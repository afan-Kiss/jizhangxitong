import { mobileTabs } from '../config/nav'

function normalizePath(path: string): string {
  if (!path || path === '/') return '/'
  return path.replace(/\/+$/, '') || '/'
}

/** 底部 Tab 一级页（默认不显示返回） */
export function isRootTabRoute(path: string): boolean {
  const p = normalizePath(path)
  return mobileTabs.some((tab) => normalizePath(tab.path) === p)
}

/** 扫码/记支出等沉浸页：虽是一级 Tab，也需要返回 */
function isImmersiveTabRoute(path: string): boolean {
  const p = normalizePath(path)
  return p === '/scan' || p === '/expense/create'
}

/**
 * 是否显示页面返回按钮。
 * 子界面、详情等均显示；首页/支出统计/我的等 Tab 根页不显示。
 */
export function shouldShowPageBack(path: string): boolean {
  if (path === '/login') return false
  if (isImmersiveTabRoute(path)) return true
  if (isRootTabRoute(path)) return false
  return true
}
