#!/usr/bin/env node
/**
 * 部署后版本一致性：远程 index.html meta 与 /api/health.version 必须等于 git HEAD
 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import { fetchWithTimeout } from './lib/script-timeout.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

export function getLocalHead() {
  return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim()
}

export async function fetchRemoteVersions(baseUrl) {
  const base = baseUrl.replace(/\/$/, '')
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const indexRes = await fetchWithTimeout(`${base}/`, {}, 30000)
      const html = await indexRes.text()
      const metaVersion = html.match(/app-version" content="([^"]+)"/)?.[1]?.trim() || null

      const healthRes = await fetchWithTimeout(`${base}/api/health`, {}, 30000)
      const healthText = await healthRes.text()
      let healthJson = {}
      try { healthJson = JSON.parse(healthText) } catch { /* ignore */ }
      const healthVersion = healthJson.version != null ? String(healthJson.version).trim() : null

      return { metaVersion, healthVersion, indexStatus: indexRes.status, healthStatus: healthRes.status }
    } catch (e) {
      lastErr = e
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  throw lastErr
}

export async function verifyDeployVersion(expectedHead, baseUrl = RECOMMENDED_URL.replace(/\/$/, '')) {
  const localHead = expectedHead || getLocalHead()
  const remote = await fetchRemoteVersions(baseUrl)
  const errors = []

  if (!remote.metaVersion) {
    errors.push('远程 index.html 缺少 <meta name="app-version">')
  } else if (remote.metaVersion !== localHead) {
    errors.push(`index.html app-version 不一致：远程=${remote.metaVersion}，期望=${localHead}`)
  }

  if (remote.healthVersion == null) {
    errors.push('/api/health 未返回 version 字段')
  } else if (remote.healthVersion !== localHead) {
    errors.push(`/api/health version 不一致：远程=${remote.healthVersion}，期望=${localHead}`)
  }

  return { ok: errors.length === 0, localHead, remote, errors }
}

async function main() {
  const expected = process.argv[2]?.trim() || getLocalHead()
  const base = (process.env.ACCEPTANCE_SERVER || RECOMMENDED_URL).replace(/\/$/, '')
  const result = await verifyDeployVersion(expected, base)

  console.log('\n=== 部署版本一致性检查 ===\n')
  console.log('本地 HEAD:', result.localHead)
  console.log('远程 APP_VERSION (meta):', result.remote.metaVersion ?? '(missing)')
  console.log('远程 /api/health version:', result.remote.healthVersion ?? '(missing)')

  if (result.ok) {
    console.log('\nPASS — 远程版本与本地 HEAD 一致\n')
    process.exit(0)
  }

  console.error('\nFAIL — 版本不一致\n')
  for (const e of result.errors) console.error(`  - ${e}`)
  console.error(`\n本地 HEAD: ${result.localHead}`)
  console.error(`远程 APP_VERSION: ${result.remote.metaVersion ?? '(missing)'}`)
  console.error(`失败原因: ${result.errors.join('; ')}\n`)
  process.exit(1)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  main().catch((e) => {
    console.error('verify-deploy-version 异常:', e.message || e)
    process.exit(1)
  })
}
