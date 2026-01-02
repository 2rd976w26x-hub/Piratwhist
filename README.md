# Piratwhist – Scorekeeper (v0.1.0)

## Nyt i v0.1.0: Rum / multiplayer ✅
- Opret rum og få en 6-tegns kode
- Join rum med koden
- Opsætning, bud, stik og point synkroniseres i real-time for alle i rummet

## Render (Python Web Service)
**Build Command:** `pip install -r requirements.txt`

**Start Command:** `gunicorn -k eventlet -w 1 app:app`

> Socket.IO kræver en async worker. På Render fungerer `eventlet` godt.

## Lokalt
- `pip install -r requirements.txt`
- `python app.py`
- Åbn `http://localhost:5000/`
