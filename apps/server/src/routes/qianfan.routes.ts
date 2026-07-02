import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import {
  consumeQianfanOrderOpenTicket,
  createQianfanOrderOpenTicket,
  htmlArkOrderFallbackPage,
  QianfanOrderOpenTicketError,
  resolveQianfanOrderDetail,
} from '../services/qianfan-order-open-ticket.service'
import { resolveShopInput } from '../xhs/xhs-shops.constants'

export const qianfanRouter = Router()

qianfanRouter.post('/order-detail-ticket', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const orderNo = String(req.body?.orderNo ?? req.body?.orderId ?? '').trim()
    const shop = String(req.body?.shop ?? req.body?.shopKey ?? '').trim()
    const data = await createQianfanOrderOpenTicket(orderNo, shop ? { shop } : undefined)
    res.json({ success: true, data })
  } catch (err) {
    if (err instanceof QianfanOrderOpenTicketError) {
      res.status(400).json({ success: false, message: err.message })
      return
    }
    throw err
  }
})

qianfanRouter.get('/order-detail/open', async (req, res) => {
  try {
    const ticket = req.query.ticket ? String(req.query.ticket) : ''
    const result = consumeQianfanOrderOpenTicket(ticket)
    if (!result.ok || !result.redirectUrl) {
      res.status(410).setHeader('Content-Type', 'text/html; charset=utf-8').send(result.html)
      return
    }
    res.redirect(302, result.redirectUrl)
  } catch (err) {
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(
      htmlArkOrderFallbackPage({
        serviceUrl: '',
        shopName: '未知店铺',
        message: err instanceof Error ? err.message : '打开失败',
      }),
    )
  }
})

qianfanRouter.get('/ark-order-detail', authMiddleware, async (req, res) => {
  try {
    const orderId = String(req.query.orderId ?? req.query.orderNo ?? '').trim()
    const shop = String(req.query.shop ?? req.query.shopKey ?? '').trim()
    const format = String(req.query.format ?? '').trim().toLowerCase()

    if (!orderId) {
      if (format === 'json') {
        res.status(400).json({ success: false, message: '请提供订单号' })
        return
      }
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
        htmlArkOrderFallbackPage({ serviceUrl: '', shopName: shop || '未知店铺', message: '请提供订单号' }),
      )
      return
    }

    const result = await resolveQianfanOrderDetail({ orderId, shop })

    if (format === 'json') {
      res.json({ success: true, data: result })
      return
    }

    if (!result.finalOpenUrl) {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
        htmlArkOrderFallbackPage({
          serviceUrl: result.serviceUrl,
          shopName: result.shopName,
          message: result.error || '无法打开订单详情',
        }),
      )
      return
    }

    res.redirect(302, result.finalOpenUrl)
  } catch (err) {
    if (err instanceof QianfanOrderOpenTicketError) {
      const format = String(req.query.format ?? '').trim().toLowerCase()
      if (format === 'json') {
        res.status(400).json({ success: false, message: err.message })
        return
      }
      const shopDef = resolveShopInput(String(req.query.shop ?? req.query.shopKey ?? ''))
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
        htmlArkOrderFallbackPage({
          serviceUrl: '',
          shopName: shopDef?.name || '未知店铺',
          message: err.message,
        }),
      )
      return
    }
    throw err
  }
})
