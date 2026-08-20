'use client'

import { useState, useTransition } from 'react'
import { updateJoinPolicy } from '@/app/actions'
import { Select } from '@/components/ui/Input'
import { useT } from '@/components/ui/LangProvider'
import type { StringKey } from '@/lib/lang'

const CONSEQUENCE: Record<string, StringKey> = {
  club_members_only: 'inv.who.membersOnly',
  anyone_with_link: 'inv.who.anyone',
  invite_only: 'inv.who.inviteOnly',
}

// Commits on change, and says what each choice does.
//
// It was a Select plus a separate Guardar, so three labels sat there stating
// no consequence at all and the choice stayed unsaved until a second tap.
// Nothing here is destructive and the value is one column, so change is the
// commit, with the saved note as the receipt.
export function JoinPolicyPicker({ eventId, slug, value }: { eventId: string; slug: string; value: string }) {
  const tr = useT()
  const [current, setCurrent] = useState(value)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <Select
        id="join_policy"
        name="join_policy"
        label={tr('inv.who')}
        value={current}
        onChange={(e) => {
          const next = e.target.value
          setCurrent(next)
          setSaved(false)
          const fd = new FormData()
          fd.set('join_policy', next)
          start(async () => {
            await updateJoinPolicy(eventId, slug, fd)
            setSaved(true)
          })
        }}
      >
        <option value="club_members_only">{tr('inv.membersOnly')}</option>
        <option value="anyone_with_link">{tr('inv.anyone')}</option>
        <option value="invite_only">{tr('inv.inviteOnly')}</option>
      </Select>
      <p className="text-xs text-ink-500">
        {tr(CONSEQUENCE[current] ?? 'inv.who.membersOnly')}
        {saved && !pending && <span className="ml-1.5 font-bold text-sage-600">{tr('inv.saved')}</span>}
      </p>
    </div>
  )
}
