import { Component, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Link } from 'react-router-dom'
import { ToastProvider, ConfirmProvider } from './state/UIContext.jsx'
import { DataProvider } from './state/DataContext.jsx'
import { AdminProvider } from './state/AdminContext.jsx'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Groups from './pages/Groups.jsx'
import GroupDetail from './pages/GroupDetail.jsx'
import Players from './pages/Players.jsx'
import PlayerProfile from './pages/PlayerProfile.jsx'
import Matches from './pages/Matches.jsx'
import MatchDetail from './pages/MatchDetail.jsx'
import About from './pages/About.jsx'

// Admin screens and reports load on demand to keep the public pages fast.
const Reports = lazy(() => import('./pages/Reports.jsx'))
const KeepScore = lazy(() => import('./pages/KeepScore.jsx'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.jsx'))
const AdminHome = lazy(() => import('./pages/admin/AdminHome.jsx'))
const AdminPlayers = lazy(() => import('./pages/admin/AdminPlayers.jsx'))
const AdminGroups = lazy(() => import('./pages/admin/AdminGroups.jsx'))
const AdminMatches = lazy(() => import('./pages/admin/AdminMatches.jsx'))
const MatchEditor = lazy(() => import('./pages/admin/MatchEditor.jsx'))
const ScoreEntry = lazy(() => import('./pages/admin/ScoreEntry.jsx'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx'))
const AdminData = lazy(() => import('./pages/admin/AdminData.jsx'))
const AdminInbox = lazy(() => import('./pages/admin/AdminInbox.jsx'))

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
        <h1>Something went wrong</h1>
        <p>
          The page hit an unexpected error. Your saved data has not been changed. Try reloading; if the problem
          continues, download a backup from Admin → Publish &amp; backup.
        </p>
        <pre className="small muted" style={{ whiteSpace: 'pre-wrap' }}>
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}

function Loading() {
  return <p className="muted">Loading…</p>
}

function NotFound() {
  return (
    <div className="card">
      <h1>Page not found</h1>
      <p>This page does not exist or the record was removed.</p>
      <Link to="/" className="btn btn-primary">
        Go to the dashboard
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <DataProvider>
            <AdminProvider>
              <HashRouter>
                <Suspense fallback={<Loading />}>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route index element={<Dashboard />} />
                      <Route path="leaderboard" element={<Leaderboard />} />
                      <Route path="groups" element={<Groups />} />
                      <Route path="groups/:groupId" element={<GroupDetail />} />
                      <Route path="players" element={<Players />} />
                      <Route path="players/:playerId" element={<PlayerProfile />} />
                      <Route path="matches" element={<Matches />} />
                      <Route path="matches/:matchId" element={<MatchDetail />} />
                      <Route path="matches/:matchId/score" element={<KeepScore />} />
                      <Route path="reports" element={<Reports />} />
                      <Route path="about" element={<About />} />
                      <Route path="admin" element={<AdminLayout />}>
                        <Route index element={<AdminHome />} />
                        <Route path="players" element={<AdminPlayers />} />
                        <Route path="groups" element={<AdminGroups />} />
                        <Route path="matches" element={<AdminMatches />} />
                        <Route path="matches/new" element={<MatchEditor />} />
                        <Route path="matches/:matchId/edit" element={<MatchEditor />} />
                        <Route path="matches/:matchId/scores" element={<ScoreEntry />} />
                        <Route path="inbox" element={<AdminInbox />} />
                        <Route path="settings" element={<AdminSettings />} />
                        <Route path="data" element={<AdminData />} />
                      </Route>
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </Suspense>
              </HashRouter>
            </AdminProvider>
          </DataProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
