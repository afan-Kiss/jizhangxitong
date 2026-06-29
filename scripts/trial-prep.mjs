/**
 * 试用前系统状态检查
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import ExcelJS from 'exceljs'
import {
  ROOT, SERVER, SCANNER, login, fetchJson, authHeaders,
  ensureServerRunning, ensureWorkerRunning, ensureScannerRunning,
  createTestPng, writeMarkdownReport,
} from './lib/services.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const report = {
  sections: [['检查项', 'checks'], ['结论', 'summary']],
  data: { checks: [], summary: [] },
}

function log(msg, ok = true) {
  report.data.checks.push(`${ok ? '✓' : '✗'} ${msg}`)
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
}

async function main() {
  console.log('\n========== 试用前系统检查 ==========\n')

  await ensureServerRunning((s, m, ok) => log(m, ok !== false))
  await ensureScannerRunning((s, m, ok) => log(m, ok !== false))
  const token = await ensureWorkerRunning((s, m, ok) => log(m, ok !== false))

  const h = await fetchJson(`${SERVER}/api/health`)
  log(`服务端: ${h.json.message || 'OK'}`, h.res.ok)

  const w = await fetchJson(`${SERVER}/api/local-worker/status`, { headers: authHeaders(token) })
  log(`Worker: ${w.json.data?.online ? '在线' : '离线'}`, w.json.data?.online)

  const s = await fetchJson(`${SCANNER}/api/health`)
  log(`扫码枪 API: ${s.res.ok ? '正常' : '异常'}`, s.res.ok)

  try {
    await fs.access('D:/jewelry-account-files')
    const test = path.join('D:/jewelry-account-files', '.write-test')
    await fs.writeFile(test, 'ok')
    await fs.unlink(test)
    log('本地图片目录: 可写', true)
  } catch {
    log('本地图片目录: 不可写或不存在', false)
  }

  const ws = await fetchJson(`${SERVER}/api/local-worker/status`, { headers: authHeaders(token) })
  if (ws.json.data?.online) {
    const buf = await createTestPng()
    const form = new FormData()
    form.append('file', new Blob([buf], { type: 'image/png' }), 'prep-test.png')
    form.append('fileType', 'payment_screenshot')
    const up = await fetch(`${SERVER}/api/files/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    log(`图片上传: ${up.ok ? 'OK' : '失败'}`, up.ok)

    const exp = await fetchJson(`${SERVER}/api/expenses`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        amount: 0.01,
        expenseType: '日常物料',
        paySource: '员工垫付',
        reimbursementPerson: 'prep-check',
        occurredAt: new Date().toISOString().slice(0, 10),
        remark: 'prep-check-delete',
        needsAttachment: false,
      }),
    })
    if (exp.res.ok) {
      const today = new Date().toISOString().slice(0, 10)
      const ex = await fetchJson(`${SERVER}/api/expenses/export/reimbursement-excel`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ startDate: today, endDate: today, reimbursementStatus: 'all' }),
      })
      log(`Excel 导出: ${ex.res.ok ? 'OK' : ex.json.message}`, ex.res.ok)
      await fetchJson(`${SERVER}/api/expenses/${exp.json.data.id}/void`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ voidReason: 'prep check cleanup' }),
      })
    }
  } else {
    log('Excel 导出: 跳过（Worker 离线）', false)
  }

  const { spawnSync } = await import('child_process')
  const auto = spawnSync('node', [path.join(__dirname, 'check-autostart.mjs')], { encoding: 'utf-8' })
  const autoOk = auto.stdout?.includes('已配置好')
  log(`开机自启: ${autoOk ? '已配置' : '未配置（可双击一键安装自启.bat）'}`, autoOk)

  const bak = spawnSync('node', [path.join(__dirname, 'check-backup-status.mjs')], { encoding: 'utf-8' })
  const bakOk = bak.stdout?.includes('备份正常')
  log(`最近备份: ${bakOk ? '正常' : '需备份'}`, bakOk)

  const failed = report.data.checks.filter((l) => l.startsWith('✗'))
  if (failed.length) {
    report.data.summary.push(`有 ${failed.length} 项需关注，建议修复后再真实试用`)
  } else {
    report.data.summary.push('系统状态良好，可以开始试用')
  }

  const p = await writeMarkdownReport(report, 'trial-prep')
  console.log(`\n报告: ${p}\n`)
  if (failed.length) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
