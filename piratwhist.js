/* Piratwhist – v0.1.23 (multiplayer rooms) */
const APP_NAME = "Piratwhist";
const APP_VERSION = "0.1.23";

const el = (id) => document.getElementById(id);

const socket = io({
  transports: ["websocket", "polling"],
});

let roomCode = null;
// Connection diagnostics (Render often needs threaded worker for long-polling)
function setConnectedUI(connected){
  const c = document.getElementById("btnCreateRoom");
  const j = document.getElementById("btnJoinRoom");
  if (c) c.disabled = !connected;
  if (j) j.disabled = !connected;
}
setConnectedUI(false);

socket.on("connect", () => {
  setConnectedUI(true);
});

socket.on("disconnect", () => {
  setConnectedUI(false);
  setRoomStatus("Frakoblet");
  setRoomHint("Forbindelsen blev afbrudt. Genindlæs siden.");
});

socket.on("connect_error", () => {
  setConnectedUI(false);
  setRoomStatus("Forbindelsesfejl");
  setRoomHint("Socket.IO kunne ikke forbinde. På Render skal Start Command være: gunicorn -w 1 -k gthread --threads 8 app:app");
  const je = document.getElementById("joinError");
  if (je) je.textContent = "Kunne ikke forbinde til realtime-serveren.";
});

let state = null; // authoritative shared state from server
let localCurrentRound = 0; // local view only (not shared in room)
let forceFocusFirstBid = false; // when true, focus bid for player 1 after render

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function isNumber(v){ return typeof v === "number" && Number.isFinite(v); }

function captureFocusKey(){
  const a = document.activeElement;
  if (!a) return null;
  if (a.tagName !== "INPUT") return null;
  const player = a.getAttribute("data-player");
  const field = a.getAttribute("data-field");
  const round = a.getAttribute("data-round");
  if (player === null || field === null || round === null) return null;
  return {
    player: parseInt(player, 10),
    field,
    round: parseInt(round, 10),
    start: a.selectionStart,
    end: a.selectionEnd
  };
}
function restoreFocusKey(key){
  if (!key) return;
  const sel = `input[data-round="${key.round}"][data-player="${key.player}"][data-field="${key.field}"]`;
  const a = document.querySelector(sel);
  if (!a) return;
  a.focus({ preventScroll: true });
  try {
    if (typeof key.start === "number" && typeof key.end === "number") {
      a.setSelectionRange(key.start, key.end);
    }
  } catch (_) {}
}

function setCurrentRound(round){
  if (!state) return;
  const warn = validateRoundTricksSum(localCurrentRound);
  if (warn) showRoundWarning(warn);
  const r = clamp(round, 0, state.rounds - 1);
  localCurrentRound = r;
  forceFocusFirstBid = true;
  render();
}


function show(id, on){ el(id).classList.toggle("hidden", !on); }

function setRoomStatus(text){ el("roomStatus").textContent = text; }
function setRoomHint(text){ el("roomHint").textContent = text || ""; }

function uppercaseCode(s){ return (s||"").toUpperCase().replace(/\s+/g,"").slice(0,6); }

function focusFirstBid(){
  // Focus bid input for player 1 in current round
  const sel = `input[data-round="${localCurrentRound}"][data-player="0"][data-field="bid"]`;
  const a = document.querySelector(sel);
  if (a){
    a.focus({ preventScroll: true });
    try { a.select(); } catch (_) {}
  }
}

function sumTricksForRound(roundIndex){
  if (!state) return null;
  const row = state.data?.[roundIndex];
  if (!row) return null;
  let sum = 0;
  let anyMissing = false;
  for (let i=0;i<state.players.length;i++){
    const t = row[i]?.tricks;
    if (isNumber(t)) sum += t;
    else anyMissing = true;
  }
  return { sum, anyMissing, max: state.maxByRound[roundIndex] };
}

function showRoundWarning(msg){
  const w = document.getElementById("roundWarning");
  if (!w) return;
  if (!msg){
    w.classList.add("hidden");
    w.textContent = "";
    return;
  }
  w.textContent = msg;
  w.classList.remove("hidden");
}

function validateRoundTricksSum(roundIndex){
  const info = sumTricksForRound(roundIndex);
  if (!info) return null;
  // Only warn when all tricks are filled in (otherwise round isn't finished anyway)
  if (info.anyMissing) return null;
  if (info.sum !== info.max){
    return `Advarsel: Sum af stik i runde ${roundIndex+1} er ${info.sum}, men skal være ${info.max}. (Du må gerne skifte runde.)`;
  }
  return null;
}

function pointsFor(bid, tricks){
  if (!isNumber(bid) || !isNumber(tricks)) return 0;
  if (tricks === bid) return 10 + bid;
  return -Math.abs(tricks - bid);
}

function isRoundComplete(roundIndex){
  const row = state?.data?.[roundIndex];
  if (!row) return false;
  for (let i = 0; i < state.players.length; i++) {
    const cell = row[i];
    if (!cell) return false;
    if (!isNumber(cell.bid) || !isNumber(cell.tricks)) return false;
  }
  return true;
}

function totalForPlayer(playerIndex){
  let sum = 0;
  for (let r = 0; r < state.rounds; r++) {
    if (!isRoundComplete(r)) continue;
    const row = state.data[r][playerIndex];
    sum += pointsFor(row.bid, row.tricks);
  }
  return sum;
}

function render(){
  const __focusKey = captureFocusKey();
  if (!state) { return; }


  // phase visibility
  show("room", true);
  show("setup", state.phase === "setup");
  show("game", state.phase === "game");

  // setup fields sync
  if (state.phase === "setup") {
    el("playerCount").value = state.playerCount;
    el("roundCount").value = state.rounds;
    renderNameFields();
  }

  if (state.phase === "game") {
    renderRound();
    renderOverview();
  }
  if (forceFocusFirstBid) {
    focusFirstBid();
    forceFocusFirstBid = false;
  } else {
    restoreFocusKey(__focusKey);
  }
}

function renderNameFields(){
  const container = el("nameFields");
  container.innerHTML = "";
  for (let i=0;i<state.playerCount;i++) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.textContent = `Navn ${i+1}`;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = state.players[i]?.name || `Spiller ${i+1}`;
    inp.addEventListener("input", () => {
      socket.emit("set_name", { room: roomCode, index: i, name: inp.value });
    });
    wrap.appendChild(span);
    wrap.appendChild(inp);
    container.appendChild(wrap);
  }
}

function renderRoundHeaderStatus() {
  const r = localCurrentRound;
  const max = state.maxByRound[r];
  const complete = isRoundComplete(r);
  const sumInfo = sumTricksForRound(r);
  const sumTxt = sumInfo ? ` · Sum stik: ${sumInfo.sum}${sumInfo.anyMissing ? " (ufuldst.)" : ""} / ${sumInfo.max}` : "";
  el("roundInfo").textContent = `Runde ${r+1} / ${state.rounds}  ·  Antal stik (0..${max})${sumTxt}  ·  ${complete ? "FÆRDIG" : "ikke færdig"}`;
  // Update warning while viewing this round
  showRoundWarning(validateRoundTricksSum(r));
}

function renderRound(){
  renderRoundHeaderStatus();

  const r = localCurrentRound;
  const max = state.maxByRound[r];
  const card = el("roundCard");
  card.innerHTML = "";

  const title = document.createElement("div");
  title.className = "sub";
  title.textContent = "Udfyld bud og stik for denne runde (tomt felt = runden tæller ikke endnu):";
  card.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "roundGrid";
  grid.style.marginTop = "10px";

  const h1 = document.createElement("div"); h1.className="head"; h1.textContent="Spiller";
  const h2 = document.createElement("div"); h2.className="head"; h2.textContent="Bud (0..max)";
  const h3 = document.createElement("div"); h3.className="head"; h3.textContent="Stik taget (0..max)";
  grid.appendChild(h1); grid.appendChild(h2); grid.appendChild(h3);

  const bidInputs = [];
  const trickInputs = [];

  state.players.forEach((p, i) => {
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;

    const bid = document.createElement("input");
    bid.type = "number";
    bid.min = "0";
    bid.max = String(max);
    const bidVal = state.data[r][i].bid;
    bid.value = isNumber(bidVal) ? String(bidVal) : "";
    bid.placeholder = "—";
    bid.setAttribute("data-round", String(localCurrentRound));
    bid.setAttribute("data-player", String(i));
    bid.setAttribute("data-field", "bid");
    bid.addEventListener("input", () => {
      let val = null;
      if (bid.value !== "") {
        val = clamp(parseInt(bid.value || "0", 10), 0, max);
        bid.value = String(val);
      }
      socket.emit("set_cell", { room: roomCode, round: r, player: i, field: "bid", value: val });
    });

    const tricks = document.createElement("input");
    tricks.type = "number";
    tricks.min = "0";
    tricks.max = String(max);
    const trVal = state.data[r][i].tricks;
    tricks.value = isNumber(trVal) ? String(trVal) : "";
    tricks.placeholder = "—";
    tricks.setAttribute("data-round", String(localCurrentRound));
    tricks.setAttribute("data-player", String(i));
    tricks.setAttribute("data-field", "tricks");
    tricks.addEventListener("input", () => {
      let val = null;
      if (tricks.value !== "") {
        val = clamp(parseInt(tricks.value || "0", 10), 0, max);
        tricks.value = String(val);
      }
      socket.emit("set_cell", { room: roomCode, round: r, player: i, field: "tricks", value: val });
    });

    bidInputs.push(bid);
    trickInputs.push(tricks);

    grid.appendChild(name);
    grid.appendChild(bid);
    grid.appendChild(tricks);
  });

  bidInputs.forEach((inp, idx) => inp.tabIndex = 1 + idx);
  trickInputs.forEach((inp, idx) => inp.tabIndex = 1 + bidInputs.length + idx);

  
  // After last tricks input, tab should go to Next round button
  const nextTab = 1 + bidInputs.length + trickInputs.length;
  const btnN = document.getElementById("btnNext");
  if (btnN) btnN.tabIndex = nextTab;
card.appendChild(grid);

  const totalsLine = document.createElement("div");
  totalsLine.id = "totalsLine";
  totalsLine.className = "sub";
  totalsLine.style.marginTop = "12px";
  card.appendChild(totalsLine);
  renderRoundTotalsLine();

  el("btnPrev").disabled = (localCurrentRound === 0);
  el("btnNext").disabled = (localCurrentRound === state.rounds - 1);
}

function renderRoundTotalsLine(){
  const totalsLine = document.getElementById("totalsLine");
  if(!totalsLine) return;

  let finishedCount = 0;
  for (let r = 0; r < state.rounds; r++) if (isRoundComplete(r)) finishedCount++;

  totalsLine.textContent =
    `Total (kun færdige runder: ${finishedCount}): ` +
    state.players.map((p,i) => `${p.name}: ${totalForPlayer(i)}`).join(" · ");
}

function renderOverview(){
  const t = el("overview");
  t.innerHTML = "";

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");

  const thRound = document.createElement("th");
  thRound.textContent = "Runde";
  hr.appendChild(thRound);

  state.players.forEach(p => {
    const th = document.createElement("th");
    th.textContent = p.name;
    hr.appendChild(th);
  });

  const thMax = document.createElement("th");
  thMax.textContent = "Antal stik";
  hr.appendChild(thMax);

  thead.appendChild(hr);
  t.appendChild(thead);

  const tbody = document.createElement("tbody");

  for(let r=0;r<state.rounds;r++){
    const tr = document.createElement("tr");
    const complete = isRoundComplete(r);

    const tdR = document.createElement("td");
    tdR.innerHTML = `<strong>${r+1}</strong> <span class="small">${r === localCurrentRound ? "(nu)" : ""}</span> <span class="small muted">${complete ? "" : "· (ikke færdig)"}</span>`;
    tr.appendChild(tdR);

    for(let i=0;i<state.players.length;i++){
      const cell = document.createElement("td");
      const b = state.data[r][i].bid;
      const s = state.data[r][i].tricks;

      if (!complete) {
        const bTxt = isNumber(b) ? b : "—";
        const sTxt = isNumber(s) ? s : "—";
        cell.innerHTML = `<span class="muted">${bTxt} / ${sTxt}  (—)</span>`;
      } else {
        const pts = pointsFor(b, s);
        cell.textContent = `${b} / ${s}  (${pts >= 0 ? "+" : ""}${pts})`;
      }
      tr.appendChild(cell);
    }

    const tdM = document.createElement("td");
    tdM.textContent = String(state.maxByRound[r]);
    tr.appendChild(tdM);

    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      setCurrentRound(r);
    });

    tbody.appendChild(tr);
  }

  const trSum = document.createElement("tr");
  const tdLabel = document.createElement("td");
  tdLabel.innerHTML = "<strong>Totals (kun færdige runder)</strong>";
  trSum.appendChild(tdLabel);

  for(let i=0;i<state.players.length;i++){
    const td = document.createElement("td");
    td.innerHTML = `<strong>${totalForPlayer(i)}</strong>`;
    trSum.appendChild(td);
  }

  const tdBlank = document.createElement("td");
  tdBlank.textContent = "";
  trSum.appendChild(tdBlank);

  tbody.appendChild(trSum);

  t.appendChild(tbody);
}

// --- Socket events ---
socket.on("connect", () => {
  setRoomStatus("Forbundet (ikke i rum)");
  setRoomHint("Opret eller join et rum for at starte.");
});

socket.on("room_created", (msg) => {
  roomCode = msg.room;
  el("createdRoomCode").textContent = roomCode;
  el("createdRoomCode").classList.remove("hidden");
  setRoomStatus("I rum: " + roomCode);
  setRoomHint("Del koden med de andre. De kan joine med samme kode.");
  show("setup", true);
  show("game", false);
});

socket.on("join_ok", (msg) => {
  roomCode = msg.room;
  el("joinError").textContent = "";
  setRoomStatus("I rum: " + roomCode);
  setRoomHint("Du er joined. Alt synkroniseres i real-time.");
});

socket.on("join_error", (msg) => {
  el("joinError").textContent = msg?.error || "Kunne ikke joine rummet.";
});

socket.on("state", (s) => {
  state = s;
  localCurrentRound = clamp(localCurrentRound, 0, (state.rounds || 1) - 1);
  // reflect current phase
  if (state.phase === "setup") {
    show("setup", true); show("game", false);
  } else if (state.phase === "game") {
    show("setup", false); show("game", true);
  }
  render();
});

socket.on("left", () => {
  roomCode = null;
  state = null;
  setRoomStatus("Ikke i rum");
  setRoomHint("");
  el("createdRoomCode").classList.add("hidden");
  el("joinCode").value = "";
  show("setup", false);
  show("game", false);
});

// --- UI wiring ---
function initUI(){
  const badge = document.getElementById("appVersion");
  const foot = document.getElementById("footerVersion");
  if (badge) badge.textContent = `v${APP_VERSION}`;
  if (foot) foot.textContent = APP_VERSION;

  el("btnCreateRoom").addEventListener("click", () => {
    socket.emit("create_room");
  });

  el("btnJoinRoom").addEventListener("click", () => {
    const code = uppercaseCode(el("joinCode").value);
    el("joinCode").value = code;
    socket.emit("join_room", { room: code });
  });

  el("joinCode").addEventListener("keydown", (e) => {
    if (e.key === "Enter") el("btnJoinRoom").click();
  });

  el("btnLeaveRoom").addEventListener("click", () => {
    socket.emit("leave_room", { room: roomCode });
  });

  el("btnResetRoom").addEventListener("click", () => {
    if (!roomCode) return;
    socket.emit("reset_room", { room: roomCode });
  });

  // setup
  el("playerCount").addEventListener("input", () => {
    if (!roomCode) return;
    const n = clamp(parseInt(el("playerCount").value || "4", 10), 2, 8);
    el("playerCount").value = n;
    socket.emit("set_player_count", { room: roomCode, playerCount: n });
  });

  el("roundCount").addEventListener("input", () => {
    if (!roomCode) return;
    const n = clamp(parseInt(el("roundCount").value || "14", 10), 4, 14);
    el("roundCount").value = n;
    socket.emit("set_rounds", { room: roomCode, rounds: n });
  });

  el("btnStart").addEventListener("click", () => {
    if (!roomCode) return;
    localCurrentRound = 0;
    forceFocusFirstBid = true;
    socket.emit("start_game", { room: roomCode });
  });

  // nav
  el("btnPrev").addEventListener("click", () => {
    if (!state) { return; }

    setCurrentRound(localCurrentRound - 1);
  });

  el("btnNext").addEventListener("click", () => {
    if (!state) { return; }

    setCurrentRound(localCurrentRound + 1);
  });
}

initUI();
