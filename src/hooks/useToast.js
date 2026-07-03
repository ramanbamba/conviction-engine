/**
 * P6-2: useToast hook
 *
 * Returns { toasts, toast, dismiss }
 * toast({ message, type: 'success'|'error'|'info', duration: 3000 })
 */
import { useState, useCallback, useRef } from 'react'

let _nextId = 0

export function useToast() {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const toast = useCallback(({ message, type = 'info', duration = 3500 }) => {
    const id = ++_nextId
    setToasts(t => [...t.slice(-2), { id, message, type }]) // max 3

    timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return { toasts, toast, dismiss }
}
