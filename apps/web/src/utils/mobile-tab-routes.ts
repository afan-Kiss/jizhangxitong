/** 手机端应隐藏底部 TabBar 的路由（全屏/沉浸操作页） */
export function shouldHideMobileTab(path: string, isWide: boolean): boolean {
  if (isWide) return true
  if (path === '/login') return true
  if (path === '/scan') return true
  if (path === '/expense/create') return true
  if (path === '/logs') return true
  if (path === '/bi/drilldown') return true
  if (path === '/sales/create') return true
  if (/^\/expense\/\d+/.test(path)) return true
  if (/^\/sales\/\d+/.test(path)) return true
  if (/^\/bracelets\/[^/]+/.test(path)) return true
  return false
}
