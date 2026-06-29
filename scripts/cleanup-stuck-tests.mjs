#!/usr/bin/env node
/**
 * 停止卡住的测试/部署/preview 进程。
 * 仅作用于本仓库（记账系统）相关 node 进程；保留 Worker、3001、7789 及第三方项目。
 */
import { execSync } from 'child_process'

const PROJECT_MARKERS = [/记账系统/, /jade-account/, /jade-accounting/]
const PROTECT_MARKERS = [
  /zhubo-control|总控台|zhubo-analysis|douyin-ai-relay/i,
  /扫码枪登记|xiangyu|bridge-relay/i,
  /360Chrome|electron|chrome\.exe/i,
  /cursor\\resources|typingsInstaller/i,
  /concurrently.*(?!@jade-account)/i,
]

const STUCK_PATTERNS = [
  { re: /vite\.js" preview|vite preview/, reason: 'vite preview', requireProject: true },
  { re: /npm-cli\.js" run (test:|deploy:aliyun|acceptance|worker:status)/, reason: 'stuck npm test/deploy', requireProject: true },
  { re: /scripts\\(deploy-aliyun|test-white-screen|test-responsive|test-login|test-subpath|remote-acceptance|auto-acceptance|acceptance-cleanup)\.mjs/, reason: 'stuck node scripts', requireProject: true },
]

function ps(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

function portPids(ports) {
  const pids = new Set()
  for (const port of ports) {
    const out = ps(`netstat -ano | findstr ":${port}" | findstr LISTENING`)
    for (const line of out.split('\n')) {
      const m = line.trim().match(/\s(\d+)\s*$/)
      if (m) pids.add(Number(m[1]))
    }
  }
  return pids
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

function isOurProject(cmd) {
  return PROJECT_MARKERS.some((p) => p.test(cmd))
}

function isProtected(cmd, pid, protectedPids) {
  if (protectedPids.has(pid)) return true
  return PROTECT_MARKERS.some((p) => p.test(cmd))
}

function listNodeProcesses() {
  const out = ps('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /FORMAT:CSV')
  return out.split('\n')
    .filter((l) => l.includes('node.exe'))
    .map((line) => {
      const m = line.match(/,(\d+)\s*$/)
      return { pid: Number(m?.[1]), cmd: line }
    })
    .filter((p) => p.pid && p.cmd)
}

console.log('=== cleanup stuck test processes ===\n')

const protectedPids = portPids([3001, 7789])
if (protectedPids.size) {
  console.log(`protected port listeners: ${[...protectedPids].join(', ')} (3001 server / 7789 scanner)`)
}

const nodes = listNodeProcesses()

for (const { re, reason, requireProject } of STUCK_PATTERNS) {
  for (const { pid, cmd } of nodes) {
    if (!re.test(cmd)) continue
    if (requireProject && !isOurProject(cmd)) continue
    if (isProtected(cmd, pid, protectedPids)) continue
    killPid(pid, reason)
  }
}

const workerLines = nodes.filter(({ cmd }) =>
  isOurProject(cmd) && /@jade-account\/worker|apps\\worker.*index\.ts/i.test(cmd))
const workerPids = workerLines.map(({ pid }) => pid)
if (workerPids.length > 1) {
  workerPids.sort((a, b) => a - b)
  const keep = workerPids[workerPids.length - 1]
  for (const pid of workerPids.slice(0, -1)) {
    if (!protectedPids.has(pid)) killPid(pid, `duplicate worker (keep ${keep})`)
  }
  console.log(`kept worker PID ${keep}`)
}

console.log('\ncleanup done — 未触碰 3001 / 7789 / 第三方项目进程')
