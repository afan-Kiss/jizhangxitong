import path from 'path'

const isProd = process.env.NODE_ENV === 'production'

function resolveScanWorkbenchEnabled(): boolean {
  if (process.env.SCAN_WORKBENCH_ENABLED === 'true') return true
  if (process.env.SCAN_BINDING_ENABLED === 'true') return true
  return false
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.SERVER_PORT || process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || 'change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  workerWsToken: process.env.WORKER_WS_TOKEN || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  localWorkerRequired: process.env.LOCAL_WORKER_REQUIRED === 'true',
  exportDir: process.env.EXPORT_TMP_DIR || process.env.EXPORT_DIR || path.join(__dirname, '../../exports'),
  tempUploadDir: process.env.TEMP_UPLOAD_DIR || path.join(__dirname, '../../tmp-uploads'),
  exportTokenTtlMinutes: Number(process.env.EXPORT_TOKEN_TTL_MINUTES || 30),
  workerRpcTimeoutMs: Number(process.env.WORKER_RPC_TIMEOUT_MS || 30000),
  databaseUrl: process.env.DATABASE_URL || '',
  publicWebDir: process.env.PUBLIC_WEB_DIR || '',
  /** 扫码工作台开关（兼容 SCAN_BINDING_ENABLED） */
  scanWorkbenchEnabled: resolveScanWorkbenchEnabled(),
  /** @deprecated 使用 scanWorkbenchEnabled */
  get scanBindingEnabled() {
    return this.scanWorkbenchEnabled
  },
  qianfanOrderDetailUrlTemplate: process.env.QIANFAN_ORDER_DETAIL_URL_TEMPLATE || '',
}

export function validateProductionConfig(): string[] {
  const warnings: string[] = []
  if (!config.isProd) return warnings

  if (!config.jwtSecret || config.jwtSecret === 'change-this-in-production' || config.jwtSecret.length < 16) {
    warnings.push('生产环境 JWT_SECRET 必须使用强随机密钥（至少16位）')
  }
  if (!config.workerWsToken || config.workerWsToken.length < 16) {
    warnings.push('生产环境必须设置 WORKER_WS_TOKEN')
  }
  if (!config.databaseUrl) {
    warnings.push('生产环境必须设置 DATABASE_URL')
  }
  // SQLite 过渡部署允许（用户明确要求先 SQLite 上线），不阻断启动
  return warnings
}

export async function validateDefaultAdminPassword(): Promise<string | null> {
  if (!config.isProd) return null
  const bcrypt = await import('bcryptjs')
  const { prisma } = await import('./prisma')
  const weakUsers = await prisma.user.findMany({
    where: { username: { in: ['admin', 'fanfan'] }, isActive: true },
  })
  for (const user of weakUsers) {
    if (await bcrypt.compare('admin123', user.password)) {
      return `生产环境账号 ${user.username} 仍使用弱密码 admin123，必须立即修改`
    }
    if (user.username === 'admin') {
      return '生产环境仍存在 admin 账号，请改用 fanfan 管理员账号'
    }
  }
  return null
}
