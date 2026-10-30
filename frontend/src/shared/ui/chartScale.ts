/** Round the top of the y axis up to a "nice" number, so gridlines land on readable values. */
export function niceMax(value: number): number {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (factor * step >= value) return factor * step
  }
  return 10 * step
}
