/**
 * Gameweek service.
 *
 * Extracted from the original codebase where the same ~30-line gameweek upsert
 * block was copy-pasted into player-service.js, league-service.js, and
 * weekly-load-complete.js. Single source of truth here.
 */
const db = require('../db');

/**
 * Upsert a single gameweek row.
 * Accepts an optional db client for use inside a transaction.
 *
 * @param {number} gameweekId
 * @param {{ isCurrent: boolean, isNext: boolean, isPrevious: boolean, finished: boolean, dataChecked: boolean }} flags
 * @param {object} [client] - optional pg client (for use within a transaction)
 */
const upsertGameweek = async (gameweekId, { isCurrent, isNext, isPrevious, finished, dataChecked }, client) => {
  const executor = client || db;
  await executor.query(
    `INSERT INTO gameweeks (
       gameweek_id,
       name,
       is_current,
       is_next,
       is_previous,
       finished,
       data_checked
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (gameweek_id)
     DO UPDATE SET
       name = $2,
       is_current = $3,
       is_next = $4,
       is_previous = $5,
       finished = $6,
       data_checked = $7`,
    [
      gameweekId,
      `Gameweek ${gameweekId}`,
      isCurrent,
      isNext,
      isPrevious,
      finished,
      dataChecked,
    ]
  );
};

/**
 * Sync current, next, and previous gameweeks from a game status object.
 * Resets all gameweek flags first so only one row has is_current = true.
 *
 * @param {object} gameStatus - FPL API game status response
 * @param {object} [client] - optional pg client for transactions
 */
const syncGameweeksFromGameStatus = async (gameStatus, client) => {
  const executor = client || db;
  const { current_event, next_event, current_event_finished } = gameStatus;

  if (!current_event) {
    throw new Error('gameStatus.current_event is required');
  }

  // Reset all flags — ensures only the correct gameweek has is_current/is_next/is_previous
  await executor.query(
    `UPDATE gameweeks SET is_current = false, is_next = false, is_previous = false`
  );

  // Current gameweek
  await upsertGameweek(
    current_event,
    {
      isCurrent: true,
      isNext: false,
      isPrevious: false,
      finished: current_event_finished || false,
      dataChecked: true,
    },
    client
  );

  // Next gameweek
  if (next_event) {
    await upsertGameweek(
      next_event,
      {
        isCurrent: false,
        isNext: true,
        isPrevious: false,
        finished: false,
        dataChecked: false,
      },
      client
    );
  }

  // Previous gameweek
  if (current_event > 1) {
    await upsertGameweek(
      current_event - 1,
      {
        isCurrent: false,
        isNext: false,
        isPrevious: true,
        finished: true,
        dataChecked: true,
      },
      client
    );
  }
};

module.exports = {
  upsertGameweek,
  syncGameweeksFromGameStatus,
};
