import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { useAdmin } from '../../state/AdminContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useToast, useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import { Banner } from '../../components/common.jsx'
import Icon from '../../components/Icons.jsx'
import { formatDateTime } from '../../lib/dates.js'

const TABS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/matches', label: 'Matches & scores' },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/groups', label: 'Groups' },
  { to: '/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/data', label: 'Backup & data' },
]

function AdminGate() {
  useTitle('Admin')
  const { enter, hasPin } = useAdmin()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!enter(pin)) setError('That PIN does not match the one set on this device.')
  }

  return (
    <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1>Admin mode</h1>
      <p>Admin mode lets the coach register players, record matches and scores, and manage backups.</p>
      <Banner kind="warning">
        <p>
          <strong>This is not a secure login.</strong> The app has no server or user accounts. Anyone using this browser can switch admin mode on,
          and the optional PIN only prevents accidental edits on a shared device. Use admin mode on a trusted device that only the coach uses.
        </p>
      </Banner>
      <p className="small muted">
        Changes are saved only in this browser on this device. They are not shared with other devices automatically — see{' '}
        <Link to="/about">how data is stored</Link>.
      </p>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        {hasPin && (
          <div className="field">
            <label htmlFor="admin-pin">Edit-lock PIN</label>
            <input
              id="admin-pin"
              className="input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value)
                setError('')
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'pin-error' : undefined}
            />
            {error && (
              <span id="pin-error" className="field-error">
                {error}
              </span>
            )}
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-block">
          <Icon name="shield" /> Switch on admin mode
        </button>
      </form>
    </div>
  )
}

function SnapshotNotice() {
  const { snapshot, adoptSnapshot, resetToSeed } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)

  const adopt = async () => {
    setBusy(true)
    try {
      const { restoredImages } = await adoptSnapshot()
      toast.success(`Published results copied into this browser${restoredImages ? ` with ${restoredImages} photos` : ''}. You can now edit.`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const fresh = async () => {
    if (
      await confirm({
        title: 'Start from the initial roster?',
        message: 'This browser will start with the three groups and their players, and no match results. The published results on the website are not affected.',
        confirmLabel: 'Start fresh',
      })
    ) {
      if (resetToSeed()) toast.success('Started from the initial roster.')
    }
  }

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <h2>You are viewing the published results</h2>
      <p>
        This browser has no saved data of its own, so it is showing the results published on the website
        {snapshot?.exportedAt ? ` (${formatDateTime(snapshot.exportedAt)})` : ''}. To make changes, choose how to start:
      </p>
      <div className="stack" style={{ gap: 10 }}>
        <button type="button" className="btn btn-primary" onClick={adopt} disabled={busy}>
          {busy ? 'Copying…' : 'Copy the published results into this browser and edit them'}
        </button>
        <Link to="/admin/data" className="btn">
          Restore from a backup file instead
        </Link>
        <button type="button" className="btn btn-ghost" onClick={fresh}>
          Start from the initial roster
        </button>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { isAdmin, exit } = useAdmin()
  const { source } = useData()
  const { pathname } = useLocation()

  if (!isAdmin) return <AdminGate />

  const blocked = source === 'snapshot' && pathname !== '/admin/data'

  return (
    <>
      <div className="admin-strip" role="note">
        <span>
          <strong>Admin mode</strong> · changes save to this browser only
        </span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={exit}>
          <Icon name="logout" /> Exit admin
        </button>
      </div>
      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<p className="muted">Loading…</p>}>{blocked ? <SnapshotNotice /> : <Outlet />}</Suspense>
    </>
  )
}
