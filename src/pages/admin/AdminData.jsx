import { useEffect, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useToast, useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { PageHeader, Banner } from '../../components/common.jsx'
import Icon from '../../components/Icons.jsx'
import { BackupReminder } from './AdminHome.jsx'
import PublishPanel from '../../components/PublishPanel.jsx'
import { createBackup, readBackupFile, summariseData, backupFileName } from '../../services/backup.js'
import { SNAPSHOT_PATH } from '../../services/snapshot.js'
import { DATA_KEY, datasetSizeBytes, listUnreadableCopies } from '../../services/storage.js'
import { downloadText } from '../../lib/download.js'
import { formatDateTime } from '../../lib/dates.js'

const LOCALSTORAGE_BUDGET = 5 * 1024 * 1024

function bytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function SummaryList({ s }) {
  return (
    <ul>
      <li>{s.groups} groups</li>
      <li>{s.players} players</li>
      <li>
        {s.matches} matches / sessions ({s.rounds} rounds)
      </li>
      {s.updatedAt && <li>last changed {formatDateTime(s.updatedAt)}</li>}
    </ul>
  )
}

function StorageStatus() {
  const { data, source } = useData()
  const toast = useToast()
  const [estimate, setEstimate] = useState(null)
  const [persisted, setPersisted] = useState(null)
  const size = datasetSizeBytes()

  useEffect(() => {
    navigator.storage?.estimate?.().then(setEstimate).catch(() => {})
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
  }, [data])

  const persist = async () => {
    try {
      const ok = await navigator.storage.persist()
      setPersisted(ok)
      if (ok) toast.success('This browser will keep the data unless you clear it yourself.')
      else toast.info('The browser declined. Keep downloading backups regularly.')
    } catch {
      toast.error('This browser does not support persistent storage.')
    }
  }

  return (
    <section className="card span-2">
      <h2>Storage on this device</h2>
      <p className="small">
        Showing:{' '}
        <strong>
          {source === 'local' ? 'data saved in this browser' : source === 'snapshot' ? 'published results (read-only)' : 'initial roster (nothing saved yet)'}
        </strong>
        {source === 'local' && ` · revision ${data.revision} · last change ${formatDateTime(data.updatedAt)}`}
      </p>
      <div className="field">
        <span className="field-label">
          Records: {bytes(size)} of about {bytes(LOCALSTORAGE_BUDGET)}
        </span>
        <div className="storage-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((size / LOCALSTORAGE_BUDGET) * 100)} aria-label="Record storage used">
          <div style={{ width: `${Math.min(100, Math.max(1, (size / LOCALSTORAGE_BUDGET) * 100))}%` }} />
        </div>
      </div>
      {estimate && (
        <p className="small muted mt-1 mb-0">
          Total site storage including photos: {bytes(estimate.usage)} used{estimate.quota ? ` of ${bytes(estimate.quota)} available` : ''}.
        </p>
      )}
      {navigator.storage?.persist && (
        <p className="small mt-1 mb-0">
          {persisted ? (
            <span className="tag tag-ok">Protected from automatic clean-up</span>
          ) : (
            <>
              Browsers may clear site data when the device is low on space.{' '}
              <button type="button" className="link-btn" onClick={persist}>
                Ask the browser to keep this data
              </button>
            </>
          )}
        </p>
      )}
    </section>
  )
}

function BackupCard() {
  const { data, source, snapshotImages, updateMeta } = useData()
  const toast = useToast()
  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const backup = await createBackup(data, { includeImages: includePhotos, snapshotImages })
      downloadText(JSON.stringify(backup), backupFileName(), 'application/json')
      if (source === 'local') updateMeta({ lastBackupAt: backup.exportedAt, lastBackupRevision: data.revision })
      toast.success(
        `Backup downloaded${includePhotos ? ` with ${Object.keys(backup.images).length} photo(s)` : ''}.${backup.missingImages ? ` ${backup.missingImages} photo(s) could not be read.` : ''}`,
      )
    } catch (e) {
      toast.error(`Backup failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>
        <Icon name="download" width="20" height="20" style={{ verticalAlign: '-3px' }} /> Back up
      </h2>
      <p className="small">
        Downloads everything — players, groups, matches, all fairway scores, statistics settings{includePhotos ? ' and photos' : ''} — as one JSON file. Keep it
        somewhere safe (Google Drive, email to yourself, a USB stick).
      </p>
      <label className="check small">
        <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
        Include photos (larger file)
      </label>
      <button type="button" className="btn btn-primary mt-1" onClick={download} disabled={busy}>
        <Icon name="download" /> {busy ? 'Preparing…' : 'Download backup (.json)'}
      </button>
    </section>
  )
}

function RestoreCard() {
  const { data, source, replaceAll, updateMeta } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let parsed
    try {
      parsed = await readBackupFile(file)
    } catch (err) {
      toast.error(err.message)
      return
    }
    const current = summariseData(data)
    const photoCount = Object.keys(parsed.images).length
    const ok = await confirm({
      title: 'Replace all data in this browser?',
      danger: true,
      confirmLabel: 'Replace with backup',
      message: (
        <>
          <p>
            <strong>Everything currently in this browser will be replaced</strong> and cannot be recovered unless you have a backup of it.
          </p>
          {source === 'local' && (
            <>
              <p className="mb-0">Current data:</p>
              <SummaryList s={current} />
            </>
          )}
          <p className="mb-0">
            Backup file “{file.name}”{parsed.exportedAt ? `, made ${formatDateTime(parsed.exportedAt)}` : ''}:
          </p>
          <SummaryList s={parsed.summary} />
          <p className="small">{photoCount ? `${photoCount} photo(s) will replace the photos stored here.` : 'The backup has no photos; existing photos are kept where they still match.'}</p>
          {source === 'local' && <p className="small">Tip: cancel and download a backup of the current data first if you might need it.</p>}
        </>
      ),
    })
    if (!ok) return
    setBusy(true)
    try {
      const { restoredImages } = await replaceAll(parsed)
      updateMeta({ lastBackupAt: parsed.exportedAt || new Date().toISOString(), lastBackupRevision: parsed.data.revision })
      toast.success(`Backup restored: ${parsed.summary.players} players, ${parsed.summary.matches} matches${restoredImages ? `, ${restoredImages} photos` : ''}.`)
    } catch (err) {
      toast.error(`Restore failed — your previous data is unchanged. ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>
        <Icon name="upload" width="20" height="20" style={{ verticalAlign: '-3px' }} /> Restore
      </h2>
      <p className="small">
        Load a backup file made by this app — on this device or another. The file is checked first, and you will be asked to confirm before anything is
        replaced.
      </p>
      <label className="btn file-label">
        <Icon name="upload" /> {busy ? 'Restoring…' : 'Choose backup file…'}
        <input type="file" accept="application/json,.json" onChange={pick} disabled={busy} aria-label="Choose a backup file to restore" />
      </label>
    </section>
  )
}

function PublishedCopyCard() {
  const { data, source, snapshot, snapshotImages, adoptSnapshot, discardLocal } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const snap = await createBackup(data, { includeImages: true, snapshotImages })
      downloadText(JSON.stringify(snap), 'snapshot.json', 'application/json')
      toast.success('snapshot.json downloaded.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const loadPublished = async () => {
    const ok = await confirm({
      title: 'Load the published results?',
      message: 'All data in this browser will be replaced by the results published on the website. Download a backup first if you need the current data.',
      confirmLabel: 'Replace with published results',
      danger: true,
    })
    if (!ok) return
    try {
      await adoptSnapshot()
      toast.success('Published results loaded into this browser.')
    } catch (e) {
      toast.error(`Could not load the published results — nothing was changed. ${e.message}`)
    }
  }

  const forget = async () => {
    const ok = await confirm({
      title: 'Remove this browser’s data?',
      message: snapshot
        ? 'The records saved in this browser will be deleted and the published results shown instead. Download a backup first if you need them.'
        : 'The records saved in this browser will be deleted and the initial roster shown instead. Download a backup first if you need them.',
      confirmLabel: 'Delete local data',
      danger: true,
    })
    if (ok && discardLocal()) toast.success('Local data removed.')
  }

  return (
    <section className="card span-2">
      <h2>Published results on the website</h2>
      <p className="small">
        {snapshot
          ? `The website currently shows results published ${formatDateTime(snapshot.exportedAt)} (${snapshot.summary?.matches ?? 0} matches).`
          : `No results have been published yet (the website looks for ${SNAPSHOT_PATH}).`}
      </p>
      <div className="row">
        {snapshot && source !== 'snapshot' && (
          <button type="button" className="btn btn-sm" onClick={loadPublished}>
            Load the published results into this browser
          </button>
        )}
        {snapshot && source === 'snapshot' && (
          <button type="button" className="btn btn-sm btn-primary" onClick={loadPublished}>
            Copy the published results into this browser to edit them
          </button>
        )}
        {source === 'local' && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={forget} style={{ color: 'var(--danger)' }}>
            Remove this browser’s data
          </button>
        )}
      </div>
      <details className="table-toggle mt-1">
        <summary>Manual publishing (without an access key)</summary>
        <ol className="small">
          <li>
            Download <code>snapshot.json</code> below (photos included).
          </li>
          <li>
            On GitHub, open the repository → <code>public/data</code> → <strong>Add file → Upload files</strong>, upload it (replacing the old one) and
            commit.
          </li>
          <li>The website updates for everyone in about 2 minutes.</li>
        </ol>
        <button type="button" className="btn btn-sm" onClick={download} disabled={busy}>
          <Icon name="download" /> {busy ? 'Preparing…' : 'Download snapshot.json'}
        </button>
      </details>
    </section>
  )
}

function DangerZone() {
  const { resetToSeed } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const reset = async () => {
    const ok = await confirm({
      title: 'Reset to the initial roster?',
      message: 'All matches, scores, added players, photos and settings in this browser will be deleted, and the original Groups A, B and C with their players restored. Download a backup first if you might need the data.',
      confirmLabel: 'Reset everything',
      danger: true,
    })
    if (ok && resetToSeed()) toast.success('Reset to the initial roster.')
  }
  return (
    <section className="card span-2" style={{ borderColor: '#f5c6c2' }}>
      <h2>Start over</h2>
      <p className="small">Deletes everything in this browser and restores the initial roster of Groups A, B and C.</p>
      <button type="button" className="btn btn-danger" onClick={reset}>
        Reset to initial roster
      </button>
    </section>
  )
}

function Recovery() {
  const { blocked } = useData()
  const keys = listUnreadableCopies()
  if (blocked) keys.unshift(DATA_KEY) // the unreadable original, still in place
  if (!keys.length) return null
  const download = (k) => downloadText(localStorage.getItem(k) || '', `${k.replace(/[^a-z0-9-]+/gi, '_')}.json`, 'application/json')
  return (
    <Banner kind="warning">
      <p>
        <strong>Unreadable data was found and kept aside.</strong> If records are missing, download these copies and ask for help recovering them, or restore a
        backup.
      </p>
      <div className="row">
        {keys.map((k) => (
          <button key={k} type="button" className="btn btn-sm" onClick={() => download(k)}>
            Download {k.split(':').pop()}
          </button>
        ))}
      </div>
    </Banner>
  )
}

export default function AdminData() {
  useTitle('Publish & backup')
  return (
    <>
      <PageHeader title="Publish & backup" subtitle="Publish results for the team, and keep backups — browser storage is not synchronised and can be cleared." />
      <BackupReminder />
      <Recovery />
      <div className="grid-2">
        <PublishPanel />
        <BackupCard />
        <RestoreCard />
        <PublishedCopyCard />
        <StorageStatus />
        <DangerZone />
      </div>
    </>
  )
}
