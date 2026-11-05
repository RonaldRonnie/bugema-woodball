import { describe, it, expect, vi } from 'vitest'
import { createSeedData } from '../src/data/seed.js'
import {
  DATA_KEY,
  loadDataset,
  saveDataset,
  migrate,
  validateDataset,
  normalizeDataset,
  listUnreadableCopies,
  StorageError,
} from '../src/services/storage.js'
import { createBackup, parseBackupText, restoreImages } from '../src/services/backup.js'
import { putImage, getImage, listImageIds, removeUnreferencedImages, blobToArrayBuffer } from '../src/services/imageStore.js'
import { escapeCell, toCSV, matchHistoryCSV, playerHistoryCSV, groupPerformanceCSV, playerSummaryCSV, teamPerformanceCSV } from '../src/lib/csv.js'
import { seedWithMatch, clone } from './helpers.js'

describe('LocalStorage persistence', () => {
  it('returns nothing when no data has been saved', () => {
    expect(loadDataset().data).toBeNull()
  })

  it('round-trips the dataset (persistence after refresh)', () => {
    const { data } = seedWithMatch()
    saveDataset(data)
    const { data: loaded, warning } = loadDataset()
    expect(warning).toBeUndefined()
    expect(loaded.players).toEqual(data.players)
    expect(loaded.matches).toEqual(data.matches)
  })

  it('keeps a recovery copy of unreadable data instead of discarding it', () => {
    localStorage.setItem(DATA_KEY, '{not json')
    const first = loadDataset()
    expect(first.data).toBeNull()
    expect(first.unreadable).toBe(true)
    loadDataset() // a second load must not create a second copy
    const copies = listUnreadableCopies()
    expect(copies).toHaveLength(1)
    expect(localStorage.getItem(copies[0])).toBe('{not json')
  })

  it('reports a friendly error when storage is full', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      expect(() => saveDataset(createSeedData())).toThrow(StorageError)
      expect(() => saveDataset(createSeedData())).toThrow(/storage is full/)
    } finally {
      spy.mockRestore()
    }
  })

  it('refuses data saved by a newer app version', () => {
    expect(() => migrate({ schemaVersion: 99 })).toThrow(/newer version/)
    expect(() => migrate({})).toThrow(/version/)
  })

  it('fills in defaults for missing optional fields', () => {
    const data = createSeedData()
    delete data.teamPhotos
    delete data.settings.tieBreakers
    const n = normalizeDataset(data)
    expect(n.teamPhotos).toEqual([])
    expect(n.settings.tieBreakers.map((t) => t.key)).toContain('headToHead')
  })

  it('detects broken references', () => {
    const { data } = seedWithMatch()
    const bad = clone(data)
    bad.players[0].groupId = 'grp-missing'
    bad.matches[0].rounds[0].scores[bad.players[0].id] = [1, 2, 3]
    const errors = validateDataset(bad)
    expect(errors.some((e) => /group that does not exist/.test(e))).toBe(true)
    expect(errors.some((e) => /exactly 12/.test(e))).toBe(true)
  })
})

describe('JSON backup and restore', () => {
  it('exports the full dataset and restores it exactly', async () => {
    const { data } = seedWithMatch()
    const backup = await createBackup(data, { includeImages: false })
    const parsed = parseBackupText(JSON.stringify(backup))
    expect(parsed.data.players).toEqual(data.players)
    expect(parsed.data.matches).toEqual(data.matches)
    expect(parsed.summary).toMatchObject({ players: 45, matches: 1, groups: 3 })
  })

  it('rejects files that are not backups or contain invalid data', () => {
    expect(() => parseBackupText('hello')).toThrow(/not valid JSON/)
    expect(() => parseBackupText('{"foo":1}')).toThrow(/not a Bugema Woodball backup/)
    const { data } = seedWithMatch()
    data.matches[0].date = 'yesterday'
    expect(() => parseBackupText(JSON.stringify({ format: 'bu-woodball-backup', data }))).toThrow(/invalid data/)
  })

  it('includes photos from IndexedDB and restores them', async () => {
    const { data } = seedWithMatch()
    const imageId = await putImage(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
    data.players[0].photoId = imageId
    const backup = await createBackup(data, { includeImages: true })
    expect(Object.keys(backup.images)).toEqual([imageId])

    const parsed = parseBackupText(JSON.stringify(backup))
    expect(await restoreImages(parsed.images)).toBe(1)
    const blob = await getImage(imageId)
    expect(new Uint8Array(await blobToArrayBuffer(blob))).toEqual(new Uint8Array([137, 80, 78, 71]))

    await putImage(new Blob(['x'], { type: 'image/png' }), 'img-orphan')
    expect(await removeUnreferencedImages(new Set([imageId]))).toBe(1)
    expect(await listImageIds()).toEqual([imageId])
  })
})

describe('CSV export', () => {
  it('escapes commas, quotes, new lines and spreadsheet formulas', () => {
    expect(escapeCell('a,b')).toBe('"a,b"')
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(escapeCell(42)).toBe('42')
    expect(toCSV([['a', 1], ['b', null]])).toBe('a,1\r\nb,')
  })

  it('exports match history with all 12 fairways and totals', () => {
    const { data, pa } = seedWithMatch({ a: 3, b: 4 })
    const csv = matchHistoryCSV(data, null)
    const header = csv.split('\r\n')[2].split(',')
    expect(header.slice(10, 22)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'])
    const row = csv.split('\r\n').find((l) => l.includes(pa.name))
    expect(row).toContain('3,3,3,3,3,3,3,3,3,3,3,3,36,Yes')
    expect(row).toContain('Group A: W; Group B: L')
  })

  it('produces player, group and team reports', () => {
    const { data, pa } = seedWithMatch()
    expect(playerHistoryCSV(data, pa.id, null)).toContain('Average strokes per round,36')
    expect(groupPerformanceCSV(data, null)).toContain('1,Group A,1,1,0,0,3')
    expect(playerSummaryCSV(data, null).split('\r\n')[3]).toMatch(/^1,NANYONDO JANE,Group A/)
    expect(teamPerformanceCSV(data, null)).toContain('Completed player rounds,2')
  })
})
