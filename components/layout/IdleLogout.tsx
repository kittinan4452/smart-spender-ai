'use client'

import { useEffect, useRef, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import Swal from 'sweetalert2'

const IDLE_MS = 30 * 60 * 1000   // 30 minutes
const WARN_MS = 1 * 60 * 1000    // warn 1 minute before logout

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

export default function IdleLogout() {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnShown = useRef(false)

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (warnTimer.current) clearTimeout(warnTimer.current)
  }, [])

  const logout = useCallback(() => {
    Swal.close()
    signOut({ callbackUrl: '/th/login' })
  }, [])

  const showWarning = useCallback(() => {
    warnShown.current = true
    Swal.fire({
      title: 'ไม่มีการใช้งาน',
      html: 'ระบบจะออกจากระบบอัตโนมัติใน <b>1 นาที</b>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยังอยู่นะ',
      cancelButtonText: 'ออกเลย',
      confirmButtonColor: '#6366f1',
      cancelButtonColor: '#6b7280',
      timer: WARN_MS,
      timerProgressBar: true,
      allowOutsideClick: false,
    }).then(result => {
      warnShown.current = false
      if (result.isDismissed && result.dismiss === Swal.DismissReason.timer) {
        logout()
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        logout()
      }
      // confirmed → reset timers (already reset by activity listener, but ensure clean state)
    })
  }, [logout])

  const resetTimers = useCallback(() => {
    if (warnShown.current) return  // don't reset while warning is visible
    clearTimers()
    warnTimer.current = setTimeout(showWarning, IDLE_MS - WARN_MS)
    idleTimer.current = setTimeout(logout, IDLE_MS)
  }, [clearTimers, showWarning, logout])

  useEffect(() => {
    resetTimers()
    EVENTS.forEach(e => window.addEventListener(e, resetTimers, { passive: true }))
    return () => {
      clearTimers()
      EVENTS.forEach(e => window.removeEventListener(e, resetTimers))
    }
  }, [resetTimers, clearTimers])

  return null
}
