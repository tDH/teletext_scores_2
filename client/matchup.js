// FPL Draft Head-to-Head Matchup page (P308)
// Shows two managers' teams side-by-side with auto-sub logic and stats accordion.
// Uses getConfig() from config.js — no hardcoded league ID.

const API_BASE_URL = '/api';

// ─── DOM refs ────────────────────────────────────────────────
const timeDisplay       = document.getElementById('ceefax-time');
const scoreLine         = document.getElementById('matchup-score-line');
const gwLabel           = document.getElementById('matchup-gw');
const homeColHeader     = document.getElementById('home-col-header');
const awayColHeader     = document.getElementById('away-col-header');
const homeContainer     = document.getElementById('home-team-players');
const awayContainer     = document.getElementById('away-team-players');
const lastUpdated       = document.querySelector('.ceefax-update');

// ─── Clock ───────────────────────────────────────────────────
function updateTime() {
    if (!timeDisplay) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    timeDisplay.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ─── URL params ──────────────────────────────────────────────
function getUrlParams() {
    const p = new URLSearchParams(window.location.search);
    return {
        gw:   parseInt(p.get('gw'))   || 1,
        home: parseInt(p.get('home')) || null,
        away: parseInt(p.get('away')) || null,
    };
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Returns true if the gameweek is finished (all matches done).
 * Uses the game-status API response.
 */
function isGwFinished(gameStatus, gw) {
    if (!gameStatus) return false;
    // current_event_finished means the CURRENT gameweek is fully done
    if (gw < (gameStatus.current_event || 0)) return true;
    if (gw === (gameStatus.current_event || 0)) return gameStatus.current_event_finished === true;
    return false; // future gameweek
}

/** Maps element_type (1–4) to position abbreviation */
function getPositionLabel(elementType) {
    return { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' }[elementType] || '?';
}

/**
 * Determine a player's display status.
 * - 'played'   — gameweek finished AND minutes > 0  → ✅ green tick
 * - 'playing'  — gameweek still live AND minutes > 0 → 🔔 whistle (in progress)
 * - 'pending'  — gameweek still live AND minutes = 0 → ⌛ hourglass (still to play)
 * - 'dnp'      — gameweek finished AND minutes = 0   → red (did not play)
 */
function getPlayerStatus(player, gwFinished) {
    const mins = player.minutes || 0;
    if (gwFinished) {
        return mins > 0 ? 'played' : 'dnp';
    }
    return mins > 0 ? 'playing' : 'pending';
}

/**
 * Calculate effective points for a player, accounting for captain multiplier.
 * The API already includes the multiplier in player.points but we recalculate
 * to handle the captain-auto-sub case where we override the multiplier.
 */
function calcEffectivePoints(player) {
    // player.points is already multiplier-adjusted by the server
    return player.points || 0;
}

/**
 * Returns true if a player is definitely unavailable to play:
 * injured (i), suspended (s), or unavailable/left club (u).
 * Doubtful (d) is NOT included — they might still play.
 * Only applies when they have 0 minutes (once they play, status is irrelevant).
 */
function isDefinitelyOut(player) {
    if ((player.minutes || 0) > 0) return false;
    return ['i', 's', 'u'].includes(player.status);
}

/**
 * Apply auto-sub logic to a squad of 15 players (positions 1–11 starters, 12–15 bench).
 *
 * Two passes:
 *  Pass 1 (always): Injury/suspension subs — if a starter is definitely out
 *    (injured, suspended, unavailable) and has 0 minutes, bring in the first
 *    eligible bench player regardless of whether the GW is finished.
 *
 *  Pass 2 (gwFinished only): DNP subs — if a starter has 0 minutes after the
 *    GW is finished (and wasn't already subbed), bring in first eligible bench
 *    player with minutes > 0.
 *
 *  Captain auto-sub: if captain didn't play, VC gets 2× (gwFinished only).
 *
 * @param {Array} players - all 15 players sorted by position (1–15)
 * @param {boolean} gwFinished
 * @returns {{ starters: Array, notPlayed: Array, bench: Array, captainSubApplied: boolean }}
 */
function applyAutoSubs(players, gwFinished) {
    // Sort by squad position
    const sorted = [...players].sort((a, b) => a.position - b.position);

    const starters  = sorted.filter(p => p.position <= 11);
    const benchRaw  = sorted.filter(p => p.position > 11);

    // Deep-clone so we don't mutate originals
    const startersCopy = starters.map(p => ({ ...p }));
    const benchCopy    = benchRaw.map(p => ({ ...p }));
    const usedBench    = new Set();
    const notPlayed    = [];

    /**
     * Try to sub out startersCopy[i] with the first eligible bench player.
     * eligibleFn(sub) — additional check on the candidate sub.
     */
    function trySub(i, eligibleFn) {
        const starter = startersCopy[i];
        const starterIsGk = starter.element_type === 1;

        for (let j = 0; j < benchCopy.length; j++) {
            if (usedBench.has(j)) continue;
            const sub = benchCopy[j];
            if (!eligibleFn(sub)) continue;

            const subIsGk = sub.element_type === 1;

            // Formation constraint
            if (starterIsGk && !subIsGk) {
                // Removing a GK — only valid if another GK remains in starters
                const remainingGks = startersCopy.filter(
                    (p, idx) => idx !== i && p.element_type === 1
                ).length;
                if (remainingGks < 1) continue;
            }
            if (!starterIsGk && subIsGk) continue; // can't put GK in outfield spot

            // Apply the sub
            usedBench.add(j);
            notPlayed.push({ ...starter, autoSubOut: true });
            startersCopy[i] = { ...sub, autoSubIn: true };
            return true;
        }
        return false;
    }

    // ── Pass 1: Injury / suspension subs (run regardless of gwFinished) ──────
    // A starter who is injured/suspended/unavailable with 0 minutes gets
    // replaced by the first available bench player (any minutes, even 0 —
    // because the GW may not have started yet).
    for (let i = 0; i < startersCopy.length; i++) {
        const starter = startersCopy[i];
        if (!isDefinitelyOut(starter)) continue;
        // Sub in first bench player who is NOT also definitely out
        trySub(i, sub => !isDefinitelyOut(sub));
    }

    // ── Pass 2: Post-GW DNP subs (only once gw is finished) ──────────────────
    if (gwFinished) {
        for (let i = 0; i < startersCopy.length; i++) {
            const starter = startersCopy[i];
            if ((starter.minutes || 0) > 0) continue; // played — no sub needed
            if (starter.autoSubIn) continue;           // already subbed in this pass
            // Sub in first bench player who actually played
            trySub(i, sub => (sub.minutes || 0) > 0);
        }

        // Captain auto-sub: if captain has 0 mins, give vice-captain 2×
        const captain = startersCopy.find(p => p.is_captain);
        if (captain && (captain.minutes || 0) === 0) {
            const vc = startersCopy.find(p => p.is_vice_captain);
            if (vc && (vc.minutes || 0) > 0) {
                vc.points = (vc.total_points || 0) * 2;
            }
        }
    }

    const bench = benchCopy.filter((_, j) => !usedBench.has(j));
    return { starters: startersCopy, notPlayed, bench, captainSubApplied: false };
}

/** Sum points for a set of players (starters only). */
function calcTeamTotal(starters) {
    return starters.reduce((sum, p) => sum + (p.points || 0), 0);
}

// ─── DOM builders ─────────────────────────────────────────────

/** Small section divider + label (e.g. "NOT PLAYED", "BENCH") */
function buildSectionHeader(text, cssClass) {
    const hr  = document.createElement('hr');
    hr.className = 'ceefax-section-divider';

    const hdr = document.createElement('div');
    hdr.className = cssClass;
    hdr.textContent = text;

    const frag = document.createDocumentFragment();
    frag.appendChild(hr);
    frag.appendChild(hdr);
    return frag;
}

/**
 * Build a single player row + hidden accordion stats panel.
 * Clicking the row toggles the accordion open/closed.
 */
function buildPlayerRow(player, gwFinished) {
    const status   = getPlayerStatus(player, gwFinished);
    const statusCss = `ceefax-player-status--${status}`;
    const pts      = player.points || 0;

    const pos      = getPositionLabel(player.element_type);
    const name     = player.web_name || '???';

    // Captain / VC label
    let captainMark = '';
    if (player.is_captain)      captainMark = '<span class="captain-label">(C)</span> ';
    else if (player.is_vice_captain) captainMark = '<span class="captain-label">(V)</span> ';

    // Status icon — tick emoji removed; played/playing shown in green via CSS instead
    const statusIcon = '';

    // Injury/suspension badge — shown only when player has 0 minutes
    // i = injured → 🚑, s = suspended → 🟥, u = unavailable → 🚑
    // d = doubtful stays in XI with no badge (may still play)
    const mins = player.minutes || 0;
    let injuryBadge = '';
    if (mins === 0) {
        if (player.status === 's') injuryBadge = ' 🟥';
        else if (player.status === 'i' || player.status === 'u') injuryBadge = ' 🚑';
    }

    // Row
    const row = document.createElement('div');
    let rowClass = `ceefax-player-row ${statusCss}`;
    if (player.autoSubIn)  rowClass += ' auto-sub-in';
    if (player.autoSubOut) rowClass += ' auto-sub-out';
    if (player.position > 11 && !player.autoSubIn) rowClass += ' sub';
    row.className = rowClass;

    row.innerHTML = `
        <div class="player-info">
            <span class="player-pos" style="font-size:0.7em;color:var(--ceefax-cyan);min-width:28px;">${pos}</span>
            <span class="player-name ${statusCss}">${captainMark}${name}${injuryBadge}${statusIcon}</span>
        </div>
        <span class="player-pts ${statusCss}">${pts}</span>
    `;

    // Stats accordion
    const accordion = buildAccordion(player);
    row.addEventListener('click', () => {
        accordion.classList.toggle('open');
    });

    const wrapper = document.createDocumentFragment();
    wrapper.appendChild(row);
    wrapper.appendChild(accordion);
    return wrapper;
}

/** Build the hidden accordion div with goal/assist/clean sheet etc. stats. */
function buildAccordion(player) {
    const acc = document.createElement('div');
    acc.className = 'ceefax-player-accordion';

    const stats = [
        { key: 'goals_scored',      label: 'G'  },
        { key: 'assists',           label: 'A'  },
        { key: 'clean_sheets',      label: 'CS' },
        { key: 'saves',             label: 'SV' },
        { key: 'bonus',             label: 'B'  },
        { key: 'yellow_cards',      label: 'YC' },
        { key: 'red_cards',         label: 'RC' },
        { key: 'minutes',           label: 'MIN'},
    ];

    for (const { key, label } of stats) {
        const val = player[key] || 0;
        const span = document.createElement('span');
        span.className = val > 0 ? 'ceefax-stat nonzero' : 'ceefax-stat';
        span.textContent = `${label}:${val}`;
        acc.appendChild(span);
    }

    return acc;
}

/**
 * Render a full team column into the given container element.
 * Shows: Starting XI → (auto-subbed in players highlighted) →
 *        NOT PLAYED section (if any) → BENCH section (unused subs).
 */
function renderTeamColumn(container, players, gwFinished) {
    container.innerHTML = '';

    const { starters, notPlayed, bench } = applyAutoSubs(players, gwFinished);

    // Column header row: PLAYER / PTS
    const hdr = document.createElement('div');
    hdr.className = 'ceefax-players-header';
    hdr.innerHTML = '<div class="ceefax-player-name">PLAYER</div><div class="ceefax-player-points">PTS</div>';
    container.appendChild(hdr);

    // Starting XI
    for (const p of starters) {
        container.appendChild(buildPlayerRow(p, gwFinished));
    }

    // Total
    const total = calcTeamTotal(starters);
    const totalEl = document.createElement('div');
    totalEl.className = 'ceefax-player-total';
    totalEl.innerHTML = `<div class="ceefax-player-name">TOTAL</div><div class="ceefax-player-points">${total}</div>`;
    container.appendChild(totalEl);

    // Bench section
    if (bench.length > 0) {
        container.appendChild(buildSectionHeader('BENCH', 'ceefax-bench-header'));
        for (const p of bench) {
            container.appendChild(buildPlayerRow(p, gwFinished));
        }
    }

    // Not Played / Unavailable section — always at the bottom
    if (notPlayed.length > 0) {
        const label = gwFinished ? 'NOT PLAYED' : 'UNAVAILABLE';
        container.appendChild(buildSectionHeader(label, 'ceefax-not-played-header'));
        for (const p of notPlayed) {
            container.appendChild(buildPlayerRow(p, gwFinished));
        }
    }
}

/**
 * Update the score line header.
 * e.g. "AMORIM SHOTTS FC  47  V  38  CLIPPER FC"
 */
function renderScoreLine(homeName, homeTotal, awayName, awayTotal, started) {
    if (!started) {
        scoreLine.textContent = `${homeName}  V  ${awayName}`;
    } else {
        scoreLine.textContent = `${homeName}  ${homeTotal}  V  ${awayTotal}  ${awayName}`;
    }
}

// ─── Main init ────────────────────────────────────────────────

async function init() {
    homeContainer.innerHTML = '<div class="ceefax-loading">LOADING...</div>';
    awayContainer.innerHTML = '<div class="ceefax-loading">LOADING...</div>';

    const { gw, home: homeId, away: awayId } = getUrlParams();

    if (!homeId || !awayId) {
        homeContainer.innerHTML = '<div class="ceefax-error">MISSING TEAM IDS IN URL</div>';
        awayContainer.innerHTML = '';
        return;
    }

    gwLabel.textContent = `GAMEWEEK ${gw}`;

    try {
        // Get leagueId from config
        const { leagueId } = await getConfig();
        if (!leagueId) {
            throw new Error('Config not available');
        }

        // Fetch game status, league data, and both teams in parallel
        const [gameStatusResp, leagueResp, homeTeamResp, awayTeamResp] = await Promise.all([
            fetch(`${API_BASE_URL}/fpl/game`),
            fetch(`${API_BASE_URL}/league/${leagueId}/db`),
            fetch(`${API_BASE_URL}/league/manager/${homeId}/gameweek/${gw}/team`),
            fetch(`${API_BASE_URL}/league/manager/${awayId}/gameweek/${gw}/team`),
        ]);

        // Parse responses (non-ok is tolerated for team data — gw may not have picks yet)
        const gameStatus = gameStatusResp.ok ? await gameStatusResp.json() : null;
        const leagueData = leagueResp.ok     ? await leagueResp.json()     : null;
        const homeData   = homeTeamResp.ok   ? await homeTeamResp.json()   : null;
        const awayData   = awayTeamResp.ok   ? await awayTeamResp.json()   : null;

        const gwFinished = isGwFinished(gameStatus, gw);

        // Resolve manager names
        let homeName = `TEAM ${homeId}`;
        let awayName = `TEAM ${awayId}`;
        let fixtureHomePoints = 0;
        let fixtureAwayPoints = 0;
        let fixtureStarted = false;

        if (leagueData) {
            const managerMap = {};
            (leagueData.managers || []).forEach(m => {
                managerMap[m.manager_id] = m.entry_name || `Team ${m.manager_id}`;
            });
            homeName = (managerMap[homeId] || homeName).toUpperCase();
            awayName = (managerMap[awayId] || awayName).toUpperCase();

            // Find the fixture record for actual FPL points
            const fixture = (leagueData.matches || []).find(m =>
                m.event === gw &&
                m.league_entry_1 === homeId &&
                m.league_entry_2 === awayId
            );
            if (fixture) {
                fixtureHomePoints = fixture.league_entry_1_points || 0;
                fixtureAwayPoints = fixture.league_entry_2_points || 0;
                fixtureStarted    = fixture.started || false;
            }
        }

        // Update column headers with team names
        homeColHeader.textContent = homeName;
        awayColHeader.textContent = awayName;

        // Render teams
        if (homeData && homeData.players && homeData.players.length > 0) {
            renderTeamColumn(homeContainer, homeData.players, gwFinished);
        } else {
            homeContainer.innerHTML = '<div class="ceefax-info">NO PICKS YET FOR THIS GAMEWEEK</div>';
        }

        if (awayData && awayData.players && awayData.players.length > 0) {
            renderTeamColumn(awayContainer, awayData.players, gwFinished);
        } else {
            awayContainer.innerHTML = '<div class="ceefax-info">NO PICKS YET FOR THIS GAMEWEEK</div>';
        }

        // Calculate totals from the rendered starters (respects auto-subs)
        const homeTotal = homeData && homeData.players
            ? calcTeamTotal(applyAutoSubs(homeData.players, gwFinished).starters)
            : fixtureHomePoints;
        const awayTotal = awayData && awayData.players
            ? calcTeamTotal(applyAutoSubs(awayData.players, gwFinished).starters)
            : fixtureAwayPoints;

        renderScoreLine(homeName, homeTotal, awayName, awayTotal, fixtureStarted);

        // Update timestamp
        if (lastUpdated) {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            lastUpdated.textContent = `UPDATED: ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        }

    } catch (err) {
        console.error('[matchup] Error:', err);
        homeContainer.innerHTML = `<div class="ceefax-error">ERROR: ${err.message}</div>`;
        awayContainer.innerHTML = '';
        scoreLine.textContent   = 'ERROR LOADING MATCHUP';
    }
}

// ─── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000);

    init();
    setInterval(init, 60000); // refresh every minute
});
