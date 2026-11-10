# Backlog Clear

> The video game backlog tracker that tells you **when you'll finally finish your list**.

Full-stack project: REST API (Express + TypeScript + PostgreSQL) and a React frontend.

## Planned features

- **Backlog Clear Date**: estimated date by which you'll have finished your whole backlog, based on your weekly play time
- **Roulette**: "I have 2 hours tonight" → the next game to play
- **Yearly Wrapped**: a shareable recap of your gaming year
- **Public profiles** (`/u/username`) and follows between players
- **Gamification**: XP, badges, streaks

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React, Vite, TypeScript *(coming soon)* |
| API | Express, TypeScript, Zod |
| Database | PostgreSQL 16 |
| Auth | JWT access token + rotating httpOnly refresh token cookie |
| Game data | [RAWG API](https://rawg.io/apidocs) |
| Tests | Vitest, Supertest |
| Infra | Docker Compose |

## Project structure

```
backlog-clear/
├── client/              # React frontend (to be created in a later step)
├── server/              # Express API
│   └── src/
│       ├── config/      # Validated environment variables (Zod), auth settings
│       ├── controllers/ # Request/response handling
│       ├── db/          # PostgreSQL pool and transactions
│       ├── middlewares/ # Error handling, requireAuth
│       ├── routes/      # API routes (+ integration tests)
│       ├── schemas/     # Zod validation schemas
│       ├── services/    # Business logic and SQL
│       └── utils/       # HTTP errors, asyncHandler, passwords, tokens
├── db/init.sql          # Database schema
└── docker-compose.yml
```

## Getting started

Requirements: Node 22+, Docker.

```bash
# 1. Environment variables
cp server/.env.example server/.env
# → fill in the JWT secrets and your RAWG key

# 2. Database (exposed on host port 5433)
docker compose up -d db

# 3. API in dev mode
cd server
npm install
npm run dev
```

Check that everything works: <http://localhost:4000/api/health>

To start over with an empty database (the schema is replayed):

```bash
docker compose down -v && docker compose up -d db
```

## Authentication

Short-lived JWT access token (15 min, sent in the `Authorization: Bearer` header) plus a
rotating refresh token (30 days, stored in an `httpOnly` cookie, only its HMAC hash is kept in the database).

| Method | Route | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account (`username`, `email`, `password`) |
| POST | `/api/auth/login` | Log in with `identifier` (username or email) and `password` |
| POST | `/api/auth/refresh` | Exchange the refresh cookie for a new access token (the refresh token is rotated) |
| POST | `/api/auth/logout` | Revoke the refresh token and clear the cookie |
| GET | `/api/auth/me` | Current user (requires an access token) |

Security notes:

- Passwords are hashed with bcrypt (12 rounds); unknown users and wrong passwords return the same error
- Refresh token reuse detection: replaying an already-rotated token signs the user out everywhere
- Login and register are rate limited (20 requests / 15 min per IP)

Try it from the terminal:

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"player_one","email":"player@example.com","password":"correct-horse-battery"}'

# Use the accessToken from the response:
curl http://localhost:4000/api/auth/me -H "Authorization: Bearer <accessToken>"
```

## Tests

Integration tests run against the real Postgres from Docker (`docker compose up -d db` first):

```bash
cd server
npm test
```

## Roadmap

- [x] 1. Monorepo, Docker Compose, Postgres schema
- [x] 2. Auth (sign up, log in, refresh)
- [ ] 3. RAWG search and backlog CRUD
- [ ] 4. Backlog Clear Date and Roulette
- [ ] 5. Public profiles and follows
- [ ] 6. Stats, badges, Wrapped
- [ ] 7. CI (GitHub Actions), deployment, screenshots