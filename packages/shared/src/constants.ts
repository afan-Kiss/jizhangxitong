export const DEFAULT_SETTINGS = {
  default_certificate_fee: '3',
  default_package_fee: '10',
  default_sf_express_fee: '18',
  date_format: 'M.D',
  scanner_api_base_url: 'http://127.0.0.1:7789',
  local_worker_enabled: 'true',
  scanner_sync_timeout: '8',
  trial_mode_enabled: 'false',
} as const

export const EXPENSE_TYPES = [
  '客户补偿',
  '售后补偿',
  '包装盒',
  '证书费',
  '快递费',
  '成本调整',
  '员工垫付',
  '日常物料',
  '系统/软件',
  '其他支出',
] as const

export const PAY_SOURCES = [
  '老板付款',
  '员工垫付',
  '娟姐转账',
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

export const PLATFORMS = ['小红书', '微信私域', '其他'] as const

export const REIMBURSEMENT_STATUSES = ['pending', 'reimbursed', 'not_required'] as const

export const SALE_STATUSES = ['sold', 'refunded', 'returned_available'] as const

export const PERMISSIONS = [
  'bracelet:view',
  'bracelet:cost:view',
  'bracelet:sync',
  'expense:view',
  'expense:create',
  'expense:update',
  'expense:void',
  'expense:attachment:view',
  'expense:attachment:upload',
  'expense:export',
  'sale:view',
  'sale:create',
  'sale:update',
  'sale:refund',
  'cost:adjust',
  'setting:update',
  'reimbursement:view',
  'reimbursement:update',
  'log:view',
  'permission:manage',
] as const

export const PERMISSION_LABELS: Record<string, string> = {
  'bracelet:view': '查看镯子列表与详情',
  'bracelet:cost:view': '查看镯子真实成本',
  'bracelet:sync': '从扫码枪同步镯子',
  'expense:view': '查看支出记录',
  'expense:create': '新建支出',
  'expense:update': '修改支出',
  'expense:void': '作废支出',
  'expense:attachment:view': '查看付款/聊天截图',
  'expense:attachment:upload': '上传支出凭证',
  'expense:export': '导出报销 Excel',
  'sale:view': '查看销售记录',
  'sale:create': '新建销售',
  'sale:update': '修改销售',
  'sale:refund': '销售退款/退货',
  'cost:adjust': '调整镯子成本',
  'setting:update': '修改系统设置',
  'reimbursement:view': '查看未报销列表',
  'reimbursement:update': '更新报销状态',
  'log:view': '查看操作日志',
  'permission:manage': '管理角色与权限',
}

export const FILE_TYPE_LABELS: Record<string, string> = {
  payment_screenshot: '付款截图',
  after_sale_problem: '售后问题图',
  chat_screenshot: '聊天截图',
  bracelet_photo: '镯子图片',
  other: '其他凭证',
}
