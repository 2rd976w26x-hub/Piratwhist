# AI help billeder (Spørg AI 🤖)

Denne version understøtter, at AI-svaret kan vise et lille hjælpebillede i AI-popuppen.

## Hvordan virker det?
Backend skal returnere JSON med felterne:

- `answer` (tekst)
- `image` (valgfrit) — et billede-id uden filendelse

Eksempel:
```json
{ "answer": "Tryk på 'Regler' knappen.", "image": "rules-button" }
```

Frontend viser så automatisk:
`/assets/ai-help/rules-button.png`

## Medsendte eksempel-billeder
Billederne ligger her:

`assets/ai-help/`

Du kan frit udskifte dem med dine egne screenshots/crops (samme filnavne).

## Foreslåede image-id’er
- `play-card`
- `bid-button`
- `confirm-button`
- `rules-button`
- `leave-button`
- `admin-button`

## Backend prompt-tip (Ollama)
Tilføj i dit `SYSTEM_PROMPT`:

- Hvis spørgsmålet handler om hvor man skal trykke, så returnér også `image` fra listen ovenfor.
- Svar gerne i JSON for UI-spørgsmål.
