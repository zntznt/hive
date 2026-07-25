'use client'

import { uploadAvatarPhotoAction, uploadBannerAction, uploadPaymentProofAction } from '@/app/actions'

// Uploads travel through server actions as FormData (File blobs cross the
// boundary fine). Server-side the cookie session is always attached, unlike
// the browser Supabase client, whose document.cookie session read proved
// unreliable in production and sent uploads out as anon (RLS then rejected
// them). Signatures kept from the old client-side version.

function toFormData(blob: Blob) {
  const fd = new FormData()
  fd.set('file', new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }))
  return fd
}

export async function uploadAvatarPhoto(_userId: string, blob: Blob) {
  return uploadAvatarPhotoAction(toFormData(blob))
}

export async function uploadBanner(clubId: string, blob: Blob) {
  return uploadBannerAction(clubId, toFormData(blob))
}

// private bucket: resolves to the storage path (not a public URL); the
// server action derives the folder from the session, so any stale userId
// argument from callers is ignored.
export async function uploadPaymentProof(_userId: string, blob: Blob) {
  return uploadPaymentProofAction(toFormData(blob))
}

// Turns a data-URL (from ImageCropModal's canvas export) into a Blob for upload.
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
