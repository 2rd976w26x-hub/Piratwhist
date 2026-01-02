# Piratwhist – Scorekeeper (v0.0.3)

En lille web-app til at holde styr på bud, stik og point i kortspillet **Piratwhist**.

## Point
- Rammer man bud præcist: **+10**
- Ellers: **-abs(stik - bud)** (minus 1 pr. stik man rammer ved siden af)

## Deploy på Render som Python Web Service (B)
Dette repo indeholder en minimal Flask-server, så Render kan bygge og starte korrekt.

**Build Command (Render):**
- `pip install -r requirements.txt`

**Start Command (Render):**
- `gunicorn app:app`

Appen serveres på `/`.

## Lokalt
- `pip install -r requirements.txt`
- `python app.py` (eller `gunicorn app:app`)
- Åbn: `http://localhost:5000/`

## Filer
- `piratwhist.html`
- `piratwhist.css`
- `piratwhist.js`
- `app.py`
- `requirements.txt`
