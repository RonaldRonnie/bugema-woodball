# Bugema University Woodball — Team Management & Performance Tracking

A mobile-first web app for the Bugema University Woodball Team: groups, players, match and practice records, 12-fairway score cards, automatic points and leaderboards, individual and group statistics, CSV/PDF reports, and JSON backup/restore.

It is a **completely static site**: React + Vite, no server, no database, no paid services. It runs on GitHub Pages, and everything the coach records is stored in the browser on the coach's device.

---

## Contents

1. [Features](#features)
2. [Quick start (local development)](#quick-start-local-development)
3. [Build](#build)
4. [Deploy to GitHub Pages](#deploy-to-github-pages)
5. [Using the app (coach's guide)](#using-the-app-coachs-guide)
6. [Publishing results so the team can see them](#publishing-results-so-the-team-can-see-them)
7. [Backup and restore](#backup-and-restore)
8. [Limitations of browser-based storage](#limitations-of-browser-based-storage)
9. [Admin mode and security](#admin-mode-and-security)
10. [How scoring works](#how-scoring-works)
11. [Testing](#testing)
12. [Project structure](#project-structure)

---

## Features

- **Public dashboard**: team branding and photos, totals, group standings, recent results, top performers and performance charts.
- **Groups A, B and C** pre-loaded with the full roster (45 players, names exactly as supplied). Groups can be added, renamed, recoloured and given photos.
- **Player management**: register, edit, deactivate or delete players, move them between groups (one at a time or in bulk), upload photos, and search and filter. Every player has a unique internal ID.
- **Match and score recording**: date, competitive match or practice, participating groups, line-up, any number of rounds, notes, and an automatic or manual result. Each round has **12 fairway score fields** per player, and totals are calculated automatically. Several matches and rounds can be recorded on the same day.
- **Mobile-friendly score entry**: player-by-player cards with an on-screen keypad and automatic advance to the next fairway, or a spreadsheet-style table on larger screens. Every value is saved as soon as it is entered.
- **Points and leaderboard**: Win 3 · Draw 1 · Loss 0, with configurable tie-breakers. Editing or deleting results recalculates everything immediately.
- **Statistics** for each player (matches, rounds, total strokes, average, best round, history, fairway-by-fairway scores) and each group, filtered by day, week, month, custom range or all time.
- **Reports**: CSV exports (player, group, team, full match history) and PDF reports (player, group, team) with charts, all filtered by date.
- **Backup and restore**: one JSON file holding all data and photos, checked before it replaces anything.
- **Published results**: an optional read-only snapshot file so visitors to the website can see the standings (see below).

---

## Quick start (local development)

Requirements: **Node.js 20.19 or newer** (22 LTS recommended) and npm.

```bash
git clone https://github.com/<your-account>/<your-repo>.git
cd <your-repo>
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). Changes to the source reload instantly.

To try it on a phone on the same Wi-Fi network, run `npm run dev -- --host` and open the "Network" address on the phone. Some browser features, such as persistent-storage requests, need HTTPS, so test those on the deployed site.

## Build

```bash
npm test          # run the automated tests
npm run build     # production build into dist/
npm run preview   # serve dist/ locally to check it
```

The build uses a relative base path by default, so `dist/` works from any folder. The GitHub Actions workflow sets the exact GitHub Pages base path automatically (see below).

---

## Deploy to GitHub Pages

The repository includes `.github/workflows/deploy.yml`. Each push to `main` runs the tests, builds the site and publishes it to GitHub Pages.

1. Create a repository on GitHub (for example `bugema-woodball`) and push this project to its `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-account>/bugema-woodball.git
   git push -u origin main
   ```
2. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to finish (about 1–2 minutes).
4. The site is then live at `https://<your-account>.github.io/bugema-woodball/`.

**Base path**: Vite must know the folder the site is served from. The workflow sets `VITE_BASE_PATH` to `/<repository-name>/`, or to `/` for a `<user>.github.io` repository, so the repository can be renamed without code changes. To build for a specific path by hand:

```bash
VITE_BASE_PATH=/bugema-woodball/ npm run build
```

**Routing**: the app uses `HashRouter`, so addresses look like `…/bugema-woodball/#/players`. Refreshing or sharing any page works on GitHub Pages without special server configuration.

---

## Using the app (coach's guide)

1. Tap **Admin** (bottom bar on phones, top right on computers) and choose **Switch on admin mode**.
2. **Record a match**: Admin → *Record a match* → choose the date, *Competitive match* or *Practice*, the groups and the line-up → *Create match & enter scores*.
3. **Enter scores**: tap a player, then tap the score for each fairway on the keypad. The cursor moves to the next fairway on its own; for a two-digit score such as 12, tap 1 then 2. The total updates as you go and every value is saved immediately. Use *Next player* to continue, and *Add round* for further rounds.
4. **Fix mistakes**: tap any fairway and enter the right number. Delete a whole round or match from the match screen, or clear one player's card with *Clear / absent*. Standings recalculate automatically.
5. **Players and groups**: Admin → *Players* to register, edit, deactivate or delete players, add photos and move players between groups. Admin → *Groups* to manage groups.
6. **Reports**: *Reports* → choose a period → download CSV or PDF.
7. **Back up** after every match day: Admin → *Backup & data* → *Download backup*.

No source code ever needs to be edited to add players or record results.

---

## Publishing results so the team can see them

Because records live in the coach's browser, other people who open the website would only see the empty starting roster. To share results without a server:

1. Admin → **Backup & data** → **Download snapshot.json**.
2. On GitHub, open the repository → `public/data/` → **Add file → Upload files**. Upload `snapshot.json` (replacing the old one) and click **Commit changes**.
3. The workflow rebuilds the site. A few minutes later every visitor sees the published standings, results and statistics (read-only).

How the app decides what to show:

| This browser has… | It shows |
|---|---|
| Its own saved records (e.g. the coach's phone) | Those records |
| No saved records, but a published snapshot exists | The published results (read-only) |
| Neither | The initial roster with no results |

If photos are included in the snapshot, they become public on the website. Untick *Include photos* if you do not want that.

A coach starting on a new device can open Admin and choose **Copy the published results into this browser** to carry on from the last published state. Restoring a full backup is more complete, because a snapshot holds only what was published.

---

## Backup and restore

**Back up**: Admin → *Backup & data* → *Download backup (.json)*. The file contains every group, player, match, round, fairway score, setting and (optionally) photo. Store it somewhere safe, such as Google Drive, email or a USB stick. The admin dashboard shows a reminder when there are changes that have not been backed up.

**Restore**: Admin → *Backup & data* → *Choose backup file…*. The app first checks that the file is valid, then shows what is currently stored and what the backup contains, and asks you to confirm before replacing anything. If the file is invalid, nothing is changed.

**Moving to a new phone or computer**: back up on the old device, open the site on the new device, switch on admin mode and restore the file.

The backup format is versioned (`schemaVersion`). Future versions of the app will upgrade older backups automatically. A backup from a newer app version is refused rather than loaded incorrectly.

---

## Limitations of browser-based storage

Please read this before relying on the app.

- **No automatic sync.** Data is stored in one browser on one device. A phone and a laptop each keep separate records. Use backup/restore to move data, and publish a snapshot to share results.
- **Data can be lost** if the browser's site data is cleared, if a private/incognito window is used, if the browser is uninstalled, or (rarely) if the device runs very low on storage. The *Backup & data* page has a button that asks the browser to protect the data from automatic clean-up. **Regular backups are the real safeguard.**
- **Storage limits.** Records use LocalStorage (about 5 MB, which is enough for many seasons of scores). Photos use IndexedDB, which allows much more. Photos are resized automatically (player photos to 480 px, team photos to 1600 px).
- **One editor at a time.** Two devices editing separately cannot be merged automatically; the last restore wins. Choose one device as the coach's main device.
- **Different browsers on the same device** (for example Chrome and Firefox) also keep separate data.

---

## Admin mode and security

The app has **no user accounts and no server**, so it cannot offer real authentication, and it does not pretend to.

- Admin mode only separates *viewing* from *editing* so results are not changed by accident.
- Anyone using the coach's browser can switch on admin mode. The optional **edit-lock PIN** (Admin → Settings) only slows down casual use of a shared device. It is stored in plain form on that device and can be bypassed with browser developer tools.
- Visitors to the public website cannot change the coach's records. Any edits a visitor makes stay in their own browser and affect no one else.
- **Use admin mode on a trusted, single device** that only the coach uses.

---

## How scoring works

- A round has 12 fairways. **Total strokes** is the sum of the 12 fairway scores, and fewer is better.
- A round counts towards statistics only when all 12 fairways are entered. Partly entered rounds are kept, marked as incomplete and listed under *Needs attention* on the admin dashboard.
- **Match result (automatic)**: the group with the lowest **average strokes per completed player round** wins, which is fair when groups field different numbers of players. Groups level on that measure draw. You can switch this to total strokes in Settings, or set any match's result manually.
- **Points**: Win 3 · Draw 1 · Loss 0. Strokes and points are separate measures.
- **Tie-breakers** (Admin → Settings, reorderable): most wins, head-to-head record between the tied groups, lowest average strokes, fewest losses, best single round. Groups still level share a rank.
- **Practice sessions** count towards stroke statistics but award no points.
- A player's past scores stay with the group they played for, even after they move to another group.
- **Player rankings** use average strokes per completed round, with a configurable minimum number of rounds.

---

## Testing

```bash
npm test
```

Automated tests (Vitest) cover the seed roster, stroke totals, match outcomes, points, tie-breakers, leaderboard recalculation after edits and deletes, individual and group statistics, date filtering, player and group management, score validation, LocalStorage persistence and corruption recovery, storage-full handling, JSON backup and restore (including photos in IndexedDB), and CSV escaping and content.

The GitHub Actions workflow runs these tests before every deployment, and a failing test stops the deploy.

---

## Project structure

```
src/
  data/          seed roster and default settings
  lib/           pure logic: scoring, statistics, dates, CSV, PDF, images
  services/      storage.js (LocalStorage persistence, validation, migrations),
                 imageStore.js (IndexedDB photos), backup.js, snapshot.js
  state/         DataContext (safe commits), actions (data operations),
                 AdminContext, UI (toasts, confirm dialog), image hooks
  components/    layout, charts, tables, filters, photo picker
  pages/         public pages; pages/admin/ for the administration area
public/data/     snapshot.json goes here when results are published
tests/           Vitest unit and integration tests
.github/workflows/deploy.yml   build, test and deploy to GitHub Pages
```

All reads and writes of saved data go through `src/services/storage.js`. Every change is applied to a copy, validated and saved before the screen updates, so a failed save never leaves half-written data.
