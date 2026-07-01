export type NavItem = {
  path: string
  label: string
  icon?: string
  custom?: boolean
  desktopOnly?: boolean
}

/** 手机底部 Tab */
export const mobileTabs: NavItem[] = [
  { path: '/', label: '首页', icon: 'home-o' },
  { path: '/expense/create', label: '记支出', icon: 'balance-list-o' },
  { path: '/expense/stats', label: '支出统计', icon: 'chart-trending-o' },
  { path: '/settings', label: '我的', icon: 'user-o' },
]

/** 电脑左侧导航 */
export const desktopNav: NavItem[] = [
  { path: '/', label: '首页', icon: 'home-o' },
  { path: '/expense/create', label: '记支出', icon: 'balance-list-o' },
  { path: '/expense/stats', label: '支出统计', icon: 'chart-trending-o' },
  { path: '/settings', label: '我的', icon: 'user-o' },
]

export function isNavActive(path: string, current: string): boolean {
  if (path === '/') return current === '/'
  return current === path || current.startsWith(`${path}/`)
}
