import { describe, it, expect, vi } from 'vitest'
import { DATA_KEY, loadDataset, validateDataset } from '../src/services/storage.js'
import { decodeImages, writeImages, BackupError } from '../src/services/backup.js'
import { putImage, listImageIds } from '../src/services/imageStore.js'
import { seedWithMatch, clone } from './helpers.js'

describe('regressions', () => {
  it('rejects a match with no rounds (score screen needs at least one)', () => {
    const { data } = seedWithMatch()
    const bad = clone(data)
    bad.matches[0].rounds = []
    expect(validateDataset(bad).some((e) => /no rounds/.test(e))).toBe(true)
  })

  it('a damaged photo in a backup fails before any photo is touched', async () => {
    await putImage(new Blob(['keep'], { type: 'image/png' }), 'img-existing')
    const images = { 'img-good': 'data:image/png;base64,iVBORw0KGgo=', 'img-bad': 'data:image/png;base64,@@@' }
    expect(() => decodeImages(images)).toThrow(BackupError)
    expect(await listImageIds()).toContain('img-existing')
  })

  it('writing restored photos never deletes existing ones', async () => {
    await putImage(new Blob(['old'], { type: 'image/png' }), 'img-old')
    const n = await writeImages(decodeImages({ 'img-new': 'data:image/png;base64,iVBORw0KGgo=' }))
    expect(n).toBe(1)
    const ids = await listImageIds()
    expect(ids).toContain('img-old')
    expect(ids).toContain('img-new')
  })

  it('reports when unreadable data could not be copied aside (so edits can be blocked)', () => {
    localStorage.setItem(DATA_KEY, '{broken')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      const res = loadDataset()
      expect(res.unreadable).toBe(true)
      expect(res.keptCopy).toBe(false)
      expect(res.warning).toMatch(/Editing is paused/)
    } finally {
      spy.mockRestore()
    }
    expect(localStorage.getItem(DATA_KEY)).toBe('{broken') // original untouched
  })
})
