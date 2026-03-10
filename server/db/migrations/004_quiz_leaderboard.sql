-- Migration 004: Quiz leaderboard table
-- Stores results from the LLM-generated football trivia quiz.

CREATE TABLE IF NOT EXISTS quiz_results (
  id              SERIAL PRIMARY KEY,
  player_name     VARCHAR(100) NOT NULL,
  difficulty      VARCHAR(20)  NOT NULL,  -- 'easy' | 'medium' | 'hard'
  league          VARCHAR(50)  NOT NULL,  -- 'scotland' | 'england'
  decade          VARCHAR(10)  NOT NULL,  -- '1990s' | '2000s' | '2010s' | '2020s'
  correct_answers INTEGER      NOT NULL,
  total_time_ms   INTEGER      NOT NULL,
  created_at      TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_score
  ON quiz_results(correct_answers DESC, total_time_ms ASC);
