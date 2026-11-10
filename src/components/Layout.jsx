import { Suspense, useEffect, useState } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { useData } from '../state/DataContext.jsx'
import { useAdmin } from '../state/AdminContext.jsx'
import { TeamLogo } from './media.jsx'
import { Banner } from './common.jsx'
import Icon from './Icons.jsx'
import { formatDateTime } from '../lib/dates.js'
import { listScorecards, hasAnyScore, sendState } from '../lib/scorecards.js'

const TOP_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/leaderboard', label: 'Standings' },
  { to: '/groups', label: 'Groups' },
  { to: '/players', label: 'Players' },
  { to: '/matches', label: 'Matches' },
  { to: '/reports', label: 'Reports' },
  { to: '/about', label: 'About' },
]

const BOTTOM_LINKS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/leaderboard', label: 'Standings', icon: 'trophy' },
  { to: '/players', label: 'Players', icon: 'users' },
  { to: '/matches', label: 'Matches', icon: 'calendar' },
  { to: '/admin', label: 'Admin', icon: 'shield' },
]

/** Sets the browser tab title for a page. */
export function useTitle(title) {
  const { data } = useData()
  useEffect(() => {
    document.title = title ? `${title} · ${data.settings.shortName}` : data.settings.teamName
  }, [title, data.settings.shortName, data.settings.teamName])
}

/** Reminds a player's phone about scorecards that have not reached the coach. */
function UnsentScorecards({ pathname }) {
  const [unsent, setUnsent] = useState([])
  useEffect(() => {
    setUnsent(listScorecards().filter((sc) => hasAnyScore(sc) && sendState(sc) !== 'sent'))
  }, [pathname])
  if (!unsent.length || /^\/matches\/[^/]+\/score$/.test(pathname)) return null
  const sc = unsent[0]
  return (
    <Banner kind="warning">
      <p>
        <strong>
          {unsent.length === 1 ? `Your scorecard for card ${sc.cardNumber} has` : `${unsent.length} scorecards on this phone have`} not been sent to the coach
          yet.
        </strong>{' '}
        Submit it when you have internet.
      </p>
      <Link to={`/matches/${sc.matchId}/score?card=${encodeURIComponent(sc.key)}`} className="btn btn-sm btn-primary">
        Open scorecard
      </Link>
    </Banner>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function Layout() {
  const { data, source, snapshot, warning, storageOk } = useData()
  const { isAdmin } = useAdmin()
  const { pathname } = useLocation()
  const inAdmin = pathname.startsWith('/admin')

  const skip = (e) => {
    e.preventDefault()
    document.getElementById('main')?.focus()
  }

  return (
    <div className="app">
      <ScrollToTop />
      <a className="skip-link" href="#main" onClick={skip}>
        Skip to content
      </a>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label={`${data.settings.teamName} — home`}>
            <TeamLogo />
            <span className="brand-text">
              <span className="brand-name">{data.settings.shortName}</span>
              <span className="brand-sub">{data.settings.teamName}</span>
            </span>
          </Link>
          <nav className="top-nav" aria-label="Main">
            {TOP_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/admin" className={`admin-pill ${isAdmin ? '' : 'off'}`}>
            <Icon name="shield" width="14" height="14" />
            {isAdmin ? 'Admin on' : 'Admin'}
          </Link>
        </div>
      </header>

      <main className="main" id="main" tabIndex={-1}>
        {warning && <Banner kind="danger">{warning}</Banner>}
        <UnsentScorecards pathname={pathname} />
        {!storageOk && (
          <Banner kind="warning">
            This browser is blocking local storage (private mode or strict privacy settings). You can look around, but
            changes cannot be saved here.
          </Banner>
        )}
        {source === 'snapshot' && !inAdmin && !/\/score$/.test(pathname) && (
          <Banner kind="info">
            Showing the team’s published results
            {snapshot?.exportedAt ? ` (updated ${formatDateTime(snapshot.exportedAt)})` : ''}.
          </Banner>
        )}
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>
            © {new Date().getFullYear()} {data.settings.teamName}
          </span>
          <span>
            {source === 'local'
              ? `Data saved in this browser · last change ${formatDateTime(data.updatedAt)}`
              : source === 'snapshot'
                ? 'Published results (read-only)'
                : 'Initial roster — no results saved on this device yet'}
            {' · '}
            <Link to="/about">How data is stored</Link>
          </span>
        </div>
      </footer>

      <nav className="bottom-nav" aria-label="Main">
        {BOTTOM_LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            <Icon name={l.icon} />
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
