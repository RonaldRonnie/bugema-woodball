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
6. [Publishing results so everyone can see them](#publishing-results-so-everyone-can-see-them)
7. [Backup and restore](#backup-and-restore)
8. [Limitations of browser-based storage](#limitations-of-browser-based-storage)
9. [Admin password and security](#admin-password-and-security)
10. [Playing cards](#playing-cards)
11. [Players keep score on their phones](#players-keep-score-on-their-phones)
12. [How scoring works](#how-scoring-works)
13. [Testing](#testing)
14. [Project structure](#project-structure)

---

## Features

- **Public dashboard**: team branding and photos, totals, group standings, recent results, top performers and performance charts.
- **Groups A, B and C** pre-loaded with the full roster (45 players, names exactly as supplied). Groups can be added, renamed, recoloured and given photos.
- **Player management**: register, edit, deactivate or delete players, move them between groups (one at a time or in bulk), upload photos, and search and filter. Every player has a unique internal ID.
- **Match and score recording**: date, competitive match or practice, participating groups, line-up, any number of rounds, notes, and an automatic or manual result. Each round has **12 fairway score fields** per player, and totals are calculated automatically. Several matches and rounds can be recorded on the same day.
- **Playing cards**: when a match is created, the line-up is seeded at random into cards of 4 — 2 players from one group and 1 from each other group. Once published, everyone can see who they are playing with on the match page, the home page and their own player page.
- **Players keep score on their phones**: one player per card enters everyone's strokes after each fairway — it works without internet — and taps *Submit* at the end. The card lands in the coach's **Score inbox** (and in a Google Sheet, one row per player, downloadable as CSV); the coach checks it, accepts it and publishes.
- **Works offline**: once a phone has opened the site with internet, the site and the published results still open without it.
- **Mobile-friendly score entry**: player-by-player cards with an on-screen keypad and automatic advance to the next fairway, or a spreadsheet-style table on larger screens. Every value is saved as soon as it is entered.
- **Points and leaderboard**: Win 3 · Draw 1 · Loss 0, with configurable tie-breakers. Editing or deleting results recalculates everything immediately.
- **Statistics** for each player (matches, rounds, total strokes, average, best round, history, fairway-by-fairway scores) and each group, filtered by day, week, month, custom range or all time.
- **Reports**: CSV exports (player, group, team, full match history) and PDF reports (player, group, team) with charts, all filtered by date.
- **Backup and restore**: one JSON file holding all data and photos, checked before it replaces anything.
- **Coach sign-in** with a password; visitors can view everything but cannot change anything.
- **One-click publishing**: the coach presses *Publish results* and, about two minutes later, everyone sees the new results wherever they are.

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

1. Tap **Admin** (bottom bar on phones, top right on computers) and sign in with the coach password.
2. **Record a match**: Admin → *Record a match* → choose the date, *Competitive match* or *Practice*, the groups and the line-up → *Create match & enter scores*.
   - **Playing cards** are seeded automatically below the line-up (see [Playing cards](#playing-cards)). Tap **Reshuffle** for a new draw, or use a player's *Card* menu to move them. Untick *Seed players into cards* if a session does not need cards.
   - **Publish** straight after creating the match so the players can see their cards before they play.
3. **Enter scores**: tap a player, then tap the score for each fairway on the keypad. The cursor moves to the next fairway on its own; for a two-digit score such as 12, tap 1 then 2. The total updates as you go and every value is saved immediately. Use *Next player* to continue, and *Add round* for further rounds.
   - **Or let the players keep score** (once the [score inbox](#players-keep-score-on-their-phones) is set up): one player per card scores on their phone and submits the card. Then open Admin → **Score inbox**, check each card and tap **Accept** (or **Accept all**), and publish from the same page.
4. **Close the match** when play is over, even if some players did not turn up or stopped before fairway 12: on the match's score page choose **Close match**. The dialog lists who did not play and who finished fewer than 12 fairways, and shows the final result. Closing makes the result final (no longer *Live*) and locks the scores and line-up; **Reopen match** unlocks them. Publish afterwards.
   - **Close one round** with **Close round N** next to the round's progress (for example when round 1 is over but round 2 is still being played). Its scores are locked and shown read-only, players with no scores in it show as *Did not play*, and its unfinished scorecards no longer keep the result *Live*. Phones are no longer offered that round. **Reopen round N** unlocks it.
5. **Fix mistakes**: tap any fairway and enter the right number. Delete a whole round or match from the match screen, or clear one player's card with *Clear / absent*. Standings recalculate automatically.
6. **Players and groups**: Admin → *Players* to register, edit, deactivate or delete players, add photos and move players between groups. Admin → *Groups* to manage groups.
7. **Reports**: *Reports* → choose a period → download CSV or PDF.
8. **Publish** after every training or match day: Admin → *Publish & backup* → **Publish results now**. Everyone sees the update in about 2 minutes.
9. **Back up** regularly on the same page: *Download backup*.

No source code ever needs to be edited to add players or record results.

---

## Publishing results so everyone can see them

Records you enter are saved on your own device first. To show them to the team, you **publish**. The app writes the results into this GitHub repository (`public/data/snapshot.json`, with photos in `public/data/images/`). The deploy workflow then rebuilds the site, and about two minutes later everyone who opens the website sees the new standings, results and statistics, wherever they are. Pages that are already open refresh when the viewer returns to them.

### One-time setup (on the coach's own device)

Publishing needs a GitHub **access key** (a fine-grained personal access token). Only you have it, so only you can change what the team sees.

1. On a computer, sign in to GitHub and open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** (direct link: https://github.com/settings/personal-access-tokens/new).
2. **Token name**: `Woodball publishing`. **Expiration**: pick a date (up to a year). You will need to create a new key when it expires.
3. **Repository access**: *Only select repositories* → `bugema-woodball`.
4. **Permissions → Repository permissions**: **Contents → Read and write**, and **Actions → Read-only** (so the app can show when the website has finished updating).
5. Click **Generate token** and copy it (it starts with `github_pat_`).
6. In the app: sign in → **Admin → Publish & backup** → paste the key → **Check and save**.

The key is stored only in that browser on that device. It is never put in backups, published files or the code. Don't set it up on a shared device. To revoke it, delete it on GitHub.

### Publishing

Admin → **Publish & backup** → **Publish results now** → confirm. The admin dashboard reminds you when there are changes the team can't see yet.

- **Photos**: published photos become public. Untick *Include photos* to publish without them; previously published photos are then removed from the site.
- **Several devices**: if you use a second phone or laptop, sign in there, open Admin and choose **Copy the published results into this browser** to continue from the latest published results. If you try to publish from a device whose data is older than what is online, the app warns you first.
- **Without a key**: a *Manual publishing* option on the same page downloads `snapshot.json`, which you can upload to `public/data/` on GitHub yourself.

---

## Backup and restore

**Back up**: Admin → *Publish & backup* → *Download backup (.json)*. The file contains every group, player, match, round, fairway score, setting and (optionally) photo. Store it somewhere safe, such as Google Drive, email or a USB stick. The admin dashboard shows a reminder when there are changes that have not been backed up.

**Restore**: Admin → *Publish & backup* → *Choose backup file…*. The app first checks that the file is valid, then shows what is currently stored and what the backup contains, and asks you to confirm before replacing anything. If the file is invalid, nothing is changed.

**Moving to a new phone or computer**: either copy the published results on the new device (Admin → *Copy the published results into this browser*), or back up on the old device and restore the file on the new one.

The backup format is versioned (`schemaVersion`). Future versions of the app will upgrade older backups automatically. A backup from a newer app version is refused rather than loaded incorrectly.

---

## Limitations of browser-based storage

Please read this before relying on the app.

- **Edits are per device until published.** A phone and a laptop each keep their own working copy. Publish to share results with everyone; use *Copy the published results into this browser* (or backup/restore) to continue on another device.
- **Data can be lost** if the browser's site data is cleared, if a private/incognito window is used, if the browser is uninstalled, or (rarely) if the device runs very low on storage. The *Publish & backup* page has a button that asks the browser to protect the data from automatic clean-up. **Regular backups are the real safeguard.**
- **Storage limits.** Records use LocalStorage (about 5 MB, which is enough for many seasons of scores). Photos use IndexedDB, which allows much more. Photos are resized automatically (player photos to 480 px, team photos to 1600 px).
- **One editor at a time.** Two devices editing separately cannot be merged automatically; the last publish wins (the app warns before overwriting newer online results). Choose one device as the coach's main device.
- **Different browsers on the same device** (for example Chrome and Firefox) also keep separate data.

---

## Admin password and security

- Only the coach can sign in (Admin → enter the password). Visitors can view everything but cannot open the admin area.
- The password is **not stored in the code**. `src/lib/auth.js` holds only a salted, slow one-way fingerprint of it (PBKDF2-SHA256), because this repository is public.
- *Keep me signed in on this device* remembers the sign-in on that device until you press **Sign out**. Use it only on your own phone or computer.
- **Changing the password**: in the project folder run
  ```bash
  npm run set-password -- "your new password"
  git commit -am "Change admin password" && git push
  ```
  The live site uses the new password after the automatic deploy, and everyone who was signed in must sign in again.

What actually protects the results: the sign-in check runs in the browser, so a technically skilled person could get past it on **their own** device. That would only let them change a private copy in their own browser. What everyone sees changes only when results are **published**, and publishing needs the GitHub access key that exists only on the coach's device.

Use a password you don't use anywhere else. A longer passphrase is stronger.

## Playing cards

A card is the group of players who go round the course together and share one scorecard.

- **Seeding**: cards of 4 players, mixed across the competing groups. With three groups, each card has **2 players from one group and 1 from each of the other two**; with two groups, 2 + 2. Players are dealt at random, and each group's players are spread as evenly as possible over the cards.
- **Numbers that don't divide by 4**: some cards have 3 players (one from each group), so nobody plays alone. For example, the full squad of 45 (17 + 13 + 15) gives 9 cards of 4 and 3 cards of 3.
- **Changing the line-up**: until you move a player by hand, the cards are dealt again whenever the line-up changes. After a hand move, or once the match is saved, everyone keeps their card: players who drop out are taken off, and newcomers join a card with room. If every card is full, a newcomer starts a new card, and the form flags any card that has fewer than 3 or more than 4 players.
- **Where players see them**: the match page lists every card, with a *Find your name* box and a *Share / Copy list* button for WhatsApp. The home page shows *Playing cards are out* for upcoming matches, and each player's page shows their card and who they play with.
- **Scoring**: score entry lists players card by card, so each paper scorecard can be entered in one go. Cards do not affect results or points.

## Players keep score on their phones

One player per playing card keeps score for the whole card on their phone, the moment each fairway is finished. The card goes to the coach when it is submitted; nothing reaches the website until the coach accepts it and publishes.

**For the player keeping score**

1. Open the website **once with internet** on match day (before going out to the course). From then on it also opens without internet.
2. Open the match → **Keep score** → choose your card, the round (if there is more than one) and your name → **Start keeping score**.
3. After each fairway, enter everyone's strokes on the keypad. The app moves to the next player by itself (for 10–15 tap *1* then the second digit; for a score of 1, tap *1* then *Next player*). Every tap is saved on the phone straight away, so a dead screen, a closed browser or no signal loses nothing.
4. After fairway 12, check the card and tap **Submit to the coach**. Without internet the button waits; the site shows a reminder on every page until the card is sent. Changed a score after sending? Send the card again — the coach gets the corrected copy.

**For the coach**

- Admin → **Score inbox** lists the cards sent in. Each shows every player's 12 fairways, who kept score, and how it compares with what is already entered: *New*, *Changes your entry* (the changed fairways are highlighted) or *Already entered*. Players no longer in the line-up, or with no scores, are skipped.
- Tap **Accept** (or **Accept all**), then **Publish results now** on the same page. **Dismiss** removes a card you do not want; it can be brought back under *Handled cards*.
- If a card is sent twice, only the newest copy counts. **Download CSV** gives every card sent, one row per player.

**One-time set-up (about 10 minutes, on a computer)**

The website itself cannot receive files, so the cards are collected by a small script in a Google Sheet in the coach's own Google account. The same steps are shown in Admin → Settings → *Score inbox*, with a button that copies the script.

1. Sign in to Google and open [sheets.new](https://sheets.new) to create a blank spreadsheet. Name it “Woodball score inbox”.
2. In the spreadsheet choose **Extensions → Apps Script**, delete the lines already there and paste the script from [`apps-script/score-inbox.gs`](apps-script/score-inbox.gs) (or use *Copy the inbox script* in Settings). Click **Save**.
3. **Deploy → New deployment** → gear icon → **Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**.
4. Authorize access with your account. If Google says it hasn't verified the app, choose **Advanced → Go to … (unsafe) → Allow** — it is your own script, and it can only use this one spreadsheet.
5. Copy the **Web app URL** (ends in `/exec`), paste it in Admin → Settings → *Score inbox* and click **Test and save**.
6. **Publish the results.** Players' phones learn the inbox address from the published results.

Each card is stored in the sheet's *Submissions* tab, one row per player with F1–F12 and the total (File → Download → CSV to keep a copy). If you later paste a newer version of the script, use **Deploy → Manage deployments → Edit → Version: New version** so the address stays the same.

**Good to know**

- Anyone who has the inbox address could send a card, which is why every card waits for the coach to accept it. The website only changes when the coach publishes.
- A scorecard lives on the phone that kept it until it is submitted. Clearing the browser's data before submitting deletes it.

## How scoring works

- A round has 12 fairways. **Total strokes** is the sum of the fairway scores, and fewer is better.
- **Every fairway score counts as soon as it is entered.** Averages are worked out per fairway and shown per round (× 12), so a player three fairways into a round can be compared fairly with someone who has finished. *Best round* records need all 12 fairways.
- **Live results**: while scorecards are still being filled in, a match shows a provisional result marked **Live**, and its points count in the standings straight away. The result becomes final when every started scorecard has all 12 fairways, or is in a round the coach has closed, or when the coach closes the match. To award points only for finished matches, switch off *Show live results* in Settings.
- **Closing a match** makes its result final with the scores entered. Players with no scores are shown as *Did not play* and are left out; players who stopped early count for the fairways they played (averages are per fairway, so this stays fair), and best-round records still need all 12. A match can be closed once every group has at least one score (or a manual result is set). Scores, rounds and the line-up are then locked, and player-submitted cards for it are not added, until the match is reopened.
- **Match result (automatic)**: the group with the fewest strokes per fairway (shown as average strokes per round) wins, which is fair when groups field different numbers of players. Groups level on that measure draw. You can switch this to total strokes in Settings, or set any match's result manually.
- **Points**: Win 3 · Draw 1 · Loss 0. Strokes and points are separate measures.
- **Tie-breakers** (Admin → Settings, reorderable): most wins, head-to-head record between the tied groups, lowest average strokes, fewest losses, best single round. Groups still level share a rank.
- **Practice sessions** count towards stroke statistics but award no points.
- A player's past scores stay with the group they played for, even after they move to another group.
- **Player rankings** use average strokes per round across every fairway entered, with a configurable minimum number of rounds played.

---

## Testing

```bash
npm test
```

Automated tests (Vitest) cover the seed roster, stroke totals, match outcomes, points, tie-breakers, leaderboard recalculation after edits and deletes, playing-card seeding (the 2 + 1 + 1 rule over hundreds of random line-ups), the score inbox (the real Google Apps Script run against a stand-in spreadsheet, card checks and merging, phone scorecards), closing matches and rounds with missing scores, individual and group statistics, date filtering, player and group management, score validation, LocalStorage persistence and corruption recovery, storage-full handling, JSON backup and restore (including photos in IndexedDB), and CSV escaping and content.

The GitHub Actions workflow runs these tests before every deployment, and a failing test stops the deploy.

---

## Project structure

```
src/
  data/          seed roster and default settings
  lib/           pure logic: scoring, statistics, playing cards, score inbox, phone scorecards,
                 dates, CSV, PDF, images,
                 auth.js (admin password fingerprint)
  services/      storage.js (LocalStorage persistence, validation, migrations),
                 imageStore.js (IndexedDB photos), backup.js, snapshot.js,
                 publish.js (one-click publishing through the GitHub API)
  state/         DataContext (safe commits), actions (data operations),
                 AdminContext, UI (toasts, confirm dialog), image hooks
  components/    layout, charts, tables, filters, photo picker
  pages/         public pages (KeepScore.jsx: scoring on a player's phone);
                 pages/admin/ for the administration area (AdminInbox.jsx: score inbox)
  offline/       sw-template.js — offline support, turned into dist/sw.js at build time
apps-script/     score-inbox.gs — the Google Sheet score inbox players submit cards to
public/data/     published results (snapshot.json) and photos (images/)
scripts/         set-admin-password.mjs
tests/           Vitest unit and integration tests
.github/workflows/deploy.yml   build, test and deploy to GitHub Pages
```

All reads and writes of saved data go through `src/services/storage.js`. Every change is applied to a copy, validated and saved before the screen updates, so a failed save never leaves half-written data.
