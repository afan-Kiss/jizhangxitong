import { execSync } from 'child_process'
import path from 'path'

/** 以 UTF-8 控制台编码调用 PowerShell 脚本，避免中文乱码 */
export function execPowerShellUtf8(scriptPath, opts = {}) {
  const normalized = path.resolve(scriptPath).replace(/\\/g, '/')
  const escaped = normalized.replace(/'/g, "''")
  const cmd = [
    'powershell -NoProfile -ExecutionPolicy Bypass -Command',
    `"chcp 65001 > $null; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; & '${escaped}'"`,
  ].join(' ')
  return execSync(cmd, { stdio: 'inherit', ...opts })
}
