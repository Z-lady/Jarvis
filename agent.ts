// ============================================================
// 🧠 agent.ts — Multi-Tool Agent  (Step 4)
//
// New in this version:
//   🔍 web_search   — Tavily real web search (was already here)
//   🧮 calculator   — accurate math, no hallucination
//   🌐 read_url     — fetch and read any webpage
//   🌤️  get_weather  — current weather for any city
//
// KEY LESSON: The AI reads ALL tool descriptions and decides
// on its own which tool to call for each situation.
// You never hardcode "use calculator for math questions" —
// the description does that work for you.
// ============================================================

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type AgentEvent =
  | { type: "thinking"; iteration: number }
  | { type: "tool_call"; name: string; query: string }
  | { type: "tool_result"; preview: string }
  | { type: "answer"; text: string }
  | { type: "error"; message: string };

// ─────────────────────────────────────────────────────────────
// 🔧 TOOL DEFINITIONS
//
// This is the most important part of Step 4.
// Notice how each description is very specific about WHEN
// to use it — this is what guides the AI's decision.
//
// Rule of thumb:
//   • Be explicit about what the tool is GOOD for
//   • Be explicit about what it should NOT be used for
//   • The more precise the description, the smarter the routing
// ─────────────────────────────────────────────────────────────
const tools = [
  // ── TOOL 1: Web Search ────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "web_search",
      // description:
      //   "Search the web for current, up-to-date information. " +
      //   "Use this for: recent news, current events, prices, people, " +
      //   "software versions, or any fact that may have changed recently. " +
      //   "Do NOT use for math calculations — use calculator instead.",

      description:
        "Search the web for current information on any topic. " +
        "Use for: news, people, prices, recent events, software versions. " +
        "Do NOT use for weather or temperature questions — use get_weather instead. " +
        "Do NOT use for math — use calculator instead.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A specific search query, e.g. 'TypeScript 5.0 new features'",
          },
        },
        required: ["query"],
      },
    },
  },

  // ── TOOL 2: Calculator ────────────────────────────────────
  // Why this matters: LLMs are notoriously bad at arithmetic.
  // They "hallucinate" wrong answers confidently.
  // A calculator tool bypasses this completely — the AI
  // generates the expression, your code evaluates it accurately.
  {
    type: "function" as const,
    function: {
      name: "calculator",
      description:
        "Evaluate a mathematical expression with 100% accuracy. " +
        "Use this for ANY math: arithmetic, percentages, unit conversions, " +
        "financial calculations, scientific formulas. " +
        "ALWAYS use this instead of doing math yourself — you make arithmetic errors.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description:
              "A valid JavaScript math expression. " +
              "Examples: '250 * 1.2', '(100 / 7) * 3', 'Math.sqrt(144)', " +
              "'Math.pow(2, 10)', '1500 * 0.08'",
          },
          explanation: {
            type: "string",
            description:
              "Brief note about what this calculates, e.g. 'price after 20% markup'",
          },
        },
        required: ["expression"],
      },
    },
  },

  // ── TOOL 3: Read URL ──────────────────────────────────────
  // Lets the agent actually READ a specific webpage —
  // not just search for it. Useful when the user pastes a URL,
  // or when a web_search result has a relevant link to follow up on.
  {
    type: "function" as const,
    function: {
      name: "read_url",
      description:
        "Fetch and read the text content of any webpage URL. " +
        "Use this when: the user shares a URL and asks about it, " +
        "or when you want to read the full content of a search result. " +
        "Returns the page's main text content.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL to fetch, including https://",
          },
        },
        required: ["url"],
      },
    },
  },

  // ── TOOL 4: Weather ───────────────────────────────────────
  // Uses Open-Meteo — completely free, no API key needed.
  // Shows how to chain tools: get_weather first geocodes the
  // city name to coordinates, then fetches weather data.
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      // description:
      //   "Get the current weather and today's forecast for any city. " +
      //   "Use this when the user asks about weather, temperature, " +
      //   "rain, wind, or whether to bring an umbrella.",

      description:
        "ALWAYS use this for ANY weather question — current conditions, " +
        "temperature, rain, wind, forecast, or 'should I bring an umbrella'. " +
        "Never use web_search for weather. This tool is faster and more accurate.",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description:
              "City name, e.g. 'Tokyo', 'New York', 'London', 'Kyiv'",
          },
        },
        required: ["city"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 🌐 TOOL IMPLEMENTATIONS
//
// Each function below is called when the AI requests that tool.
// The AI never runs these directly — your code does.
// ─────────────────────────────────────────────────────────────

// ── Calculator ────────────────────────────────────────────────
// Uses Function() to safely evaluate math expressions.
// Much safer than eval() — no access to variables or scope.
function runCalculator(expression: string, explanation?: string): string {
  try {
    // Only allow safe math characters — reject anything dangerous
    const safe =
      /^[0-9+\-*/().,\s%MathsqrtpowlogroundceilfloorPIabsminmax]+$/.test(
        expression,
      );
    if (!safe) return "Error: expression contains unsafe characters.";

    // eslint-disable-next-line no-new-func
    const result = new Function(
      `"use strict"; return (${expression})`,
    )() as number;

    if (!isFinite(result)) return "Error: result is not a finite number.";

    const formatted = Number.isInteger(result)
      ? result.toLocaleString()
      : parseFloat(result.toFixed(10)).toLocaleString();

    return explanation
      ? `${explanation}: ${formatted}`
      : `Result: ${formatted}`;
  } catch (err) {
    return `Calculation error: ${err instanceof Error ? err.message : "invalid expression"}`;
  }
}

// ── Read URL ──────────────────────────────────────────────────
// Fetches a webpage and strips HTML tags to return clean text.
// Limits to 3000 chars so it fits in the context window.
async function runReadUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)",
      },
      signal: AbortSignal.timeout(8000), // 8 second timeout
    });

    if (!res.ok) return `Failed to fetch URL: HTTP ${res.status}`;

    const html = await res.text();

    // Strip scripts, styles, then all HTML tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return "Page loaded but no readable text content found.";

    return `Content from ${url}:\n\n${text.slice(0, 3000)}${text.length > 3000 ? "\n\n[truncated...]" : ""}`;
  } catch (err) {
    return `Failed to read URL: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// ── Weather ───────────────────────────────────────────────────
// Step 1: geocode the city name → lat/lon (Open-Meteo geocoding API)
// Step 2: fetch current weather using those coordinates
// Both APIs are completely free with no key needed.
async function runGetWeather(city: string): Promise<string> {
  try {
    // Step 1 — Geocode city name to coordinates
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    );
    const geoData = (await geoRes.json()) as {
      results?: Array<{
        name: string;
        country: string;
        latitude: number;
        longitude: number;
      }>;
    };

    if (!geoData.results?.length) {
      return `Could not find city: "${city}". Try a different spelling.`;
    }

    const { name, country, latitude, longitude } = geoData.results[0];

    // Step 2 — Fetch current weather + hourly forecast
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
        `&timezone=auto&forecast_days=1`,
    );
    const w = (await weatherRes.json()) as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        weather_code: number;
      };
      daily: {
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
      };
    };

    // Decode WMO weather codes to human-readable descriptions
    const weatherDesc = decodeWeatherCode(w.current.weather_code);

    return [
      `Weather in ${name}, ${country}:`,
      `Condition: ${weatherDesc}`,
      `Temperature: ${w.current.temperature_2m}°C (feels like ${w.current.apparent_temperature}°C)`,
      `Humidity: ${w.current.relative_humidity_2m}%`,
      `Wind: ${w.current.wind_speed_10m} km/h`,
      `Today's range: ${w.daily.temperature_2m_min[0]}°C — ${w.daily.temperature_2m_max[0]}°C`,
      `Precipitation today: ${w.daily.precipitation_sum[0]} mm`,
    ].join("\n");
  } catch (err) {
    return `Weather lookup failed: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// WMO weather interpretation codes → readable strings
function decodeWeatherCode(code: number): string {
  const codes: Record<number, string> = {
    0: "Clear sky ☀️",
    1: "Mainly clear 🌤️",
    2: "Partly cloudy ⛅",
    3: "Overcast ☁️",
    45: "Foggy 🌫️",
    48: "Icy fog 🌫️",
    51: "Light drizzle 🌦️",
    53: "Drizzle 🌦️",
    55: "Heavy drizzle 🌧️",
    61: "Light rain 🌧️",
    63: "Rain 🌧️",
    65: "Heavy rain 🌧️",
    71: "Light snow 🌨️",
    73: "Snow 🌨️",
    75: "Heavy snow ❄️",
    77: "Snow grains 🌨️",
    80: "Light showers 🌦️",
    81: "Showers 🌧️",
    82: "Violent showers ⛈️",
    85: "Snow showers 🌨️",
    86: "Heavy snow showers ❄️",
    95: "Thunderstorm ⛈️",
    96: "Thunderstorm with hail ⛈️",
    99: "Heavy thunderstorm ⛈️",
  };
  return codes[code] ?? `Weather code ${code}`;
}

// ─────────────────────────────────────────────────────────────
// 🚦 TOOL ROUTER
// Receives a tool name + args from the AI, dispatches to the
// right implementation above. Add new tools here as you grow.
// ─────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, string>,
  tavilyKey: string,
): Promise<string> {
  switch (name) {
    case "web_search": {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tavilyKey}`,
        },
        body: JSON.stringify({
          query: args.query,
          search_depth: "basic",
          max_results: 5,
          include_answer: true,
        }),
      });
      if (!res.ok)
        return `Search failed (${res.status}). Answer from training knowledge.`;
      const data = (await res.json()) as {
        answer?: string;
        results?: Array<{ title: string; url: string; content: string }>;
      };
      const parts: string[] = [];
      if (data.answer) parts.push(`Summary: ${data.answer}\n`);
      data.results?.forEach((r, i) => {
        parts.push(
          `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 350)}`,
        );
      });
      return parts.join("\n\n") || "No results found.";
    }

    case "calculator":
      return runCalculator(args.expression, args.explanation);

    case "read_url":
      return await runReadUrl(args.url);

    case "get_weather":
      return await runGetWeather(args.city);

    default:
      return `Unknown tool: "${name}"`;
  }
}

// ─────────────────────────────────────────────────────────────
// 🔄 THE AGENT LOOP — unchanged from before
//
// The loop itself doesn't care how many tools exist.
// Adding tools only requires:
//   1. Adding to the tools[] array above
//   2. Handling in executeTool() above
// That's it — the loop is completely generic.
// ─────────────────────────────────────────────────────────────
export async function* runAgent(
  history: Message[],
  apiKey: string,
): AsyncGenerator<AgentEvent> {
  const messages: Message[] = [...history];
  const tavilyKey = process.env.TAVILY_API_KEY ?? "";

  let iteration = 0;
  const MAX_ITERATIONS = 10; // slightly higher — multi-tool tasks need more steps

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    yield { type: "thinking", iteration };

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Multi-Tool Agent",
        },
        body: JSON.stringify({
          model: "openrouter/auto",
          messages,
          tools,
          tool_choice: "auto",
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

    const { finish_reason, message } = data.choices[0];

    // ✅ Done
    if (finish_reason === "stop" || finish_reason === "end_turn") {
      yield { type: "answer", text: message.content ?? "(no response)" };
      return;
    }

    // 🔧 Tool use
    if (finish_reason === "tool_calls" && message.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments) as Record<
          string,
          string
        >;

        yield {
          type: "tool_call",
          name: fnName,
          query:
            fnArgs.query ??
            fnArgs.expression ??
            fnArgs.url ??
            fnArgs.city ??
            JSON.stringify(fnArgs),
        };

        const result = await executeTool(fnName, fnArgs, tavilyKey);
        yield { type: "tool_result", preview: result.slice(0, 220) };

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }
      continue;
    }

    if (message.content) {
      yield { type: "answer", text: message.content };
      return;
    }

    yield { type: "error", message: "Unexpected AI response." };
    return;
  }

  yield { type: "error", message: "Max iterations reached." };
}
