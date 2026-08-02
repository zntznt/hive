'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { snoozePlateItem } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { useT } from '@/components/ui/LangProvider'

// "Luego": gone until tomorrow morning, then back. Not a dismissal, because
// the thing it points at is still owed, and a debt should not disappear
// because somebody was busy on a Tuesday.
export default function SnoozeButton({ itemKey, label = 'Luego' }: { itemKey: string; label?: string }) {
  const tr = useT()
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const router = useRouter()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await snoozePlateItem(itemKey)
          toast(tr('plate.snooze'))
          router.refresh()
        })
      }
      className="min-h-11 flex-shrink-0 px-2 text-[12.5px] font-bold text-ink-300 disabled:opacity-50"
    >
      {label}
    </button>
  )
}
