import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import {
  approveUser,
  disableUser,
  enableUser,
  listManagedUsers,
  rejectUser,
  updateManagedUser,
} from '../services/user.service'

export const userRouter = Router()
userRouter.use(authMiddleware, requirePermission('permission:manage'))

userRouter.get('/', async (_req, res) => {
  const data = await listManagedUsers()
  res.json({ success: true, data })
})

userRouter.post('/:id/approve', async (req: AuthRequest, res) => {
  try {
    const roleName = req.body.roleName === '管理员' ? '管理员' : '员工'
    await approveUser(Number(req.params.id), req.user!, roleName)
    res.json({ success: true, message: '已通过审核' })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})

userRouter.post('/:id/reject', async (req: AuthRequest, res) => {
  try {
    await rejectUser(Number(req.params.id), req.user!)
    res.json({ success: true, message: '已拒绝' })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})

userRouter.post('/:id/disable', async (req: AuthRequest, res) => {
  try {
    await disableUser(Number(req.params.id), req.user!)
    res.json({ success: true, message: '已禁用' })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})

userRouter.post('/:id/enable', async (req: AuthRequest, res) => {
  try {
    await enableUser(Number(req.params.id), req.user!)
    res.json({ success: true, message: '已启用' })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})

userRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    await updateManagedUser(Number(req.params.id), {
      displayName: req.body.displayName,
      roleName: req.body.roleName,
    }, req.user!)
    res.json({ success: true, message: '已更新' })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})
