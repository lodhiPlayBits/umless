import { useEffect, useMemo, useRef } from 'react'

/**
 * Object URL for the blob, available on the same render. Revoked when the blob changes or on
 * unmount; the revoke is deferred so StrictMode's simulated unmount/remount can cancel it.
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  const pendingRevoke = useRef<{ url: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  useEffect(() => {
    if (pendingRevoke.current?.url === url) clearTimeout(pendingRevoke.current.timer)
    return () => {
      if (!url) return
      pendingRevoke.current = { url, timer: setTimeout(() => URL.revokeObjectURL(url), 0) }
    }
  }, [url])
  return url
}
