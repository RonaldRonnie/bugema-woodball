// Version of the saved data structure. Bump it and add a migration in
// services/storage.js whenever the shape of the dataset changes.
export const SCHEMA_VERSION = 1

export const APP_VERSION = '1.0.0'

export const FAIRWAY_COUNT = 12

export const POINTS = Object.freeze({ W: 3, D: 1, L: 0 })

export const TIE_BREAKER_OPTIONS = Object.freeze({
  wins: 'Most wins',
  headToHead: 'Head-to-head record between the tied groups',
  avgStrokes: 'Lowest average strokes per round',
  fewerLosses: 'Fewest losses',
  bestRound: 'Best (lowest) single round by a group member',
})

export const DEFAULT_SETTINGS = Object.freeze({
  teamName: 'Bugema University Woodball Team',
  shortName: 'BU Woodball',
  tagline: 'Precision · Patience · Team spirit',
  logoImageId: null,
  // How the automatic match outcome is decided from player scores.
  // 'average' compares average strokes per player round (fair when group
  // sizes differ); 'total' compares total strokes.
  outcomeMetric: 'average',
  // Count matches still in progress (not every scorecard has 12 fairways)
  // in the standings with their current, provisional result.
  liveResults: true,
  // Ordered tie-breakers applied after points.
  tieBreakers: [
    { key: 'wins', enabled: true },
    { key: 'headToHead', enabled: true },
    { key: 'avgStrokes', enabled: true },
    { key: 'fewerLosses', enabled: false },
    { key: 'bestRound', enabled: false },
  ],
  // Players need at least this many rounds played (rounds in progress count) to be ranked.
  minRoundsForRanking: 1,
  // Upper bound accepted when entering a single fairway score.
  maxStrokesPerFairway: 15,
  // Address of the coach's score inbox (a Google Apps Script web app) that
  // players' phones send finished playing cards to. Empty = switched off.
  scoreInboxUrl: '',
})
