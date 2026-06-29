/** 登录表单前端校验（可被验收脚本直接测试） */
export function validateLoginForm(username: string, password: string): string | null {
  if (!username.trim() || !password) return '请输入用户名和密码'
  return null
}
