import type { StringKey } from './lang'
// Shrink a picked image before it is uploaded.
//
// Avatars and banners go through ImageCropModal, which redraws the picture on
// a canvas and exports JPEG, so whatever the member picked comes out small and
// of an allowed type. The payment proof has no crop step: the file went up
// exactly as it came off the phone. Since 0032 the buckets cap at 2 MB and
// accept only JPEG, PNG and WebP, and a photo straight from a phone camera is
// routinely three to five megabytes, so the most ordinary thing a member can
// do (screenshot the transfer, attach it) started failing.
//
// Redrawing through a canvas fixes both halves at once: the result is JPEG
// whatever went in, and capping the long edge keeps a receipt well under the
// limit while staying legible. It also rescues iOS, where the camera hands
// over HEIC and the browser decodes it for us.
//
// Returns a data URL, the same shape ImageCropModal hands back.

// A receipt or a transfer screenshot is legible well below this, and the
// steps below exist because "small enough" depends on the picture: a photo of
// a printed ticket is mostly noise and compresses far worse than a screenshot,
// so one fixed size cannot promise to fit. Each step is tried in order and the
// first result under the budget wins.
const STEPS: [edge: number, quality: number][] = [
  [1600, 0.85],
  [1600, 0.7],
  [1200, 0.7],
  [900, 0.65],
]
// the bucket refuses at 2 MB, so stop short of it rather than at it
const BUDGET_BYTES = 1_700_000

// data URLs are base64: four characters per three bytes, minus the padding
// and the "data:image/jpeg;base64," prefix.
function approxBytes(dataUrl: string) {
  const body = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.floor((body.length * 3) / 4) - padding
}

// Takes the translator: this runs in the browser and throws messages the
// caller shows, and a plain function cannot call a hook.
export async function downscaleToDataUrl(file: File, t: (k: StringKey) => string): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(t('err.image.read')))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    // A format the browser cannot decode (HEIC on desktop, mostly) lands here.
    // Saying so beats uploading it and letting storage answer in English.
    el.onerror = () => reject(new Error(t('err.image.open')))
    el.src = raw
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return raw

  let out = raw
  for (const [edge, quality] of STEPS) {
    const scale = Math.min(1, edge / Math.max(img.width, img.height))
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    out = canvas.toDataURL('image/jpeg', quality)
    if (approxBytes(out) <= BUDGET_BYTES) return out
  }
  // Every step was still too heavy, which takes a very large and very noisy
  // picture. Hand back the smallest one anyway: the server action says so in
  // Spanish if storage still refuses it.
  return out
}
