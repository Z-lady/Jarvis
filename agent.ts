// ============================================================
// 🧠 agent.ts — The Agent Brain
//
// This file contains everything that makes our app an "agent"
// rather than a simple chatbot:
//
//   1. TOOL DEFINITIONS  — tell the AI what tools exist
//   2. TOOL EXECUTION    — actually run the tools
//   3. AGENT LOOP        — keep going until the AI is done
//
// OpenRouter gives us access to FREE models (like Mistral,
// LLaMA, Gemma) using the same OpenAI-compatible API format.
// ============================================================

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string; // needed when role is "tool"
  tool_calls?: ToolCall[]; // present on assistant messages that call tools
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// Events we stream back to the browser
export type AgentEvent =
  | { type: "thinking"; iteration: number }
  | { type: "tool_call"; name: string; query: string }
  | { type: "tool_result"; preview: string }
  | { type: "answer"; text: string }
  | { type: "error"; message: string };

// ─────────────────────────────────────────────────────────────
// 🔧 STEP 1 — Tool Definitions
//
// This JSON tells the AI:
//   - what tools exist
//   - what each tool does (the description is crucial!)
//   - what parameters each tool needs
//
// The AI reads these descriptions and DECIDES on its own
// when to call a tool. You never hardcode "call search now".
// ─────────────────────────────────────────────────────────────
const tools = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Search the web for current, up-to-date information on any topic. " +
        "Use this when the question requires recent facts, news, prices, events, " +
        "or anything that may have changed after your training data cutoff.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A clear, specific search query (e.g. 'best TypeScript agent frameworks 2025')",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 🌐 STEP 2 — Tool Execution
//
// When the AI says "call web_search with query X",
// THIS function actually runs it.
//
// We use DuckDuckGo's free Instant Answer API —
// no key needed, works great for factual queries.
// ─────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, string>,
): Promise<string> {
  if (name === "web_search") {
    const { query } = args;
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "AgentDemo/1.0" },
      });
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        Answer?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };

      const parts: string[] = [];

      if (data.Answer) {
        parts.push(`Direct answer: ${data.Answer}`);
      }

      if (data.AbstractText) {
        parts.push(`Summary: ${data.AbstractText}`);
        if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
      }

      if (data.RelatedTopics?.length) {
        parts.push("\nRelated results:");
        data.RelatedTopics.slice(0, 5).forEach((t) => {
          if (t.Text) {
            parts.push(`• ${t.Text}`);
            if (t.FirstURL) parts.push(`  → ${t.FirstURL}`);
          }
        });
      }

      return parts.length > 0
        ? parts.join("\n")
        : "No results found for that query. Try rephrasing it.";
    } catch (err) {
      return `Search failed: ${err instanceof Error ? err.message : "Unknown error"}. Please answer from your training knowledge.`;
    }
  }

  return `Tool "${name}" is not implemented.`;
}

// ─────────────────────────────────────────────────────────────
// 🔄 STEP 3 — The Agent Loop
//
// This is the core pattern of EVERY AI agent:
//
//   while (not done) {
//     ask AI → did it want a tool?
//       yes → run the tool → send result back → repeat
//       no  → return the final answer
//   }
//
// We use an async generator (*) so we can STREAM each step
// back to the browser in real time — you see the tool calls
// as they happen, not just the final answer.
// ─────────────────────────────────────────────────────────────
export async function* runAgent(
  history: Message[],
  apiKey: string,
): AsyncGenerator<AgentEvent> {
  // Clone so we don't mutate the caller's array
  const messages: Message[] = [...history];

  let iteration = 0;
  const MAX_ITERATIONS = 8; // Safety cap — prevents infinite loops

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    yield { type: "thinking", iteration };

    // ── Call the AI via OpenRouter ──────────────────────────
    // OpenRouter uses the exact same format as OpenAI's API,
    // just with a different base URL and your OpenRouter key.
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000", // OpenRouter requires this
          "X-Title": "Web Search Agent Demo",
        },
        body: JSON.stringify({
          // 🆓 FREE model — no cost at all!
          // Other free options: "google/gemma-3-27b-it:free", "meta-llama/llama-3.1-8b-instruct:free"
          model: "openrouter/free",
          messages,
          tools,
          tool_choice: "auto", // let the AI decide when to use tools
          max_tokens: 1024,
        }),
      },
    );
    if (!response.ok) {
      const err = await response.text();
      yield { type: "error", message: `API error ${response.status}: ${err}` };
      return;
    }

    const data = (await response.json()) as {
      choices: Array<{
        finish_reason: string;
        message: {
          content: string | null;
          tool_calls?: ToolCall[];
        };
      }>;
    };

    const choice = data.choices[0];
    const { finish_reason, message } = choice;

    // ── ✅ DONE — AI has a final answer ────────────────────
    if (finish_reason === "stop" || finish_reason === "end_turn") {
      const text = message.content ?? "(no response)";
      yield { type: "answer", text };
      return;
    }

    // ── 🔧 TOOL USE — AI wants to call a tool ──────────────
    if (finish_reason === "tool_calls" && message.tool_calls?.length) {
      // Add the AI's tool-call request to history
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.tool_calls,
      });

      // Process each tool call the AI requested
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments) as Record<
          string,
          string
        >;

        yield {
          type: "tool_call",
          name: fnName,
          query: fnArgs.query ?? JSON.stringify(fnArgs),
        };

        // Actually run the tool
        const result = await executeTool(fnName, fnArgs);

        yield { type: "tool_result", preview: result.slice(0, 200) };

        // Add tool result to history so AI can see it next iteration
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Loop continues — AI will now read the tool results
      continue;
    }

    // ── Fallback: treat any text response as final answer ──
    if (message.content) {
      yield { type: "answer", text: message.content };
      return;
    }

    yield { type: "error", message: "Unexpected response from AI." };
    return;
  }

  yield { type: "error", message: "Max iterations reached — agent stopped." };
}
