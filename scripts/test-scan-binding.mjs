#!/usr/bin/env node
/** @deprecated 使用 test:scan-workbench；本脚本转发到扫码工作台验收 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [path.join(__dirname, 'test-scan-workbench.mjs')], {
  stdio: 'inherit',
  env: process.env,
})
process.exit(r.status ?? 1)
