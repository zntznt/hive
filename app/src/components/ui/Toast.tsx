'use client'

import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react'

// Transient confirmation pill, bottom-center, auto-dismissing. A tiny local
// provider is enough here since every mutation already round-trips through a
// server action + revalidatePath - no cross-page toast queue needed.
const ToastCtx = createContext<(message: string) => void>(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const show = useCallback((m: string) => setMessage(m), [])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 2400)
    return () => clearTimeout(t)
  }, [message])

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {message && (
        <div
          role="status"
          className="fixed bottom-7 left-1/2 z-[140] flex max-w-[calc(100vw-40px)] -translate-x-1/2 items-center gap-2 rounded-pill px-[18px] py-2.5 text-[13.5px] font-bold text-on-dark shadow-raised"
          style={{ background: 'var(--charcoal-2)' }}
        >
          <span aria-hidden="true">🍯</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{message}</span>
        </div>
      )}
    </ToastCtx.Provider>
  )
}
