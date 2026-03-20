-- Migration 004: Recency-weighted player form view
--
-- Projects each player's expected points for the next gameweek using a
-- weighted average of their last 5 finished gameweeks.
--
-- Weights (most-recent first):
--   GW-1: 35%  GW-2: 25%  GW-3: 20%  GW-4: 12%  GW-5: 8%
--
-- Only gameweeks where data_checked = true are used to avoid partial data.
-- Players with fewer than 5 finished gameweeks are included using whatever
-- data is available; projected_points is NULL if no data exists at all.

CREATE OR REPLACE VIEW player_form AS
WITH finished_gws AS (
  -- Restrict to gameweeks where stats are confirmed final
  SELECT gameweek_id
  FROM gameweeks
  WHERE data_checked = TRUE
),
ranked_stats AS (
  -- Rank each player's gameweeks from most recent (1) to oldest
  SELECT
    pgs.player_id,
    pgs.gameweek_id,
    pgs.total_points,
    ROW_NUMBER() OVER (
      PARTITION BY pgs.player_id
      ORDER BY pgs.gameweek_id DESC
    ) AS gw_rank
  FROM player_gameweek_stats pgs
  INNER JOIN finished_gws fg ON fg.gameweek_id = pgs.gameweek_id
),
weighted_stats AS (
  -- Apply recency weights to each of the last 5 gameweeks
  SELECT
    player_id,
    total_points,
    gw_rank,
    CASE gw_rank
      WHEN 1 THEN 0.35
      WHEN 2 THEN 0.25
      WHEN 3 THEN 0.20
      WHEN 4 THEN 0.12
      WHEN 5 THEN 0.08
    END AS weight
  FROM ranked_stats
  WHERE gw_rank <= 5
)
SELECT
  p.player_id,
  p.web_name,
  p.first_name,
  p.second_name,
  p.element_type,                                  -- 1=GKP 2=DEF 3=MID 4=FWD
  p.team_id,
  -- Weighted average, normalised to the sum of weights actually available
  -- so players with <5 GWs still get a sensible projection
  ROUND(
    SUM(ws.total_points * ws.weight) / SUM(ws.weight),
    2
  ) AS projected_points,
  COUNT(ws.gw_rank) AS gameweeks_used             -- how many GWs contributed
FROM players p
LEFT JOIN weighted_stats ws ON ws.player_id = p.player_id
GROUP BY
  p.player_id,
  p.web_name,
  p.first_name,
  p.second_name,
  p.element_type,
  p.team_id;
