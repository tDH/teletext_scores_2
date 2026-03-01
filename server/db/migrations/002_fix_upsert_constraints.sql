-- Fix: matches table had no natural unique key, so ON CONFLICT (match_id) was a no-op.
-- Every sync inserted duplicate rows instead of updating existing ones.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'matches' AND constraint_name = 'matches_natural_unique'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT matches_natural_unique
      UNIQUE (league_id, event, league_entry_1, league_entry_2);
  END IF;
END $$;

-- Fix: transactions table had no unique constraint, so ON CONFLICT DO NOTHING silently
-- never fired. Without this, the same transaction can be inserted multiple times.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'transactions' AND constraint_name = 'transactions_natural_unique'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_natural_unique
      UNIQUE (league_id, manager_id, added_player_id, removed_player_id, transaction_time);
  END IF;
END $$;
