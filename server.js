// =======================================
// Piratwhist AI Backend – STABLE VERSION
// Node 18+ / 20+ / 24+ compatible
// =======================================

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3001;

// ---------- Middleware ----------
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// ---------- Config ----------
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "mistral";
const OLLAMA_CMD = `ollama run ${OLLAMA_MODEL}`;

const PIPER_EXE = process.env.PIPER_EXE || "C:\\piper\\piper.exe";
const PIPER_MODEL =
  process.env.PIPER_MODEL ||
  "C:\\piper\\voices\\da_DK-talesyntese-medium.onnx";

const KNOWLEDGE_PATH = path.join(
  __dirname,
  "knowledge",
  "piratwhist_knowledge.json"
);

// ---------- Load knowledge ----------
let KNOWLEDGE = { rules: [], ui: [] };

function loadKnowledge() {
  try {
    const raw = fs.readFileSync(KNOWLEDGE_PATH, "utf8");
    const json = JSON.parse(raw);
    KNOWLEDGE.rules = Array.isArray(json.rules) ? json.rules : [];
    KNOWLEDGE.ui = Array.isArray(json.ui) ? json.ui : [];
    console.log(
      `✅ Knowledge loaded (rules=${KNOWLEDGE.rules.length}, ui=${KNOWLEDGE.ui.length})`
    );
  } catch (e) {
    console.error("❌ Failed to load knowledge:", e.message);
  }
}
loadKnowledge();

// ---------- Helpers ----------
function tokenize(txt) {
  return String(txt || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function score(questionTokens, text) {
  const t = text.toLowerCase();
  let s = 0;
  for (const w of questionTokens) if (t.includes(w)) s++;
  return s;
}

function findRelevantChunks(question, max = 6) {
  const tokens = tokenize(question);
  const all = [
    ...KNOWLEDGE.rules.map((x) => ({ type: "regel", text: x.text })),
    ...KNOWLEDGE.ui.map((x) => ({ type: "ui", text: x.text })),
  ];

  return all
    .map((c) => ({ ...c, score: score(tokens, c.text) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((c) => `(${c.type}) ${c.text}`);
}

function buildPrompt(question, game) {
  const sources = findRelevantChunks(question);

  return `
Du er hjælper til kortspillet Piratwhist.

VIGTIGT:
- Brug KUN information fra [KILDER].
- Gæt aldrig.
- Hvis svaret ikke findes i [KILDER], så skriv: "Det står ikke i reglerne/vejledningen i denne version."
- Svar kort, klart og på dansk.

[SPILSTATUS]
${JSON.stringify(game || {}, null, 0)}

[KILDER]
${sources.length ? "- " + sources.join("\n- ") : "- (Ingen relevante kilder)"}

[SPØRGSMÅL]
${question}
`.trim();
}

function runOllama(prompt) {
  return new Promise((resolve, reject) => {
    const child = exec(OLLAMA_CMD, { maxBuffer: 1024 * 1024 });

    let output = "";
    let timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error("Ollama timeout"));
    }, 30000);

    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", () => {});

    child.on("close", () => {
      clearTimeout(timeout);
      resolve(output.trim());
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ---------- Routes ----------
app.get("/", (req, res) => {
  res.send("Piratwhist AI backend kører ✅");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "piratwhist-local-ai",
    model: OLLAMA_MODEL,
    knowledge: {
      rules: KNOWLEDGE.rules.length,
      ui: KNOWLEDGE.ui.length,
    },
    time: new Date().toISOString(),
  });
});

app.post("/ask", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Missing question" });

  try {
    const prompt = buildPrompt(question, req.body.game || {});
    const answer = await runOllama(prompt);
    res.json({ answer });
  } catch (e) {
    console.error("AI error:", e.message);
    res.status(500).json({ error: "AI failed" });
  }
});

app.post("/speak", (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "No text" });

  const outFile = path.join(__dirname, "tts.wav");
  const cmd =
    `echo "${text.replace(/"/g, "")}" | ` +
    `"${PIPER_EXE}" --model "${PIPER_MODEL}" --output_file "${outFile}"`;

  exec(cmd, (err) => {
    if (err) return res.status(500).json({ error: "TTS failed" });
    res.setHeader("Content-Type", "audio/wav");
    fs.createReadStream(outFile).pipe(res);
  });
});

// ---------- Start ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🤖 Piratwhist AI backend kører på http://127.0.0.1:${PORT}`);
});
