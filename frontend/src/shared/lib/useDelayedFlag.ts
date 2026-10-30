import { useEffect, useState } from 'react'

/** True once `on` has stayed true for `ms`: skeletons that don't flash on fast loads. */
export function useDelayedFlag(on: boolean, ms: number): boolean {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!on) {
      setLate(false)
      return
    }
    const timer = window.setTimeout(() => setLate(true), ms)
    return () => window.clearTimeout(timer)
  }, [on, ms])
  return on && late
}
