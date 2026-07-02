# 以 UTF-8 控制台编码运行另一个 PowerShell 脚本（避免中文乱码）
param(
  [Parameter(Mandatory = $true)]
  [string]$ScriptPath,
  [Parameter(ValueFromRemainingArguments = $true)]
  [object[]]$ScriptArgs
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-ConsoleUtf8

$resolved = Resolve-Path -LiteralPath $ScriptPath
& $resolved @ScriptArgs
exit $LASTEXITCODE
