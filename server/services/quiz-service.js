/**
 * Quiz service — LLM question generation and leaderboard persistence.
 *
 * Uses the Anthropic Messages API directly via axios (no extra package needed).
 * Generates 5 multiple-choice Tamboozle football trivia questions based on the
 * player's chosen league and decade. Difficulty is always hard.
 */
const axios = require('axios');
const db = require('../db');
const config = require('../config');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const MODEL = 'claude-3-haiku-20240307';

const LEAGUE_LABELS = {
  scotland: 'Scottish Premier League / Scottish Premiership',
  england: 'English Premier League',
};

/**
 * Generate 5 multiple-choice football trivia questions via Claude.
 * Difficulty is always hard.
 *
 * @param {string} league  - 'scotland' | 'england'
 * @param {string} decade  - '1990s' | '2000s' | '2010s' | '2020s'
 * @returns {Promise<Array<{ question, options, correctIndex }>>}
 */
const generateQuestions = async (league, decade) => {
  if (!config.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const leagueLabel = LEAGUE_LABELS[league] || league;

  const prompt = `You are a football trivia quiz generator. Generate exactly 5 multiple choice questions about ${leagueLabel} football from the ${decade}.

Difficulty: hard (deep trivia, obscure statistics, lesser-known events — for serious football fans only)

Rules:
- Questions must be factually accurate and specific to ${leagueLabel} in the ${decade}
- Each question must have exactly 4 answer options
- Exactly one option must be correct
- Wrong options should be plausible but clearly wrong to someone with deep football knowledge
- Questions should vary in topic: mix of players, managers, clubs, results, records, transfers, key match-ups (e.g. who scored the winning goal in a specific fixture, who scored in a derby or cup final), and positional questions (e.g. who played left back for a specific club in a specific season)

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
        max_tokens: 1000,
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
    console.error('[quiz-service] Anthropic API error:', err.response?.status, detail);
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
 * Save a completed Tamboozle result to the leaderboard.
 * Difficulty is always stored as 'hard'.
 *
 * @param {{ playerName, league, decade, correctAnswers, totalTimeMs }}
 * @returns {Promise<{ id }>}
 */
const saveResult = async ({ playerName, league, decade, correctAnswers, totalTimeMs }) => {
  const result = await db.query(
    `INSERT INTO quiz_results (player_name, difficulty, league, decade, correct_answers, total_time_ms)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [playerName, 'hard', league, decade, correctAnswers, totalTimeMs]
  );
  return { id: result.rows[0].id };
};

/**
 * Fetch the top 20 Tamboozle results ordered by score (desc) then time (asc).
 * Optionally filter by league.
 *
 * @param {string|null} league - 'scotland' | 'england' | null (all)
 * @returns {Promise<Array>}
 */
const getLeaderboard = async (league = null) => {
  const result = await db.query(
    `SELECT id, player_name, league, decade, correct_answers, total_time_ms, created_at
     FROM quiz_results
     WHERE ($1::text IS NULL OR league = $1)
     ORDER BY correct_answers DESC, total_time_ms ASC
     LIMIT 20`,
    [league]
  );
  return result.rows;
};

module.exports = { generateQuestions, saveResult, getLeaderboard };
