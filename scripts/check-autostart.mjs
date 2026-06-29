/**
 * 开机自启状态检查（中文大白话）
 */
import { spawnSync } from 'child_process'
import net from 'net'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' }, () => { s.destroy(); resolve(true) })
    s.on('error', () => resolve(false))
    s.setTimeout(2000, () => { s.destroy(); resolve(false) })
  })
}

function getScheduledTask(name) {
  const r = spawnSync('powershell', [
    '-NoProfile', '-Command',
    `(Get-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty State)`,
  ], { encoding: 'utf-8' })
  return (r.stdout || '').trim()
}

async function main() {
  console.log('\n=== 开机自启检查 ===\n')

  const workerState = getScheduledTask('JadeAccounting-LocalWorker')
  const scannerState = getScheduledTask('JadeAccounting-ScannerAPI')
  const serverOk = await portOpen(3001)
  const scannerOk = await portOpen(7789)

  if (!workerState && !scannerState) {
    console.log('[未配置] 还没有注册开机自启。')
    console.log('请双击项目里的「一键安装自启.bat」，或桌面「安装和田玉记账系统自启」。')
  } else {
    console.log(workerState ? `[Worker 自启] 已注册，状态: ${workerState}` : '[Worker 自启] 未注册')
    console.log(scannerState ? `[扫码枪自启] 已注册，状态: ${scannerState}` : '[扫码枪自启] 未注册')
  }

  console.log('')
  console.log(`记账服务端 (3001): ${serverOk ? '正在运行' : '未运行'}`)
  console.log(`扫码枪 API (7789): ${scannerOk ? '正在运行' : '未运行'}`)

  if ((workerState || scannerState) && workerState && !serverOk) {
    console.log('\n[配置了但没启动] 自启已注册，但服务端/Worker 依赖的服务还没起来。')
  }
  if (scannerState && !scannerOk) {
    console.log('\n[启动了但接口不通] 扫码枪自启已配置，但 7789 目前访问不了。')
  }
  if (workerState && scannerState && serverOk && scannerOk) {
    console.log('\n[已配置好] 自启和服务都在运行，一切正常。')
  }
  console.log('')
}

main()
