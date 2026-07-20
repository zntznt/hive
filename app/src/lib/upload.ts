'use client'

import { supabaseBrowser } from './supabase/client'

// Client-side storage uploads. File blobs can't cross a server-action
// boundary cleanly, so these run in the browser against the anon key and
// rely entirely on the storage RLS policies from migration 0005.

async function upload(bucket: string, path: string, blob: Blob) {
  const { error } = await supabaseBrowser().storage.from(bucket).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return path
}

export async function uploadAvatarPhoto(userId: string, blob: Blob) {
  const path = await upload('avatars', `${userId}/${Date.now()}.jpg`, blob)
  const { data } = supabaseBrowser().storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}

export async function uploadBanner(clubId: string, blob: Blob) {
  const path = await upload('banners', `${clubId}/${Date.now()}.jpg`, blob)
  const { data } = supabaseBrowser().storage.from('banners').getPublicUrl(path)
  return data.publicUrl
}

// Private bucket: returns the storage path (not a public URL) - the server
// action stores this on the settlement row and mints signed URLs to display it.
export async function uploadPaymentProof(userId: string, blob: Blob) {
  return upload('payment-proofs', `${userId}/${Date.now()}.jpg`, blob)
}

// Turns a data-URL (from ImageCropModal's canvas export) into a Blob for upload.
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
