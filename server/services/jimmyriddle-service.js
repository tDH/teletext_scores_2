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

The player must have represented their country at international level. Choose a mix of medium and hard difficulty — some well-known internationals, some less obvious ones. Players can come from any nation and era (European leagues preferred but not required). Do not always pick the most famous players.

Return ONLY a raw JSON object with exactly these 7 fields:
- "playerName": string (full name)
- "nationality": string (e.g. "Scottish", "French", "Brazilian")
- "teams": array of strings (clubs played for, in chronological order)
- "trophies": array of strings (major honours — league titles, cups, international trophies)
- "goals": string (e.g. "187 career club goals" or "23 international goals")
- "era": string (e.g. "1998 – 2014")
- "famousMoment": string (one memorable career highlight, match, or achievement — one sentence)

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

  return player;
};

module.exports = { generatePlayer };
