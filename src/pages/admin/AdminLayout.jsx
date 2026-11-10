import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { useAdmin } from '../../state/AdminContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useToast, useConfirm } from '../../state/UIContext.jsx'
import { useTitle } from '../../components/Layout.jsx'
import Icon from '../../components/Icons.jsx'
import { formatDateTime } from '../../lib/dates.js'

const TABS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/matches', label: 'Matches & scores' },
  { to: '/admin/inbox', label: 'Score inbox' },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/groups', label: 'Groups' },
  { to: '/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/data', label: 'Publish & backup' },
]

function AdminGate() {
  useTitle('Admin sign-in')
  const { enter } = useAdmin()
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError('')
    try {
      const ok = await enter(password, { remember })
      if (!ok) {
        await new Promise((r) => setTimeout(r, 1200)) // slows down guessing
        setError('Incorrect password.')
        setPassword('')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1>Coach sign-in</h1>
      <p>Only the coach can record results, manage players and publish results for the team.</p>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            className="input"
            type="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'password-error' : undefined}
            autoFocus
          />
          {error && (
            <span id="password-error" className="field-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <label className="check small">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Keep me signed in on this device (only on your own phone or computer)
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
          <Icon name="shield" /> {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
      <p className="small muted mt-2 mb-0">
        Results you record are saved on this device until you publish them. See <Link to="/about">how data is stored</Link>.
      </p>
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
          <strong>Signed in as coach</strong> · changes save on this device until you publish
        </span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={exit}>
          <Icon name="logout" /> Sign out
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
