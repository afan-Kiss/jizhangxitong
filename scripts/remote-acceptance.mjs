#!/usr/bin/env node
/**
 * 针对已部署阿里云服务器的验收（Worker 仍须在本地运行并连接云端）
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

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
  installScriptTimeout('acceptance:remote', TIMEOUTS.remoteAcceptance)
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

  const killer = setTimeout(() => {
    console.error(`\nFAIL — acceptance:remote 子进程超时 (${TIMEOUTS.remoteAcceptance / 1000}s)`)
    try { child.kill('SIGTERM') } catch { /* ignore */ }
    setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore */ } }, 3000)
  }, TIMEOUTS.remoteAcceptance)
  killer.unref()

  child.on('exit', (code) => {
    clearTimeout(killer)
    process.exit(code ?? 1)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
