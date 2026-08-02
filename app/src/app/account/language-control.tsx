'use client'

import { useState, useTransition } from 'react'
import { setLanguage } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { t, type Lang } from '@/lib/lang'

// Three options and no flags. A flag is a country, not a language: Spanish is
// not Spain to most of the people using this, and English is not the union
// jack. The words are each written in their own language, which is the one
// convention that works when you cannot read the interface you are in.
//
// It sits with the bug and the name because it is part of who you are, not a
// setting filed under a gear.
export function LanguageControl({ value, lang }: { value: Lang | null; lang: Lang }) {
  const [choice, setChoice] = useState<Lang | null>(value)
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const OPTIONS: { v: Lang | null; label: string }[] = [
    { v: null, label: t(lang, 'lang.auto') },
    { v: 'en', label: t(lang, 'lang.en') },
    { v: 'es', label: t(lang, 'lang.es') },
  ]

  function pick(v: Lang | null) {
    setChoice(v)
    startTransition(async () => {
      await setLanguage(v)
      toast(t(lang, 'saved'))
    })
  }

  return (
    <div className="mt-3.5">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">{t(lang, 'lang.label')}</span>
      <div className="flex gap-2">
        {OPTIONS.map((o) => {
          const on = choice === o.v
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => pick(o.v)}
              className={`tap min-h-11 flex-1 rounded-pill px-2 text-[12.5px] font-bold ${
                on ? 'bg-honey-500 text-charcoal' : 'border border-line-card bg-paper text-ink-700'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
