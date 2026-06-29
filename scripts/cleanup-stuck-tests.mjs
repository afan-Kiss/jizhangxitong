#!/usr/bin/env node
/**
 * 停止卡住的测试/部署/preview 进程，保留 Worker 与扫码枪
 */
import { execSync } from 'child_process'

function ps(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

function killPid(pid, reason) {
  if (!pid || Number.isNaN(pid)) return
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    console.log(`stopped PID ${pid} — ${reason}`)
  } catch {
    /* already gone */
  }
}

function killMatching(pattern, reason) {
  const out = ps('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /FORMAT:CSV')
  const lines = out.split('\n').filter((l) => l.includes('node.exe'))
  for (const line of lines) {
    if (!pattern.test(line)) continue
    const m = line.match(/,(\d+)\s*$/)
    if (m) killPid(Number(m[1]), reason)
  }
}

console.log('=== cleanup stuck test processes ===\n')

killMatching(/vite\.js" preview|vite preview/, 'vite preview')
killMatching(/npm-cli\.js" run test:white-screen|test:responsive|test:login|deploy:aliyun|worker:status/, 'stuck npm test/deploy')
killMatching(/scripts\\deploy-aliyun\.mjs|scripts\\test-white-screen|scripts\\test-responsive/, 'stuck node scripts')

const workerOut = ps('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /FORMAT:CSV')
const workerLines = workerOut.split('\n').filter((l) => /@jade-account\/worker|apps\\worker.*index\.ts/i.test(l))
const workerPids = workerLines.map((l) => Number(l.match(/,(\d+)\s*$/)?.[1])).filter(Boolean)
if (workerPids.length > 1) {
  workerPids.sort((a, b) => a - b)
  const keep = workerPids[workerPids.length - 1]
  for (const pid of workerPids.slice(0, -1)) {
    killPid(pid, `duplicate worker (keep ${keep})`)
  }
  console.log(`kept worker PID ${keep}`)
}

console.log('\ncleanup done')
