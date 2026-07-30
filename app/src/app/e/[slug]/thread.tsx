'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addComment, removeComment } from '@/app/actions'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Icon } from '@/components/ui/Icon'
import { timeAgo } from '@/lib/relative-time'

export type Comment = {
  id: string
  body: string
  created_at: string
  user_id: string
  user: AvatarUser
}

// Coordination around an event: "voy 20 min tarde", "¿quién trae el hielo?".
//
// It had no home, so it happened in the WhatsApp group and the app lost the
// context it had just created. This is deliberately not a chat. It belongs to
// one event, it dies with it, and there is no unread state, because the moment
// something has to be kept up with it becomes an inbox and the app has spent
// its whole design avoiding one.

export default function Thread({
  eventId,
  slug,
  myId,
  isOrganizer,
  comments,
}: {
  eventId: string
  slug: string
  myId: string
  isOrganizer: boolean
  comments: Comment[]
}) {
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  function send() {
    const text = body.trim()
    if (!text) return
    const fd = new FormData()
    fd.set('body', text)
    startTransition(async () => {
      await addComment(eventId, slug, fd)
      setBody('')
      box.current?.focus()
      router.refresh()
    })
  }

  return (
    <section className="mb-8">
      <SectionHeader>Conversación{comments.length ? ` · ${comments.length}` : ''}</SectionHeader>

      {comments.length > 0 && (
        <ul className="mb-2.5 flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5 rounded-md border border-line-card bg-paper px-3.5 py-2.5">
              <UserAvatar user={c.user} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-bold text-ink-900">{c.user.display_name}</span>
                  <span className="text-[11.5px] text-ink-300">{timeAgo(c.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-700">
                  {c.body}
                </p>
              </div>
              {(c.user_id === myId || isOrganizer) && (
                <button
                  type="button"
                  aria-label="Borrar"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await removeComment(c.id, slug)
                      router.refresh()
                    })
                  }
                  className="h-8 w-8 flex-shrink-0 text-ink-300"
                >
                  <Icon name="trash" size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          placeholder="Escribe algo para el grupo…"
          className="min-h-11 flex-1 resize-none rounded-md border-[1.5px] border-line-input bg-paper px-3.5 py-2.5 text-[13.5px] text-ink-900 outline-none placeholder:text-ink-300 focus:border-honey-500"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !body.trim()}
          aria-label="Enviar"
          className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-md bg-honey-500 text-charcoal shadow-lip disabled:opacity-40"
        >
          <Icon name="paper-plane" size={14} />
        </button>
      </div>
    </section>
  )
}
