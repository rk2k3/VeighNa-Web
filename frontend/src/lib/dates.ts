// Polygon's free tier only serves ~2 years of history, so default to the last year
export function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setFullYear(end.getFullYear() - 1)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}
