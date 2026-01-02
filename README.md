# Piratwhist – Scorekeeper (v0.1.3)

## Rum / multiplayer ✅
- Opret rum og få en 6-tegns kode
- Join rum med koden
- Opsætning, bud, stik og point synkroniseres i real-time for alle i rummet

## Render (Python 3.13) – vigtig rettelse
Render kører Python **3.13**, og `eventlet` fejler pt. pga. ændringer i `threading`.
Derfor kører vi Socket.IO i **threading**-mode (long-polling).

**Build Command:** `pip install -r requirements.txt`

**Start Command (anbefalet):
`gunicorn -w 1 -k gthread --threads 8 app:app`

> Hvis du bruger en anden host, må du gerne beholde 1 worker for at undgå room-state split mellem workers
> (rum-state ligger i memory i denne simple version).

## Lokalt
- `pip install -r requirements.txt`
- `python app.py`
- Åbn `http://localhost:5000/`


## Socket.IO klient
Appen loader Socket.IO klientbiblioteket fra Socket.IO CDN (v4), som matcher python-socketio 5.x.
