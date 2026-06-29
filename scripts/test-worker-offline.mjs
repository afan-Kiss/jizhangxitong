// Worker offline + image upload offline test
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
const status = await (await fetch(`${SERVER}/api/local-worker/status`, { headers: { Authorization: `Bearer ${token}` } })).json()
console.log('worker_online', status.data?.online)

// Test bracelet query when worker might be offline
const br = await fetch(`${SERVER}/api/bracelets/ZZZ_OFFLINE_TEST`, { headers: { Authorization: `Bearer ${token}` } })
const brJson = await br.json()
console.log('bracelet_offline_or_notfound', br.status, brJson.code, brJson.message?.slice(0, 60))

// Upload without worker - check response
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const form = new FormData()
form.append('file', new Blob([png], { type: 'image/png' }), 't.png')
form.append('fileType', 'payment_screenshot')
const up = await fetch(`${SERVER}/api/files/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
const upJson = await up.json()
console.log('upload_result', up.status, upJson.code || upJson.success, upJson.message?.slice(0, 60))
