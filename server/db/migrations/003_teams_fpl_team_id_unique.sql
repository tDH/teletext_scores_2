-- Fix: teams table needs UNIQUE(fpl_team_id) so player-service.js can use
-- ON CONFLICT (fpl_team_id) when upserting teams.
-- This constraint was previously applied directly to local DB but not migrated.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'teams' AND constraint_name = 'teams_fpl_team_id_unique'
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_fpl_team_id_unique UNIQUE (fpl_team_id);
  END IF;
END $$;
