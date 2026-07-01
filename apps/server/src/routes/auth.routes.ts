import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { sanitizeUser } from '../lib/serialize'
import { registerUser, findUserByUsername } from '../services/user.service'
import { writeOperationLog } from '../services/operation-log.service'

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword, displayName, phone } = req.body
    if (password !== confirmPassword) {
      res.status(400).json({ success: false, message: '两次密码不一致' })
      return
    }
    const user = await registerUser({ username, password, displayName, phone })
    await writeOperationLog({
      module: 'auth',
      action: 'register',
      targetType: 'user',
      targetId: user.id,
      targetCode: user.username,
      afterJson: { username: user.username, name: user.name },
    })
    res.json({
      success: true,
      message: '注册成功，等管理员审核通过后就能登录。',
      data: user,
    })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body
  const user = await findUserByUsername(username)
  if (!user) {
    res.status(401).json({ success: false, message: '用户名或密码错误' })
    return
  }
  if (user.status === 'pending') {
    res.status(403).json({ success: false, message: '账号还没审核，找管理员在系统设置里通过一下。' })
    return
  }
  if (user.status === 'rejected') {
    res.status(403).json({ success: false, message: '账号未通过审核，请联系管理员。' })
    return
  }
  if (user.status === 'disabled' || !user.isActive) {
    res.status(403).json({ success: false, message: '账号已禁用，请联系管理员。' })
    return
  }
  const ok = await bcrypt.compare(password, user.password)
  if (!ok) {
    res.status(401).json({ success: false, message: '用户名或密码错误' })
    return
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })
  const token = signToken({ userId: user.id, username: user.username, name: user.name })
  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        status: user.status,
        phone: user.phone,
      },
    },
  })
})

authRouter.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  })
  if (!user || user.status !== 'active' || !user.isActive) {
    res.status(403).json({ success: false, message: '账号不可用，请联系管理员。' })
    return
  }
  res.json({
    success: true,
    data: {
      user: sanitizeUser(user),
      permissions: req.user!.permissions,
    },
  })
})

authRouter.patch('/profile', authMiddleware, async (req: AuthRequest, res) => {
  const displayName = String(req.body.displayName || '').trim()
  if (!displayName) {
    res.status(400).json({ success: false, message: '请填写显示名' })
    return
  }
  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: { name: displayName },
  })
  res.json({ success: true, data: sanitizeUser(user) })
})
