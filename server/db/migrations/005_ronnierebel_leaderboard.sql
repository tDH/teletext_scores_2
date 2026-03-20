-- Migration 005: RonnieRebel leaderboard table
-- Stores results from the Irish rebel music & history quiz.
-- Single global leaderboard — no league/decade columns needed.

CREATE TABLE IF NOT EXISTS ronnierebel_results (
  id              SERIAL PRIMARY KEY,
  player_name     VARCHAR(100) NOT NULL,
  correct_answers INTEGER      NOT NULL,
  total_time_ms   INTEGER      NOT NULL,
  created_at      TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ronnierebel_score
  ON ronnierebel_results(correct_answers DESC, total_time_ms ASC);
