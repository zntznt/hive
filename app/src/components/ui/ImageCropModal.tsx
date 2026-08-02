'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { useT } from '@/components/ui/LangProvider'

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
  title,
  subtitle,
  outWidth = 640,
  onCancel,
  onApply,
}: {
  src: string | null
  aspect?: number
  shape?: 'rect' | 'hex'
  title: string
  subtitle?: string
  outWidth?: number
  onCancel: () => void
  onApply: (dataUrl: string) => void
}) {
  const tr = useT()
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

  // Two scales matter. `cover` fills the frame and loses whatever does not
  // fit; `contain` fits the whole picture inside it and leaves room over.
  //
  // The slider used to start at cover and only go up, so cover was the most of
  // your photo you could ever include. A phone shoots 4:3 and this frame is
  // 5:2, which means every cover upload silently threw away about half the
  // height and no amount of dragging brought it back. That is the whole of
  // "it is still cropped": not the page, the picker.
  //
  // So zoom now goes below 1, down to contain, and the room left over is
  // filled with a blurred blow-up of the photo itself rather than bars. The
  // export is a full 5:2 image either way, so nothing downstream has to know
  // which choice was made.
  const cover = img ? Math.max(frameW / img.width, frameH / img.height) : 1
  const contain = img ? Math.min(frameW / img.width, frameH / img.height) : 1
  const minZoom = img ? contain / cover : 1
  const scale = cover * zoom
  // true when the photo no longer fills the frame on its own
  const letterboxed = img ? img.width * scale < frameW - 0.5 || img.height * scale < frameH - 0.5 : false

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
    setPos((p) => clampAt(p, cover * z))
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
    // frame pixels to output pixels
    const k = outWidth / frameW

    // The backdrop, painted first and only visible where the photo does not
    // reach. A blurred blow-up of the same photo rather than a flat colour,
    // because a cover that fades into its own colours reads as one picture and
    // two grey bars read as a mistake.
    if (letterboxed) {
      const fill = Math.max(outWidth / img.width, outH / img.height)
      const bw = img.width * fill
      const bh = img.height * fill
      ctx.filter = 'blur(24px)'
      // drawn slightly oversized so the blur does not pull the page's
      // background in around the edges
      ctx.drawImage(img, (outWidth - bw * 1.12) / 2, (outH - bh * 1.12) / 2, bw * 1.12, bh * 1.12)
      ctx.filter = 'none'
    }

    // The photo itself, at exactly the position and size the frame showed.
    // Positioning the whole image and letting the canvas clip it is the same
    // arithmetic the preview does, so what was framed is what is written; the
    // old source-rectangle form had to be kept in step with it by hand.
    const imgX = frameW / 2 + view.x - (img.width * scale) / 2
    const imgY = frameH / 2 + view.y - (img.height * scale) / 2
    ctx.drawImage(img, imgX * k, imgY * k, img.width * scale * k, img.height * scale * k)
    onApply(c.toDataURL('image/jpeg', 0.9))
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      subtitle={subtitle || tr('ui.crop.hint')}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {tr('common.cancel')}
          </Button>
          <Button disabled={!img} onClick={apply}>
            {tr('crop.usePhoto')}
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
          {/* The same blurred backdrop the export paints, so the frame is a
              preview and not an approximation of one. */}
          {img && letterboxed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
              style={{
                width: frameW * 1.12,
                height: frameH * 1.12,
                objectFit: 'cover',
                filter: 'blur(18px)',
              }}
            />
          )}
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
            min={minZoom}
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
