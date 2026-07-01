export type XhsOrderItem = {
  externalOrderNo: string
  shopKey: string
  shopName: string
  buyerName: string
  phoneMasked: string
  amount: number
  payTime: string
  orderStatus: string
  afterSaleStatus: string
  logisticsNo: string
  goodsTitle: string
}

export type XhsShopStatus = {
  key: string
  name: string
  canSyncOrders: boolean
  statusLabel: string
  reason: string
}

export type XhsOrderPickPayload = XhsOrderItem & {
  orderStatus?: string
}
