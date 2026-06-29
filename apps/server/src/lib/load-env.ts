import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const serverRoot = path.resolve(__dirname, '../..')
const projectRoot = path.resolve(serverRoot, '../..')

const candidates = [
  path.join(serverRoot, '.env.production'),
  path.join(serverRoot, '.env'),
  path.join(projectRoot, '.env'),
]

const loaded: string[] = []

for (const file of candidates) {
  if (!fs.existsSync(file)) continue
  dotenv.config({ path: file, override: false })
  loaded.push(file)
}

if (loaded.length) {
  console.log(`[env] 已加载: ${loaded.join(', ')}`)
} else {
  console.log('[env] 未找到 .env 文件，使用 process.env')
}
