const PRODUCTION_DB_MARKERS = [
  '/www/wwwroot/jade-accounting',
  '8.137.126.18',
  'xiangyuzhubao',
] as const

const PROD_GUARD_MESSAGE =
  '拒绝清理：当前 DATABASE_URL 看起来像生产库。请检查环境变量，避免误删线上数据。'

function looksLikeProductionDatabase(databaseUrl?: string): boolean {
  const url = (databaseUrl || process.env.DATABASE_URL || '').trim()
  const envFlags = [
    process.env.NODE_ENV,
    process.env.APP_ENV,
    process.env.JADE_ENV,
  ]
    .filter(Boolean)
    .join('|')
  const haystack = `${url}|${envFlags}`.toLowerCase()
  if (envFlags.split('|').some((v) => v?.toLowerCase() === 'production')) return true
  return PRODUCTION_DB_MARKERS.some((m) => haystack.includes(m.toLowerCase()))
}

export function assertSafeDatabaseUrl(databaseUrl?: string): void {
  if (looksLikeProductionDatabase(databaseUrl)) {
    throw new Error(PROD_GUARD_MESSAGE)
  }
}
