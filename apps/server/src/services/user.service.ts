import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'

const FANFAN_USERNAME = 'fanfan'

export function isProtectedAdmin(username: string) {
  return username === FANFAN_USERNAME
}

export async function registerUser(input: {
  username: string
  password: string
  displayName: string
  phone?: string
}) {
  const username = input.username?.trim()
  const displayName = input.displayName?.trim()
  const password = input.password
  if (!username || username.length < 2) throw new Error('登录账号至少 2 个字符')
  if (!displayName) throw new Error('请填写显示名（员工姓名）')
  if (!password || password.length < 6) throw new Error('密码至少 6 位')

  const exists = await prisma.user.findUnique({ where: { username } })
  if (exists) throw new Error('这个登录账号已经有人用了')

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      name: displayName,
      phone: input.phone?.trim() || null,
      status: 'pending',
      isActive: true,
    },
  })

  return { id: user.id, username: user.username, name: user.name, status: user.status }
}

export async function listManagedUsers() {
  const users = await prisma.user.findMany({
    include: {
      userRoles: { include: { role: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  const approverIds = users
    .flatMap((u) => [u.approvedByUserId, u.rejectedByUserId])
    .filter((id): id is number => !!id)
  const approvers = approverIds.length
    ? await prisma.user.findMany({
        where: { id: { in: [...new Set(approverIds)] } },
        select: { id: true, name: true, username: true },
      })
    : []
  const approverMap = new Map(approvers.map((a) => [a.id, a]))

  return users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    phone: u.phone,
    status: u.status,
    isActive: u.isActive,
    createdAt: u.createdAt,
    approvedAt: u.approvedAt,
    approvedBy: u.approvedByUserId ? approverMap.get(u.approvedByUserId) || null : null,
    rejectedAt: u.rejectedAt,
    rejectedBy: u.rejectedByUserId ? approverMap.get(u.rejectedByUserId) || null : null,
    lastLoginAt: u.lastLoginAt,
    roles: u.userRoles.map((ur) => ur.role.name),
    protected: isProtectedAdmin(u.username),
  }))
}

async function ensureEmployeeRole() {
  let role = await prisma.role.findUnique({ where: { name: '员工' } })
  if (!role) {
    role = await prisma.role.create({ data: { name: '员工', description: '普通员工' } })
  }
  const employeePermCodes = [
    'bracelet:view',
    'expense:view',
    'expense:create',
    'expense:update',
    'expense:attachment:view',
    'expense:attachment:upload',
    'reimbursement:view',
    'sale:view',
  ]
  const perms = await prisma.permission.findMany({ where: { code: { in: employeePermCodes } } })
  for (const perm of perms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      create: { roleId: role.id, permissionId: perm.id },
      update: {},
    })
  }
  return role
}

async function ensureAdminRole() {
  return prisma.role.findUniqueOrThrow({ where: { name: '管理员' } })
}

export async function approveUser(userId: number, operator: AuthRequest['user'], roleName: '管理员' | '员工' = '员工') {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('用户不存在')
  if (user.status === 'active') throw new Error('这个账号已经通过了')

  const role = roleName === '管理员' ? await ensureAdminRole() : await ensureEmployeeRole()
  await prisma.user.update({
    where: { id: userId },
    data: {
      status: 'active',
      isActive: true,
      approvedAt: new Date(),
      approvedByUserId: operator!.userId,
      rejectedAt: null,
      rejectedByUserId: null,
    },
  })
  await prisma.userRole.deleteMany({ where: { userId } })
  await prisma.userRole.create({ data: { userId, roleId: role.id } })

  await writeOperationLog({
    module: 'user',
    action: 'approve_user',
    targetType: 'user',
    targetId: userId,
    targetCode: user.username,
    afterJson: { role: roleName },
    operator,
  })
}

export async function rejectUser(userId: number, operator: AuthRequest['user']) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('用户不存在')
  if (isProtectedAdmin(user.username)) throw new Error('fanfan 管理员不能拒绝')

  await prisma.user.update({
    where: { id: userId },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedByUserId: operator!.userId,
    },
  })

  await writeOperationLog({
    module: 'user',
    action: 'reject_user',
    targetType: 'user',
    targetId: userId,
    targetCode: user.username,
    operator,
  })
}

export async function disableUser(userId: number, operator: AuthRequest['user']) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('用户不存在')
  if (isProtectedAdmin(user.username)) throw new Error('fanfan 管理员不能禁用')

  await prisma.user.update({
    where: { id: userId },
    data: { status: 'disabled', isActive: false },
  })

  await writeOperationLog({
    module: 'user',
    action: 'disable_user',
    targetType: 'user',
    targetId: userId,
    targetCode: user.username,
    operator,
  })
}

export async function enableUser(userId: number, operator: AuthRequest['user']) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('用户不存在')

  await prisma.user.update({
    where: { id: userId },
    data: { status: 'active', isActive: true },
  })

  await writeOperationLog({
    module: 'user',
    action: 'enable_user',
    targetType: 'user',
    targetId: userId,
    targetCode: user.username,
    operator,
  })
}

export async function updateManagedUser(
  userId: number,
  input: { displayName?: string; roleName?: '管理员' | '员工' },
  operator: AuthRequest['user'],
) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('用户不存在')

  const data: Record<string, unknown> = {}
  if (input.displayName?.trim()) data.name = input.displayName.trim()

  if (Object.keys(data).length) {
    await prisma.user.update({ where: { id: userId }, data })
  }

  if (input.roleName) {
    if (isProtectedAdmin(user.username) && input.roleName !== '管理员') {
      throw new Error('fanfan 管理员不能降级')
    }
    const role = input.roleName === '管理员' ? await ensureAdminRole() : await ensureEmployeeRole()
    await prisma.userRole.deleteMany({ where: { userId } })
    await prisma.userRole.create({ data: { userId, roleId: role.id } })
  }

  await writeOperationLog({
    module: 'user',
    action: 'update_user',
    targetType: 'user',
    targetId: userId,
    targetCode: user.username,
    afterJson: input,
    operator,
  })
}
