# From Frontend Dev to Agent Dev
### A Complete Step-by-Step Journey

> **Author:** Z-lady  
> **Stack:** TypeScript · Node.js · Express · OpenRouter · Tavily · Open-Meteo  
> **Started:** March 2026

---

## Table of Contents

1. [What is Agent Development?](#1-what-is-agent-development)
2. [The Roadmap](#2-the-roadmap)
3. [Tools & Keys You Need](#3-tools--keys-you-need)
4. [Step 1 — Build a Web Search Agent](#4-step-1--build-a-web-search-agent)
5. [Step 2 — Prompting Concepts](#5-step-2--prompting-concepts)
6. [Step 3 — Persistent Memory](#6-step-3--persistent-memory)
7. [Step 4 — Multiple Tools](#7-step-4--multiple-tools)
8. [Key Concepts Reference](#8-key-concepts-reference)
9. [Bugs We Hit & How We Fixed Them](#9-bugs-we-hit--how-we-fixed-them)
10. [What's Next](#10-whats-next)

---

## 1. What is Agent Development?

AI agent development means building systems where an LLM (Large Language Model) can:

- **Reason** about a problem
- **Decide** which tools to use
- **Act** by calling those tools
- **Observe** the results
- **Repeat** until the task is done

The key difference from a regular chatbot:

| Chatbot | Agent |
|---|---|
| Answers from training data only | Can call tools to get real data |
| One turn: question → answer | Multiple turns: question → think → tool → result → answer |
| No external actions | Can search, calculate, read URLs, call APIs |
| Static knowledge | Real-time information |

### Why is this valuable for a frontend developer?

- You already understand **state management** → agent state/memory is the same problem
- You understand **async flows** → agent loops are async by nature
- You can build **great UIs** for agents — most agent devs can't
- You understand **user needs** — which shapes better agent design

---

## 2. The Roadmap

```
✅ Step 1 — Build a working web search agent
✅ Step 2 — Learn prompting (system prompts, few-shot, chain-of-thought)
✅ Step 3 — Add memory (conversations saved to disk)
✅ Step 4 — Multiple tools (calculator, weather, URL reader)
⬜ Step 5 — Multi-agent (agents that delegate to sub-agents)
⬜ Step 6 — RAG (agent that reads your own documents)
```

---

## 3. Tools & Keys You Need

### API Keys (both free)

| Service | Purpose | Get it at |
|---|---|---|
| **OpenRouter** | Access to free AI models (Mistral, LLaMA, Gemma) | https://openrouter.ai/keys |
| **Tavily** | Real web search built for AI agents | https://app.tavily.com |

### How to get OpenRouter key
1. Go to **https://openrouter.ai**
2. Sign up with Google or GitHub — no credit card needed
3. Go to **Keys** section
4. Click **Create Key**
5. Copy the key — starts with `sk-or-v1-...`

### How to get Tavily key
1. Go to **https://app.tavily.com**
2. Sign up — no credit card needed
3. Copy your API key — starts with `tvly-...`
4. Free tier: **1000 searches/month**

### Your `.env` file
```
API_KEY=sk-or-v1-YOUR_OPENROUTER_KEY
TAVILY_API_KEY=tvly-YOUR_TAVILY_KEY
```

> ⚠️ Never commit `.env` to Git. Make sure `.gitignore` contains `.env`.

---

## 4. Step 1 — Build a Web Search Agent

### Project structure

```
web-search-agent/
├── src/
│   ├── agent.ts        ← 🧠 Tool definitions + agent loop
│   └── server.ts       ← 🌐 Express server + SSE streaming
├── public/
│   └── index.html      ← 🎨 Browser UI
├── .env                ← 🔑 API keys
├── .gitignore
├── package.json
└── tsconfig.json
```

### How to run

```bash
npm install
npm run dev
# open http://localhost:3000
```

### The 3 core concepts in agent.ts

#### Concept 1 — Tool Definitions

You define tools as a JSON schema. The AI reads the `description` field and decides **on its own** when to call each tool. You never hardcode "call search now."

```typescript
const tools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current, up-to-date information. " +
        "Use this when the question requires recent facts or news.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A clear, specific search query",
          },
        },
        required: ["query"],
      },
    },
  },
];
```

**Key insight:** The quality of your `description` directly determines how smartly the AI uses the tool. Better descriptions = smarter agents.

#### Concept 2 — Tool Execution

When the AI decides to call a tool, **your code runs it** — the AI never runs tools directly. This is a fundamental security property of the tool use pattern.

```typescript
async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  if (name === "web_search") {
    // YOUR code runs the actual search
    const result = await fetch("https://api.tavily.com/search", { ... });
    return result;
  }
}
```

#### Concept 3 — The Agent Loop

This `while` loop is the heart of every AI agent ever built:

```typescript
while (iteration < MAX_ITERATIONS) {
  // 1. Call the AI
  const response = await callAI(messages);

  // 2. Did it want a tool?
  if (response.finish_reason === "tool_calls") {
    // Run the tool, add result to messages, loop again
    const result = await executeTool(toolName, toolArgs);
    messages.push({ role: "tool", content: result });
    continue;
  }

  // 3. Or is it done?
  if (response.finish_reason === "stop") {
    return response.message.content; // final answer
  }
}
```

The loop keeps running until `finish_reason === "stop"` — meaning the AI has enough information to answer without calling another tool.

### Server-Sent Events (SSE) — Real-time streaming

Instead of waiting for the full response, the server streams each event to the browser as it happens. This is why you see tool calls appear in real time.

```typescript
// server.ts — streaming setup
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");

// Send each agent event as it happens
for await (const event of runAgent(messages, apiKey)) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

Event types streamed:
- `thinking` — agent starting a new iteration
- `tool_call` — agent decided to use a tool
- `tool_result` — tool returned a result
- `answer` — final answer ready
- `error` — something went wrong

### Why we switched from DuckDuckGo to Tavily

The original version used the DuckDuckGo Instant Answer API but it was returning empty results. The AI had nothing to read so it answered from its training data — no real searching.

**DuckDuckGo problems:**
- Returns empty results for most queries
- Not designed for programmatic AI use
- Unreliable and inconsistent

**Tavily advantages:**
- Built specifically for AI agents
- Returns clean text (no HTML to parse)
- Includes source URLs for citations
- Consistent and reliable
- Free tier: 1000 requests/month

---

## 5. Step 2 — Prompting Concepts

This step teaches the 4 core techniques for controlling AI behavior. We built an interactive **Prompting Playground** (runs on port 3001) to experience each technique live.

### Project structure

```
prompting-playground/
├── src/
│   └── server.ts     ← 4 endpoints, one per technique
├── public/
│   └── index.html    ← Interactive UI with tabs
├── .env
└── package.json
```

### Run it

```bash
cd prompting-playground
npm install
npm run dev
# open http://localhost:3001
```

---

### Technique 1 — Basic (No System Prompt)

Just a raw user message — no context, no rules. The AI guesses your intent.

```typescript
const messages = [
  { role: "user", content: "What is recursion?" }
];
```

**Result:** Generic, often verbose, no consistent format or persona.

This is your **baseline** — every other technique improves on this.

---

### Technique 2 — System Prompt ⭐ Most Important

A system prompt sets the AI's **identity, rules, format, and tone** before the conversation starts. It runs invisibly on every single message.

```typescript
const messages = [
  {
    role: "system",
    content: `You are a senior TypeScript developer with 10 years of experience.
You explain things concisely and always include a short code example.
Never use jargon without explaining it.
Keep answers under 150 words.`
  },
  { role: "user", content: "What is recursion?" }
];
```

**Anatomy of a good system prompt:**

```
You are a [role] with [expertise].        ← Identity
You always [positive behavior rule].      ← Rules
Never [negative behavior rule].           ← Constraints  
Format your response as [structure].      ← Output format
Keep answers [length constraint].         ← Length control
```

**Why this matters for agents:** In your web search agent, the system prompt is what defines what *kind* of agent it is. A research agent, a coding agent, and a customer support agent are all built on the same loop — only the system prompt changes.

**Three presets in the playground:**

| Preset | Use case |
|---|---|
| Senior Dev | Technical explanations with code |
| Teacher | Beginner-friendly with analogies |
| Agent | Structured output for automation |

---

### Technique 3 — Few-Shot Examples

You show the AI 2–3 examples of the exact input/output format you want **before** giving the real question.

```typescript
const messages = [
  { role: "system", content: "Classify messages. Reply with ONLY the category." },

  // Example 1
  { role: "user",      content: "I was charged twice for my subscription" },
  { role: "assistant", content: "BILLING" },

  // Example 2
  { role: "user",      content: "App crashes when I upload a photo" },
  { role: "assistant", content: "TECHNICAL" },

  // Real question
  { role: "user", content: "My order hasn't arrived after 2 weeks!" }
  // AI will say: "SHIPPING"
];
```

**Why it works:** AI models are pattern matchers. Examples are far more reliable than written instructions for controlling output format. The AI sees the examples as "past conversation" and immediately learns the pattern.

**When to use it:**
- You need a very specific output structure
- You want consistent tone or style
- Written instructions alone aren't working

---

### Technique 4 — Chain of Thought (CoT)

Force the AI to show its reasoning **before** answering. This dramatically improves accuracy on complex problems.

```typescript
const systemPrompt = `You are a helpful assistant.

IMPORTANT: Before giving your final answer, show your reasoning.
Structure your response like this:

## 🧠 Thinking
[Step-by-step reasoning here]

## ✅ Answer
[Final answer based on your reasoning]`;
```

**Classic demo — The Bat & Ball puzzle:**

> A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost?

- **Without CoT:** Most AIs say `$0.10` (wrong gut-feel answer)
- **With CoT:** AI works through the algebra: `ball + (ball + 1.00) = 1.10` → `ball = $0.05` ✅

**When to use it:**
- Multi-step math or logic problems
- Complex decisions with tradeoffs
- Debugging and analysis tasks
- Anywhere accuracy matters more than speed

---

## 6. Step 3 — Persistent Memory

Added `memory.ts` to save every conversation to disk so the agent remembers past chats after restarts.

### How it works

```
data/
  conversations.json     ← index: all conversation metadata
  conv_abc123.json       ← full messages for one conversation
  conv_def456.json
  ...
```

### Key functions in memory.ts

```typescript
// List all past conversations (for sidebar)
listConversations(): Conversation[]

// Load one conversation with all messages
loadConversation(id: string): ConversationWithMessages | null

// Save/update a conversation after each response
saveConversation(id: string | null, messages: Message[]): Conversation

// Delete a conversation
deleteConversation(id: string): boolean
```

### Bug we fixed

The `DATA_DIR` path was wrong:
```typescript
// ❌ Wrong — goes 2 levels up from __dirname
const DATA_DIR = path.join(__dirname, "../../data");

// ✅ Correct — data folder next to server.ts
const DATA_DIR = path.join(__dirname, "./data");
```

### REST endpoints added in server.ts

```
GET    /api/conversations        → list all conversations
GET    /api/conversations/:id    → load one conversation
DELETE /api/conversations/:id    → delete a conversation
POST   /api/chat                 → run agent (existing)
```

---

## 7. Step 4 — Multiple Tools

Upgraded from 1 tool to 4 tools. The agent now picks the right tool automatically based on what you ask.

### The 4 tools

| Tool | Trigger | Implementation |
|---|---|---|
| `web_search` | Current events, news, recent facts | Tavily API |
| `calculator` | Any math, percentages, formulas | JavaScript `Function()` evaluator |
| `read_url` | User pastes a URL, reading full page content | `fetch()` + HTML stripping |
| `get_weather` | Weather questions for any city | Open-Meteo (free, no key!) |

### How tool routing works

The key insight: **you don't hardcode which tool to use for which question.** The AI reads each tool's `description` and decides. Your descriptions do the routing:

```typescript
// Calculator description tells the AI EXACTLY when to use it:
description:
  "Evaluate a mathematical expression with 100% accuracy. " +
  "Use this for ANY math: arithmetic, percentages, conversions. " +
  "ALWAYS use this instead of doing math yourself — you make arithmetic errors."

// Web search description tells it NOT to use for math:
description:
  "Search the web for current information. " +
  "Do NOT use for math calculations — use calculator instead."
```

### The tool router pattern

```typescript
async function executeTool(name, args, tavilyKey) {
  switch (name) {
    case "web_search":  return await runWebSearch(args.query, tavilyKey);
    case "calculator":  return runCalculator(args.expression);
    case "read_url":    return await runReadUrl(args.url);
    case "get_weather": return await runGetWeather(args.city);
    default:            return `Unknown tool: "${name}"`;
  }
}
```

Adding a new tool in the future = add to `tools[]` array + add a `case` here. The agent loop never changes.

### Calculator implementation

LLMs hallucinate wrong math answers confidently. The calculator tool bypasses this: the AI writes the expression, your code evaluates it accurately.

```typescript
function runCalculator(expression: string): string {
  // Only allow safe math characters
  const safe = /^[0-9+\-*/().,\s%MathsqrtpowlogroundceilfloorPIabsminmax]+$/.test(expression);
  if (!safe) return "Error: unsafe expression";

  // Function() is safer than eval() — no scope access
  const result = new Function(`"use strict"; return (${expression})`)();
  return `Result: ${result.toLocaleString()}`;
}
```

### Weather implementation (no API key!)

Uses Open-Meteo — completely free, no registration needed. Two API calls chained:

```
Step 1: Geocoding API — city name → latitude/longitude
Step 2: Forecast API  — coordinates → current weather data
```

```typescript
// Step 1 — city name to coordinates
const geo = await fetch(
  `https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=1`
);

// Step 2 — coordinates to weather
const weather = await fetch(
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,...`
);
```

### UI improvements

Each tool gets its own color and icon — so you instantly see which tool fired:

| Tool | Color | Icon |
|---|---|---|
| `web_search` | 🔵 Cyan | 🔍 |
| `calculator` | 🟢 Green | 🧮 |
| `read_url` | 🟣 Purple | 🌐 |
| `get_weather` | 🟡 Yellow | 🌤️ |

### Test each tool

```
🔍 "Who is the current CEO of OpenAI?"           → web_search
🧮 "What is 15% tip on a $84.50 bill?"           → calculator
🌤️ "What is the weather in Kyiv right now?"      → get_weather
🌐 "Summarize: https://en.wikipedia.org/wiki/AI" → read_url
```

---

## 8. Key Concepts Reference

### The Agent Loop (pseudocode)

```
function runAgent(userMessage):
  messages = [userMessage]
  
  while iterations < MAX:
    response = callAI(messages, tools)
    
    if response.finish_reason == "stop":
      return response.text          ← done!
    
    if response.finish_reason == "tool_calls":
      for each toolCall in response.tool_calls:
        result = executeTool(toolCall.name, toolCall.args)
        messages.append(toolResult)
      continue                       ← loop again
```

### Message history is the agent's memory

The `messages` array is sent on **every** API call. It contains the full conversation history — user messages, assistant responses, tool calls, and tool results. Without it, the AI has no memory of what happened.

```typescript
// Every turn adds to the history:
messages.push({ role: "user",      content: userQuestion });
messages.push({ role: "assistant", content: "", tool_calls: [...] });
messages.push({ role: "tool",      content: toolResult, tool_call_id: "..." });
messages.push({ role: "assistant", content: finalAnswer });
```

### finish_reason values

| Value | Meaning |
|---|---|
| `"stop"` | AI is done, final answer ready |
| `"tool_calls"` | AI wants to call one or more tools |
| `"length"` | Hit max_tokens limit |
| `"end_turn"` | Same as stop (some models use this) |

### Tool description best practices

```
✅ Be specific about WHEN to use it
✅ Be specific about WHEN NOT to use it
✅ Give concrete examples in the description
✅ Mention accuracy advantages ("100% accurate" for calculator)
❌ Don't be vague ("use this for useful tasks")
❌ Don't overlap descriptions between tools
```

### OpenRouter model selection

```typescript
model: "openrouter/auto"     // auto-picks best available free model ✅ recommended
model: "openrouter/free"     // any free model

// Specific free models (may change availability):
model: "meta-llama/llama-3.3-70b-instruct:free"
model: "meta-llama/llama-4-scout:free"
model: "google/gemma-3-27b-it:free"
```

Using `"openrouter/auto"` is the most future-proof — it never returns a 404 when a specific model becomes unavailable.

---

## 9. Bugs We Hit & How We Fixed Them

### Bug 1 — API error 404

**Problem:** `API error 404` when calling OpenRouter.  
**Cause:** Model name `"mistralai/mistral-7b-instruct:free"` was no longer available.  
**Fix:** Use `"openrouter/auto"` instead — it always routes to an available free model.

```typescript
// ❌ Before
model: "mistralai/mistral-7b-instruct:free"

// ✅ After
model: "openrouter/auto"
```

### Bug 2 — Agent not actually searching the web

**Problem:** Agent was responding from training data only, not doing real searches.  
**Cause:** DuckDuckGo API was returning empty results. The AI had no search data to read so it fell back to its own knowledge.  
**Fix:** Replace DuckDuckGo with Tavily — a search API built specifically for AI agents.

```typescript
// ❌ DuckDuckGo (unreliable, often empty)
const url = `https://api.duckduckgo.com/?q=${query}&format=json`;

// ✅ Tavily (built for AI, reliable)
const res = await fetch("https://api.tavily.com/search", {
  method: "POST",
  body: JSON.stringify({ query, search_depth: "basic", max_results: 5 })
});
```

### Bug 3 — Wrong env variable name

**Problem:** Agent showed "key missing" despite `.env` being set.  
**Cause:** Mismatch between `.env` key name and what `server.ts` was reading.  
**Fix:** Make sure the name in `.env` exactly matches `process.env.YOUR_KEY_NAME` in code.

```
# .env
API_KEY=sk-or-v1-...          ← must match exactly

# server.ts
process.env.API_KEY            ← must match exactly
```

### Bug 4 — Memory saving to wrong folder

**Problem:** Conversations not being saved, or saved in wrong location.  
**Cause:** `DATA_DIR` path used `"../../data"` which went 2 levels above the project root.  
**Fix:** Use `"./data"` to save next to the server file.

```typescript
// ❌ Goes too far up the directory tree
const DATA_DIR = path.join(__dirname, "../../data");

// ✅ Creates data/ folder in the right place
const DATA_DIR = path.join(__dirname, "./data");
```

---

## 10. What's Next

### Step 5 — Multi-Agent

Instead of one agent doing everything, build an **orchestrator** that breaks tasks into pieces and delegates to specialist sub-agents.

```
User: "Research the top 3 AI agent frameworks and write a comparison report"

Orchestrator Agent
  ├── Search Agent    → searches for each framework
  ├── Analyst Agent   → summarizes findings per framework
  └── Writer Agent    → formats everything into a report
```

This is how production systems like AutoGPT and CrewAI work.

### Step 6 — RAG (Retrieval-Augmented Generation)

Give the agent access to **your own documents** — PDFs, markdown files, code — so it can answer questions about them.

```
Your docs → chunked + embedded → vector database
                                        ↓
User question → similarity search → relevant chunks → AI answer
```

Use cases: "Chat with your codebase", "Ask questions about a PDF", "Search your notes".

---

## How to share your whole project with Claude

Use **Repomix** to bundle your entire codebase into one file:

```bash
# Install once
npm install -g repomix

# Run inside your project folder
repomix

# Paste the generated repomix-output.txt into the chat
```

This gives Claude full context of your project in one paste — much better than copying files one by one.

---

*Document written by Claude · March 2026*
