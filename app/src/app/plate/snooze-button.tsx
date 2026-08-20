'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { snoozePlateItem } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { useT } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

// "Luego": gone until tomorrow morning, then back. Not a dismissal, because
// the thing it points at is still owed, and a debt should not disappear
// because somebody was busy on a Tuesday.
//
// Two shapes, because it sits in two places. In the loud block it is the other
// half of a pair, so it is a real secondary button with a word on it. In a list
// row the kit draws a 44px clock and nothing else: a word per row put "Luego"
// down the whole column beside every debt.
//
// The label used to be a Spanish default parameter, so one page showed "Luego"
// on the rows it did not pass a label to and the translated word on the one it
// did. There is no default now; both shapes read the table.
export default function SnoozeButton({ itemKey, wide = false }: { itemKey: string; wide?: boolean }) {
  const tr = useT()
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const router = useRouter()

  const go = () =>
    startTransition(async () => {
      await snoozePlateItem(itemKey)
      toast(tr('plate.snooze'))
      router.refresh()
    })

  if (wide) {
    return (
      <Button variant="secondary" block disabled={pending} onClick={go}>
        {tr('plate.later')}
      </Button>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={go}
      aria-label={tr('plate.snooze.aria')}
      title={tr('plate.later')}
      className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-sm text-ink-500 disabled:opacity-50"
    >
      <Icon name="clock" size={15} />
    </button>
  )
}
