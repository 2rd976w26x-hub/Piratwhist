/*
  Piratwhist lokal AI backend (Ollama) – template v1.2.1
  - Læser regler + UI-viden fra ./knowledge/piratwhist_knowledge.json
  - Finder de mest relevante afsnit og sender dem med i prompten (RAG light)
*/

const fs = require("fs");
const path = require("path");

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json({ limit: "20kb" }));

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.options("*", cors());

app.use(rateLimit({ windowMs: 60 * 1000, max: 30 }));

// --- Load knowledge (rules + UI) from the game bundle ---
const KNOWLEDGE_PATH = path.join(__dirname, "knowledge", "piratwhist_knowledge.json");
let KNOWLEDGE = { rules: [], ui: [] };
try {
  KNOWLEDGE = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, "utf8"));
  console.log(`[knowledge] loaded: rules=${KNOWLEDGE.rules?.length || 0}, ui=${KNOWLEDGE.ui?.length || 0}`);
} catch (e) {
  console.warn("[knowledge] could not load piratwhist_knowledge.json:", e?.message || e);
}

// Simple keyword matcher (fast + good enough for rules/UI)
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-zæøå0-9]+/gi, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

function scoreEntry(tokens, entryText) {
  const hay = (" " + String(entryText || "").toLowerCase() + " ");
  let score = 0;
  for (const t of tokens) {
    // crude but effective: count token occurrences
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const m = hay.match(re);
    if (m) score += m.length;
  }
  return score;
}

function getRelevantSnippets(question, k = 4) {
  const tokens = tokenize(question);
  const candidates = [];

  for (const r of (KNOWLEDGE.rules || [])) {
    const s = scoreEntry(tokens, `${r.title || ""} ${r.text || ""}`);
    if (s > 0) candidates.push({ kind: "RULE", score: s, title: r.title || r.id || "Regel", text: r.text || "" });
  }
  for (const u of (KNOWLEDGE.ui || [])) {
    const s = scoreEntry(tokens, `${u.title || ""} ${u.text || ""}`);
    if (s > 0) candidates.push({ kind: "UI", score: s, title: u.title || u.id || "UI", text: u.text || "" });
  }

  // If no hits, fall back to the most important basics (first 2 rules + 1 ui)
  if (candidates.length === 0) {
    const fallback = [];
    const basics = (KNOWLEDGE.rules || []).slice(0, 2).map(r => ({ kind: "RULE", score: 1, title: r.title || r.id || "Regel", text: r.text || "" }));
    const ui = (KNOWLEDGE.ui || []).slice(0, 1).map(u => ({ kind: "UI", score: 1, title: u.title || u.id || "UI", text: u.text || "" }));
    return fallback.concat(basics, ui).slice(0, k);
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, k);
}

const SYSTEM_PROMPT = `
Du er en meget præcis regel- og UI-assistent for Piratwhist.
Svar altid på dansk.

DU MÅ KUN bruge viden fra afsnittet "KILDER" nedenfor (regler + UI).
Hvis svaret ikke kan udledes fra KILDER, så sig: "Det står ikke i reglerne/denne UI-vejledning."

KRAV:
- Svar kort (1–4 sætninger).
- Forklar hvorfor noget er tilladt/ikke tilladt, hvis relevant.
- Hvis spørgsmålet handler om hvor man skal trykke i UI'et, så returnér JSON med felterne:
  {"answer":"...","image":"<id>"}

BILLED-ID'er du må bruge (valgfrit felt "image"):
play-card, bid-button, confirm-button, rules-button, leave-button, admin-button, ask-ai
`;

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "piratwhist-local-ai", time: new Date().toISOString() });
});

app.post("/ask", async (req, res) => {
  try {
    const { question, game } = req.body || {};
    if (!question || typeof question !== "string" || question.length > 500) {
      return res.status(400).json({ error: "Ugyldigt spørgsmål" });
    }

    const context = `
Aktuel spilfase: ${game?.phase || "ukendt"}
Har spilleren tur lige nu: ${game?.myTurn === true ? "ja" : "nej/ukendt"}
Første farve i stikket (lead suit): ${game?.leadSuit || "ingen"}
Antal spillere: ${game?.players || "ukendt"}
`;

    const snippets = getRelevantSnippets(question, 5);
    const sources = snippets.map(s => `- [${s.kind}] ${s.title}: ${s.text}`).join("\n");

    const prompt =
`${SYSTEM_PROMPT}

KILDER (brug kun dette):
${sources}

SPILSTATUS:
${context}

SPØRGSMÅL:
${question}

SVAR:`;

    const r = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.1",
        prompt,
        stream: false,
        options: { temperature: 0.2 }
      })
    });

    if (!r.ok) return res.status(502).json({ error: "Ollama-fejl" });

    const data = await r.json();
    const out = (data.response || "").trim();

    // If the model returns JSON, pass it through; otherwise wrap as {answer}
    if (out.startsWith("{") && out.endsWith("}")) {
      try {
        const parsed = JSON.parse(out);
        if (parsed && typeof parsed === "object") return res.json(parsed);
      } catch {}
    }

    res.json({ answer: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI-fejl" });
  }
});

app.listen(3001, () => console.log("AI backend på http://localhost:3001"));
