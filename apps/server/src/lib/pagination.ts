export function clampPage(n: unknown, fallback = 1): number {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 1) return fallback
  return Math.floor(v)
}

export function clampPageSize(n: unknown, fallback = 20, max = 100): number {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 1) return fallback
  return Math.min(Math.floor(v), max)
}
