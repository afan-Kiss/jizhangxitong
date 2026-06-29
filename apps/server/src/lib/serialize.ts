/** 从 API 响应中移除敏感字段 */
export function sanitizeUser<T extends Record<string, unknown>>(user: T | null | undefined) {
  if (!user) return user
  const { password, ...rest } = user as T & { password?: string }
  return rest
}

export function sanitizeUsers<T extends Record<string, unknown>>(users: T[]) {
  return users.map((u) => sanitizeUser(u)!)
}

export function sanitizeFile<T extends Record<string, unknown>>(file: T | null | undefined) {
  if (!file) return file
  const { localPath, thumbPath, ...rest } = file as T & { localPath?: string; thumbPath?: string }
  return rest
}
