import { prisma } from '../lib/prisma'
import { DEFAULT_SETTINGS } from '@jade-account/shared'

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
