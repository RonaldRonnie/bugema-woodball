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
            <li>A round counts in statistics only when all 12 fairways are entered. Partly entered rounds are kept and marked as incomplete.</li>
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
              The safeguard is the <strong>JSON backup</strong>: download one regularly (Admin → Backup &amp; data) and keep it somewhere safe,
              such as Google Drive or email. A backup restores everything — players, groups, matches, scores, settings and photos — on any device.
            </li>
          </ul>
        </section>

        <section className="card">
          <h2>Admin mode</h2>
          <p>
            There are no user accounts. Admin mode simply separates viewing from editing so results are not changed by accident. It is{' '}
            <strong>not a security feature</strong>: anyone using this browser can turn it on, and the optional PIN only slows down casual use of a
            shared device. Use admin mode on a trusted device that only the coach uses.
          </p>
        </section>

        <section className="card">
          <h2>Sharing results with the team</h2>
          <p>
            Visitors to the website see the coach’s results only after they are <strong>published</strong>: the coach downloads a published-results
            file (Admin → Backup &amp; data) and uploads it to the website’s GitHub repository as <code>public/data/snapshot.json</code>. The site
            rebuilds automatically and everyone then sees the updated standings. See the README for step-by-step instructions.
          </p>
          <Link to="/admin/data" className="btn btn-sm">
            Go to Backup &amp; data
          </Link>
        </section>
      </div>
    </>
  )
}
