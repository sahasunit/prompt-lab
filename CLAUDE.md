# CLAUDE.md — Prompt Engineering Lab

## Who You Are Helping

You are working with a senior frontend engineer (5 years experience) who is new to AI/ML concepts. They are comfortable with React, Next.js, JavaScript, Redux, Node.js, Vercel, and MongoDB. Do not explain basic software concepts. Do explain every AI/API concept in depth — that is the entire point of this project.

They are building this project to deeply understand the Claude API — not just to ship working code. Every implementation decision should be accompanied by a clear explanation of the underlying AI concept it demonstrates.

---

## What We Are Building

**Project:** Prompt Engineering Lab
**Purpose:** A hands-on tool for experimenting with the Claude API — every parameter, every prompt pattern, every token. The build is the learning vehicle.
**Stack:** React + Vite (frontend), Node.js + Express (backend), MongoDB (experiment history), Anthropic SDK

---

## Core Features — In Priority Order

### 1. Basic Completion Endpoint (Start Here)
- Express server with a single `/api/complete` POST endpoint
- Accepts: `{ prompt, systemPrompt, temperature, top_p, max_tokens, stopSequences, model }`
- Returns: `{ content, inputTokens, outputTokens, estimatedCost }`
- Non-streaming first. Get a real Claude response working before anything else.
- Error handling for: rate limits (429), invalid parameters (400), API errors (500), network timeouts

### 2. Streaming Endpoint
- `/api/stream` POST endpoint using Server-Sent Events (SSE)
- Stream tokens from Claude to the client as they arrive using the Anthropic SDK's streaming API
- Server must set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Each SSE event sends a token chunk as JSON: `data: { type: "delta", text: "..." }`
- Send a final event when stream completes: `data: { type: "done", inputTokens: N, outputTokens: N }`
- Handle client disconnection — abort the Anthropic stream if the client drops
- Client-side: use `EventSource` or `fetch` with `ReadableStream` to consume and render tokens incrementally

### 3. Parameter Controls (UI + API wired together)
All parameters must be real — wired to actual API calls, not mocked.

| Parameter | Type | Range | Default | What to explain |
|-----------|------|--------|---------|-----------------|
| temperature | float | 0.0 – 1.0 | 1.0 | Controls randomness by scaling the probability distribution over tokens before sampling. 0 = always pick the highest probability token (deterministic). 1 = sample from the full distribution. |
| top_p | float | 0.0 – 1.0 | 1.0 | Nucleus sampling — only sample from the smallest set of tokens whose cumulative probability exceeds top_p. Alternative to temperature, not typically used together. |
| max_tokens | integer | 1 – 8192 | 1024 | Hard cap on output tokens. Generation stops when this limit is hit, even mid-sentence. |
| stop_sequences | string[] | up to 4 | [] | Claude stops generating immediately when it produces any of these strings. The stop sequence itself is not included in the output. |
| model | enum | see models below | claude-sonnet-4-6 | Different capability/cost tradeoffs. |

**Available models:**
- `claude-haiku-4-5-20251001` — fastest, cheapest ($1.00 input / $5.00 output per million tokens)
- `claude-sonnet-4-6` — balanced, recommended default ($3.00 input / $15.00 output per million tokens)
- `claude-opus-4-6` — most capable, most expensive ($5.00 input / $25.00 output per million tokens)

### 4. Token Inspector
Display after every API call:
- Input token count (from API response `usage.input_tokens`)
- Output token count (from API response `usage.output_tokens`)
- Estimated cost in USD: `(inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate`
- Running session total (sum of all calls this session)

Cost rates per model:
```javascript
const COST_RATES = {
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'claude-opus-4-6':           { input: 5.00, output: 25.00 },
}
```

### 5. Compare Mode
- Single prompt input
- Two independent parameter configuration panels (Config A and Config B)
- Both fire simultaneously (parallel `Promise.all` or two concurrent streams)
- Side-by-side output rendering
- Show token count and cost for each config independently
- Goal: let the user feel the difference between parameter settings with the same prompt

### 6. Multi-Turn Conversation Mode
- A separate mode (tab or toggle) from single-prompt mode
- Client maintains conversation history as an array: `[{ role: 'user' | 'assistant', content: string }]`
- Each API call sends the full history array in the `messages` field — this is critical
- The API is stateless. It has no memory. Every call must include the full conversation history.
- UI shows the conversation thread
- System prompt is configurable and sent separately (not in the messages array)
- "Clear conversation" resets the history array to `[]`

### 7. MongoDB Experiment History
- Save every experiment run to MongoDB
- Schema:

```javascript
{
  _id: ObjectId,
  createdAt: Date,
  mode: 'single' | 'compare' | 'conversation',
  model: String,
  systemPrompt: String,
  prompt: String,
  parameters: {
    temperature: Number,
    top_p: Number,
    max_tokens: Number,
    stop_sequences: [String]
  },
  response: String,
  usage: {
    input_tokens: Number,
    output_tokens: Number,
    estimated_cost_usd: Number
  }
}
```

- GET `/api/experiments` — return last 50 experiments, sorted by createdAt descending
- GET `/api/experiments/:id` — return a single experiment
- POST `/api/experiments` — called internally after each completion
- DELETE `/api/experiments/:id` — delete a single experiment

### 8. Frontend Shell
- React + Vite
- Three modes accessible via tabs or nav: Single Prompt | Compare | Conversation
- Left panel: parameter controls (temperature slider, top_p slider, max_tokens input, stop sequences input, model selector, system prompt textarea)
- Main area: prompt input + output display
- Right panel or bottom drawer: experiment history list, click to reload any past experiment
- Token inspector bar: always visible below output, shows current call stats and session total
- No CSS framework required — plain CSS or CSS modules is fine. Functional over pretty.

---

## Project Structure

```
prompt-lab/
├── server/
│   ├── index.js              # Express app, middleware, route registration
│   ├── routes/
│   │   ├── complete.js       # POST /api/complete
│   │   ├── stream.js         # POST /api/stream
│   │   └── experiments.js    # CRUD for experiment history
│   ├── models/
│   │   └── Experiment.js     # Mongoose schema
│   └── lib/
│       └── costCalculator.js # Token cost calculation utility
├── client/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── ParameterPanel.jsx
│       │   ├── PromptInput.jsx
│       │   ├── OutputDisplay.jsx
│       │   ├── TokenInspector.jsx
│       │   ├── CompareMode.jsx
│       │   ├── ConversationMode.jsx
│       │   └── ExperimentHistory.jsx
│       └── api/
│           └── client.js     # All fetch calls to the backend
├── .env                      # ANTHROPIC_API_KEY, MONGODB_URI
├── .gitignore
├── CLAUDE.md
└── README.md
```

---

## Build Sequence — Do Not Skip Steps

Follow this exact order. Each step depends on the previous one being working and tested.

```
Step 1: Server scaffold → Express server running on port 3001, health check endpoint returning 200
Step 2: Basic completion → /api/complete returns a real Claude response (no streaming yet)
Step 3: Error handling → rate limits, bad params, API errors all handled correctly
Step 4: Streaming → /api/stream sends SSE tokens, verify with curl before touching the client
Step 5: MongoDB → Experiment schema, connection, CRUD routes all working
Step 6: Client scaffold → Vite + React running, proxying /api to :3001
Step 7: Wire single prompt → parameter controls in UI, connected to /api/stream
Step 8: Token inspector → display usage data after each call
Step 9: Compare mode → two configs, parallel calls, side-by-side output
Step 10: Conversation mode → history array management, multi-turn working correctly
Step 11: Experiment history → save on each call, display in sidebar, reload on click
Step 12: Polish → error states, loading states, cancellation
```

---

## Environment Variables

```
ANTHROPIC_API_KEY=your_key_here
MONGODB_URI=mongodb+srv://...
PORT=3001
```

---

## Key AI Concepts to Explain During Implementation

When implementing each feature, explain these concepts clearly:

**On stateless API (Step 2):**
> The Claude API has no memory between calls. Each request is completely independent. When you implement multi-turn conversation, you are manually reconstructing the illusion of memory by sending the full conversation history with every single request. The API does not store anything on its end.

**On temperature (Step 7):**
> Temperature scales the logits (raw model outputs) before the softmax function converts them to probabilities. At temperature 0, the highest-probability token is always selected — deterministic output. At temperature 1, you sample from the natural probability distribution the model learned. Above 1 is rarely used and makes outputs increasingly random and incoherent.

**On top_p (Step 7):**
> Instead of adjusting the shape of the probability distribution like temperature does, top_p cuts off the distribution at a cumulative probability threshold. If top_p is 0.9, Claude only considers the smallest set of tokens that together account for 90% of the probability mass. Tokens outside this set are excluded from sampling entirely.

**On streaming (Step 4):**
> The model does not generate the full response then send it. It generates one token at a time, left to right. SSE streaming lets you send each token to the client the moment it's generated. This is why streaming feels fast even for long responses — you're reading at the model's generation speed, not waiting for completion.

**On tokens (Step 8):**
> A token is approximately 4 characters of English text, but it varies. "tokenization" might be 3 tokens. "a" is 1 token. Code and non-English text tokenize differently. The input token count includes your system prompt + all conversation history + the current message. This is why long conversations get expensive — history accumulates.

**On stop sequences (Step 7):**
> Stop sequences are exact string matches. The moment Claude generates a sequence that matches one of your stop strings, generation halts immediately and that string is excluded from the output. Useful for structured outputs — if you're generating JSON, you might use `}` as a stop sequence to ensure Claude stops after the closing brace.

---

## Constraints and Rules

- **Never mock API responses.** Every parameter must produce real Claude output. If something is broken, fix it — do not fake it.
- **Non-streaming before streaming.** Get `/api/complete` working and tested before touching `/api/stream`.
- **Test with curl before wiring to the frontend.** Every backend endpoint should be verified with a raw curl command before the client consumes it.
- **Explain every AI concept in code comments.** When implementing temperature controls, add a comment explaining what temperature actually does. This project is for learning, not just shipping.
- **No shortcutting error handling.** Rate limits, network failures, and malformed responses will happen. Handle them.
- **One feature at a time.** Do not scaffold everything at once. Build → test → move to next step.

---

## curl Test Commands (Use These to Verify Each Endpoint)

```bash
# Health check
curl http://localhost:3001/health

# Basic completion
curl -X POST http://localhost:3001/api/complete \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "systemPrompt": "You are a helpful assistant.",
    "temperature": 0.7,
    "top_p": 1.0,
    "max_tokens": 100,
    "stopSequences": [],
    "model": "claude-sonnet-4-6"
  }'

# Streaming (watch tokens arrive)
curl -X POST http://localhost:3001/api/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "prompt": "Count from 1 to 10 slowly.",
    "systemPrompt": "You are a helpful assistant.",
    "temperature": 1.0,
    "max_tokens": 200,
    "model": "claude-sonnet-4-6"
  }'

# Get experiments
curl http://localhost:3001/api/experiments
```

---

## What Success Looks Like

The engineer using this lab should be able to:
1. Change temperature from 0 to 1 with the same prompt and observe — and explain — the difference in output
2. Explain exactly what gets sent to the API in a multi-turn conversation
3. Read the token inspector and calculate the cost of a call manually
4. Explain why streaming feels fast without the model being faster
5. Use stop sequences deliberately to control output format

If the code works but these questions cannot be answered, the project is not done.