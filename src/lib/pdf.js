// PDF reports built with jsPDF. Charts are drawn with jsPDF's vector
// primitives, so they stay sharp when printed. This module is loaded on
// demand (dynamic import) because jsPDF is large.

import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { FAIRWAY_COUNT, POINTS, computeStandings, computeOutcome, hasResult, matchesInRange, sortMatches } from './scoring.js'
import { playerStats, allPlayerStats, groupStats, teamSummary, formatAvg } from './stats.js'
import { formatDate, formatDateTime } from './dates.js'
import { slugify, rangeSlug } from './download.js'
import { getImage, isImageStoreAvailable } from '../services/imageStore.js'
import { blobToDataURL, imageSourceToDataURL } from './images.js'
import { NEUTRAL_SERIES } from './colors.js'

const PAGE_W = 210
const PAGE_H = 297
const M = 14 // page margin (mm)
const CONTENT_W = PAGE_W - 2 * M

const NAVY = '#0b2545'
const GOLD = '#f2b705'
const TEXT = '#0f172a'
const TEXT2 = '#3f4b5e'
const MUTED = '#64748b'
const GRID = '#e6e9ee'
const BORDER = '#dde3ea'

const rgb = (hex) => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const FAIRWAY_HEAD = Array.from({ length: FAIRWAY_COUNT }, (_, i) => `F${i + 1}`)

// ------------------------------------------------------------- layout kit

function createReport(data, title, subtitle, range) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: `${title} — ${subtitle}`, creator: data.settings.teamName })

  doc.setFillColor(NAVY)
  doc.rect(0, 0, PAGE_W, 34, 'F')
  doc.setFillColor(GOLD)
  doc.rect(0, 34, PAGE_W, 1.2, 'F')
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(subtitle, M, 14, { maxWidth: CONTENT_W })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor('#cdd8e8')
  doc.text(`${title} · ${data.settings.teamName}`, M, 21, { maxWidth: CONTENT_W })
  doc.text(`Period: ${range?.label || 'All time'}`, M, 28)
  doc.text(`Generated ${formatDateTime(new Date().toISOString())}`, PAGE_W - M, 28, { align: 'right' })

  return { doc, y: 45 }
}

function ensureSpace(ctx, needed) {
  if (ctx.y + needed > PAGE_H - 16) {
    ctx.doc.addPage()
    ctx.y = 18
  }
}

function sectionTitle(ctx, text, note) {
  ensureSpace(ctx, 16)
  const { doc } = ctx
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(TEXT)
  doc.text(text, M, ctx.y)
  if (note) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED)
    doc.text(note, M, ctx.y + 4.5, { maxWidth: CONTENT_W })
    ctx.y += 4.5
  }
  ctx.y += 4
}

function statBoxes(ctx, items, perRow = 4) {
  const gap = 3
  const w = (CONTENT_W - gap * (perRow - 1)) / perRow
  const h = 17
  const rows = Math.ceil(items.length / perRow)
  ensureSpace(ctx, rows * (h + gap))
  const { doc } = ctx
  items.forEach((it, i) => {
    const x = M + (i % perRow) * (w + gap)
    const y = ctx.y + Math.floor(i / perRow) * (h + gap)
    doc.setDrawColor(BORDER)
    doc.setFillColor('#f8fafc')
    doc.roundedRect(x, y, w, h, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(MUTED)
    doc.text(String(it.label), x + 3, y + 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(TEXT)
    doc.text(String(it.value), x + 3, y + 12.5)
    if (it.note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(MUTED)
      doc.text(String(it.note), x + 3, y + 15.5, { maxWidth: w - 5 })
    }
  })
  ctx.y += rows * (h + gap) + 3
}

function table(ctx, { head, body, columnStyles = {}, fontSize = 8, didParseCell }) {
  if (!body.length) {
    ensureSpace(ctx, 8)
    ctx.doc.setFont('helvetica', 'italic')
    ctx.doc.setFontSize(9)
    ctx.doc.setTextColor(MUTED)
    ctx.doc.text('No records in this period.', M, ctx.y + 2)
    ctx.y += 9
    return
  }
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [head],
    body,
    margin: { left: M, right: M, top: 16, bottom: 16 },
    theme: 'grid',
    styles: { fontSize, cellPadding: 1.4, textColor: rgb(TEXT), lineColor: rgb(GRID), lineWidth: 0.15, overflow: 'linebreak' },
    headStyles: { fillColor: rgb(NAVY), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: fontSize - 0.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    didParseCell,
  })
  ctx.y = ctx.doc.lastAutoTable.finalY + 7
}

function niceStep(range, ticks = 4) {
  const raw = range / ticks
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const norm = raw / mag
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
}

function axisFrame(doc, { x, y, w, h, min, max }) {
  const step = niceStep(max - min)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step || step
  doc.setLineWidth(0.15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const yy = y + h - ((v - lo) / (hi - lo || 1)) * h
    doc.setDrawColor(GRID)
    doc.line(x, yy, x + w, yy)
    doc.setTextColor(MUTED)
    doc.text(String(Math.round(v * 10) / 10), x - 1.5, yy + 1, { align: 'right' })
  }
  return { lo, hi, scale: (v) => y + h - ((v - lo) / (hi - lo || 1)) * h }
}

/** Vertical bar chart; colours follow each category. */
function barChart(ctx, { title, note, labels, values, colors, format = (v) => String(v), fromZero = true, height = 52 }) {
  const present = values.filter((v) => v != null)
  sectionTitle(ctx, title, note)
  if (!present.length) {
    table(ctx, { head: [], body: [] })
    return
  }
  ensureSpace(ctx, height + 10)
  const { doc } = ctx
  const x = M + 9
  const w = CONTENT_W - 9
  const y = ctx.y + 4
  const h = height
  const max = Math.max(...present)
  const min = fromZero ? 0 : Math.min(...present) - 1
  const axis = axisFrame(doc, { x, y, w, h, min, max: max === min ? max + 1 : max })
  const slot = w / labels.length
  const barW = Math.min(8, slot * 0.55)
  labels.forEach((label, i) => {
    const v = values[i]
    const cx = x + slot * i + slot / 2
    if (v != null) {
      const top = axis.scale(v)
      const base = axis.scale(axis.lo)
      doc.setFillColor(colors?.[i] || NEUTRAL_SERIES)
      doc.roundedRect(cx - barW / 2, top, barW, Math.max(0.4, base - top), 0.9, 0.9, 'F')
      if (base - top > 1.2) doc.rect(cx - barW / 2, base - 1, barW, 1, 'F') // square base
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(TEXT2)
      doc.text(format(v), cx, top - 1.2, { align: 'center' })
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(MUTED)
    doc.text(String(label), cx, y + h + 4, { align: 'center', maxWidth: slot - 1 })
  })
  ctx.y = y + h + 10
}

/** Single-series line chart with ringed markers. */
function lineChart(ctx, { title, note, points, color = NEUTRAL_SERIES, height = 50 }) {
  sectionTitle(ctx, title, note)
  if (!points.length) {
    table(ctx, { head: [], body: [] })
    return
  }
  ensureSpace(ctx, height + 10)
  const { doc } = ctx
  const x = M + 9
  const w = CONTENT_W - 12
  const y = ctx.y + 3
  const h = height
  const values = points.map((p) => p.value)
  const min = Math.min(...values) - 2
  const max = Math.max(...values) + 2
  const axis = axisFrame(doc, { x, y, w, h, min, max })
  const px = (i) => (points.length === 1 ? x + w / 2 : x + (i / (points.length - 1)) * w)

  doc.setDrawColor(color)
  doc.setLineWidth(0.6)
  for (let i = 1; i < points.length; i++) {
    doc.line(px(i - 1), axis.scale(values[i - 1]), px(i), axis.scale(values[i]))
  }
  points.forEach((p, i) => {
    doc.setFillColor('#ffffff')
    doc.circle(px(i), axis.scale(p.value), 1.3, 'F')
    doc.setFillColor(color)
    doc.circle(px(i), axis.scale(p.value), 0.9, 'F')
  })
  const every = Math.max(1, Math.ceil(points.length / 8))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(MUTED)
  points.forEach((p, i) => {
    if (i % every === 0 || i === points.length - 1) doc.text(p.label, px(i), y + h + 4, { align: 'center' })
  })
  ctx.y = y + h + 10
}

function addFooters(doc, teamName) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(GRID)
    doc.setLineWidth(0.2)
    doc.line(M, PAGE_H - 11, PAGE_W - M, PAGE_H - 11)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(MUTED)
    doc.text(teamName, M, PAGE_H - 7)
    doc.text(`Page ${i} of ${n}`, PAGE_W - M, PAGE_H - 7, { align: 'right' })
  }
}

function finish(ctx, data, filename) {
  addFooters(ctx.doc, data.settings.teamName)
  ctx.doc.save(filename)
  return filename
}

async function imageDataURL(imageId, snapshotImages) {
  if (!imageId) return null
  if (snapshotImages?.[imageId]) return imageSourceToDataURL(snapshotImages[imageId]).catch(() => null)
  if (!isImageStoreAvailable()) return null
  try {
    const blob = await getImage(imageId)
    return blob ? await blobToDataURL(blob) : null
  } catch {
    return null
  }
}

const shortDate = (iso) => formatDate(iso).replace(/ \d{4}$/, '')
const resultLabel = (o, gid) =>
  o.status === 'practice' ? 'Practice' : o.status === 'pending' ? 'Pending' : o.status === 'live' ? `${o.results[gid]} (live)` : o.results[gid]

// ---------------------------------------------------------------- reports

export async function playerReportPDF(data, playerId, range, { snapshotImages } = {}) {
  const player = data.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not found.')
  const group = data.groups.find((g) => g.id === player.groupId)
  const s = playerStats(data, playerId, range)
  const rank = allPlayerStats(data, range).find((r) => r.player.id === playerId)?.rank
  const ctx = createReport(data, 'Individual player report', player.name, range)
  const { doc } = ctx

  // identity block (with photo when available)
  const photo = await imageDataURL(player.photoId, snapshotImages)
  let textX = M
  if (photo) {
    try {
      doc.addImage(photo, photo.startsWith('data:image/png') ? 'PNG' : 'JPEG', M, ctx.y - 3, 24, 24)
      textX = M + 28
    } catch {
      /* unsupported image — skip it */
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(TEXT)
  doc.text(player.name, textX, ctx.y + 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(TEXT2)
  const facts = [
    `Group: ${group?.name || 'Unassigned'}`,
    `Status: ${player.active ? 'Active' : 'Inactive'}`,
    player.role ? `Role: ${player.role}` : null,
    `Team ranking: ${rank ? `#${rank}` : 'not ranked in this period'}`,
  ].filter(Boolean)
  doc.text(facts.join('   ·   '), textX, ctx.y + 9, { maxWidth: CONTENT_W - (textX - M) })
  ctx.y += photo ? 27 : 16

  statBoxes(ctx, [
    { label: 'Matches played', value: s.matchesPlayed },
    { label: 'Rounds completed', value: s.roundsCompleted, note: s.incompleteRounds ? `+${s.incompleteRounds} in progress` : '' },
    { label: 'Total strokes', value: s.totalStrokes, note: `${s.fairwaysPlayed} fairways played` },
    { label: 'Average per round', value: formatAvg(s.avgStrokes), note: 'lower is better' },
    { label: 'Best round', value: s.bestRound?.total ?? '—', note: s.bestRound ? formatDate(s.bestRound.date) : '' },
    { label: 'Highest round', value: s.worstRound?.total ?? '—', note: s.worstRound ? formatDate(s.worstRound.date) : '' },
  ])

  const complete = s.history.filter((e) => e.complete)
  lineChart(ctx, {
    title: 'Performance history',
    note: 'Total strokes for each completed round, oldest to newest',
    points: complete.map((e) => ({ label: shortDate(e.date), value: e.total })),
    color: group?.color,
  })
  barChart(ctx, {
    title: 'Fairway averages',
    note: 'Average strokes on each fairway',
    labels: FAIRWAY_HEAD,
    values: s.fairwayAverages.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
    colors: FAIRWAY_HEAD.map(() => group?.color || NEUTRAL_SERIES),
    format: (v) => v.toFixed(1),
  })

  sectionTitle(ctx, 'Round-by-round scores', 'Rounds marked * are incomplete and not counted in averages')
  table(ctx, {
    head: ['Date', 'Rd', ...FAIRWAY_HEAD, 'Total'],
    body: s.history.map((e) => [formatDate(e.date), e.roundNumber, ...e.fairways.map((v) => v ?? '–'), e.complete ? e.total : `${e.total}*`]),
    fontSize: 7.5,
    columnStyles: { 0: { cellWidth: 22 }, [FAIRWAY_COUNT + 2]: { fontStyle: 'bold' } },
  })

  return finish(ctx, data, `player-report_${slugify(player.name)}_${rangeSlug(range)}.pdf`)
}

export async function groupReportPDF(data, groupId, range) {
  const group = data.groups.find((g) => g.id === groupId)
  if (!group) throw new Error('Group not found.')
  const s = groupStats(data, groupId, range)
  const st = s.standing
  const ctx = createReport(data, 'Group performance report', group.name, range)
  const playersById = Object.fromEntries(data.players.map((p) => [p.id, p]))

  statBoxes(ctx, [
    { label: 'Rank', value: st?.rank ?? '–', note: `of ${data.groups.length} groups` },
    { label: 'Points', value: st?.points ?? 0, note: 'W 3 · D 1 · L 0' },
    { label: 'Record (W-D-L)', value: `${st?.won ?? 0}-${st?.drawn ?? 0}-${st?.lost ?? 0}`, note: st?.live ? `${st.played} matches · ${st.live} live` : `${st?.played ?? 0} matches` },
    { label: 'Active players', value: s.activeMembers },
    { label: 'Completed rounds', value: s.roundsCompleted, note: s.incompleteRounds ? `+${s.incompleteRounds} in progress` : 'all sessions' },
    { label: 'Total strokes', value: s.totalStrokes, note: `${s.fairwaysPlayed} fairways played` },
    { label: 'Average strokes', value: formatAvg(s.avgStrokes), note: 'per round (per fairway × 12)' },
    { label: 'Best round', value: s.bestRound?.total ?? '—', note: s.bestRound ? playersById[s.bestRound.playerId]?.name : '' },
  ])

  barChart(ctx, {
    title: 'Fairway averages',
    note: 'Average strokes on each fairway by group members',
    labels: FAIRWAY_HEAD,
    values: s.fairwayAverages.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
    colors: FAIRWAY_HEAD.map(() => group.color),
    format: (v) => v.toFixed(1),
  })

  sectionTitle(ctx, 'Match log')
  table(ctx, {
    head: ['Date', 'Match', 'Type', 'Fairways', 'Avg strokes', 'Result', 'Points'],
    body: s.matchLog.map(({ match, outcome, result, metrics }) => [
      formatDate(match.date),
      match.title || 'Match',
      match.type === 'practice' ? 'Practice' : 'Match',
      metrics?.fairways ?? 0,
      formatAvg(metrics?.avgStrokes),
      resultLabel(outcome, groupId),
      hasResult(outcome) ? POINTS[result] : '',
    ]),
  })

  sectionTitle(ctx, 'Player rankings', 'By average strokes per round — every fairway entered counts, scaled to 12 fairways')
  table(ctx, {
    head: ['Rank', 'Player', 'Matches', 'Fairways', 'Total strokes', 'Avg', 'Best'],
    body: s.playerRows.map((r) => [r.rank ?? '–', r.player.name, r.matchesPlayed, r.fairwaysPlayed, r.totalStrokes, formatAvg(r.avgStrokes), r.bestRound?.total ?? '—']),
  })

  const rounds = s.matchLog
    .slice()
    .reverse()
    .flatMap(({ match }) =>
      [...match.rounds]
        .sort((a, b) => a.number - b.number)
        .flatMap((round) =>
          match.participants
            .filter((p) => p.groupId === groupId && round.scores[p.playerId])
            .map((p) => {
              const f = round.scores[p.playerId]
              const total = f.reduce((sum, v) => sum + (v || 0), 0)
              const complete = f.every((v) => v != null)
              return [shortDate(match.date), playersById[p.playerId]?.name || '', round.number, ...f.map((v) => v ?? '–'), complete ? total : `${total}*`]
            }),
        ),
    )
  sectionTitle(ctx, 'Round scores', 'All 12 fairways for every member round · * incomplete')
  table(ctx, {
    head: ['Date', 'Player', 'Rd', ...FAIRWAY_HEAD, 'Total'],
    body: rounds,
    fontSize: 7,
    columnStyles: { 1: { cellWidth: 32 }, [FAIRWAY_COUNT + 3]: { fontStyle: 'bold' } },
  })

  return finish(ctx, data, `group-report_${slugify(group.name)}_${rangeSlug(range)}.pdf`)
}

export async function teamReportPDF(data, range) {
  const t = teamSummary(data, range)
  const standings = computeStandings(data, range)
  const players = allPlayerStats(data, range).filter((r) => r.rank != null)
  const ctx = createReport(data, 'Overall team report', data.settings.teamName, range)
  const groupsById = Object.fromEntries(data.groups.map((g) => [g.id, g]))

  statBoxes(ctx, [
    { label: 'Active players', value: t.activePlayers, note: `${t.totalPlayers} registered` },
    { label: 'Competitive matches', value: t.competitiveMatches },
    { label: 'Practice sessions', value: t.practiceSessions },
    { label: 'Completed rounds', value: t.playerRounds, note: `team avg ${formatAvg(t.avgStrokes)} strokes` },
  ])

  sectionTitle(
    ctx,
    'Group standings',
    standings.some((s) => s.live)
      ? 'Win 3 · Draw 1 · Loss 0 · includes matches still in progress (live), which can change'
      : 'Win 3 · Draw 1 · Loss 0 · average strokes per round from competitive matches',
  )
  table(ctx, {
    head: ['Rank', 'Group', 'P', 'W', 'D', 'L', 'Pts', 'Avg strokes'],
    body: standings.map((s) => [s.rank, s.name, s.played, s.won, s.drawn, s.lost, s.points, formatAvg(s.avgStrokes)]),
    columnStyles: { 6: { fontStyle: 'bold' } },
  })

  barChart(ctx, {
    title: 'Points by group',
    labels: standings.map((s) => s.name),
    values: standings.map((s) => s.points),
    colors: standings.map((s) => s.color),
    height: 42,
  })
  const avgs = data.groups.map((g) => groupStats(data, g.id, range).avgStrokes)
  barChart(ctx, {
    title: 'Average strokes per round',
    note: 'All sessions · lower is better',
    labels: data.groups.map((g) => g.name),
    values: avgs.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
    colors: data.groups.map((g) => g.color),
    format: (v) => v.toFixed(1),
    height: 42,
  })

  sectionTitle(ctx, 'Player rankings', 'By average strokes per round — every fairway entered counts (lower is better)')
  table(ctx, {
    head: ['Rank', 'Player', 'Group', 'Matches', 'Fairways', 'Total strokes', 'Avg', 'Best'],
    body: players.map((r) => [
      r.rank,
      r.player.name,
      groupsById[r.player.groupId]?.name || '—',
      r.matchesPlayed,
      r.fairwaysPlayed,
      r.totalStrokes,
      formatAvg(r.avgStrokes),
      r.bestRound?.total ?? '—',
    ]),
  })

  sectionTitle(ctx, 'Results')
  table(ctx, {
    head: ['Date', 'Match', 'Type', 'Outcome'],
    body: sortMatches(matchesInRange(data.matches, range), 'desc').map((m) => {
      const o = computeOutcome(m, data.settings)
      return [
        formatDate(m.date),
        m.title || m.groupIds.map((g) => groupsById[g]?.name).join(' vs '),
        m.type === 'practice' ? 'Practice' : 'Match',
        m.groupIds.map((g) => `${groupsById[g]?.name}: ${resultLabel(o, g)}`).join(', '),
      ]
    }),
  })

  return finish(ctx, data, `team-report_${rangeSlug(range)}.pdf`)
}
