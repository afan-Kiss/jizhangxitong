const SERVER = 'http://localhost:3001'

async function login() {
  const r = await fetch(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  return (await r.json()).data.token
}

const token = await login()
const h = (t) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

// Disable worker via settings
await fetch(`${SERVER}/api/settings/local_worker_enabled`, { method: 'PATCH', headers: h(token), body: JSON.stringify({ value: 'false' }) })

const br = await fetch(`${SERVER}/api/bracelets/NEWCODE999`, { headers: h(token) })
const brJ = await br.json()
console.log('bracelet_disabled_worker', br.status, brJ.code, brJ.message)

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const form = new FormData()
form.append('file', new Blob([png], { type: 'image/png' }), 't.png')
form.append('fileType', 'payment_screenshot')
const up = await fetch(`${SERVER}/api/files/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
const upJ = await up.json()
console.log('upload_disabled_worker', up.status, upJ.code, upJ.message)

// Re-enable
await fetch(`${SERVER}/api/settings/local_worker_enabled`, { method: 'PATCH', headers: h(token), body: JSON.stringify({ value: 'true' }) })
console.log('worker_re_enabled', true)

// Web checks
for (const path of ['/', '/login']) {
  const w = await fetch(`http://127.0.0.1:5173${path}`)
  const html = await w.text()
  console.log('web_route', path, w.status, html.includes('和田玉') || html.includes('root'))
}

const css = await fetch('http://127.0.0.1:5173/assets/index-DjOVA727.css')
console.log('web_css', css.status, css.headers.get('content-type'), (await css.text()).includes('--color-bg'))
