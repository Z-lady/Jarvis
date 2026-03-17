// ============================================================
// 💾 memory.ts — Persistent Memory
//
// This is Step 2 of agent development: giving your agent
// a real memory that survives restarts.
//
// How it works:
//   - Every conversation is saved as a JSON file on disk
//   - Each conversation has a unique ID and a title
//   - The agent can load any past conversation and continue it
//
// File structure on disk:
//   data/
//     conversations.json   ← index of all conversations
//     conv_abc123.json     ← individual conversation messages
//     conv_def456.json
//     ...
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Message } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where we store all conversation files
const DATA_DIR = path.join(__dirname, "./data");
const INDEX_FILE = path.join(DATA_DIR, "conversations.json");

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Conversation {
  id: string; // unique ID, e.g. "conv_1714000000000"
  title: string; // auto-generated from first message
  createdAt: string; // ISO date string
  updatedAt: string;
  messageCount: number;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

// ─────────────────────────────────────────────────────────────
// 🗂️ Setup — make sure the data directory exists
// ─────────────────────────────────────────────────────────────
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify([], null, 2));
  }
}

// ─────────────────────────────────────────────────────────────
// 📖 Read the index (list of all conversations)
// ─────────────────────────────────────────────────────────────
function readIndex(): Conversation[] {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8")) as Conversation[];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ✏️ Write the index back to disk
// ─────────────────────────────────────────────────────────────
function writeIndex(conversations: Conversation[]) {
  ensureDataDir();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(conversations, null, 2));
}

// ─────────────────────────────────────────────────────────────
// 🆔 Generate a unique conversation ID
// ─────────────────────────────────────────────────────────────
function generateId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────
// 🏷️ Auto-generate a title from the first user message
// Keeps it short and readable in the sidebar
// ─────────────────────────────────────────────────────────────
function generateTitle(firstMessage: string): string {
  return firstMessage.length > 50
    ? firstMessage.slice(0, 50).trim() + "…"
    : firstMessage.trim();
}

// ─────────────────────────────────────────────────────────────
// 📋 LIST all conversations (for the sidebar)
// Returns metadata only — not the full messages
// ─────────────────────────────────────────────────────────────
export function listConversations(): Conversation[] {
  return readIndex().sort(
    // Most recently updated first
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

// ─────────────────────────────────────────────────────────────
// 📂 LOAD a single conversation with all its messages
// ─────────────────────────────────────────────────────────────
export function loadConversation(id: string): ConversationWithMessages | null {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${id}.json`);

  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf-8"),
    ) as ConversationWithMessages;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 💾 SAVE messages to a conversation
//
// If the conversation doesn't exist yet → create it (NEW)
// If it already exists → append the new messages (UPDATE)
//
// This is called after every agent response so nothing is lost
// ─────────────────────────────────────────────────────────────
export function saveConversation(
  id: string | null,
  messages: Message[],
): Conversation {
  ensureDataDir();

  const now = new Date().toISOString();
  const index = readIndex();

  // Find the first user message to use as the title
  const firstUserMsg =
    messages.find((m) => m.role === "user")?.content ?? "New conversation";

  if (id && index.find((c) => c.id === id)) {
    // ── UPDATE existing conversation ──────────────────────
    const meta = index.find((c) => c.id === id)!;
    meta.updatedAt = now;
    meta.messageCount = messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    ).length;

    writeIndex(index);

    // Save full messages to individual file
    const conv: ConversationWithMessages = { ...meta, messages };
    fs.writeFileSync(
      path.join(DATA_DIR, `${id}.json`),
      JSON.stringify(conv, null, 2),
    );

    return meta;
  } else {
    // ── CREATE new conversation ───────────────────────────
    const newId = id ?? generateId();
    const meta: Conversation = {
      id: newId,
      title: generateTitle(firstUserMsg),
      createdAt: now,
      updatedAt: now,
      messageCount: messages.filter(
        (m) => m.role === "user" || m.role === "assistant",
      ).length,
    };

    index.push(meta);
    writeIndex(index);

    const conv: ConversationWithMessages = { ...meta, messages };
    fs.writeFileSync(
      path.join(DATA_DIR, `${newId}.json`),
      JSON.stringify(conv, null, 2),
    );

    return meta;
  }
}

// ─────────────────────────────────────────────────────────────
// 🗑️ DELETE a conversation (removes from index + deletes file)
// ─────────────────────────────────────────────────────────────
export function deleteConversation(id: string): boolean {
  ensureDataDir();

  const index = readIndex();
  const exists = index.find((c) => c.id === id);
  if (!exists) return false;

  // Remove from index
  const updated = index.filter((c) => c.id !== id);
  writeIndex(updated);

  // Delete the message file
  const filePath = path.join(DATA_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return true;
}
