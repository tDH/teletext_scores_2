# Teletext Scores 2

A retro Ceefax-style football scores app with FPL Draft league integration.

Built with Node.js, Express, PostgreSQL, and Vanilla JS.

---

## Setup

### Prerequisites

- Node.js ≥ 18.0.0 (tested with 20.x)
- PostgreSQL (tested with 14+)
- A [RapidAPI](https://rapidapi.com) account with access to the API-Football endpoint
- Your FPL Draft league ID

### Install dependencies

```bash
npm install
```

### Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | `development` or `production` |
| `CORS_ORIGIN` | Allowed origin for CORS (e.g. `http://localhost:3000`) |
| `DB_USER` | PostgreSQL username |
| `DB_HOST` | PostgreSQL host |
| `DB_DATABASE` | Production database name |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_PORT` | PostgreSQL port (default 5432) |
| `TEST_DB_DATABASE` | Test database name (separate DB) |
| `FPL_LEAGUE_ID` | Your FPL Draft league ID |
| `FOOTBALL_API_KEY` | RapidAPI key for API-Football |

### Create databases

```sql
CREATE DATABASE teletext_scores_2;
CREATE DATABASE teletext_scores_2_test;
```

### Run migrations

```bash
npm run migrate
```

This runs all SQL migrations in `server/db/migrations/` in order, tracking them in a `schema_migrations` table. Safe to run multiple times (idempotent).

---

## Running

```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

The server serves static files from `client/` and API routes at `/api/*`.

Open `http://localhost:3000` in your browser.

---

## Data Loading

Before the app shows any data, you need to populate the database.

### First time setup

Run the one-time load (fetches league info, all players, gameweeks, standings, matches, draft picks):

```bash
npm run load:one-time
```

This can take a minute. Run it once at the start of the season.

### Weekly (after gameweek ends)

```bash
npm run load:weekly-complete
```

Saves final standings, match results, player stats, and transactions for the completed gameweek.

### Weekly (before next gameweek starts)

```bash
npm run load:weekly-start
```

Saves manager squad picks for the upcoming gameweek.

### Frequent (live updates)

```bash
npm run load:frequent
```

Updates live player scores. Run this every 5 minutes during an active gameweek.

### Automated cron

```bash
npm run cron
```

Runs all jobs on a schedule automatically:
- Tuesday 3am: weekly-complete
- Friday 3am: weekly-start
- Every 5 minutes: frequent-load (when active)

### Health check

```bash
npm run health
```

Checks database connectivity and FPL API reachability.

---

## Testing

```bash
# All tests
npm test

# Unit tests only (no DB needed)
npm run test:unit

# Integration tests (requires test DB)
npm run test:integration
```

Unit tests mock all external dependencies. Integration tests run against `TEST_DB_DATABASE`.

---

## Project Structure

```
teletext_scores_2/
├── server/
│   ├── server.js           # Express app startup
│   ├── config.js           # All config from env vars (validated at startup)
│   ├── api/
│   │   └── fpl-client.js   # FPL API with retry + stale cache
│   ├── db/
│   │   ├── index.js        # PostgreSQL pool
│   │   └── migrations/     # SQL schema migrations
│   ├── services/           # Business logic
│   ├── controllers/        # Request handlers
│   ├── routes/             # Express routes
│   ├── middleware/         # Error handling
│   └── jobs/               # Data sync scripts + cron
├── client/
│   ├── styles.css          # Ceefax retro styles
│   ├── config.js           # Fetches league config from /api/config
│   └── *.html / *.js       # Teletext pages
└── tests/
    ├── unit/               # Unit tests (mocked)
    └── integration/        # Integration tests (real DB)
```

---

## Architecture Notes

- **No API keys in client JS.** The RapidAPI football key is used server-side only (`/api/fixtures` proxy). The browser never sees it.
- **Data integrity.** `matches` and `transactions` tables use natural unique constraints, preventing duplicate rows on repeated syncs.
- **FPL API reliability.** All FPL API calls retry up to 3 times with exponential backoff and fall back to stale cached data if the API is down.
- **No hardcoded IDs.** `FPL_LEAGUE_ID` lives in `.env`. Client JS fetches it from `/api/config`.
- **No child_process in cron.** Jobs are imported as modules, not spawned as subprocesses. Errors propagate and are logged.
