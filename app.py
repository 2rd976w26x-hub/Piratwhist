from __future__ import annotations

import os
import random
from typing import Any, Dict, List, Optional

from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, join_room, leave_room, emit

# --- App setup ---
app = Flask(__name__, static_folder=".", static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "piratwhist-secret")

# IMPORTANT (Render + Python 3.13):
# eventlet currently breaks on Python 3.13 (threading API change).
# We run Socket.IO in "threading" mode (long-polling; works reliably).
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# --- In-memory room state (resets on redeploy) ---
rooms: Dict[str, Dict[str, Any]] = {}




# Online multiplayer rooms for /online.html
ONLINE_ROOMS: Dict[str, Dict[str, Any]] = {}
def _room_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # avoid confusing chars
    return "".join(random.choice(alphabet) for _ in range(6))


def _build_max_by_round(rounds: int) -> List[int]:
    base = [7, 6, 5, 4, 3, 2, 1, 1, 2, 3, 4, 5, 6, 7]
    return [base[i % len(base)] for i in range(rounds)]


def _default_room_state() -> Dict[str, Any]:
    player_count = 4
    rounds = 14
    players = [{"name": f"Spiller {i+1}"} for i in range(player_count)]
    data = [[{"bid": None, "tricks": None} for _ in range(player_count)] for _ in range(rounds)]
    return {
        "phase": "setup",
        "playerCount": player_count,
        "rounds": rounds,
        "players": players,
        "maxByRound": _build_max_by_round(rounds),
        "data": data,    }


def _broadcast_state(room: str) -> None:
    socketio.emit("state", rooms[room], to=room)


@app.get("/")
def index():
    return send_from_directory(".", "piratwhist.html")

@app.get("/online.html")
def online_page():
    return send_from_directory(".", "online.html")

@app.get("/online.js")
def online_js():
    return send_from_directory(".", "online.js")

@app.get("/online.css")
def online_css():
    return send_from_directory(".", "online.css")


@app.get("/<path:path>")
def static_files(path: str):
    return send_from_directory(".", path)


@socketio.on("create_room")
def on_create_room():
    room = _room_code()
    while room in rooms:
        room = _room_code()
    rooms[room] = _default_room_state()

    join_room(room)
    emit("room_created", {"room": room})
    emit("state", rooms[room])


@socketio.on("join_room")
def on_join_room(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if not room or room not in rooms:
        emit("join_error", {"error": "Rum findes ikke (tjek koden)."})
        return

    join_room(room)
    emit("join_ok", {"room": room})
    emit("state", rooms[room])


@socketio.on("leave_room")
def on_leave_room(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if room:
        leave_room(room)
    emit("left")


@socketio.on("reset_room")
def on_reset_room(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if room not in rooms:
        return
    rooms[room] = _default_room_state()
    _broadcast_state(room)


@socketio.on("set_player_count")
def on_set_player_count(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if room not in rooms:
        return
    s = rooms[room]
    if s.get("phase") != "setup":
        return

    n = int(payload.get("playerCount") or 4)
    n = max(2, min(8, n))

    s["playerCount"] = n

    players = s["players"]
    if len(players) < n:
        for i in range(len(players), n):
            players.append({"name": f"Spiller {i+1}"})
    else:
        del players[n:]
    s["players"] = players

    rounds = int(s["rounds"])
    data = s["data"]
    for r in range(rounds):
        row = data[r]
        if len(row) < n:
            for _ in range(len(row), n):
                row.append({"bid": None, "tricks": None})
        else:
            del row[n:]
    s["data"] = data

    _broadcast_state(room)


@socketio.on("set_rounds")
def on_set_rounds(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if room not in rooms:
        return
    s = rooms[room]
    if s.get("phase") != "setup":
        return

    rounds = int(payload.get("rounds") or 14)
    rounds = max(4, min(14, rounds))
    s["rounds"] = rounds
    s["maxByRound"] = _build_max_by_round(rounds)

    pc = int(s["playerCount"])
    data = s["data"]
    if len(data) < rounds:
        for _ in range(len(data), rounds):
            data.append([{"bid": None, "tricks": None} for _ in range(pc)])
    else:
        del data[rounds:]
    s["data"] = data

    _broadcast_state(room)


@socketio.on("set_name")
def on_set_name(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if room not in rooms:
        return
    s = rooms[room]
    if s.get("phase") != "setup":
        return
    idx = int(payload.get("index") or 0)
    if idx < 0 or idx >= int(s["playerCount"]):
        return
    name = (payload.get("name") or "").strip() or f"Spiller {idx+1}"
    s["players"][idx]["name"] = name
    _broadcast_state(room)


@socketio.on("start_game")
def on_start_game(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if room not in rooms:
        return
    s = rooms[room]
    s["phase"] = "game"
    _broadcast_state(room)


@socketio.on("set_cell")
def on_set_cell(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if room not in rooms:
        return
    s = rooms[room]
    if s.get("phase") != "game":
        return

    r = int(payload.get("round") or 0)
    p = int(payload.get("player") or 0)
    field = payload.get("field")
    value = payload.get("value", None)

    rounds = int(s["rounds"])
    pc = int(s["playerCount"])
    if r < 0 or r >= rounds or p < 0 or p >= pc:
        return
    if field not in ("bid", "tricks"):
        return

    max_allowed = int(s["maxByRound"][r])
    if value is None:
        s["data"][r][p][field] = None
    else:
        try:
            v = int(value)
        except Exception:
            return
        v = max(0, min(max_allowed, v))
        s["data"][r][p][field] = v

    _broadcast_state(room)


# ---------- Online game helpers ----------
ONLINE_SUITS = ["♠", "♥", "♦", "♣"]  # spar is trump
ONLINE_RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"]
ONLINE_RANK_VALUE = {r: i+2 for i, r in enumerate(ONLINE_RANKS)}
ONLINE_ROUND_CARDS = [7,6,5,4,3,2,1,1,2,3,4,5,6,7]

def _online_room_code() -> str:
    return f"{random.randint(0, 9999):04d}"

def _online_make_deck():
    return [{"suit": s, "rank": r} for s in ONLINE_SUITS for r in ONLINE_RANKS]

def _online_card_key(c):
    return f"{c['rank']}{c['suit']}"

def _online_compare_cards(a, b, lead_suit):
    # 1 if a beats b, -1 if b beats a
    a_trump = a["suit"] == "♠"
    b_trump = b["suit"] == "♠"
    if a_trump and not b_trump:
        return 1
    if not a_trump and b_trump:
        return -1

    if a["suit"] == b["suit"]:
        av = ONLINE_RANK_VALUE[a["rank"]]
        bv = ONLINE_RANK_VALUE[b["rank"]]
        return (av > bv) - (av < bv)

    a_lead = a["suit"] == lead_suit
    b_lead = b["suit"] == lead_suit
    if a_lead and not b_lead:
        return 1
    if not a_lead and b_lead:
        return -1

    # fallback (shouldn't matter)
    av = ONLINE_RANK_VALUE[a["rank"]]
    bv = ONLINE_RANK_VALUE[b["rank"]]
    return (av > bv) - (av < bv)

def _online_deal(n_players, round_index):
    cards_per = ONLINE_ROUND_CARDS[round_index]
    needed = cards_per * n_players
    deck = _online_make_deck()
    random.shuffle(deck)
    take = deck[:needed]
    hands = [[] for _ in range(n_players)]
    for i, c in enumerate(take):
        hands[i % n_players].append(c)

    suit_order = {s:i for i,s in enumerate(ONLINE_SUITS)}
    for h in hands:
        h.sort(key=lambda c: (suit_order[c["suit"]], ONLINE_RANK_VALUE[c["rank"]]))
    return hands, cards_per

def _online_public_state(room):
    st = room["state"]
    return {
        "n": st["n"],
        "names": st["names"],
        "roundIndex": st["roundIndex"],
        "leader": st["leader"],
        "turn": st["turn"],
        "leadSuit": st["leadSuit"],
        "table": st["table"],
        "winner": st["winner"],
        "phase": st["phase"],
        "tricksTotal": st["tricksTotal"],
    }

def _online_cleanup_sid(sid):
    for code, room in list(ONLINE_ROOMS.items()):
        seat = room["members"].pop(sid, None)
        if seat is not None:
            try:
                leave_room(code)
            except Exception:
                pass
            st = room["state"]
            st["names"][seat] = None
            if not room["members"]:
                ONLINE_ROOMS.pop(code, None)
            else:
                socketio.emit("online_state", {"room": code, "seat": None, "state": _online_public_state(room)}, room=code)

# ---------- Online multiplayer socket events ----------
@socketio.on("online_create_room")
def online_create_room(data):
    name = (data.get("name") or "").strip() or "Spiller 1"
    n_players = int(data.get("players") or 4)
    if n_players < 2 or n_players > 8:
        n_players = 4

    code = _online_room_code()
    while code in ONLINE_ROOMS:
        code = _online_room_code()

    names = [None for _ in range(n_players)]
    names[0] = name

    room = {
        "code": code,
        "members": {request.sid: 0},
        "state": {
            "n": n_players,
            "names": names,
            "roundIndex": 0,
            "leader": 0,
            "turn": 0,
            "leadSuit": None,
            "table": [None for _ in range(n_players)],
            "winner": None,
            "phase": "lobby",
            "hands": [None for _ in range(n_players)],
            "tricksTotal": [0 for _ in range(n_players)],
        }
    }
    ONLINE_ROOMS[code] = room
    join_room(code)
    emit("online_state", {
        "room": code,
        "seat": 0,
        "state": {**_online_public_state(room), "hands": [None]*n_players}
    })

@socketio.on("online_join_room")
def online_join_room(data):
    code = (data.get("room") or "").strip()
    name = (data.get("name") or "").strip() or "Spiller"
    if (not code.isdigit()) or len(code) != 4:
        emit("error", {"message": "Rumkode skal være 4 tal."})
        return
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("error", {"message": "Rum ikke fundet."})
        return

    st = room["state"]
    n = st["n"]
    occupied = set(room["members"].values())
    seat = next((i for i in range(n) if i not in occupied), None)
    if seat is None:
        emit("error", {"message": "Rummet er fuldt."})
        return

    room["members"][request.sid] = seat
    st["names"][seat] = name
    join_room(code)

    socketio.emit("online_state", {"room": code, "seat": None, "state": _online_public_state(room)}, room=code)

    hand = st["hands"][seat] if st["hands"][seat] else []
    emit("online_state", {
        "room": code,
        "seat": seat,
        "state": {**_online_public_state(room), "hands": [hand if i==seat else None for i in range(n)]}
    })

@socketio.on("online_leave_room")
def online_leave_room(data):
    code = (data.get("room") or "").strip()
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("online_left")
        return

    seat = room["members"].pop(request.sid, None)
    leave_room(code)

    if seat is not None:
        st = room["state"]
        st["names"][seat] = None
        if not room["members"]:
            ONLINE_ROOMS.pop(code, None)
        else:
            socketio.emit("online_state", {"room": code, "seat": None, "state": _online_public_state(room)}, room=code)

    emit("online_left")

@socketio.on("online_start_game")
def online_start_game(data):
    code = (data.get("room") or "").strip()
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("error", {"message": "Rum ikke fundet."})
        return

    st = room["state"]
    if st["phase"] != "lobby":
        return

    joined = sum(1 for n in st["names"] if n)
    if joined < 2:
        emit("error", {"message": "Der skal være mindst 2 spillere i rummet."})
        return

    st["roundIndex"] = 0
    hands, _ = _online_deal(st["n"], 0)
    st["hands"] = hands
    st["leader"] = 0
    st["turn"] = 0
    st["leadSuit"] = None
    st["table"] = [None for _ in range(st["n"])]
    st["winner"] = None
    st["phase"] = "playing"

    socketio.emit("online_state", {"room": code, "seat": None, "state": _online_public_state(room)}, room=code)

    for sid, seat in list(room["members"].items()):
        hand = st["hands"][seat]
        socketio.emit("online_state", {
            "room": code,
            "seat": seat,
            "state": {**_online_public_state(room), "hands": [hand if i==seat else None for i in range(st["n"])]}
        }, to=sid)

@socketio.on("online_play_card")
def online_play_card(data):
    code = (data.get("room") or "").strip()
    card_key = (data.get("card") or "").strip()
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("error", {"message": "Rum ikke fundet."})
        return

    st = room["state"]
    if st["phase"] != "playing":
        return

    seat = room["members"].get(request.sid, None)
    if seat is None:
        emit("error", {"message": "Du er ikke i rummet."})
        return
    if st["turn"] != seat:
        emit("error", {"message": "Det er ikke din tur."})
        return

    hand = st["hands"][seat]
    idx = next((i for i,c in enumerate(hand) if _online_card_key(c)==card_key), None)
    if idx is None:
        emit("error", {"message": "Kort ikke fundet i din hånd."})
        return
    card = hand[idx]

    # bekend kulør hvis muligt
    if st["leadSuit"] is not None:
        has_lead = any(c["suit"] == st["leadSuit"] for c in hand)
        if has_lead and card["suit"] != st["leadSuit"]:
            emit("error", {"message": "Du skal bekende kulør hvis muligt."})
            return

    hand.pop(idx)
    if st["leadSuit"] is None:
        st["leadSuit"] = card["suit"]
    st["table"][seat] = card

    # next turn = next seat without a card on table
    n = st["n"]
    nxt = (seat + 1) % n
    for _ in range(n):
        if st["table"][nxt] is None:
            st["turn"] = nxt
            break
        nxt = (nxt + 1) % n

    # trick done?
    if all(c is not None for c in st["table"]):
        winner = st["leader"]
        best = st["table"][winner]
        for i in range(n):
            c = st["table"][i]
            if _online_compare_cards(c, best, st["leadSuit"]) > 0:
                best = c
                winner = i
        st["winner"] = winner
        st["tricksTotal"][winner] += 1

        # round finished when all hands empty
        if all(len(h) == 0 for h in st["hands"]):
            st["phase"] = "round_finished"
        else:
            st["phase"] = "between_tricks"

    socketio.emit("online_state", {"room": code, "seat": None, "state": _online_public_state(room)}, room=code)
    for sid, s_seat in list(room["members"].items()):
        hand2 = st["hands"][s_seat]
        socketio.emit("online_state", {
            "room": code,
            "seat": s_seat,
            "state": {**_online_public_state(room), "hands": [hand2 if i==s_seat else None for i in range(n)]}
        }, to=sid)

@socketio.on("online_next")
def online_next(data):
    code = (data.get("room") or "").strip()
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("error", {"message": "Rum ikke fundet."})
        return

    st = room["state"]
    n = st["n"]

    if st["phase"] == "between_tricks":
        st["leader"] = st["winner"]
        st["turn"] = st["leader"]
        st["leadSuit"] = None
        st["table"] = [None for _ in range(n)]
        st["winner"] = None
        st["phase"] = "playing"

    elif st["phase"] == "round_finished":
        if st["roundIndex"] >= 13:
            st["phase"] = "game_finished"
        else:
            st["roundIndex"] += 1
            hands, _ = _online_deal(n, st["roundIndex"])
            st["hands"] = hands
            st["leader"] = 0
            st["turn"] = 0
            st["leadSuit"] = None
            st["table"] = [None for _ in range(n)]
            st["winner"] = None
            st["phase"] = "playing"

    socketio.emit("online_state", {"room": code, "seat": None, "state": _online_public_state(room)}, room=code)
    for sid, s_seat in list(room["members"].items()):
        hand2 = st["hands"][s_seat] if st["hands"][s_seat] else []
        socketio.emit("online_state", {
            "room": code,
            "seat": s_seat,
            "state": {**_online_public_state(room), "hands": [hand2 if i==s_seat else None for i in range(n)]}
        }, to=sid)

@socketio.on("disconnect")
def online_disconnect():
    _online_cleanup_sid(request.sid)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
