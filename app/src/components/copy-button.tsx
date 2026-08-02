'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/components/ui/LangProvider'

// `path` is origin-relative ("/e/abc"); the full URL is built client-side
export default function CopyButton({ path, label }: { path: string; label?: string }) {
  const tr = useT()
  const text = label ?? tr('event.bar.copyLink')
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${location.origin}${path}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="tap rounded-md border-[1.5px] border-honey-500 px-2 py-1 text-xs font-bold text-honey-700"
    >
      {copied ? (
        <>
          <Icon name="check" size={11} /> Copiado
        </>
      ) : (
        text
      )}
    </button>
  )
}
