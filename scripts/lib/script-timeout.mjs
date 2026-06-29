#!/usr/bin/env node
/**
 * 脚本级硬超时（所有验收/部署脚本共用）
 */
export const DEFAULT_SCRIPT_TIMEOUT_MS = Number(process.env.SCRIPT_TIMEOUT_MS || 120000)

export const TIMEOUTS = {
  login: Number(process.env.TIMEOUT_LOGIN_MS || 60000),
  subpath: Number(process.env.TIMEOUT_SUBPATH_MS || 60000),
  whiteScreen: Number(process.env.PW_SCRIPT_TIMEOUT_MS || 120000),
  responsive: Number(process.env.PW_SCRIPT_TIMEOUT_MS || 120000) * 2,
  acceptanceBasic: Number(process.env.TIMEOUT_ACCEPTANCE_MS || 300000),
  acceptanceFull: Number(process.env.TIMEOUT_ACCEPTANCE_FULL_MS || 600000),
  acceptanceCleanup: Number(process.env.TIMEOUT_CLEANUP_MS || 120000),
  workerOnline: Number(process.env.TIMEOUT_WORKER_ONLINE_MS || 180000),
  remoteAcceptance: Number(process.env.TIMEOUT_REMOTE_ACCEPTANCE_MS || 600000),
  deploy: Number(process.env.TIMEOUT_DEPLOY_MS || 3600000),
}

export function installScriptTimeout(label, ms = DEFAULT_SCRIPT_TIMEOUT_MS) {
  const timer = setTimeout(() => {
    console.error(`\nFAIL — ${label} 总超时 (${ms / 1000}s)，强制退出`)
    process.exit(1)
  }, ms)
  timer.unref()
  return timer
}

export async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) })
}
