// Client-side photo processing: photos are scaled down before storage so
// the browser's storage quota goes much further.

export const IMAGE_PRESETS = {
  player: { maxSize: 480, quality: 0.82, type: 'image/jpeg' },
  team: { maxSize: 1600, quality: 0.82, type: 'image/jpeg' },
  logo: { maxSize: 512, quality: 0.9, type: 'image/png' },
}

const MAX_INPUT_BYTES = 25 * 1024 * 1024

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This file could not be read as an image. Try a JPEG or PNG photo.'))
    }
    img.src = url
  })
}

/** Resizes an uploaded image file and returns a compressed Blob. */
export async function processImageFile(file, preset = IMAGE_PRESETS.player) {
  if (!file) throw new Error('No file selected.')
  if (!file.type || !file.type.startsWith('image/')) throw new Error('Please choose an image file (JPEG, PNG or WebP).')
  if (file.size > MAX_INPUT_BYTES) throw new Error('This image is larger than 25 MB. Please choose a smaller photo.')

  const img = await loadImage(file)
  const scale = Math.min(1, preset.maxSize / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (preset.type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, preset.type, preset.quality))
  if (!blob) throw new Error('The photo could not be processed in this browser.')
  return blob
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Could not read image data.'))
    reader.readAsDataURL(blob)
  })
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/

export function isImageDataURL(value) {
  return typeof value === 'string' && DATA_URL.test(value)
}

export function dataURLToBlob(dataURL) {
  const m = DATA_URL.exec(dataURL)
  if (!m) throw new Error('Invalid image data.')
  const binary = atob(m[2].replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

/** Every image ID referenced by the dataset. */
export function referencedImageIds(data) {
  const ids = new Set()
  if (data?.settings?.logoImageId) ids.add(data.settings.logoImageId)
  for (const p of data?.players || []) if (p.photoId) ids.add(p.photoId)
  for (const g of data?.groups || []) if (g.photoId) ids.add(g.photoId)
  for (const t of data?.teamPhotos || []) if (t.imageId) ids.add(t.imageId)
  return ids
}

/** Downloads an image from a URL (e.g. a published photo) as a Blob. */
export async function fetchImageBlob(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Photo could not be downloaded (${res.status}).`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('Downloaded file is not an image.')
  return blob
}

/** A data URL for an image source that may be a data URL or a normal URL. */
export async function imageSourceToDataURL(src) {
  if (isImageDataURL(src)) return src
  return blobToDataURL(await fetchImageBlob(src))
}
