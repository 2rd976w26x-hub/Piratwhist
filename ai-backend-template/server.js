/*
  Piratwhist lokal AI backend (Ollama) – template
  Opdater SYSTEM_PROMPT så modellen kan returnere {answer, image}.
*/

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use(cors({ origin: "*" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 15 }));

const SYSTEM_PROMPT = `
Du er en meget præcis regel- og UI-assistent for Piratwhist.
Svar altid på dansk.

KRAV:
- Svar kort (1–4 sætninger)
- Forklar hvorfor noget er tilladt/ikke tilladt, når relevant
- Hvis spørgsmålet handler om hvor man skal trykke i UI'et, så returnér også et billed-id.

BILLED-ID'er du må bruge (valgfrit felt "image"):
play-card, bid-button, confirm-button, rules-button, leave-button, admin-button

FORMAT:
- Normale spørgsmål: returnér ren tekst.
- UI-klik spørgsmål: returnér JSON som:
  {"answer":"...","image":"rules-button"}
`;

app.post("/ask", async (req, res) => {
  try {
    const { question, game } = req.body || {};
    if (!question || typeof question !== "string" || question.length > 300) {
      return res.status(400).json({ error: "Ugyldigt spørgsmål" });
    }

    const context = `
Aktuel spilfase: ${game?.phase || "ukendt"}
Har spilleren tur lige nu: ${game?.myTurn === true ? "ja" : "nej/ukendt"}
Første farve i stikket (lead suit): ${game?.leadSuit || "ingen"}
`;

    const prompt = `${SYSTEM_PROMPT}\n\nSPILSTATUS:\n${context}\nSPØRGSMÅL:\n${question}\n\nSVAR:`;

    const r = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.1", prompt, stream: false })
    });

    if (!r.ok) return res.status(502).json({ error: "Ollama-fejl" });

    const data = await r.json();
    res.json({ answer: (data.response || "").trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI-fejl" });
  }
});

app.listen(3001, () => console.log("AI backend på http://localhost:3001"));
