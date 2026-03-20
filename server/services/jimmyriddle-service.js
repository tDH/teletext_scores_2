/**
 * Jimmyriddle service — LLM mystery player generation.
 *
 * Generates a single mystery international football player profile via Claude.
 * Returns clubs, trophies, goals, era, nationality, and a famous moment as clues.
 * The player name is included but only shown to the client when they reveal.
 */
const axios = require('axios');
const config = require('../config');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const MODEL = 'claude-3-haiku-20240307';

/**
 * Generate a mystery international football player profile via Claude.
 *
 * @returns {Promise<{ playerName, nationality, teams, trophies, goals, era, famousMoment }>}
 */
const generatePlayer = async () => {
  if (!config.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const prompt = `You are generating a mystery football player profile for a guessing game called Jimmyriddle.

Rules:
- The player MUST be English, Scottish, Welsh, Northern Irish, or Irish (Republic of Ireland).
- The player MUST have earned at least 1 full international cap for their nation.
- The player MUST have been active (playing professionally) from 1990 onwards. Do NOT pick players whose careers ended before 1990.
- Difficulty: hard to very hard. Avoid household names. Pick players that only a knowledgeable football fan would recognise — solid internationals, cult heroes, one-cap wonders, journeymen with interesting careers. Do NOT pick players like Wayne Rooney, Steven Gerrard, or Thierry Henry.
- The "famousMoment" field MUST NOT contain the player's name (first name, surname, or any part of it). Describe the moment without naming the subject — e.g. "Scored the only goal in a famous European Cup upset" not "John Smith scored the only goal...".

Return ONLY a raw JSON object with exactly these 7 fields:
- "playerName": string (full name)
- "nationality": string (e.g. "Scottish", "Welsh", "Irish")
- "teams": array of strings (clubs played for, in chronological order)
- "trophies": array of strings (major honours — league titles, cups, international trophies; empty array if none)
- "goals": string (e.g. "187 career club goals" or "12 international goals")
- "era": string (e.g. "1998 – 2014")
- "famousMoment": string (one memorable career highlight, match, or achievement — one sentence, player's name must NOT appear)

No markdown code blocks, no explanation, no other text. Only the raw JSON object.`;

  let response;
  try {
    response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': config.anthropic.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
          'content-type': 'application/json',
        },
        timeout: 30000,
      }
    );
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error('[jimmyriddle-service] Anthropic API error:', err.response?.status, detail);
    throw new Error(`Anthropic API error: ${detail}`);
  }

  const text = response.data?.content?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Anthropic API');
  }

  let player;
  try {
    // Strip markdown code fences if the model wrapped the JSON
    let jsonText = text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();
    player = JSON.parse(jsonText);
  } catch {
    throw new Error('Failed to parse player profile from LLM response');
  }

  // Validate structure
  const required = ['playerName', 'nationality', 'teams', 'trophies', 'goals', 'era', 'famousMoment'];
  for (const field of required) {
    if (!(field in player)) {
      throw new Error(`LLM response missing field: ${field}`);
    }
  }
  if (!Array.isArray(player.teams) || !Array.isArray(player.trophies)) {
    throw new Error('LLM response: teams and trophies must be arrays');
  }
  for (const field of ['playerName', 'nationality', 'goals', 'era', 'famousMoment']) {
    if (typeof player[field] !== 'string' || !player[field].trim()) {
      throw new Error(`LLM response: ${field} must be a non-empty string`);
    }
  }

  // Safety net: redact any part of the player's name that leaked into famousMoment
  const nameParts = player.playerName.trim().split(/\s+/);
  let moment = player.famousMoment;
  for (const part of nameParts) {
    if (part.length > 1) {
      const pattern = new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      moment = moment.replace(pattern, '***');
    }
  }
  player.famousMoment = moment;

  return player;
};

module.exports = { generatePlayer };
