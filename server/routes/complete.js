const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { calculateCost } = require('../lib/costCalculator');

const router = express.Router();

const VALID_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
]);

// The client reads ANTHROPIC_API_KEY from the environment automatically.
// Each request to this endpoint is a completely independent, stateless API call —
// the Claude API has no memory of previous requests. Multi-turn conversation
// (Step 10) is handled entirely by the client sending the full history each time.
const anthropic = new Anthropic();

function validateParams({ prompt, model, temperature, top_p, max_tokens, stopSequences }) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return 'prompt is required and must be a non-empty string';
  }
  if (!VALID_MODELS.has(model)) {
    return `model must be one of: ${[...VALID_MODELS].join(', ')}`;
  }
  if (typeof temperature !== 'number' || temperature < 0 || temperature > 1) {
    return 'temperature must be a number between 0.0 and 1.0';
  }
  if (typeof top_p !== 'number' || top_p < 0 || top_p > 1) {
    return 'top_p must be a number between 0.0 and 1.0';
  }
  if (!Number.isInteger(max_tokens) || max_tokens < 1 || max_tokens > 8192) {
    return 'max_tokens must be an integer between 1 and 8192';
  }
  if (!Array.isArray(stopSequences) || stopSequences.length > 4) {
    return 'stopSequences must be an array of at most 4 strings';
  }
  return null;
}

router.post('/', async (req, res) => {
  const {
    prompt,
    systemPrompt,
    temperature = 1.0,
    top_p = 1.0,
    max_tokens = 1024,
    stopSequences = [],
    model = 'claude-sonnet-4-6',
  } = req.body;

  const validationError = validateParams({ prompt, model, temperature, top_p, max_tokens, stopSequences });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const messageParams = {
    model,
    max_tokens,
    messages: [{ role: 'user', content: prompt }],
  };

  // System prompt is sent as a separate field, not inside messages[].
  // Prompt caching: adding cache_control tells Anthropic to cache this prefix.
  // On repeated calls with the same system prompt, the cached version is served
  // at ~0.1× the normal input cost. Cache TTL is 5 minutes.
  if (systemPrompt) {
    messageParams.system = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ];
  }

  // temperature and top_p are mutually exclusive on Claude 4.x models.
  // temperature (default 1.0): scales the probability distribution over tokens.
  //   At 0 → always pick the highest-probability token (deterministic).
  //   At 1 → sample from the model's natural distribution.
  // top_p (default 1.0): nucleus sampling — only sample from the smallest set of
  //   tokens whose cumulative probability mass exceeds top_p. Alternative to temperature.
  // When top_p is set to a non-default value, use it; otherwise use temperature.
  if (top_p !== 1.0) {
    messageParams.top_p = top_p;
  } else {
    messageParams.temperature = temperature;
  }

  // stop_sequences: Claude stops generating the moment it produces any of these
  // strings. The stop sequence itself is NOT included in the output.
  if (stopSequences.length > 0) {
    messageParams.stop_sequences = stopSequences;
  }

  try {
    // 30-second timeout. The SDK will throw APIConnectionTimeoutError if exceeded.
    // Streaming (Step 4) handles timeouts differently — tokens arrive incrementally
    // so there's no single wall-clock limit that makes sense there.
    const response = await anthropic.messages.create(messageParams, { timeout: 30_000 });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    res.json({
      content: response.content[0].text,
      inputTokens,
      outputTokens,
      estimatedCost: calculateCost(model, inputTokens, outputTokens),
    });
  } catch (error) {
    // Network timeout — the 30-second limit above was exceeded.
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return res.status(504).json({ error: 'Request to Claude timed out. Try again.' });
    }

    // Rate limit: the SDK already retried with exponential backoff (default 2 retries).
    // If we're still hitting it, tell the client to back off.
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Wait before retrying.',
        retryAfter: error.headers?.['retry-after'] ?? null,
      });
    }

    // Invalid model ID — the API returns 404 for unknown model strings.
    if (error instanceof Anthropic.NotFoundError) {
      return res.status(404).json({
        error: 'Model not found.',
        details: error.message,
      });
    }

    // Bad parameters: temperature out of range, malformed stop sequences, etc.
    if (error instanceof Anthropic.BadRequestError) {
      return res.status(400).json({
        error: 'Invalid request parameters.',
        details: error.message,
      });
    }

    // Authentication failure — bad or missing API key.
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(401).json({ error: 'Invalid ANTHROPIC_API_KEY.' });
    }

    // Any other Anthropic API error (5xx from their side, network drop, etc.)
    if (error instanceof Anthropic.APIError) {
      return res.status(500).json({
        error: 'Claude API error.',
        details: error.message,
      });
    }

    // Truly unexpected — log it so we can diagnose
    console.error('Unexpected error in /api/complete:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
