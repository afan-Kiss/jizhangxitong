import { RECOMMENDED_URL } from './deploy-env.mjs'
import { SERVER, isLocalServer } from './services.mjs'

/** 当前验收是否指向生产服务器 */
export function isProductionAcceptanceServer(url = SERVER) {
  const u = String(url).replace(/\/$/, '')
  const prod = RECOMMENDED_URL.replace(/\/\/$/, '').replace(/\/account\/?$/, '')
  if (u.includes('8.137.126.18')) return true
  return u === prod || u === `${prod}/account`
}

/**
 * 是否允许写入型验收（创建测试支出等）。
 * 生产真实库默认禁止；仅本地或显式 TEST_DATABASE_URL 时允许。
 */
export function allowWriteAcceptanceTests(url = SERVER) {
  if (process.env.TEST_DATABASE_URL?.trim()) return true
  if (process.env.ALLOW_WRITE_ACCEPTANCE === '1') return true
  if (isLocalServer(url)) return true
  return false
}

export function skipWriteAcceptanceMessage() {
  return '已跳过生产写入型测试（账本系统禁止自动写入测试支出）'
}
