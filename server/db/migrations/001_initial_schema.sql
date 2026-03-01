-- Create leagues table
CREATE TABLE IF NOT EXISTS leagues (
  league_id INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  draft_status VARCHAR(50),
  scoring_type VARCHAR(50),
  start_event INTEGER,
  stop_event INTEGER,
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  team_id SERIAL PRIMARY KEY,
  fpl_team_id INTEGER,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(3),
  code INTEGER,
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Create gameweeks table
CREATE TABLE IF NOT EXISTS gameweeks (
  gameweek_id INTEGER PRIMARY KEY,
  name VARCHAR(50),
  deadline_time TIMESTAMP NULL,
  is_current BOOLEAN,
  is_next BOOLEAN,
  is_previous BOOLEAN,
  finished BOOLEAN,
  data_checked BOOLEAN,
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Create players table
CREATE TABLE IF NOT EXISTS players (
  player_id INTEGER PRIMARY KEY,
  first_name VARCHAR(255),
  second_name VARCHAR(255),
  web_name VARCHAR(255) NOT NULL,
  team_id INTEGER REFERENCES teams(team_id),
  element_type INTEGER, -- 1: GKP, 2: DEF, 3: MID, 4: FWD
  now_cost INTEGER,
  status VARCHAR(50),
  total_points INTEGER,
  form NUMERIC(5,2),
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Create managers table
CREATE TABLE IF NOT EXISTS managers (
  manager_id INTEGER PRIMARY KEY,
  entry_id INTEGER,
  entry_name VARCHAR(255),
  player_first_name VARCHAR(255),
  player_last_name VARCHAR(255),
  short_name VARCHAR(3),
  league_id INTEGER REFERENCES leagues(league_id),
  waiver_pick INTEGER,
  joined_time TIMESTAMP,
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
  match_id SERIAL PRIMARY KEY,
  league_id INTEGER REFERENCES leagues(league_id),
  event INTEGER REFERENCES gameweeks(gameweek_id),
  league_entry_1 INTEGER REFERENCES managers(manager_id),
  league_entry_2 INTEGER REFERENCES managers(manager_id),
  league_entry_1_points INTEGER,
  league_entry_2_points INTEGER,
  started BOOLEAN,
  finished BOOLEAN,
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Create standings table
CREATE TABLE IF NOT EXISTS standings (
  standing_id SERIAL PRIMARY KEY,
  league_id INTEGER REFERENCES leagues(league_id),
  league_entry INTEGER REFERENCES managers(manager_id),
  rank INTEGER,
  last_rank INTEGER,
  matches_played INTEGER,
  matches_won INTEGER,
  matches_drawn INTEGER,
  matches_lost INTEGER,
  points_for INTEGER,
  points_against INTEGER,
  total INTEGER,
  last_updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (league_id, league_entry)
);

-- Create player_gameweek_stats table
CREATE TABLE IF NOT EXISTS player_gameweek_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(player_id),
  gameweek_id INTEGER REFERENCES gameweeks(gameweek_id),
  total_points INTEGER,
  minutes INTEGER,
  goals_scored INTEGER,
  assists INTEGER,
  clean_sheets INTEGER,
  goals_conceded INTEGER,
  own_goals INTEGER,
  penalties_saved INTEGER,
  penalties_missed INTEGER,
  yellow_cards INTEGER,
  red_cards INTEGER,
  saves INTEGER,
  bonus INTEGER,
  bps INTEGER,
  influence NUMERIC(5,2),
  creativity NUMERIC(5,2),
  threat NUMERIC(5,2),
  ict_index NUMERIC(5,2),
  value NUMERIC(5,2),
  transfers_in INTEGER,
  transfers_out INTEGER,
  selected_by_percent NUMERIC(5,2),
  last_updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (player_id, gameweek_id)
);

-- Create manager_picks table
CREATE TABLE IF NOT EXISTS manager_picks (
  id SERIAL PRIMARY KEY,
  manager_id INTEGER REFERENCES managers(manager_id),
  gameweek_id INTEGER REFERENCES gameweeks(gameweek_id),
  player_id INTEGER REFERENCES players(player_id),
  position INTEGER, -- 1-11 starting, 12-15 bench
  is_captain BOOLEAN DEFAULT FALSE,
  is_vice_captain BOOLEAN DEFAULT FALSE,
  multiplier INTEGER,
  points INTEGER,
  last_updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (manager_id, gameweek_id, player_id)
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  league_id INTEGER REFERENCES leagues(league_id),
  gameweek_id INTEGER REFERENCES gameweeks(gameweek_id),
  transaction_type VARCHAR(50), -- waiver, freeagent
  result VARCHAR(50),           -- success, fail
  added_player_id INTEGER REFERENCES players(player_id),
  removed_player_id INTEGER REFERENCES players(player_id),
  manager_id INTEGER REFERENCES managers(manager_id),
  transaction_time TIMESTAMP,
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Create draft_picks table
CREATE TABLE IF NOT EXISTS draft_picks (
  id SERIAL PRIMARY KEY,
  league_id INTEGER REFERENCES leagues(league_id),
  round INTEGER,
  pick INTEGER,
  manager_id INTEGER REFERENCES managers(manager_id),
  player_id INTEGER REFERENCES players(player_id),
  draft_time TIMESTAMP,
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Create latest_player_gameweek_stats table (for live/frequent updates)
-- This was previously created inside frequent-load.js — it belongs in the schema.
CREATE TABLE IF NOT EXISTS latest_player_gameweek_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(player_id),
  gameweek_id INTEGER REFERENCES gameweeks(gameweek_id),
  total_points INTEGER,
  minutes INTEGER,
  goals_scored INTEGER,
  assists INTEGER,
  clean_sheets INTEGER,
  goals_conceded INTEGER,
  own_goals INTEGER,
  penalties_saved INTEGER,
  penalties_missed INTEGER,
  yellow_cards INTEGER,
  red_cards INTEGER,
  saves INTEGER,
  bonus INTEGER,
  bps INTEGER,
  last_updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (player_id, gameweek_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_gameweek ON player_gameweek_stats(player_id, gameweek_id);
CREATE INDEX IF NOT EXISTS idx_manager_gameweek ON manager_picks(manager_id, gameweek_id);
CREATE INDEX IF NOT EXISTS idx_match_event ON matches(event);
CREATE INDEX IF NOT EXISTS idx_match_league ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_standing_league ON standings(league_id);
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_league ON draft_picks(league_id);

-- Timestamp auto-update function
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE OR REPLACE TRIGGER update_leagues_timestamp
  BEFORE UPDATE ON leagues FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_teams_timestamp
  BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_gameweeks_timestamp
  BEFORE UPDATE ON gameweeks FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_players_timestamp
  BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_managers_timestamp
  BEFORE UPDATE ON managers FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_matches_timestamp
  BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_standings_timestamp
  BEFORE UPDATE ON standings FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_player_gameweek_stats_timestamp
  BEFORE UPDATE ON player_gameweek_stats FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_latest_player_gameweek_stats_timestamp
  BEFORE UPDATE ON latest_player_gameweek_stats FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_manager_picks_timestamp
  BEFORE UPDATE ON manager_picks FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_transactions_timestamp
  BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE OR REPLACE TRIGGER update_draft_picks_timestamp
  BEFORE UPDATE ON draft_picks FOR EACH ROW EXECUTE FUNCTION update_timestamp();
