# Piratwhist – Scorekeeper (v0.0.2)

En lille offline web-app til at holde styr på bud, stik og point i kortspillet **Piratwhist**.

## Features
- 2–8 spillere (navne)
- 4–14 runder (default 14)
- Bud pr. runde pr. spiller (0..max, hvor 0 altid er tilladt)
- Stik taget pr. runde pr. spiller (0..max)
- Point:
  - Rammer man bud præcist: **+10**
  - Ellers: **-abs(stik - bud)** (minus 1 pr. stik man rammer ved siden af)
- Automatisk gem/restore i browseren via `localStorage`

## Kør lokalt
Åbn `piratwhist.html` i en browser.

Valgfrit (local server):
- Python: `python -m http.server 8000`
- Åbn derefter `http://localhost:8000/piratwhist.html`

## Filer
- `piratwhist.html`
- `piratwhist.css`
- `piratwhist.js`
