# Piratwhist – Scorekeeper (v1.0.8)

## MASTERPROMPT – PIRATWHIST

(Konsolideret v2 – autoritativ)



TEKNISKE KRAV:
- Følg eksisterende kodekonventioner slavisk.
- Match whitespace, indrykning og navngivning.
- Bevar output-format, rækkefølge og sideeffekter.

FORBUDTE HANDLINGER:
- “For en sikkerheds skyld”-ændringer
- Optimeringer
- Forbedret performance
- Ekstra logging
- Fejlhåndtering der ikke er bedt om
- Forkortelser eller omskrivning af logik

SELVTJEK (SKAL UDFØRES FØR SVAR):
- Har jeg ændret noget, jeg ikke blev bedt om?
- Har jeg fjernet eller omdøbt noget?
- Har jeg tilføjet funktionalitet?
Hvis JA → RET SVARET.

0) Formål og ansvar

Du overtager vedligeholdelse og videreudvikling af Piratwhist, et online whist-lignende kortspil med bots samt et fysisk spil (digital scoretavle).

Du må ikke:

ødelægge eksisterende funktioner

bryde UI-, layout- eller animationskontrakter

ændre spillets regler uden eksplicit godkendelse

Alt arbejde skal ske inkrementelt og kontrolleret.

1) Stabil baseline og versionsregler (KRITISK)
Baseline

Der arbejdes altid ud fra seneste stabile ZIP.
Hvis noget bliver ustabilt, rulles der tilbage til sidste godkendte ZIP.

Versionskontrakt (MEGET VIGTIGT)

Ved hver ny ZIP/release:

Versionsformat: v0.2.xx

Versionsnummer SKAL opdateres ALLE steder:

ZIP-filnavn

alle relevante HTML-sider

relevante JavaScript-filer (visning i UI/HUD/footer)

README / dokumentation

Der må kun eksistere én ZIP pr version

Ingen “glemte versioner”

Release-script

Brug scripts/release.sh for at sikre, at versionen er opdateret alle relevante steder:

  scripts/release.sh check

Opdatering af version (v0.2.xx) i alle påkrævede UI/dokumentationsfiler:

  scripts/release.sh bump v0.2.xx

2) Kortdesign – fast kontrakt (KRITISK)
Kortbagside (LÅST)

Der findes én og kun én kortbagside

Motiv: 2 personer + 4 sommerfugle

Ingen variationer, ingen placeholders

Bruges til:

skjulte modstander-kort

eget kort i 1-korts-runder (før bud)

stik-bunker

deal/ghost-kort

Kortforsider

52 kort, standard kulører: ♠ ♥ ♦ ♣

SVG/pips-baseret rendering (skalerbart)

Klassisk struktur:

værdi i to hjørner

kulørsymbol i midten (gentaget)

Billedkort (J/Q/K):

tekst + symbol

ingen figurer

PNG-kort kan bruges, hvis de matcher samme mapping og ID’er

Alle designændringer:

starter i /cards_gallery.html

godkendes visuelt før spil/guide/regler opdateres

3) Spiltype og grundregler

2–8 spillere

1 menneske + 1+ bots

Ét standard kortspil (52 kort)

Spar er altid trumf

Man skal bekende kulør, hvis muligt

Højeste kort vinder stikket (trumf slår alt)

4) Rundestruktur og kortantal (KRITISK)

Antal kort pr spiller beregnes som:

cardsPer = min(requestedForRound, floor(52 / nPlayers))


Der må aldrig:

genbruges kort

mangle kort

Minimum: 1 kort pr spiller

5) Udlæg og spiller-rækkefølge (LÅST)
Fast regel

Spillerækkefølgen går ALTID med uret (clockwise)
set oppefra bordet

Gælder for:

mobil

PC

online spil

fysisk spil

⚠️ Visuel placering må aldrig ændre den logiske rækkefølge.

6) Særregel – 1-korts-runde (KRITISK)

Når der kun er 1 kort pr spiller:

Spilleren ser ikke sit eget kort før bud

Spilleren ser alle modstanderes kort (forsider)

Eget kort vises som bagside

Gælder for alle spillere symmetrisk

Gælder både online og fysisk spil

7) Server / client arkitektur (autoritativ server)

Server styrer al game-state

Client er “dum”:

viser state

sender input

Ingen race conditions

Ingen handlinger under animationer

Bots må aldrig handle under animation

8) Animationer (LÅST KONTRAKT)
Kort spilles (kort-ind)

Kort flyver fra spiller til bord

Varighed: 2 sek

Stik tages (sweep)

Alle kort flyver samlet til vinderen

Varighed: 2 sek

Timing-regler (KRITISK)

Sweep starter aldrig før kort-ind er færdig

Næste stik starter aldrig før sweep er færdig

Ingen ekstra effekter (ingen “winner glow”)

9) Deal-animation

Deal vises kun for lokal spiller

Kort flyver til håndens slots

Deal-bunken:

kun synlig under deal

må ikke vises på play-board

bruger officiel kortbagside

10) Layout-kontrakt v3 (MEGET VIGTIG)
Mobil vs PC
if (isMobile()) useGridLayout();
else useRingLayout();


Der må aldrig blandes layouts.

Mobil (PORTRÆT – grid)

Brug faste slots:

T, TL, TR, ML, MR, BL, BR, B (lokal spiller)

Layout defineres pr playercount (2–8)
– ikke dynamisk beregning

8 spillere er reference-layout

3–4 spillere bruger eksplicit vertikal komprimering

Mobil scroll-kontrakt

Spilfladen er låst i viewport

Scroll er kun tilladt ned til:

point/resultattabel

Hånd, knapper og HUD:

må ikke overlappe tabellen

må ikke flytte sig under scroll

PC (ring)

Bundramme er fjernet

HUD i hjørner

“No-fly zones” er tilladt

4 spillere må have fast (ikke trig-baseret) placering

11) CSS stacking-order (LÅST)

Lav → høj:

Sidebaggrund

Spilleplade

Midter-stik

Seats

Hånd

HUD / bund-bar

Flyve-/ghost-kort

Modals / debug

Ghost-kort:

position: fixed

meget høj z-index

pointer-events: none

12) Seats – indhold

Hvert seat viser:

navn (max 2 linjer)

bud

stik (tekst + visuelt)

stik-bunke (destination for sweep)

Navne:

må aldrig bryde layout

må forkortes (ellipsis)

fuldt navn skal kunne ses:

tooltip (PC)

tap/long-press (mobil)

13) Resultattabel (LÅST)

Én samlet tabel

Total øverst (kun point)

Seneste runde under

Ældre runder nederst

Celleformat:

bud / stik (point)


Ingen separate “Aktuel” vs “Historik”.

14) Fysisk spil vs online spil
Regler

Identiske regler

Forskel

Fysisk spil:

bud og stik indtastes manuelt

Online spil:

alt registreres automatisk

15) Guide / Regel-mode (NY – FAST)

Formål:

regler

illustrationer

screenshots

Aktiveres via:

?guide=1&scene=...


Kendetegn:

ingen server/socket

ingen timers

ingen input

frossen game-state

Regelsiden:

viser illustrationer inline

mobil: kompakt

PC: stor

via iframe + clean=1

16) Stabilitet på mobil (KRITISK)
Input-kontrakt

Touch/scroll må aldrig kunne låse kort-udspil

pointercancel / touchcancel må ikke efterlade locks

visibilitychange/pagehide skal nulstille animation-gates sikkert

Debug / freeze-logging

Client skal have ring-buffer logger

Ved “din tur” + ingen state-advance i X sek:

dump log

mulighed for kopi / rapport

Debug skal være skjult i normal drift

Aktiveres via:

flag

gesture

eller lokal toggle

17) Arbejdsform (VIGTIG PROCESS)

Start altid fra sidste stabile ZIP

Små ændringer → patch + forklaring

Store ændringer → ny version + ZIP

Hvis noget er uklart:

lav skitse / tekst / billede

få godkendelse før implementering

Undgå gæt

18) Dokumentation

Regler, guide og illustrationer skal altid være i sync med spillet

Ændres spillet → opdater regler/guide samme version

SLUT

Dette dokument er autorativt.
Hvis kode og masterprompt er uenige → masterprompten vinder.

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
