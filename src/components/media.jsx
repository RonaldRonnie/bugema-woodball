import { useState } from 'react'
import { useImageUrl, storeUploadedImage, discardImage } from '../state/images.jsx'
import { useData } from '../state/DataContext.jsx'
import { useToast } from '../state/UIContext.jsx'
import { IMAGE_PRESETS } from '../lib/images.js'
import Icon from './Icons.jsx'

export function initials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2)
  return letters.toUpperCase()
}

export function PlayerAvatar({ player, group, size = 40 }) {
  const url = useImageUrl(player?.photoId)
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36), '--ring': group?.color || 'var(--border)' }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" loading="lazy" /> : initials(player?.name)}
    </span>
  )
}

/** The default emblem: a woodball gate with the ball passing through. */
export function DefaultMark({ className, size = 36 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#13315c" />
      <path d="M18 46V26a14 14 0 0 1 28 0v20" fill="none" stroke="#f2b705" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="40" r="7" fill="#fff" />
    </svg>
  )
}

export function TeamLogo({ className = 'brand-logo' }) {
  const { data } = useData()
  const url = useImageUrl(data.settings.logoImageId)
  return url ? <img className={className} src={url} alt="" /> : <DefaultMark className={className} />
}

export function StoredImage({ imageId, alt = '', className, fallback = null }) {
  const url = useImageUrl(imageId)
  if (!url) return fallback
  return <img className={className} src={url} alt={alt} loading="lazy" />
}

/**
 * Upload / replace / remove control for one photo.
 * `onChange(newImageId | null)` must persist the new ID; if it reports
 * failure the newly stored image is discarded again.
 */
export function PhotoPicker({ imageId, onChange, preset = IMAGE_PRESETS.player, label = 'Photo' }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const url = useImageUrl(imageId)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const newId = await storeUploadedImage(file, preset)
      const ok = await onChange(newId)
      if (ok === false) await discardImage(newId)
      else if (imageId) await discardImage(imageId)
    } catch (err) {
      toast.error(err.message || 'The photo could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const ok = await onChange(null)
    if (ok !== false && imageId) await discardImage(imageId)
  }

  return (
    <div className="photo-picker">
      <div className="photo-preview">{url ? <img src={url} alt={`${label} preview`} /> : <span>No photo</span>}</div>
      <div className="row">
        <label className="btn btn-sm file-label">
          <Icon name="camera" /> {busy ? 'Saving…' : imageId ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*" onChange={handleFile} disabled={busy} aria-label={`Upload ${label.toLowerCase()}`} />
        </label>
        {imageId && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
