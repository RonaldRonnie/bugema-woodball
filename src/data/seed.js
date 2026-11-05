import { SCHEMA_VERSION, DEFAULT_SETTINGS } from './defaults.js'
import { GROUP_COLORS } from '../lib/colors.js'

// Initial roster supplied by the coach. Names are kept exactly as provided.
const ROSTER = {
  A: [
    'NANYONDO JANE',
    'NTOGO GLADYS',
    'KAITESI TABITHA',
    'MUTONI WASE MOUREEN',
    'NAGAWA JOVIA',
    'NANTOGO MEHA',
    'NAGASHA SAVIOUR',
    'MUSIMENTA NOREEN',
    'SSEMPIJJA EZRA',
    'KALYANGO EMMA',
    'PARTNER JANE',
    'AYEBARE ONESMAS',
    'TAMALE WILLIAM',
    'KATO CHRISTOPHER',
    'TUMUSIME ELLIAH',
    'MARK WA PARVIN',
    'YAWE JOHN JOEL',
  ],
  B: [
    'Nakku Olivia Ruth',
    'Ssempijja Keneddy',
    'Namuyanja Jane',
    'Namugerwa Anna',
    'Wannyana Becky',
    'Nabasumba Parvin',
    'Muwonge Amson',
    'Kawooya Shem',
    'Makumbi Jonathan',
    'Nicholas',
    'Ssali Godfrey',
    'Ainamani Samuel',
    'Hope Swaibu',
  ],
  C: [
    'Precious Chelsy',
    'Julian',
    'Jackline',
    'Agatha Kabatesi',
    'Angel',
    'Vivian Babiry',
    'Nkonge Amos',
    'Mwebaza Yusuf',
    'Nabagesera Gladys',
    'Muhwezi Alex',
    'Cyrus',
    'Kabuye Moses',
    'Lagu Ronald',
    'Ssentezza Gilbert',
    'Joseph',
  ],
}

export const SEED_ROSTER = ROSTER

/**
 * Builds the starting dataset: three groups and their players, no matches.
 * Seed IDs are deterministic so a fresh install always has the same IDs.
 */
export function createSeedData(now = new Date().toISOString()) {
  const groups = Object.keys(ROSTER).map((letter, i) => ({
    id: `grp-${letter.toLowerCase()}`,
    name: `Group ${letter}`,
    color: GROUP_COLORS[i],
    description: '',
    photoId: null,
    createdAt: now,
    updatedAt: now,
  }))

  const players = Object.entries(ROSTER).flatMap(([letter, names]) =>
    names.map((name, i) => ({
      id: `ply-${letter.toLowerCase()}${String(i + 1).padStart(2, '0')}`,
      name,
      groupId: `grp-${letter.toLowerCase()}`,
      active: true,
      role: '',
      studentNo: '',
      notes: '',
      photoId: null,
      createdAt: now,
      updatedAt: now,
    })),
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    settings: structuredCloneSafe(DEFAULT_SETTINGS),
    groups,
    players,
    matches: [],
    teamPhotos: [],
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value))
}
