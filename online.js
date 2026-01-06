// Piratwhist Online Multiplayer (v0.1.15)
const SUIT_NAME = {"♠":"spar","♥":"hjerter","♦":"ruder","♣":"klør"};
const ROUND_CARDS = [7,6,5,4,3,2,1,1,2,3,4,5,6,7];

function el(id){ return document.getElementById(id); }

function showRoomWarn(msg){
  const w = el("olRoomWarn");
  if (!w) return;
  if (!msg){ w.classList.add("hidden"); w.textContent=""; return; }
  w.textContent = msg;
  w.classList.remove("hidden");
}

function makeCardEl(card){
  const btn = document.createElement("button");
  btn.className = "cardbtn";
  const div = document.createElement("div");
  const red = (card.suit === "♥" || card.suit === "♦");
  div.className = "playingcard" + (red ? " red" : "");

  const c1 = document.createElement("div");
  c1.className = "corner";
  c1.textContent = card.rank + card.suit;

  const mid = document.createElement("div");
  mid.className = "center";
  mid.textContent = card.suit;

  const c2 = document.createElement("div");
  c2.className = "corner";
  c2.style.alignSelf = "flex-end";
  c2.textContent = card.rank + card.suit;

  div.appendChild(c1); div.appendChild(mid); div.appendChild(c2);
  btn.appendChild(div);
  return btn;
}

function normalizeCode(s){ return (s || "").trim(); }

const socket = io({ transports: ["websocket", "polling"] });

let roomCode = null;
let mySeat = null;
let state = null;

socket.on("connect", () => {
  const s = el("olRoomStatus");
  if (s) s.textContent = "Forbundet.";
});

socket.on("error", (data) => {
  showRoomWarn(data?.message || "Ukendt fejl");
});

socket.on("online_state", (payload) => {
  roomCode = payload.room;
  if (payload.seat !== null && payload.seat !== undefined) mySeat = payload.seat;
  state = payload.state;

  const rl = el("olRoomLabel"); if (rl) rl.textContent = roomCode || "-";
  const sl = el("olSeatLabel"); if (sl) sl.textContent = (mySeat===null || mySeat===undefined) ? "-" : `Spiller ${mySeat+1}`;
  showRoomWarn("");
  render();
});

socket.on("online_left", () => {
  roomCode = null;
  mySeat = null;
  state = null;
  const rl = el("olRoomLabel"); if (rl) rl.textContent = "-";
  const sl = el("olSeatLabel"); if (sl) sl.textContent = "-";
  const s = el("olRoomStatus");
  if (s) s.textContent = "Forlod rum.";
  showRoomWarn("");
  render();
});

function myName(){ return (el("olMyName")?.value || "").trim() || "Spiller"; }
function playerCount(){ return parseInt(el("olPlayerCount")?.value || "4", 10); }

function createRoom(){ socket.emit("online_create_room", { name: myName(), players: playerCount() }); }
function joinRoom(){ socket.emit("online_join_room", { room: normalizeCode(el("olRoomCode")?.value), name: myName() }); }
function leaveRoom(){ if (roomCode) socket.emit("online_leave_room", { room: roomCode }); }
function startOnline(){ if (roomCode) socket.emit("online_start_game", { room: roomCode }); }
function onNext(){ if (roomCode) socket.emit("online_next", { room: roomCode }); }
function playCard(cardKey){ if (roomCode) socket.emit("online_play_card", { room: roomCode, card: cardKey }); }

function isPlayable(card){
  if (!state) return false;
  if (state.phase !== "playing") return false;
  if (mySeat === null || mySeat === undefined) return false;
  if (state.turn !== mySeat) return false;
  if (!state.leadSuit) return true;

  const hand = state.hands ? state.hands[mySeat] : null;
  if (!hand) return false;
  const hasLead = hand.some(c => c.suit === state.leadSuit);
  if (!hasLead) return true;
  return card.suit === state.leadSuit;
}

function render(){
  const namesWrap = el("olNames");
  if (namesWrap){
    namesWrap.innerHTML = "";
    const n = playerCount();
    const names = state?.names || Array.from({length:n}, (_,i)=>`Spiller ${i+1}`);
    for (let i=0;i<n;i++){
      const input = document.createElement("input");
      input.className = "input";
      input.value = names[i] || `Spiller ${i+1}`;
      input.disabled = true;
      namesWrap.appendChild(input);
    }
  }

  const info = el("olInfo");
  const roundSpan = el("olRound");
  const cardsPer = el("olCardsPer");

  if (!state){
    if (info) info.textContent = "Ikke startet";
    if (roundSpan) roundSpan.textContent = "-";
    if (cardsPer) cardsPer.textContent = "-";
    if (el("olLeader")) el("olLeader").textContent = "-";
    if (el("olLeadSuit")) el("olLeadSuit").textContent = "-";
    if (el("olWinner")) el("olWinner").textContent = "-";
    if (el("olTable")) el("olTable").innerHTML = "";
    if (el("olHands")) el("olHands").innerHTML = "";
    if (el("olNextRound")) el("olNextRound").disabled = true;
    if (el("olStartOnline")) el("olStartOnline").disabled = !roomCode;
    return;
  }

  const rNo = (state.roundIndex ?? 0) + 1;
  if (roundSpan) roundSpan.textContent = String(rNo);
  if (cardsPer) cardsPer.textContent = String(ROUND_CARDS[state.roundIndex ?? 0] ?? "-");

  if (info){
    if (state.phase === "lobby"){
      const joined = state.names.filter(Boolean).length;
      info.textContent = `Lobby · ${joined}/${state.n} spillere`;
    } else if (state.phase === "game_finished"){
      info.textContent = "Spil færdigt · 14 runder";
    } else if (state.phase === "round_finished"){
      info.textContent = `Runde ${rNo} færdig · Klik “Næste”`;
    } else if (state.phase === "between_tricks"){
      info.textContent = `Stik færdig · Vinder: ${state.names[state.winner]}`;
    } else {
      info.textContent = `Runde ${rNo} · Tur: ${state.names[state.turn]}`;
    }
  }

  if (el("olLeader")) el("olLeader").textContent = state.names[state.leader] ?? "-";
  if (el("olLeadSuit")) el("olLeadSuit").textContent = state.leadSuit ? `${state.leadSuit} (${SUIT_NAME[state.leadSuit]})` : "-";
  if (el("olWinner")) el("olWinner").textContent = (state.winner===null || state.winner===undefined) ? "-" : (state.names[state.winner] ?? "-");

  const table = el("olTable");
  if (table){
    table.innerHTML = "";
    table.style.gridTemplateColumns = `repeat(${Math.min(4,state.n)}, minmax(140px, 1fr))`;
    for (let i=0;i<state.n;i++){
      const slot = document.createElement("div");
      slot.className = "slot";

      const nm = document.createElement("div");
      nm.className = "name";
      const total = (state.tricksTotal && state.tricksTotal[i] !== undefined) ? state.tricksTotal[i] : 0;
      nm.textContent = `${state.names[i] || ("Spiller " + (i+1))} · total stik: ${total}`;

      const cd = document.createElement("div");
      cd.className = "card";
      const c = state.table ? state.table[i] : null;
      if (c){
        const ce = makeCardEl(c);
        ce.disabled = true;
        cd.appendChild(ce.firstChild);
      } else {
        cd.textContent = "—";
      }

      slot.appendChild(nm);
      slot.appendChild(cd);
      table.appendChild(slot);
    }
  }

  const hands = el("olHands");
  if (hands){
    hands.innerHTML = "";
    const mine = (mySeat!==null && mySeat!==undefined && state.hands) ? state.hands[mySeat] : null;

    if (mine){
      const h = document.createElement("div");
      h.className = "hand";

      const head = document.createElement("div");
      head.className = "head";
      const left = document.createElement("div");
      left.innerHTML = `<b>Din hånd</b> <span class="sub">(${mine.length} kort)</span>`;
      const right = document.createElement("div");
      right.className = "sub";
      right.textContent = (state.turn===mySeat && state.phase==="playing") ? "Din tur" : "";
      head.appendChild(left); head.appendChild(right);

      const cards = document.createElement("div");
      cards.className = "cards";
      for (const c of mine){
        const b = makeCardEl(c);
        b.disabled = !isPlayable(c);
        b.addEventListener("click", ()=>playCard(`${c.rank}${c.suit}`));
        cards.appendChild(b);
      }

      h.appendChild(head);
      h.appendChild(cards);
      hands.appendChild(h);
    } else {
      const p = document.createElement("div");
      p.className = "sub";
      p.textContent = roomCode ? "Vent på start." : "Opret eller join et rum.";
      hands.appendChild(p);
    }
  }

  if (el("olStartOnline")) el("olStartOnline").disabled = !(state.phase === "lobby");
  if (el("olNextRound")){
    el("olNextRound").disabled = !(state.phase === "between_tricks" || state.phase === "round_finished");
    if (state.phase === "between_tricks") el("olNextRound").textContent = "Næste stik";
    else if (state.phase === "round_finished") el("olNextRound").textContent = "Næste runde";
    else el("olNextRound").textContent = "Næste";
  }
}

el("olCreateRoom")?.addEventListener("click", createRoom);
el("olJoinRoom")?.addEventListener("click", joinRoom);
el("olLeaveRoom")?.addEventListener("click", leaveRoom);
el("olStartOnline")?.addEventListener("click", startOnline);
el("olNextRound")?.addEventListener("click", onNext);
el("olPlayerCount")?.addEventListener("change", () => render());

render();
