'use client'

import { useState } from 'react'

// `path` is origin-relative ("/e/abc"); the full URL is built client-side
export default function CopyButton({ path, label = 'Copiar enlace' }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${location.origin}${path}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="rounded-lg border border-amber-500 px-2 py-1 text-xs font-medium text-amber-700"
    >
      {copied ? 'Copiado ✓' : label}
    </button>
  )
}
