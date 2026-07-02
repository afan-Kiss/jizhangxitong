import { prisma } from '../lib/prisma'
import { DEFAULT_SETTINGS } from '@jade-account/shared'
import { config } from '../lib/config'

export async function getSettings() {
  const rows = await prisma.systemSetting.findMany()
  const map: Record<string, string> = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    map[row.settingKey] = row.settingValue
  }
  return map
}

export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const settings = await getSettings()
  const val = settings[key]
  return val ? Number(val) : fallback
}

export async function updateSetting(key: string, value: string, userId: number) {
  return prisma.systemSetting.upsert({
    where: { settingKey: key },
    create: { settingKey: key, settingValue: value, updatedBy: userId },
    update: { settingValue: value, updatedBy: userId },
  })
}

export async function getConfigOptions(category: string) {
  return prisma.configOption.findMany({
    where: { category, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

/** DB 设置优先，其次环境变量 QIANFAN_ORDER_DETAIL_URL_TEMPLATE */
export async function getQianfanOrderUrlTemplate(): Promise<string> {
  const settings = await getSettings()
  const fromDb = settings.qianfan_order_detail_url_template?.trim()
  if (fromDb?.includes('{orderNo}')) return fromDb
  return config.qianfanOrderDetailUrlTemplate?.trim() || ''
}

export async function isQianfanOrderLinkEnabled(): Promise<boolean> {
  if (process.env.CONTROL_SERVICE_TOKEN?.trim()) return true
  const tpl = await getQianfanOrderUrlTemplate()
  return !!tpl && tpl.includes('{orderNo}')
}
