import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { downloadExport, getExportTask } from '../services/export.service'

export const exportRouter = Router()

exportRouter.get('/:id/status', authMiddleware, requirePermission('expense:export'), async (req, res) => {
  const task = await getExportTask(Number(req.params.id))
  if (!task) {
    res.status(404).json({ success: false, message: '导出任务不存在' })
    return
  }
  res.json({ success: true, data: task })
})

exportRouter.get('/:id/download', async (req, res) => {
  try {
    const { buffer, fileName } = await downloadExport(Number(req.params.id), String(req.query.token || ''))
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.send(buffer)
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})
