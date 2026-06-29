import { getSettings } from './settings.service'

export async function isTrialModeEnabled(): Promise<boolean> {
  const settings = await getSettings()
  return settings.trial_mode_enabled === 'true'
}
