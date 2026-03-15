// ============================================================
// 🌐 server.ts — Express Server
//
// Responsibilities:
//   1. Serve the frontend (public/index.html)
//   2. Accept POST /api/chat with conversation history
//   3. Run the agent and stream events back via SSE
//   4. Expose GET /api/check so the UI can verify the key works
// ============================================================

import "dotenv/config"; // loads .env automatically
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runAgent, type Message } from "./agent.js";
import {
  listConversations,
  loadConversation,
  saveConversation,
  deleteConversation,
} from "./memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "./public")));

// ── GET /api/check ──────────────────────────────────────────
// The UI calls this on startup to verify the API key is set
app.get("/api/check", (_req, res) => {
  // const key = process.env.API_KEY ?? "";
  // const isSet = key.startsWith("sk-or-") && key.length > 20;
  // res.json({ ok: isSet });
  const orKey = process.env.API_KEY ?? "";
  const tvKey = process.env.TAVILY_API_KEY ?? "";
  res.json({
    ok: orKey.startsWith("sk-or-") && tvKey.startsWith("tvly-"),
    openrouter: orKey.startsWith("sk-or-"),
    tavily: tvKey.startsWith("tvly-"),
  });
});

// ── GET /api/conversations ───────────────────────────────────
// Returns the list of all saved conversations (no messages,
// just metadata: id, title, date, message count)
app.get("/api/conversations", (_req, res) => {
  res.json(listConversations());
});

// ── GET /api/conversations/:id ───────────────────────────────
// Returns a single conversation WITH all its messages
// Used when the user clicks a past chat in the sidebar
app.get("/api/conversations/:id", (req, res) => {
  const conv = loadConversation(req.params.id);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json(conv);
});

// ── DELETE /api/conversations/:id ────────────────────────────
app.delete("/api/conversations/:id", (req, res) => {
  const ok = deleteConversation(req.params.id);
  res.json({ ok });
});


// ── POST /api/chat ──────────────────────────────────────────
// Main endpoint — receives message history, streams agent events
// back to the browser using Server-Sent Events (SSE)
app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.API_KEY ?? "";

  if (!apiKey.startsWith("sk-or-")) {
    res.status(401).json({ error: "API_KEY not set in .env" });
    return;
  }

  const { messages } = req.body as { messages: Message[] };

  // SSE setup — keeps the HTTP connection open 
  // and lets us write multiple events over time
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Stream each agent event directly to the browser
    for await (const event of runAgent(messages, apiKey)) {
      send(event);
    }
  } catch (err: unknown) {
    send({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown server error",
    });
  }

  res.end();
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  const key = process.env.API_KEY ?? "";
  const keyStatus = key.startsWith("sk-or-") ? "✅ found" : "❌ NOT SET — edit .env first!";

  console.log(`
╔═══════════════════════════════════════════╗
║         🤖  Web Search Agent               ║
╠═══════════════════════════════════════════╣
║  URL  →  http://localhost:${PORT}         ║
║  Key  →  API_KEY ${keyStatus}
╚═══════════════════════════════════════════╝
  `);
});
