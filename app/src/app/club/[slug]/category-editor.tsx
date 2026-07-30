'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, EmojiField } from '@/components/ui/Input'
import { ChipButton } from '@/components/ui/Chip'
import { proposeOrEditCategory, deleteCategory } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

type Category = { id: string; name: string; emoji: string | null }

export function AddCategoryButton({ clubId, slug, isAdmin }: { clubId: string; slug: string; isAdmin: boolean }) {
  return <CategoryModal clubId={clubId} slug={slug} isAdmin={isAdmin} trigger={<span className="inline-flex items-center gap-1"><Icon name="plus" size={10} /> Categoría</span>} />
}

export function EditCategoryButton({ clubId, slug, isAdmin, category }: { clubId: string; slug: string; isAdmin: boolean; category: Category }) {
  return <CategoryModal clubId={clubId} slug={slug} isAdmin={isAdmin} category={category} trigger={<span aria-hidden="true"><Icon name="pen" size={12} /></span>} small />
}

function CategoryModal({
  clubId,
  slug,
  isAdmin,
  category,
  trigger,
  small,
}: {
  clubId: string
  slug: string
  isAdmin: boolean
  category?: Category
  trigger: React.ReactNode
  small?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(category?.name ?? '')
  const [emoji, setEmoji] = useState(category?.emoji ?? '🎲')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function save() {
    const fd = new FormData()
    fd.set('name', name)
    fd.set('emoji', emoji)
    startTransition(async () => {
      await proposeOrEditCategory(clubId, slug, category?.id ?? null, fd)
      setOpen(false)
      router.refresh()
    })
  }

  function remove() {
    if (!category) return
    startTransition(async () => {
      await deleteCategory(clubId, slug, category.id)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      {small ? (
        <button aria-label="Editar categoría" onClick={() => setOpen(true)} className="tap -ml-0.5 px-1 text-[11px] text-ink-300">
          {trigger}
        </button>
      ) : (
        <ChipButton onClick={() => setOpen(true)} className="border-dashed !border-line-input !bg-transparent !text-ink-500">
          {trigger}
        </ChipButton>
      )}
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={category ? 'Editar categoría' : 'Nueva categoría'}
          footer={
            <>
              {category && (
                <Button variant="danger" disabled={pending} onClick={remove}>
                  Eliminar
                </Button>
              )}
              <Button disabled={pending || !name.trim()} onClick={save}>
                {isAdmin ? (category ? 'Guardar' : 'Añadir categoría') : 'Enviar para aprobación'}
              </Button>
            </>
          }
        >
          <div className="flex items-end gap-2.5">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">Emoji</label>
              <EmojiField value={emoji} onChange={setEmoji} />
            </div>
            <div className="flex-1">
              <Input label="Nombre de la categoría" placeholder="Juegos de mesa" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
