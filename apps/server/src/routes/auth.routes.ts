import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { sanitizeUser } from '../lib/serialize'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user || !user.isActive) {
    res.status(401).json({ success: false, message: '用户名或密码错误' })
    return
  }
  const ok = await bcrypt.compare(password, user.password)
  if (!ok) {
    res.status(401).json({ success: false, message: '用户名或密码错误' })
    return
  }
  const token = signToken({ userId: user.id, username: user.username, name: user.name })
  res.json({ success: true, data: { token, user: { id: user.id, username: user.username, name: user.name } } })
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
  res.json({
    success: true,
    data: {
      user: sanitizeUser(user),
      permissions: req.user!.permissions,
    },
  })
})
