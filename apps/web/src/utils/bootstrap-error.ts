/** 检测部署版本变化，清理可能导致白屏的脏登录态 */
export function syncAppVersion(): void {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
  const key = 'app_version'
  const prev = localStorage.getItem(key)
  if (prev && prev !== version) {
    localStorage.removeItem('token')
  }
  localStorage.setItem(key, version)
}

export function showBootstrapError(message: string) {
  const root = document.getElementById('app')
  if (!root) return
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f5f3ef;font-family:system-ui,sans-serif;">
      <div style="max-width:360px;text-align:center;">
        <h2 style="margin:0 0 12px;color:#1F4D3A;font-size:20px;">页面加载失败</h2>
        <p style="margin:0 0 20px;color:#666;line-height:1.6;">${message}</p>
        <button type="button" id="bootstrap-reload" style="padding:12px 24px;border:none;border-radius:12px;background:#1F4D3A;color:#fff;font-size:16px;cursor:pointer;">刷新页面</button>
      </div>
    </div>`
  document.getElementById('bootstrap-reload')?.addEventListener('click', () => location.reload())
}

export function registerGlobalErrorHandlers(app: import('vue').App) {
  app.config.errorHandler = (err) => {
    console.error('[vue-error]', err)
    if (isBenignUiError(err)) return
    showBootstrapError('页面加载失败，请刷新重试；如果还不行，请联系管理员。')
  }

  window.addEventListener('error', (event) => {
    console.error('[window-error]', event.error || event.message)
    if (event.filename?.includes('/assets/')) {
      showBootstrapError('页面加载失败，请刷新重试；如果还不行，请联系管理员。')
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event.reason?.message || event.reason || '')
    console.error('[unhandledrejection]', event.reason)
    if (isBenignUiError(event.reason)) {
      event.preventDefault()
      return
    }
    if (/Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg)) {
      showBootstrapError('页面加载失败，请刷新重试；如果还不行，请联系管理员。')
    }
  })
}

function isBenignUiError(reason: unknown): boolean {
  if (reason === undefined || reason === null) return true
  if (reason === 'cancel') return true
  const msg = String((reason as Error)?.message ?? reason)
  return msg === 'cancel' || /cancel/i.test(msg)
}
