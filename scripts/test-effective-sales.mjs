#!/usr/bin/env node
/**
 * 有效成交金额口径单元测试（9 个用例）
 */
import { isEffectiveSale, EFFECTIVE_SALES_RULE_HINT } from '@jade-account/shared'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:effective-sales', TIMEOUTS.acceptanceBasic)

const cases = [
  { name: '已完成 + 无售后 = 计入', os: '已完成', as: null, expect: true },
  { name: '已签收 + 无售后 = 计入', os: '已签收', as: '', expect: true },
  { name: '已完成 + 售后取消 = 计入', os: '已完成', as: '售后取消', expect: true },
  { name: '已签收 + 售后取消 = 计入', os: '已签收', as: '售后取消', expect: true },
  { name: '已完成 + 售后处理中 = 不计入', os: '已完成', as: '售后处理中', expect: false },
  { name: '已签收 + 售后处理中 = 不计入', os: '已签收', as: '售后处理中', expect: false },
  { name: '已完成 + 退款成功 = 不计入', os: '已完成', as: '退款成功', expect: false },
  { name: '已关闭 + 无售后 = 不计入', os: '已关闭', as: null, expect: false },
  { name: '待发货 + 无售后 = 不计入', os: '待发货', as: null, expect: false },
]

let failed = 0
for (const c of cases) {
  const got = isEffectiveSale(c.os, c.as)
  if (got === c.expect) {
    console.log(`✓ ${c.name}`)
  } else {
    failed++
    console.error(`✗ ${c.name} — 期望 ${c.expect} 得到 ${got}`)
  }
}

if (!EFFECTIVE_SALES_RULE_HINT.includes('有效成交金额')) {
  failed++
  console.error('✗ 口径说明文案缺失')
} else {
  console.log('✓ 口径说明文案存在')
}

// 系统内 sold 状态
if (isEffectiveSale('sold', null)) {
  console.log('✓ sold + 无售后 = 计入')
} else {
  failed++
  console.error('✗ sold + 无售后 应计入')
}

console.log(`\n=== 结果: ${cases.length + 2 - failed}/${cases.length + 2} 通过 ===`)
if (failed > 0) process.exit(1)
