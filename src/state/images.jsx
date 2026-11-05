import { useEffect, useState } from 'react'
import { getImage, putImage, deleteImage, isImageStoreAvailable } from '../services/imageStore.js'
import { processImageFile } from '../lib/images.js'
import { useData } from './DataContext.jsx'

// Object URLs for stored photos, cached by image ID. Image IDs are never
// reused (a replaced photo gets a new ID), so the cache never goes stale.
const urlCache = new Map()
const pending = new Map()

function loadUrl(id) {
  if (urlCache.has(id)) return Promise.resolve(urlCache.get(id))
  if (!pending.has(id)) {
    pending.set(
      id,
      getImage(id)
        .then((blob) => {
          if (!blob) return null // not cached: the photo may arrive later (e.g. from a restore)
          const url = URL.createObjectURL(blob)
          urlCache.set(id, url)
          return url
        })
        .catch(() => null)
        .finally(() => pending.delete(id)),
    )
  }
  return pending.get(id)
}

/** Returns a displayable URL for a stored image ID (or null). */
export function useImageUrl(imageId) {
  const { snapshotImages, imagesVersion } = useData()
  const fromSnapshot = imageId && snapshotImages ? snapshotImages[imageId] : null
  const [url, setUrl] = useState(() => fromSnapshot || (imageId ? urlCache.get(imageId) : null) || null)

  useEffect(() => {
    if (!imageId) return setUrl(null)
    if (fromSnapshot) return setUrl(fromSnapshot)
    if (!isImageStoreAvailable()) return setUrl(null)
    let cancelled = false
    loadUrl(imageId).then((u) => !cancelled && setUrl(u))
    return () => {
      cancelled = true
    }
  }, [imageId, fromSnapshot, imagesVersion])

  return url
}

/** Processes and stores an uploaded photo; returns the new image ID. */
export async function storeUploadedImage(file, preset) {
  if (!isImageStoreAvailable()) throw new Error('Photo storage is not available in this browser.')
  const blob = await processImageFile(file, preset)
  return putImage(blob)
}

/** Removes a stored photo and its cached URL. Errors are ignored. */
export async function discardImage(id) {
  if (!id) return
  const url = urlCache.get(id)
  if (url) URL.revokeObjectURL(url)
  urlCache.delete(id)
  try {
    await deleteImage(id)
  } catch {
    /* an orphaned photo is harmless; it is cleaned up on the next restore */
  }
}
