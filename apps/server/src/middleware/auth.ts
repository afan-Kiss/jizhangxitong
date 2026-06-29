import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../lib/jwt'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  user?: {
    userId: number
    username: string
    name: string
    permissions: string[]
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: '未登录' })
    return
  }
  try {
    const payload = verifyToken(header.slice(7))
    const permissions = await getUserPermissions(payload.userId)
    req.user = { ...payload, permissions }
    next()
  } catch {
    res.status(401).json({ success: false, message: '登录已过期' })
  }
}

export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.permissions.includes(permission)) {
      res.status(403).json({ success: false, message: '无权限' })
      return
    }
    next()
  }
}

export async function getUserPermissions(userId: number): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  })
  const set = new Set<string>()
  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) {
      set.add(rp.permission.code)
    }
  }
  return Array.from(set)
}
