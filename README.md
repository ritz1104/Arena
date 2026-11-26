# BUZZ OR LOSE – THE ARENA

**Think fast. Buzz first. Win big.**

A live tournament platform for student coding battles. One host runs the whole event from a laptop. A projector shows the read-only audience screen, and podium devices act as buzzers.

## Quick start

Requirements: **Node 20+** and **MongoDB** running locally (default `mongodb://127.0.0.1:27017`).

```powershell
npm install
```

```powershell
npm run install:all
```

```powershell
npm run seed
```

```powershell
npm run dev
```

- Host app: http://localhost:5173/admin
- Audience screen: http://localhost:5173/arena/live
- API and realtime: http://localhost:4000

The first admin account is created automatically on first start from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env`. Change these before a real event.

`npm run seed` adds 10 sample teams and 42 sample questions. `npm run seed -- --reset` wipes teams, questions, competitions and history first.

### Deploying to Render

See **[DEPLOY.md](DEPLOY.md)**. It uses a one-click Blueprint (`render.yaml`) with MongoDB Atlas.

### Production / event day (self-hosted)

```powershell
npm run build
```

```powershell
npm start
```

`npm start` serves the built client and API together on `API_PORT` (default 4000). Other devices on the same network open `http://<laptop-LAN-IP>:4000/arena/live`, and the podium buzzers use the links on **Settings → Podium buzzers**.

## Running an event

1. **Teams**: add teams manually or import a **PDF, CSV or Excel** file. Every import shows an editable preview with validation (duplicate names, more than 4 members, missing names). Nothing is saved until you confirm.
2. **Questions**: add questions or import CSV/Excel. Each question has a category, hint, answer, difficulty and optional explanation. Questions can be limited to specific rounds. A question is never reused within a competition.
3. **Host Control → START COMPETITION.** All teams enter Round 1.
4. **Spin the wheel** (`S`) twice to draw a battle. Drawn teams leave the wheel for the rest of the round. The server picks the team with a crypto-secure random number, and every screen animates to the same result.
5. **Start the battle** and run each question:

| Key | Action |
|---|---|
| `Q` | Show question |
| `Space` | Start / pause / resume timer |
| `A` / `←`, `L` / `→` | Team A / Team B buzzed (or use the podium buzzers) |
| `C` / `X` / `O` | Correct / Wrong / No answer |
| `H` | Reveal hint (only after nobody buzzes) |
| `R` | Reveal answer |
| `N` | Next question |
| `S` | Skip question |

6. **End the battle.** The winner qualifies and the loser is eliminated (records are never deleted). Ties need a tiebreaker question or a winner chosen by the host with a recorded reason.
7. **Complete the round**, choose **wildcards** (eliminated teams ranked by points, with the top one suggested), and start the next round. With an odd number of teams, give a **bye**, add a wildcard opponent, or pair teams manually. A team is never eliminated just because the count is odd.
8. **Playoffs (recommended finish):** after any completed round, use **Start playoffs** on Host Control. The seeds are pre-filled from total points, and you can adjust them.
   - **#1** qualifies directly for the Grand Final.
   - **#2 vs #3** play a **Semifinal** buzzer battle. Every other team finishes here; their records are kept.
9. **Grand Final: video challenge.** After the semifinal, complete the round and set up the Grand Final for #1 and the semifinal winner. You provide a title, a problem statement, the build time in minutes, and the judging criteria (default: correctness, clarity, creativity, presentation, each out of 10).
   1. **Reveal problem & start clock.** The problem appears on the projector with a big countdown. You can pause the clock, add or remove 5 minutes, or end it early.
   2. **Submissions.** Upload each team's video file (.mp4, .webm, .mov or .m4v, up to 1 GB) or paste a YouTube / Google Drive / direct link.
   3. **Showcase.** Choose which team's video plays on the projector, and control Play / Pause / Restart / Fullscreen from the laptop. These controls work for uploaded files; YouTube and Drive links play in an embedded player that you control on the projector.
   4. **Judging.** Enter each judge's scores per criterion. The audience never sees scores before the reveal.
   5. **Reveal results.** Every judge must have scored every finalist. Totals are revealed from lowest to highest, and the highest total becomes **the Ultimate Champion**. A tie needs the host's choice plus a recorded reason. Then press **Announce champion**.

   The classic format is still available: create a round with only two teams and it becomes a head-to-head buzzer **Final**.

Use the **Live screen** bar to choose what the projector shows: standby, wheel, versus, battle, round leaderboard, overall leaderboard or champion.

## Scoring rules (enforced on the server)

- The first buzz within the 10 s window wins the chance to answer; the other team is locked out immediately.
- Correct answer: **+1** to the answering team.
- Wrong answer, or no answer within 5 s: **+1 to the opposition**, plus one **steal** attempt. A correct steal earns another +1; a missed steal earns nothing.
- Nobody buzzes: the host may reveal **one hint**, which opens a second 10 s window. After the hint, a wrong answer or timeout gives +1 to the opposition (a steal after the hint is optional in Settings). If nobody buzzes after the hint, the question is skipped with no points.

All timer lengths, questions per battle, and the steal-after-hint option are in **Settings**.

## Architecture

```
server/                 Express + Mongoose + Socket.IO
  src/models/           User, Team, Category, Question, Tournament, Round, Battle,
                        AnswerAttempt, TournamentEvent, Setting
  src/services/
    commands.js         every live action → role check → serial queue → persist → broadcast
    lock.js             global serial command queue (no race conditions)
    battleEngine.js     buzzer/scoring state machine (Battle.live)
    tournamentEngine.js wheel, rounds, byes, wildcards, champion
    timer.js            server-authoritative countdowns (deadline persisted, re-armed on restart)
    snapshot.js         full host state + sanitized audience state
    leaderboard.js      round / overall / final, computed from the scoring history
    importers.js        PDF / CSV / XLSX parsing + validation
  src/socket/           rooms: hosts (JWT) · public (read-only) · podium buzzers (buzzer key)
  tests/                engine tests (node:test, uses a separate *_test database)
client/                 React + Vite, CSS Modules + design tokens
  src/pages/admin/      Dashboard, Host Control, Wheel, Teams, Questions, Rounds,
                        Leaderboards, History & Audit, Settings
  src/pages/arena/      LiveArena (audience scenes), Buzzer (podium device)
  src/components/arena/ Wheel, BattleStage, Countdown, LeaderboardBoard, ChampionStage
  src/lib/sound.js      Web Audio sound manager (synthesised, royalty-free)
samples/                example team PDF/CSV and question CSV for testing imports
```

### Reliability and security

- Every state change is persisted to MongoDB before it is broadcast. A page refresh or a server restart restores the exact battle phase, scores and running timers.
- Simultaneous buzzes resolve to exactly one winner (serial queue plus phase checks). Results cannot be applied twice: each one carries an `actionId` with a unique index, and there is a unique slot per question attempt.
- The audience and buzzer clients never receive hidden answers. Question text is sent only after it is shown, hints only after they are revealed, and answers only after the host reveals them.
- Host commands require a JWT with the `admin` or `host` role. Resetting a competition is admin-only.
- Corrections (manual pairing, cancelled battles, team swaps, byes, wildcards, score adjustments, winner overrides) require a reason where it matters and are stored as audit events.
- Uploads are restricted by type and size. Data imports are parsed in memory and never written to disk.

## Testing

```powershell
npm test
```

The tests run the real engine against a temporary `buzz_or_lose_test` database. They cover wheel uniqueness, every scoring path, simultaneous buzzes, duplicate submissions, ties, odd team counts with byes and wildcards through to the champion, answer secrecy, authorization, timer recovery after a restart, audited corrections, and PDF/CSV parsing.

## Sounds

Built-in effects are synthesised in the browser with the Web Audio API, so no third-party audio files are bundled. In **Settings** you can enable or disable sound, set the volume, choose which screens play sound (keep it on just one device in the same room to avoid echo), preview each effect, and upload your own licensed audio for any event. Browsers only allow audio after a user interaction, so the live screen asks for one click to enable sound.
