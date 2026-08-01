'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

// Crop & framing step shown right after picking an image, before it's
// uploaded. Drag to pan, slider to zoom; exports the framed region as a JPEG
// data URL (caller turns that into a Blob via lib/upload's dataUrlToBlob).
//
// The frame used to be 300px wide, always, whatever the modal or the screen
// was. For a square avatar that is fine. For a wide cover it meant framing a
// photograph inside a 300x75 slot: too small to see what you were choosing,
// on every phone, no matter how much room the sheet had. It measures the
// space it was given now and fills it.

// Small enough to still fit a narrow phone, large enough that the picture is
// a picture. Beyond the upper bound the frame stops growing, because a crop
// box wider than a forearm is not easier to aim.
const MIN_FRAME = 240
const MAX_FRAME = 420
export function ImageCropModal({
  src,
  aspect = 1,
  shape = 'rect',
  title = 'Encuadra tu foto',
  subtitle,
  outWidth = 640,
  onCancel,
  onApply,
}: {
  src: string | null
  aspect?: number
  shape?: 'rect' | 'hex'
  title?: string
  subtitle?: string
  outWidth?: number
  onCancel: () => void
  onApply: (dataUrl: string) => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const [frameW, setFrameW] = useState(MIN_FRAME)
  const frameH = Math.round(frameW / aspect)

  useEffect(() => {
    if (!src) return
    const i = new Image()
    i.onload = () => {
      setImg(i)
      setZoom(1)
      setPos({ x: 0, y: 0 })
    }
    i.src = src
  }, [src])

  // How much room the sheet actually gave us, watched rather than assumed, so
  // the frame is right on a phone, on a tablet and after a rotation.
  useEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    const measure = () => {
      const w = slot.clientWidth
      if (w > 0) setFrameW(Math.round(Math.min(MAX_FRAME, Math.max(MIN_FRAME, w))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(slot)
    return () => ro.disconnect()
  }, [src])

  if (!src) return null

  const base = img ? Math.max(frameW / img.width, frameH / img.height) : 1
  const scale = base * zoom

  const clampAt = (p: { x: number; y: number }, s: number) => {
    if (!img) return p
    const mx = Math.max(0, (img.width * s - frameW) / 2)
    const my = Math.max(0, (img.height * s - frameH) / 2)
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) }
  }

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    setPos(clampAt({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) }, scale))
  }
  const onUp = () => {
    drag.current = null
    setDragging(false)
  }
  const onZoom = (z: number) => {
    setZoom(z)
    setPos((p) => clampAt(p, base * z))
  }

  // Where the image actually sits, clamped as it is read rather than stored
  // clamped. The frame is measured after the first paint, so a pan that was
  // against the edge of a 240px frame is past the edge of the 354px one that
  // replaces it, and a wider frame would otherwise show a strip of empty
  // background down one side.
  const view = clampAt(pos, scale)

  const apply = () => {
    if (!img) {
      onCancel()
      return
    }
    const outH = Math.round(outWidth / aspect)
    const c = document.createElement('canvas')
    c.width = outWidth
    c.height = outH
    const ctx = c.getContext('2d')!
    const imgX = frameW / 2 + view.x - (img.width * scale) / 2
    const imgY = frameH / 2 + view.y - (img.height * scale) / 2
    ctx.drawImage(img, -imgX / scale, -imgY / scale, frameW / scale, frameH / scale, 0, 0, outWidth, outH)
    onApply(c.toDataURL('image/jpeg', 0.9))
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      subtitle={subtitle || 'Arrastra para mover, desliza para acercar'}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={!img} onClick={apply}>
            Usar foto
          </Button>
        </>
      }
    >
      <div ref={slotRef} className="flex w-full flex-col items-center gap-3.5">
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative max-w-full overflow-hidden rounded-md border border-line-card bg-cream-sunk touch-none"
          style={{ width: frameW, height: frameH, cursor: dragging ? 'grabbing' : 'grab' }}
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: img.width * scale,
                height: img.height * scale,
                transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
              }}
            />
          )}
          {shape === 'hex' && <HexMask frameW={frameW} frameH={frameH} />}
        </div>
        <label className="min-h-11 flex w-full items-center gap-2.5">
          <span className="text-xs text-ink-300">−</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => onZoom(parseFloat(e.target.value))}
            className="flex-1 accent-honey-500"
          />
          <span className="text-xs text-ink-300">+</span>
        </label>
      </div>
    </Modal>
  )
}

function HexMask({ frameW, frameH }: { frameW: number; frameH: number }) {
  const hw = frameH * 0.92
  const x0 = (frameW - hw) / 2
  const h = frameH
  const d = `M0 0H${frameW}V${h}H0Z M${x0 + hw / 2} 0 L${x0 + hw} ${h * 0.25} L${x0 + hw} ${h * 0.75} L${x0 + hw / 2} ${h} L${x0} ${h * 0.75} L${x0} ${h * 0.25} Z`
  return (
    <svg width={frameW} height={h} className="pointer-events-none absolute inset-0">
      <path d={d} fillRule="evenodd" fill="rgba(255,251,240,.72)" />
    </svg>
  )
}
