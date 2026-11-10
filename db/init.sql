-- Backlog Clear: initial PostgreSQL schema
-- Run automatically by Docker the first time the db container starts.

CREATE EXTENSION IF NOT EXISTS citext;

-- ─────────────────────────── Users ───────────────────────────
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    username        CITEXT       NOT NULL UNIQUE
                    CHECK (username ~ '^[A-Za-z0-9_]{3,24}$'),
    email           CITEXT       NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    display_name    VARCHAR(50),
    bio             VARCHAR(280),
    -- Used to compute the "Backlog Clear Date"
    weekly_hours    NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (weekly_hours > 0 AND weekly_hours <= 168),
    is_public       BOOLEAN      NOT NULL DEFAULT TRUE,
    xp              INTEGER      NOT NULL DEFAULT 0 CHECK (xp >= 0),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Refresh tokens (only the hash is stored, never the token itself)
CREATE TABLE refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ─────────────────────────── Games (RAWG cache) ───────────────────────────
CREATE TABLE games (
    id               BIGSERIAL PRIMARY KEY,
    rawg_id          INTEGER      NOT NULL UNIQUE,
    slug             VARCHAR(255) NOT NULL,
    name             VARCHAR(255) NOT NULL,
    cover_url        TEXT,
    released         DATE,
    rating           NUMERIC(3,2),
    metacritic       SMALLINT,
    -- Average time to finish the game (used for the Backlog Clear Date)
    playtime_hours   INTEGER,
    genres           TEXT[]       NOT NULL DEFAULT '{}',
    platforms        TEXT[]       NOT NULL DEFAULT '{}',
    fetched_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_games_name ON games(name);

-- ─────────────────────────── Backlog ───────────────────────────
CREATE TYPE entry_status AS ENUM ('backlog', 'playing', 'completed', 'dropped');

CREATE TABLE entries (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id       BIGINT       NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    status        entry_status NOT NULL DEFAULT 'backlog',
    rating        SMALLINT     CHECK (rating BETWEEN 1 AND 10),
    hours_played  NUMERIC(6,1) NOT NULL DEFAULT 0 CHECK (hours_played >= 0),
    review        TEXT,
    platform      VARCHAR(50),
    started_at    DATE,
    completed_at  DATE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, game_id)
);
CREATE INDEX idx_entries_user_status ON entries(user_id, status);
CREATE INDEX idx_entries_completed_at ON entries(completed_at) WHERE completed_at IS NOT NULL;

-- ─────────────────────────── Social ───────────────────────────
CREATE TABLE follows (
    follower_id  BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id  BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followed_id),
    CHECK (follower_id <> followed_id)
);
CREATE INDEX idx_follows_followed ON follows(followed_id);

-- ─────────────────────────── Gamification ───────────────────────────
CREATE TABLE badges (
    id           SERIAL PRIMARY KEY,
    code         VARCHAR(50)  NOT NULL UNIQUE,
    name         VARCHAR(100) NOT NULL,
    description  VARCHAR(255) NOT NULL,
    icon         VARCHAR(50)
);

CREATE TABLE user_badges (
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id    INTEGER     NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, badge_id)
);

INSERT INTO badges (code, name, description, icon) VALUES
    ('first_game',       'First Steps',      'Add your first game to your backlog', 'rocket'),
    ('first_clear',      'Mission Complete', 'Finish your first game',              'trophy'),
    ('ten_clears',       'War Machine',      'Finish 10 games',                     'flame'),
    ('backlog_100',      'Collector',        'Have 100 games in your backlog',      'stack'),
    ('streak_7',         'Regular',          'Play 7 days in a row',                'calendar'),
    ('social_butterfly', 'Social Butterfly', 'Follow 10 players',                   'users');
