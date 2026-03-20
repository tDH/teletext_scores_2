/**
 * RonnieRebel service — LLM question generation and leaderboard persistence.
 *
 * Uses the Anthropic Messages API directly via axios.
 * Generates 5 multiple-choice questions about Irish rebel music and
 * Irish Republican history. Single global leaderboard (no league/decade).
 */
const axios = require('axios');
const db = require('../db');
const config = require('../config');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const MODEL = 'claude-3-haiku-20240307';

/**
 * Generate 5 multiple-choice questions about Irish rebel music and history.
 *
 * @returns {Promise<Array<{ question, options, correctIndex }>>}
 */
const generateQuestions = async () => {
  if (!config.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const prompt = `You are a quiz generator specialising in Irish rebel music and Irish Republican history.
Generate exactly 5 multiple choice questions. Topics should cover a mix of:
- Irish rebel songs (song titles, lyrics, meaning, origin stories)
- Notable rebel musicians, ballad groups and singers
- Key events in Irish Republican history that inspired rebel music
- Historical context behind famous songs
- Connections between specific songs and historical events or figures

Difficulty: hard — for knowledgeable fans of the genre only. Questions should require genuine knowledge, not just general awareness.

Rules:
- Questions must be factually accurate
- Each question must have exactly 4 answer options
- Exactly one option must be correct
- Wrong options must be plausible but clearly wrong to an expert

Return ONLY a JSON array with exactly 5 objects. Each object must have:
- "question": string (the question text)
- "options": array of exactly 4 strings (the answer choices)
- "correctIndex": integer 0-3 (index of the correct answer in options)

No markdown code blocks, no explanation, no other text. Only the raw JSON array.`;

  let response;
  try {
    response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: MODEL,
        max_tokens: 900,
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
    console.error('[ronnierebel-service] Anthropic API error:', err.response?.status, detail);
    throw new Error(`Anthropic API error: ${detail}`);
  }

  const text = response.data?.content?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Anthropic API');
  }

  let questions;
  try {
    // Strip markdown code fences if the model wrapped the JSON (e.g. ```json ... ```)
    let jsonText = text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();
    questions = JSON.parse(jsonText);
  } catch {
    throw new Error('Failed to parse quiz questions from LLM response');
  }

  // Validate structure
  if (!Array.isArray(questions) || questions.length !== 5) {
    throw new Error('LLM did not return exactly 5 questions');
  }
  for (const q of questions) {
    if (
      typeof q.question !== 'string' ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      typeof q.correctIndex !== 'number' ||
      q.correctIndex < 0 ||
      q.correctIndex > 3
    ) {
      throw new Error('LLM returned malformed question structure');
    }
  }

  return questions;
};

/**
 * Save a completed RonnieRebel result to the leaderboard.
 *
 * @param {{ playerName, correctAnswers, totalTimeMs }}
 * @returns {Promise<{ id }>}
 */
const saveResult = async ({ playerName, correctAnswers, totalTimeMs }) => {
  const result = await db.query(
    `INSERT INTO ronnierebel_results (player_name, correct_answers, total_time_ms)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [playerName, correctAnswers, totalTimeMs]
  );
  return { id: result.rows[0].id };
};

/**
 * Fetch the top 20 RonnieRebel results ordered by score (desc) then time (asc).
 *
 * @returns {Promise<Array>}
 */
const getLeaderboard = async () => {
  const result = await db.query(
    `SELECT id, player_name, correct_answers, total_time_ms, created_at
     FROM ronnierebel_results
     ORDER BY correct_answers DESC, total_time_ms ASC
     LIMIT 20`
  );
  return result.rows;
};

module.exports = { generateQuestions, saveResult, getLeaderboard };
