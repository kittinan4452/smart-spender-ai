'use client'

import { useEffect } from 'react'

const EVENT = 'app:data-changed'

export function emitDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT))
  }
}

export function useDataRefresh(callback: () => void) {
  useEffect(() => {
    const handler = () => callback()
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [callback])
}
