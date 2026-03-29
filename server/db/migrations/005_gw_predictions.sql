-- GW Predictions table.
-- Stores one AI-generated predicted score per manager per gameweek.
-- Generated during the weekly-start cron (Friday 3am) for GW >= PREDICTIONS_START_GW.
-- Persists after the gameweek ends so historical predictions remain visible.

CREATE TABLE IF NOT EXISTS gw_predictions (
  manager_id      INTEGER NOT NULL REFERENCES managers(manager_id),
  gameweek_id     INTEGER NOT NULL REFERENCES gameweeks(gameweek_id),
  predicted_score NUMERIC(6,2) NOT NULL,
  source          TEXT NOT NULL DEFAULT 'openfpl',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (manager_id, gameweek_id)
);

CREATE INDEX IF NOT EXISTS idx_gw_predictions_gameweek ON gw_predictions(gameweek_id);
