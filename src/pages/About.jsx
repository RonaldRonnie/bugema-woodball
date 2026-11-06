import { Link } from 'react-router-dom'
import { useData } from '../state/DataContext.jsx'
import { useTitle } from '../components/Layout.jsx'
import { PageHeader } from '../components/common.jsx'
import { TIE_BREAKER_OPTIONS } from '../data/defaults.js'

export default function About() {
  useTitle('About')
  const { data } = useData()
  const s = data.settings
  return (
    <>
      <PageHeader title="About this app" subtitle={s.teamName} />
      <div className="stack" style={{ maxWidth: 820 }}>
        <section className="card">
          <h2>How scoring works</h2>
          <ul>
            <li>Every round has 12 fairways. A player’s total strokes for the round is the sum of the 12 fairway scores — fewer is better.</li>
            <li>
              Every fairway score counts as soon as it is entered. Averages are worked out per fairway and shown per round (× 12), so a player three
              fairways into a round can be compared fairly with someone who has finished. Best-round records need all 12 fairways.
            </li>
            <li>
              While scorecards are still being filled in, a match shows a <strong>live</strong> result and its points count in the standings straight away;
              the result becomes final when every started scorecard has all 12 fairways. (This can be switched off in Settings.)
            </li>
            <li>
              Competitive matches award league points: <strong>win 3</strong>, <strong>draw 1</strong>, <strong>loss 0</strong>. Strokes and points
              are separate measures.
            </li>
            <li>
              Match results are decided automatically from the recorded scores by{' '}
              {s.outcomeMetric === 'total' ? 'total strokes' : 'average strokes per player round (fair when groups field different numbers of players)'}.
              The coach can instead set a result manually for any match.
            </li>
            <li>When groups finish level on points, these tie-breakers apply in order: {s.tieBreakers.filter((t) => t.enabled).map((t) => TIE_BREAKER_OPTIONS[t.key]).join(' → ') || 'none'}.</li>
            <li>Practice sessions count towards individual and group stroke statistics but award no points.</li>
            <li>A player’s scores stay with the group they played for, even if they later move to another group.</li>
          </ul>
        </section>

        <section className="card">
          <h2>Where the data is stored</h2>
          <p>
            This is a static website with no server and no online database. Everything the coach records is saved{' '}
            <strong>inside the web browser on the device used</strong> (LocalStorage for records, IndexedDB for photos).
          </p>
          <ul>
            <li>Records are <strong>not synchronised</strong> between devices or browsers. A phone and a laptop each keep their own copy.</li>
            <li>Clearing the browser’s site data, using a private window, or uninstalling the browser deletes the records on that device.</li>
            <li>
              Browsers limit storage (roughly 5 MB for records; photos have more room). Photos are resized automatically to save space.
            </li>
            <li>
              The safeguard is the <strong>JSON backup</strong>: download one regularly (Admin → Publish &amp; backup) and keep it somewhere safe,
              such as Google Drive or email. A backup restores everything — players, groups, matches, scores, settings and photos — on any device.
            </li>
          </ul>
        </section>

        <section className="card">
          <h2>Who can change the results</h2>
          <p>
            Only the coach can sign in to record results, manage players and publish. Signing in needs the coach’s password; the password itself is not
            stored anywhere in the website, only a one-way fingerprint of it.
          </p>
          <p className="mb-0">
            What the team sees changes only when the coach <strong>publishes</strong>, and publishing needs a GitHub access key that exists only on the
            coach’s own device. So even someone who got past the sign-in screen on their own phone could only change a private copy in their own browser —
            never the results everyone sees.
          </p>
        </section>

        <section className="card">
          <h2>How everyone sees the results</h2>
          <p>
            After a training or match day the coach presses <strong>Publish results</strong> (Admin → Publish &amp; backup). The app saves the results to
            the website’s GitHub repository, the website rebuilds automatically, and about two minutes later everyone — wherever they are — sees the new
            standings, results and statistics. Pages that are already open refresh when the viewer returns to them.
          </p>
          <Link to="/admin/data" className="btn btn-sm">
            Go to Publish &amp; backup
          </Link>
        </section>
      </div>
    </>
  )
}
