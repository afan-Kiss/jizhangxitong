import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { getConfigOptions, getSettings, updateSetting, isQianfanOrderLinkEnabled, getExpenseOperators } from '../services/settings.service'
import { writeOperationLog } from '../services/operation-log.service'
import { formatOperationLogEntry } from '../services/audit.service'
import { prisma } from '../lib/prisma'
import { PERMISSIONS, PERMISSION_LABELS } from '@jade-account/shared'
import { sanitizeUser, sanitizeUsers } from '../lib/serialize'

export const settingsRouter = Router()
settingsRouter.use(authMiddleware)

settingsRouter.get('/', async (_req, res) => {
  const settings = await getSettings()
  const expenseTypes = await getConfigOptions('expense_type')
  const paySources = await getConfigOptions('pay_source')
  const expenseOperators = await getExpenseOperators()
  res.json({
    success: true,
    data: {
      settings,
      expenseTypes,
      paySources,
      expenseOperators,
      qianfanOrderLinkEnabled: await isQianfanOrderLinkEnabled(),
    },
  })
})

settingsRouter.patch('/:key', requirePermission('setting:update'), async (req: AuthRequest, res) => {
  const key = String(req.params.key)
  const before = await getSettings()
  await updateSetting(key, req.body.value, req.user!.userId)
  const after = await getSettings()
  await writeOperationLog({
    module: 'setting',
    action: 'update_setting',
    targetType: 'setting',
    targetCode: key,
    beforeJson: { [key]: before[key] },
    afterJson: { [key]: after[key] },
    operator: req.user,
  })
  res.json({ success: true, data: after })
})

export const logRouter = Router()
logRouter.use(authMiddleware, requirePermission('log:view'))
logRouter.get('/', async (req, res) => {
  const page = Number(req.query.page || 1)
  const pageSize = Number(req.query.pageSize || 30)
  const [items, total] = await Promise.all([
    prisma.operationLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.operationLog.count(),
  ])
  res.json({
    success: true,
    data: {
      items: items.map(formatOperationLogEntry),
      total,
      page,
      pageSize,
    },
  })
})

export const permissionRouter = Router()
permissionRouter.use(authMiddleware)

permissionRouter.get('/permissions', requirePermission('permission:manage'), async (_req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: { code: 'asc' } })
  res.json({ success: true, data: permissions })
})

permissionRouter.get('/roles', requirePermission('permission:manage'), async (_req, res) => {
  const roles = await prisma.role.findMany({
    include: {
      rolePermissions: { include: { permission: true } },
      userRoles: {
        include: {
          user: true,
        },
      },
    },
  })
  const data = roles.map((role) => ({
    ...role,
    userRoles: role.userRoles.map((ur) => ({
      ...ur,
      user: sanitizeUser(ur.user),
    })),
  }))
  res.json({ success: true, data })
})

permissionRouter.post('/roles', requirePermission('permission:manage'), async (req: AuthRequest, res) => {
  const role = await prisma.role.create({
    data: {
      name: req.body.name,
      description: req.body.description,
    },
  })
  if (req.body.permissionIds?.length) {
    await prisma.rolePermission.createMany({
      data: req.body.permissionIds.map((pid: number) => ({ roleId: role.id, permissionId: pid })),
    })
  }
  await writeOperationLog({
    module: 'permission',
    action: 'create_role',
    targetType: 'role',
    targetId: role.id,
    afterJson: role,
    operator: req.user,
  })
  res.json({ success: true, data: role })
})

permissionRouter.patch('/roles/:id', requirePermission('permission:manage'), async (req: AuthRequest, res) => {
  const roleId = Number(req.params.id)
  await prisma.role.update({
    where: { id: roleId },
    data: { name: req.body.name, description: req.body.description },
  })
  if (req.body.permissionIds) {
    await prisma.rolePermission.deleteMany({ where: { roleId } })
    await prisma.rolePermission.createMany({
      data: req.body.permissionIds.map((pid: number) => ({ roleId, permissionId: pid })),
    })
  }
  await writeOperationLog({
    module: 'permission',
    action: 'update_role',
    targetType: 'role',
    targetId: roleId,
    afterJson: req.body,
    operator: req.user,
  })
  res.json({ success: true })
})

permissionRouter.post('/users/:id/roles', requirePermission('permission:manage'), async (req: AuthRequest, res) => {
  const userId = Number(req.params.id)
  await prisma.userRole.deleteMany({ where: { userId } })
  if (req.body.roleIds?.length) {
    await prisma.userRole.createMany({
      data: req.body.roleIds.map((roleId: number) => ({ userId, roleId })),
    })
  }
  await writeOperationLog({
    module: 'permission',
    action: 'update_user_roles',
    targetType: 'user',
    targetId: userId,
    afterJson: req.body,
    operator: req.user,
  })
  res.json({ success: true })
})

permissionRouter.get('/users', requirePermission('permission:manage'), async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { userRoles: { include: { role: true } } },
  })
  res.json({ success: true, data: sanitizeUsers(users) })
})

export async function seedPermissions() {
  for (const code of PERMISSIONS) {
    const label = PERMISSION_LABELS[code] || code
    await prisma.permission.upsert({
      where: { code },
      create: { code, name: label, description: label },
      update: { name: label, description: label },
    })
  }
}
