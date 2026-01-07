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
    # 4 digits to keep it simple
    return f"{random.randint(0, 9999):04d}"

def _online_make_deck():
    return [{"suit": s, "rank": r} for s in ONLINE_SUITS for r in ONLINE_RANKS]

def _online_card_key(c):
    return f"{c['rank']}{c['suit']}"

def _online_compare_cards(a, b, lead_suit):
    # returns 1 if a beats b, -1 if b beats a, 0 if equal
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

    # fallback
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

def _online_points_for_round(bid: int, taken: int) -> int:
    if bid == taken:
        return 10 + bid
    return -abs(taken - bid)

def _online_public_state(room):
    st = room["state"]
    # do NOT expose other players' hands
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
        "bids": st["bids"],
        "tricksRound": st["tricksRound"],
        "tricksTotal": st["tricksTotal"],
        "pointsTotal": st["pointsTotal"],
        "history": st["history"],
        "botSeats": sorted(list(st.get("botSeats", set()))),
    }


def _online_bot_choose_bid(room) -> None:
    st = room["state"]
    max_bid = ONLINE_ROUND_CARDS[st["roundIndex"]]
    for seat in st.get("botSeats", set()):
        if st["bids"][seat] is not None:
            continue
        hand = st["hands"][seat] or []
        sp = sum(1 for c in hand if c["suit"] == "♠")
        hi = sum(1 for c in hand if ONLINE_RANK_VALUE[c["rank"]] >= 11)
        bid = max(0, min(max_bid, int(round((sp * 0.6) + (hi * 0.35)))))
        st["bids"][seat] = bid

def _online_bot_choose_card(room, seat: int):
    st = room["state"]
    hand = st["hands"][seat]
    if not hand:
        return None
    lead = st.get("leadSuit")
    if lead:
        same = [c for c in hand if c["suit"] == lead]
        if same:
            same.sort(key=lambda c: ONLINE_RANK_VALUE[c["rank"]])
            return same[0]
    tr = [c for c in hand if c["suit"] == "♠"]
    if tr:
        tr.sort(key=lambda c: ONLINE_RANK_VALUE[c["rank"]])
        return tr[0]
    hand.sort(key=lambda c: (c["suit"], ONLINE_RANK_VALUE[c["rank"]]))
    return hand[0]

def _online_schedule_bot_turn(code: str):
    def _task():
        try:
            socketio.sleep(0.6)
            room = ONLINE_ROOMS.get(code)
            if not room:
                return
            st = room["state"]
            if st.get("phase") != "playing":
                return
            turn = st.get("turn")
            if turn is None or turn not in st.get("botSeats", set()):
                return
            card = _online_bot_choose_card(room, turn)
            if not card:
                return
            _online_internal_play_card(code, room, turn, _online_card_key(card))
        except Exception:
            return
    socketio.start_background_task(_task)

def _online_schedule_auto_next_trick(code: str, round_index: int):
    def _task():
        try:
            socketio.sleep(1.2)
            room = ONLINE_ROOMS.get(code)
            if not room:
                return
            st = room["state"]
            if st.get("phase") != "between_tricks":
                return
            if st.get("roundIndex") != round_index:
                return
            # auto-advance only if there are bots
            if len(st.get("botSeats", set())) == 0:
                return

            n = st["n"]
            st["leader"] = st["winner"]
            st["turn"] = st["leader"]
            st["leadSuit"] = None
            st["table"] = [None for _ in range(n)]
            st["winner"] = None
            st["phase"] = "playing"

            _online_emit_full_state(code, room)

            if st.get("turn") in st.get("botSeats", set()):
                _online_schedule_bot_turn(code)
        except Exception:
            return

    socketio.start_background_task(_task)
def _online_internal_play_card(code: str, room, seat: int, card_key: str):
    st = room["state"]
    if st.get("phase") != "playing":
        return
    if st.get("turn") != seat:
        return

    hand = st["hands"][seat]
    idx = next((i for i, c in enumerate(hand) if _online_card_key(c) == card_key), None)
    if idx is None:
        return
    card = hand[idx]

    if st.get("leadSuit") is not None:
        lead = st["leadSuit"]
        has_lead = any(c["suit"] == lead for c in hand)
        if has_lead and card["suit"] != lead:
            return

    hand.pop(idx)
    if st.get("leadSuit") is None:
        st["leadSuit"] = card["suit"]
    st["table"][seat] = card

    n = st["n"]
    nxt = (seat + 1) % n
    for _ in range(n):
        if st["table"][nxt] is None:
            st["turn"] = nxt
            break
        nxt = (nxt + 1) % n

    if all(c is not None for c in st["table"]):
        winner = st["leader"]
        best = st["table"][winner]
        for i in range(n):
            c = st["table"][i]
            if _online_compare_cards(c, best, st["leadSuit"]) > 0:
                best = c
                winner = i

        st["winner"] = winner
        st["tricksRound"][winner] += 1
        st["tricksTotal"][winner] += 1

        if all(len(h) == 0 for h in st["hands"]):
            bids = [int(b or 0) for b in st["bids"]]
            taken = list(st["tricksRound"])
            points = [_online_points_for_round(bids[i], taken[i]) for i in range(n)]
            for i in range(n):
                st["pointsTotal"][i] += points[i]
            st["history"].append({
                "round": st["roundIndex"] + 1,
                "cardsPer": ONLINE_ROUND_CARDS[st["roundIndex"]],
                "bids": bids,
                "taken": taken,
                "points": points,
            })
            st["phase"] = "round_finished"
            _online_schedule_auto_next_round(code, st["roundIndex"])
        else:
            st["phase"] = "between_tricks"
            _online_schedule_auto_next_trick(code, st["roundIndex"])

    _online_emit_full_state(code, room)

    if st.get("phase") == "playing" and st.get("turn") in st.get("botSeats", set()):
        _online_schedule_bot_turn(code)

def _online_emit_full_state(code: str, room):
    st = room["state"]
    # broadcast public state
    socketio.emit("online_state", {"room": code, "seat": None, "state": _online_public_state(room)}, room=code)
    # send private hand to each member
    for sid, seat in list(room["members"].items()):
        hand = st["hands"][seat] if st["hands"][seat] else []
        payload_state = dict(_online_public_state(room))
        payload_state["hands"] = [hand if i == seat else None for i in range(st["n"])]
        socketio.emit("online_state", {"room": code, "seat": seat, "state": payload_state}, to=sid)
def _online_schedule_auto_next_round(code: str, round_index: int):
    # Start next round automatically 2 seconds after the final card of a round is played.
    def _task():
        try:
            socketio.sleep(2)
            room = ONLINE_ROOMS.get(code)
            if not room:
                return
            st = room["state"]
            # Only advance if we are still on the same finished round
            if st.get("phase") != "round_finished":
                return
            if st.get("roundIndex") != round_index:
                return
            # Prevent duplicate advancement
            if st.get("autoNextDoneFor") == round_index:
                return
            st["autoNextDoneFor"] = round_index

            n = st["n"]
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
                st["bids"] = [None for _ in range(n)]
                st["tricksRound"] = [0 for _ in range(n)]
                st["phase"] = "bidding"

                _online_bot_choose_bid(room)
                if all(b is not None for b in st["bids"]):
                    st["phase"] = "playing"
                    st["turn"] = st["leader"]

            _online_emit_full_state(code, room)
            if st.get("phase") == "playing" and st.get("turn") in st.get("botSeats", set()):
                _online_schedule_bot_turn(code)
        except Exception:
            # don't crash the server on background task errors
            return

    socketio.start_background_task(_task)



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
            # if room empty, delete it
            if not room["members"]:
                ONLINE_ROOMS.pop(code, None)
            else:
                _online_emit_full_state(code, room)

# ---------- Online multiplayer socket events ----------
@socketio.on("online_create_room")
def online_create_room(data):
    name = (data.get("name") or "").strip() or "Spiller 1"
    n_players = int(data.get("players") or 4)
    if n_players < 2 or n_players > 8:
        n_players = 4

    bots = int(data.get("bots") or 0)
    if bots < 0:
        bots = 0
    if bots > n_players - 1:
        bots = n_players - 1

    code = _online_room_code()
    while code in ONLINE_ROOMS:
        code = _online_room_code()

    names = [None for _ in range(n_players)]
    names[0] = name

    bot_seats = set(range(1, 1 + bots))
    for i, seat in enumerate(sorted(list(bot_seats))):
        names[seat] = f"Computer {i+1}"

    room = {
        "code": code,
        "members": {request.sid: 0},
        "state": {
            "n": n_players,
            "names": names,
            "botSeats": bot_seats,
            "roundIndex": 0,
            "leader": 0,
            "turn": 0,
            "leadSuit": None,
            "table": [None for _ in range(n_players)],
            "winner": None,
            "phase": "lobby",
            "hands": [None for _ in range(n_players)],
            "bids": [None for _ in range(n_players)],
            "tricksRound": [0 for _ in range(n_players)],
            "tricksTotal": [0 for _ in range(n_players)],
            "pointsTotal": [0 for _ in range(n_players)],
            "history": [],
            "autoNextDoneFor": None,
        }
    }
    ONLINE_ROOMS[code] = room
    join_room(code)

    # send state (seat 0)
    st = dict(_online_public_state(room))
    st["hands"] = [[]] + [None for _ in range(n_players-1)]
    emit("online_state", {"room": code, "seat": 0, "state": st})

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
    bot_seats = set(st.get("botSeats", set()))
    seat = next((i for i in range(n) if i not in occupied and i not in bot_seats), None)
    if seat is None:
        emit("error", {"message": "Rummet er fuldt."})
        return

    room["members"][request.sid] = seat
    st["names"][seat] = name
    join_room(code)

    _online_emit_full_state(code, room)

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
            _online_emit_full_state(code, room)

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

    human_joined = len(room["members"])
    total_joined = sum(1 for n in st["names"] if n)
    if total_joined < 2 or human_joined < 1:
        emit("error", {"message": "Der skal være mindst 1 menneske og mindst 2 spillere i alt (inkl. computere)."})
        return

    st["roundIndex"] = 0
    hands, _ = _online_deal(st["n"], 0)
    st["hands"] = hands
    st["leader"] = 0
    st["turn"] = 0
    st["leadSuit"] = None
    st["table"] = [None for _ in range(st["n"])]
    st["winner"] = None
    st["bids"] = [None for _ in range(st["n"])]
    st["tricksRound"] = [0 for _ in range(st["n"])]
    st["phase"] = "bidding"

    _online_bot_choose_bid(room)
    if all(b is not None for b in st["bids"]):
        st["phase"] = "playing"
        st["turn"] = st["leader"]

    _online_emit_full_state(code, room)
    if st.get("phase") == "playing" and st.get("turn") in st.get("botSeats", set()):
        _online_schedule_bot_turn(code)

@socketio.on("online_set_bid")
def online_set_bid(data):
    code = (data.get("room") or "").strip()
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("error", {"message": "Rum ikke fundet."})
        return

    st = room["state"]
    if st["phase"] != "bidding":
        return

    seat = room["members"].get(request.sid, None)
    if seat is None:
        emit("error", {"message": "Du er ikke i rummet."})
        return

    if st["bids"][seat] is not None:
        emit("error", {"message": "Dit bud er allerede gemt."})
        return

    max_bid = ONLINE_ROUND_CARDS[st["roundIndex"]]
    try:
        bid = int(data.get("bid"))
    except Exception:
        bid = 0
    if bid < 0 or bid > max_bid:
        emit("error", {"message": f"Bud skal være mellem 0 og {max_bid}."})
        return

    st["bids"][seat] = bid

    # when all bids submitted -> start playing
    if all(b is not None for b in st["bids"]):
        st["phase"] = "playing"
        st["turn"] = st["leader"]

    _online_emit_full_state(code, room)

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

    _online_internal_play_card(code, room, seat, card_key)
    return

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
            st["bids"] = [None for _ in range(n)]
            st["tricksRound"] = [0 for _ in range(n)]
            st["phase"] = "bidding"

    _online_bot_choose_bid(room)
    if all(b is not None for b in st["bids"]):
        st["phase"] = "playing"
        st["turn"] = st["leader"]

    _online_emit_full_state(code, room)
    if st.get("phase") == "playing" and st.get("turn") in st.get("botSeats", set()):
        _online_schedule_bot_turn(code)

@socketio.on("disconnect")
def online_disconnect():
    _online_cleanup_sid(request.sid)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
