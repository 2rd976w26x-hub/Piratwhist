from __future__ import annotations

import os
import random
import time
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
ONLINE_EMPTY_TTL_SECONDS = 120  # keep empty rooms briefly (redirects/reloads)


def _online_purge_old_rooms():
    now = time.time()
    for code, room in list(ONLINE_ROOMS.items()):
        empty_since = room.get("emptySince")
        if empty_since and (now - float(empty_since)) > ONLINE_EMPTY_TTL_SECONDS:
            ONLINE_ROOMS.pop(code, None)

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
        # Deal animation metadata (cards themselves remain private).
        "dealId": st.get("dealId"),
        "dealSeq": st.get("dealSeq"),
        "cardsPer": st.get("cardsPer"),
    }


def _online_start_deal_phase(code: str, room, round_index: int):
    """Deal server-side immediately, but keep phase='dealing' briefly so
    clients can play a visible deal animation without bots advancing.

    This keeps the 'server authoritative state' rule intact.
    """
    st = room["state"]
    n = st["n"]

    hands, cards_per = _online_deal(n, round_index)
    st["hands"] = hands
    st["cardsPer"] = cards_per

    # Deterministic seat sequence (card-by-card) for the animation.
    st["dealId"] = int(st.get("dealId") or 0) + 1
    st["dealSeq"] = [i % n for i in range(cards_per * n)]

    # Reset round-specific state.
    st["leader"] = (st["roundIndex"] % st["n"])
    st["turn"] = st["leader"]
    st["leadSuit"] = None
    st["table"] = [None for _ in range(n)]
    st["winner"] = None
    st["bids"] = [None for _ in range(n)]
    st["tricksRound"] = [0 for _ in range(n)]

    # Enter dealing phase and schedule a transition into bidding.
    st["phase"] = "dealing"

    st["lastActionAt"] = time.time()

    # Animation pacing (client mirrors this).
    per_card_ms = 120
    duration = max(0.8, min(8.0, (cards_per * n * per_card_ms) / 1000.0 + 0.6))
    st["dealEndsAt"] = time.time() + duration
    deal_id = st["dealId"]

    _online_emit_full_state(code, room)

    def _finish():
        try:
            socketio.sleep(duration)
            room2 = ONLINE_ROOMS.get(code)
            if not room2:
                return
            st2 = room2["state"]
            # Only finish if we're still in the same deal.
            if st2.get("phase") != "dealing":
                return
            if st2.get("dealId") != deal_id:
                return

            st2["phase"] = "bidding"

            st2["lastActionAt"] = time.time()

            _online_bot_choose_bid(room2)
            if all(b is not None for b in st2["bids"]):
                st2["phase"] = "playing"
                st2["turn"] = st2["leader"]
                st2["lastActionAt"] = time.time()

            _online_emit_full_state(code, room2)

            if st2.get("phase") == "playing" and st2.get("turn") in st2.get("botSeats", set()):
                _online_schedule_bot_turn(code)
        except Exception:
            return

    socketio.start_background_task(_finish)


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
    room = ONLINE_ROOMS.get(code)
    if room and room.get('state'):
        st = room['state']
        st['botScheduledAt'] = time.time()
        st['botScheduledTurn'] = st.get('turn')
    _online_ensure_bot_watchdog(code)
    socketio.start_background_task(_task)



def _online_ensure_bot_watchdog(code: str):
    """Fail-safe: ensures bots don't stall the game if a background task is missed.

    Starts one lightweight watchdog loop per room. It periodically checks whether
    it is a bot's turn in phase='playing' and no action has occurred recently.
    If so, it re-schedules the bot turn.
    """
    room = ONLINE_ROOMS.get(code)
    if not room:
        return
    st = room.get('state', {})
    if st.get('botWatchdogStarted'):
        return
    st['botWatchdogStarted'] = True

    def _loop():
        try:
            while True:
                socketio.sleep(1.0)
                room2 = ONLINE_ROOMS.get(code)
                if not room2:
                    return
                st2 = room2.get('state', {})

                # Stop if game ended.
                if st2.get('phase') in ('game_finished',):
                    return

                if st2.get('phase') != 'playing':
                    continue

                turn = st2.get('turn')
                bots = st2.get('botSeats', set()) or set()
                if turn is None or turn not in bots:
                    continue

                now = time.time()
                last_action = st2.get('lastActionAt') or now
                # If nothing has happened for a bit, re-schedule.
                if now - last_action < 2.5:
                    continue

                # Avoid scheduling too aggressively.
                last_sched = st2.get('botScheduledAt') or 0.0
                if now - last_sched < 2.0 and st2.get('botScheduledTurn') == turn:
                    continue

                _online_schedule_bot_turn(code)
        except Exception:
            return

    socketio.start_background_task(_loop)
def _online_schedule_auto_next_trick(code: str, round_index: int):
    def _task():
        try:
            # Wait for the client-side animations to finish before advancing.
            # In the UI we animate:
            #  - card flies in: 2s
            #  - trick sweeps out to winner: 2s
            # We gate server-side advancement using st["sweepUntil"].
            socketio.sleep(0.2)
            room = ONLINE_ROOMS.get(code)
            if not room:
                return
            st = room["state"]
            if st.get("phase") != "between_tricks":
                return
            if st.get("roundIndex") != round_index:
                return
            # If a sweep lock is present, do not advance early.
            sweep_until = st.get("sweepUntil")
            if sweep_until and time.time() < sweep_until:
                socketio.sleep(max(0.0, sweep_until - time.time()))
                # room/state may have changed while sleeping
                room = ONLINE_ROOMS.get(code)
                if not room:
                    return
                st = room["state"]
                if st.get("phase") != "between_tricks" or st.get("roundIndex") != round_index:
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
            st["sweepUntil"] = None
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

    # Track last action to support bot watchdog
    st["lastActionAt"] = time.time()

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

        # Prevent the next trick from starting until the UI has finished animating.
        # UI timing:
        #  - card flies in to the table: 2 seconds
        #  - trick sweeps out to the winner: 2 seconds
        # Total lock: 4 seconds.
        st["sweepUntil"] = time.time() + 4.0

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
                # Start next round with a short 'dealing' phase.
                _online_start_deal_phase(code, room, st["roundIndex"])
                return

            _online_emit_full_state(code, room)
            if st.get("phase") == "playing" and st.get("turn") in st.get("botSeats", set()):
                _online_schedule_bot_turn(code)
        except Exception:
            # don't crash the server on background task errors
            return

    socketio.start_background_task(_task)



def _online_cleanup_sid(sid):
    for code, room in list(ONLINE_ROOMS.items()):
        # Detach member; keep seat reservation for a short time so a browser
        # navigation (redirect/reload) can re-attach to the same seat.
        seat = room["members"].pop(sid, None)
        client_id = None
        try:
            client_id = room.get("sidToClient", {}).pop(sid, None)
        except Exception:
            client_id = None
        if seat is not None:
            try:
                leave_room(code)
            except Exception:
                pass
            st = room["state"]
            # If we know the client id, keep the name and refresh lastSeen.
            if client_id and room.get("clients") and client_id in room["clients"]:
                room["clients"][client_id]["lastSeen"] = time.time()
            else:
                st["names"][seat] = None
            # if room empty, keep it briefly (redirects/reloads) then purge later
            if not room["members"]:
                room["emptySince"] = time.time()
            else:
                room["emptySince"] = None
                _online_emit_full_state(code, room)

# ---------- Online multiplayer socket events ----------
@socketio.on("online_create_room")
def online_create_room(data):
    _online_purge_old_rooms()
    client_id = (data.get("clientId") or data.get("client_id") or "").strip() or None
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
        "emptySince": None,
        "members": {request.sid: 0},
        # Stable client mapping (clientId -> seat) to survive redirects/reloads.
        "clients": {},
        "sidToClient": {},
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
            # Deal animation meta
            "dealId": 0,
            "dealSeq": None,
            "cardsPer": None,
            "dealEndsAt": None,
            "tricksRound": [0 for _ in range(n_players)],
            "tricksTotal": [0 for _ in range(n_players)],
            "pointsTotal": [0 for _ in range(n_players)],
            "history": [],
            "autoNextDoneFor": None,
        "lastActionAt": time.time(),
        "botScheduledAt": 0.0,
        "botScheduledTurn": None,
        "botWatchdogStarted": False,
        }
    }
    if client_id:
        room["clients"][client_id] = {"seat": 0, "lastSeen": time.time()}
        room["sidToClient"][request.sid] = client_id
    ONLINE_ROOMS[code] = room
    join_room(code)

    # send state (seat 0)
    st = dict(_online_public_state(room))
    st["hands"] = [[]] + [None for _ in range(n_players-1)]
    emit("online_state", {"room": code, "seat": 0, "state": st})

@socketio.on("online_join_room")
def online_join_room(data):
    _online_purge_old_rooms()
    code = (data.get("room") or "").strip()
    name = (data.get("name") or "").strip() or "Spiller"
    client_id = (data.get("clientId") or data.get("client_id") or "").strip() or None
    if (not code.isdigit()) or len(code) != 4:
        emit("error", {"message": "Rumkode skal være 4 tal."})
        return
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("error", {"message": "Rum ikke fundet."})
        return

    room["emptySince"] = None
    st = room["state"]
    n = st["n"]
    # Seats currently occupied by live members
    occupied = set(room["members"].values())
    # Seats reserved for recently-seen clients (redirect/reload)
    now = time.time()
    for cid, meta in (room.get("clients") or {}).items():
        try:
            if now - float(meta.get("lastSeen", 0)) < 30:
                occupied.add(int(meta.get("seat")))
        except Exception:
            continue
    bot_seats = set(st.get("botSeats", set()))
    # If the client has joined before, re-attach to the same seat.
    seat = None
    if client_id and room.get("clients") and client_id in room["clients"]:
        seat = int(room["clients"][client_id]["seat"])
        room["clients"][client_id]["lastSeen"] = now
    else:
        seat = next((i for i in range(n) if i not in occupied and i not in bot_seats), None)
    if seat is None:
        emit("error", {"message": "Rummet er fuldt."})
        return

    # If this client already had a different sid in the room, detach it.
    if client_id:
        for sid_existing, cid in list((room.get("sidToClient") or {}).items()):
            if cid == client_id and sid_existing in room["members"]:
                room["members"].pop(sid_existing, None)
                room["sidToClient"].pop(sid_existing, None)

    room["members"][request.sid] = seat
    if client_id:
        room.setdefault("clients", {})[client_id] = {"seat": seat, "lastSeen": now}
        room.setdefault("sidToClient", {})[request.sid] = client_id
    st["names"][seat] = name
    join_room(code)

    _online_emit_full_state(code, room)

@socketio.on("online_leave_room")
def online_leave_room(data):
    code = (data.get("room") or "").strip()
    client_id = (data.get("clientId") or data.get("client_id") or "").strip() or None
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("online_left")
        return

    seat = room["members"].pop(request.sid, None)
    # also clear stable mapping for this client (explicit leave means really gone)
    try:
        room.get("sidToClient", {}).pop(request.sid, None)
    except Exception:
        pass
    if client_id:
        try:
            room.get("clients", {}).pop(client_id, None)
        except Exception:
            pass
    leave_room(code)

    if seat is not None:
        st = room["state"]
        st["names"][seat] = None
        # IMPORTANT: Do NOT delete the room immediately when it becomes empty.
        # Redirects/navigation between phase pages can briefly leave the room
        # with 0 live members, and immediate deletion causes "Rum ikke fundet"
        # on the next page load. We keep the room for a short TTL.
        if not room["members"]:
            room["emptySince"] = time.time()
        else:
            room["emptySince"] = None
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

    # Start round 1 with a short 'dealing' phase so clients can animate
    # the deal visibly before bots can advance the game.
    st["roundIndex"] = 0
    _online_start_deal_phase(code, room, 0)


@socketio.on("online_update_lobby")
def online_update_lobby(data):
    """Host-only lobby configuration.

    Allows changing player count and bot count while phase is 'lobby'.
    Safety rules:
      - Only seat 0 (host) may change config
      - Only allowed while only the host is connected (no other humans)
      - Only allowed in lobby phase
    """
    _online_purge_old_rooms()
    code = (data.get("room") or "").strip()
    room = ONLINE_ROOMS.get(code)
    if not room:
        emit("error", {"message": "Rum ikke fundet."})
        return

    seat = room["members"].get(request.sid)
    if seat != 0:
        emit("error", {"message": "Kun værten kan ændre opsætningen."})
        return

    st = room["state"]
    if st.get("phase") != "lobby":
        return

    # If other humans are connected, don't allow reshaping seats.
    if len(room["members"]) > 1:
        emit("error", {"message": "Kan ikke ændre opsætning når andre spillere er i rummet."})
        return

    n_players = int(data.get("players") or st.get("n") or 4)
    if n_players < 2 or n_players > 8:
        n_players = 4

    bots = int(data.get("bots") or 0)
    if bots < 0:
        bots = 0
    if bots > n_players - 1:
        bots = n_players - 1

    # Rebuild state arrays to match new n.
    host_name = (data.get("name") or st.get("names") or ["Spiller 1"])[0] if st.get("names") else (data.get("name") or "Spiller 1")
    host_name = (host_name or "").strip() or "Spiller 1"

    names = [None for _ in range(n_players)]
    names[0] = host_name

    bot_seats = set(range(1, 1 + bots))
    for i, s in enumerate(sorted(list(bot_seats))):
        names[s] = f"Computer {i+1}"

    room["state"] = {
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
        # Deal animation meta
        "dealId": 0,
        "dealSeq": None,
        "cardsPer": None,
        "dealEndsAt": None,
        "tricksRound": [0 for _ in range(n_players)],
        "tricksTotal": [0 for _ in range(n_players)],
        "pointsTotal": [0 for _ in range(n_players)],
        "history": [],
        "autoNextDoneFor": None,
        "lastActionAt": time.time(),
        "botScheduledAt": 0.0,
        "botScheduledTurn": None,
        "botWatchdogStarted": False,
    }

    _online_emit_full_state(code, room)

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
        st["lastActionAt"] = time.time()

    _online_emit_full_state(code, room)

    # If the bidding phase just transitioned into playing and it is a bot's
    # turn (very common with 2 players when the leader rotates each round),
    # we must schedule the bot's opening lead immediately.
    if st.get("phase") == "playing" and st.get("turn") in st.get("botSeats", set()):
        _online_schedule_bot_turn(code)

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
        sweep_until = st.get("sweepUntil")
        if sweep_until and time.time() < sweep_until:
            # Ignore early "next" clicks while the trick is still sweeping to the winner.
            return
        st["leader"] = st["winner"]
        st["turn"] = st["leader"]
        st["leadSuit"] = None
        st["table"] = [None for _ in range(n)]
        st["winner"] = None
        st["sweepUntil"] = None
        st["phase"] = "playing"

    elif st["phase"] == "round_finished":
        if st["roundIndex"] >= 13:
            st["phase"] = "game_finished"
        else:
            st["roundIndex"] += 1
            hands, _ = _online_deal(n, st["roundIndex"])
            st["hands"] = hands
            st["leader"] = (st["roundIndex"] % st["n"])
            st["turn"] = st["leader"]
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
        st["lastActionAt"] = time.time()

    _online_emit_full_state(code, room)
    if st.get("phase") == "playing" and st.get("turn") in st.get("botSeats", set()):
        _online_schedule_bot_turn(code)

@socketio.on("disconnect")
def online_disconnect():
    _online_cleanup_sid(request.sid)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
