from __future__ import annotations

import os
import random
import string
from typing import Any, Dict, List, Optional

from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, join_room, leave_room, emit

# --- App setup ---
app = Flask(__name__, static_folder=".", static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "piratwhist-secret")

# eventlet is recommended on Render for websockets
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# --- In-memory room state (simple + fast) ---
# NOTE: Resets on redeploy. This matches typical "musikspil" simple room behavior.
rooms: Dict[str, Dict[str, Any]] = {}


def _room_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # avoid confusing chars
    return "".join(random.choice(alphabet) for _ in range(6))


def _build_max_by_round(rounds: int) -> List[int]:
    base = [7, 6, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7]
    return [base[i % len(base)] for i in range(rounds)]


def _default_room_state() -> Dict[str, Any]:
    # "setup" phase is shared. Once started -> "game".
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
        "data": data,
        "currentRound": 0,
    }


def _ensure_room(room: str) -> Optional[Dict[str, Any]]:
    return rooms.get(room)


def _broadcast_state(room: str) -> None:
    state = rooms[room]
    socketio.emit("state", state, to=room)


@app.get("/")
def index():
    return send_from_directory(".", "piratwhist.html")


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
    # resize players
    players = s["players"]
    if len(players) < n:
        for i in range(len(players), n):
            players.append({"name": f"Spiller {i+1}"})
    else:
        del players[n:]
    s["players"] = players

    # resize data columns for each round
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
    s["currentRound"] = max(0, min(int(s["currentRound"]), rounds - 1))

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
    s["currentRound"] = 0
    _broadcast_state(room)


@socketio.on("set_current_round")
def on_set_current_round(payload: Dict[str, Any]):
    room = (payload.get("room") or "").strip().upper()
    if room not in rooms:
        return
    s = rooms[room]
    if s.get("phase") != "game":
        return
    r = int(payload.get("round") or 0)
    r = max(0, min(int(s["rounds"]) - 1, r))
    s["currentRound"] = r
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


if __name__ == "__main__":
    # local dev
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
