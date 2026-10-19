export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

const pad = (n: number) => String(n).padStart(2, '0')

export function baseFileName(question: string, at: Date): string {
  const date = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  return `${slugify(question) || 'practice'}-${date}-${time}`
}

export function transcriptText(question: string, transcript: string): string {
  const q = question.trim()
  return q ? `${q}\n\n${transcript}\n` : `${transcript}\n`
}
