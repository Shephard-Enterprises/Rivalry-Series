export function nextDraftDeadline() {
  const date = new Date()
  const days = (3 - date.getDay() + 7) % 7
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 0, 0)
  if (date <= new Date()) date.setDate(date.getDate() + 7)
  return date
}
