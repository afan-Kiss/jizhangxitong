import { showConfirmDialog, type DialogOptions } from 'vant'

/** 用户点取消时返回 false，点确认返回 true；不会抛出未捕获异常 */
export async function confirmAction(options: DialogOptions): Promise<boolean> {
  try {
    await showConfirmDialog(options)
    return true
  } catch {
    return false
  }
}
