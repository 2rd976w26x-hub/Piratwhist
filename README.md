# Piratwhist – Scorekeeper (v0.0.4)

## Rettelse
- **Der tælles ikke point fra omgange som ikke er færdige.**
  - En runde tæller først, når alle spillere har udfyldt både **bud** og **stik** (0 er ok). Tomt felt = ikke færdig.
- Point pr. spiller pr. færdig runde:
  - Rammer man bud præcist: **10 + bud**
  - Ellers: **-abs(stik - bud)**

## Deploy på Render (Python Web Service)
**Build Command:**
- `pip install -r requirements.txt`

**Start Command:**
- `gunicorn app:app`
