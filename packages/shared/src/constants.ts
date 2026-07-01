export const DEFAULT_SETTINGS = {
  default_certificate_fee: '3',
  default_package_fee: '10',
  default_sf_express_fee: '18',
  date_format: 'M.D',
  scanner_api_base_url: 'http://127.0.0.1:7789',
  local_worker_enabled: 'true',
  scanner_sync_timeout: '8',
  qianfan_order_detail_url_template: '',
} as const

export const DEFAULT_PAY_SOURCE = '项目专用资金' as const

/** 项目资金支出分类（前端记支出 / 统计展示） */
export const PROJECT_EXPENSE_CATEGORIES = [
  '好评返现',
  '快递/运费',
  '包装物料',
  '平台费用',
  '运营推广',
  '售后处理',
  '软件/工具',
  '办公杂费',
  '其他支出',
] as const

/** @deprecated 历史兼容；新记录请用 PROJECT_EXPENSE_CATEGORIES */
export const EXPENSE_TYPES = [...PROJECT_EXPENSE_CATEGORIES] as const

export const PAY_SOURCES = [
  '项目专用资金',
  '微信',
  '支付宝',
  '银行卡',
  '老板付款',
  '财务转账',
  '其他',
] as const

export const FILE_TYPES = [
  'payment_screenshot',
  'after_sale_problem',
  'chat_screenshot',
  'bracelet_photo',
  'other',
] as const

/** 当前系统启用的权限（支出 + 管理） */
export const PERMISSIONS = [
  'expense:view',
  'expense:create',
  'expense:update',
  'expense:void',
  'expense:attachment:view',
  'expense:attachment:upload',
  'log:view',
  'setting:update',
  'permission:manage',
] as const

/** @deprecated 历史库中可能存在，不再分配给新角色 */
export const DEPRECATED_PERMISSIONS = [
  'bracelet:view',
  'bracelet:cost:view',
  'bracelet:sync',
  'sale:view',
  'sale:create',
  'sale:update',
  'sale:refund',
  'cost:adjust',
] as const

export const ADMIN_ONLY_PERMISSIONS = ['permission:manage', 'setting:update'] as const

export const SHARED_BUSINESS_PERMISSIONS = PERMISSIONS.filter(
  (code) => !(ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(code),
)

export const PERMISSION_LABELS: Record<string, string> = {
  'expense:view': '查看支出记录',
  'expense:create': '新建支出',
  'expense:update': '修改支出',
  'expense:void': '作废支出',
  'expense:attachment:view': '查看付款/聊天截图',
  'expense:attachment:upload': '上传支出凭证',
  'log:view': '查看操作日志',
  'setting:update': '修改系统设置',
  'permission:manage': '管理角色与权限',
}

export const FILE_TYPE_LABELS: Record<string, string> = {
  payment_screenshot: '付款截图',
  after_sale_problem: '售后问题图',
  chat_screenshot: '聊天截图',
  bracelet_photo: '凭证图片',
  other: '其他凭证',
}
