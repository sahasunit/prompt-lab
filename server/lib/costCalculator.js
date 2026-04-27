// Cost per million tokens, per model, as defined in CLAUDE.md
const COST_RATES = {
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'claude-opus-4-6':           { input: 5.00, output: 25.00 },
};

function calculateCost(model, inputTokens, outputTokens) {
  const rates = COST_RATES[model] ?? COST_RATES['claude-sonnet-4-6'];
  return (inputTokens / 1_000_000) * rates.input
       + (outputTokens / 1_000_000) * rates.output;
}

module.exports = { calculateCost, COST_RATES };
