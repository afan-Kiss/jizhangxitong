#!/usr/bin/env node
/**
 * 针对已部署阿里云服务器的验收（Worker 仍须在本地运行并连接云端）
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

async function readDeployUrl() {
  try {
    const info = JSON.parse(
      await fs.readFile(path.join(ROOT, 'deploy/aliyun/last-deploy-info.json'), 'utf-8'),
    )
    return info.recommended || info.url || RECOMMENDED_URL
  } catch {
    return process.env.ACCEPTANCE_SERVER || RECOMMENDED_URL
  }
}

async function main() {
  const server = process.env.ACCEPTANCE_SERVER || await readDeployUrl()
  console.log(`远程验收目标: ${server}`)

  const child = spawn('node', ['scripts/auto-acceptance.mjs', 'full'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      ACCEPTANCE_SERVER: server,
      ACCEPTANCE_MODE: 'full',
    },
    shell: true,
  })
  child.on('exit', (code) => process.exit(code ?? 1))
}

main()
