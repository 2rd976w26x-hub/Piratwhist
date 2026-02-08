// Piratwhist Online Multiplayer (v1.0.7)
// Online flow: lobby -> bidding -> playing -> between_tricks -> round_finished -> bidding ...
const SUIT_NAME = {"♠":"spar","♥":"hjerter","♦":"ruder","♣":"klør"};
const ROUND_CARDS = [7,6,5,4,3,2,1,1,2,3,4,5,6,7];

function el(id){ return document.getElementById(id); }

function rectCenter(elm){
  const r = elm.getBoundingClientRect();
  return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
}

function spawnFlyCard(x, y, faceText, isBack){
  const d = document.createElement("div");
  d.className = "flycard" + (isBack ? " back" : " cardface");
  d.style.left = (x - 32) + "px";
  d.style.top  = (y - 45) + "px";
  if (!isBack){
    d.textContent = faceText;
    // add trump badge if spade
    if (faceText.includes("♠")){
      const b = document.createElement("div");
      b.className = "badge";
      b.textContent = "TRUMF";
      d.appendChild(b);
    }
  }
  document.body.appendChild(d);
  return d;
}

function flyTo(elm, tx, ty, scale, opacity){
  const dx = tx - (parseFloat(elm.style.left) + 32);
  const dy = ty - (parseFloat(elm.style.top) + 45);
  elm.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
  if (opacity !== undefined) elm.style.opacity = String(opacity);
}

function runDealAnimation(){
  const deck = el("olDeck");
  if (!deck) return;
  const deckC = rectCenter(deck);
  const n = state?.n || 0;
  // Find player cards/areas on screen
  const targets = [];
  for (let i=0;i<n;i++){
    const target = document.querySelector(`[data-seat="${i}"]`);
    if (target) targets.push({seat:i, el:target});
  }
  if (!targets.length) return;

  const cardsPer = (state?.hands && state.hands[0] ? state.hands[0].length : null);
  const per = (typeof cardsPer === "number") ? cardsPer : 1;

  // deal: per rounds, to each seat
  let t = 0;
  for (let c=0;c<per;c++){
    for (const tg of targets){
      setTimeout(() => {
        const cc = rectCenter(tg.el);
        const fc = spawnFlyCard(deckC.x, deckC.y, "", true);
        // trigger transition
        requestAnimationFrame(()=> flyTo(fc, cc.x, cc.y, 0.92, 0.98));
        setTimeout(()=> { fc.style.opacity="0"; setTimeout(()=> fc.remove(), 240); }, 560);
      }, t);
      t += 70;
    }
  }
}

function runPlayAnimation(seat, cardText){
  const pile = el("olPile");
  const deck = el("olDeck");
  if (!pile) return;
  const srcEl = document.querySelector(`[data-seat="${seat}"]`) || deck;
  if (!srcEl) return;
  const sc = rectCenter(srcEl);
  const pc = rectCenter(pile);
  const fc = spawnFlyCard(sc.x, sc.y, cardText, false);
  requestAnimationFrame(()=> flyTo(fc, pc.x, pc.y, 0.96, 1));
  setTimeout(()=> { fc.style.opacity="0"; setTimeout(()=> fc.remove(), 240); }, 620);
}

function highlightWinner(){
  const w = state?.winner;
  if (w === null || w === undefined) return;
  const cardEl = document.querySelector(`#olTable [data-seat-card="${w}"]`);
  if (!cardEl) return;
  cardEl.classList.add("winnerGlow");
  setTimeout(()=> cardEl.classList.remove("winnerGlow"), 950);
}


function setHidden(id, hidden){
  const e = el(id);
  if (!e) return;
  e.classList.toggle("hidden", !!hidden);
}

function showRoomWarn(msg){
  const w = el("olRoomWarn");
  if (!w) return;
  if (!msg){ w.classList.add("hidden"); w.textContent=""; return; }
  w.textContent = msg;
  w.classList.remove("hidden");
}

function showWarn(msg){
  const w = el("olWarn");
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
let autoJoinRequested = false;
let mySeat = null;
let state = null;
let prevState = null;

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
  prevState = state;
  state = payload.state;
  updateOnlinePageFromState();

  const rl = el("olRoomLabel"); if (rl) rl.textContent = roomCode || "-";
  const sl = el("olSeatLabel"); if (sl) sl.textContent = (mySeat===null || mySeat===undefined) ? "-" : `Spiller ${mySeat+1}`;
  showRoomWarn("");
  showWarn("");
  syncPlayerCount();
  updateAutoBotCountDisplay();
  maybeRunAnimations();
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
  showWarn("");
  render();
});

function myName(){ return (el("olMyName")?.value || "").trim() || "Spiller"; }
function playerCount(){ return parseInt(el("olPlayerCount")?.value || "4", 10); }

function getHumanCount(){
  if (state && Array.isArray(state.names)){
    const botSeats = new Set(state.botSeats || []);
    return state.names.reduce((count, name, idx) => {
      if (!name) return count;
      if (botSeats.has(idx)) return count;
      return count + 1;
    }, 0);
  }
  return 1;
}
function autoBotCount(){
  const humans = getHumanCount();
  return Math.max(0, playerCount() - humans);
}
function updateAutoBotCountDisplay(){
  const botEl = el("olBotCount");
  if (!botEl) return;
  const value = autoBotCount();
  if ("value" in botEl) botEl.value = String(value);
  else botEl.textContent = String(value);
  if ("readOnly" in botEl) botEl.readOnly = true;
}
function botCount(){
  return 0;
}



function syncPlayerCount(){
  const sel = el("olPlayerCount");
  if (!sel) return;
  if (roomCode && state && typeof state.n === "number"){
    sel.value = String(state.n);
    sel.disabled = true; // room decides player count
  } else {
    sel.disabled = false;
  }
  updateAutoBotCountDisplay();
}


function createRoom(){ socket.emit("online_create_room", { name: myName(), players: playerCount(), bots: 0 }); }
function joinRoom(){ socket.emit("online_join_room", { room: normalizeCode(el("olRoomCode")?.value), name: myName() }); }
function leaveRoom(){ if (roomCode) socket.emit("online_leave_room", { room: roomCode }); }
function startOnline(){ if (roomCode) socket.emit("online_start_game", { room: roomCode }); }
function onNext(){ if (roomCode) socket.emit("online_next", { room: roomCode }); }
function submitBid(){ 
  if (!roomCode) return;
  const v = parseInt(el("olBidSelect")?.value || "0", 10);
  socket.emit("online_set_bid", { room: roomCode, bid: v });
}
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

function renderBidUI(cardsPer){
  const max = cardsPer ?? 0;
  const maxEl = el("olBidMax");
  if (maxEl) maxEl.textContent = String(max);

  const sel = el("olBidSelect");
  if (sel){
    sel.innerHTML = "";
    for (let i=0;i<=max;i++){
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      sel.appendChild(opt);
    }
  }

  const bids = state?.bids || [];
  const myBid = (mySeat!==null && mySeat!==undefined) ? bids[mySeat] : null;
  const status = el("olBidStatus");
  if (status){
    if (state.phase === "lobby") status.textContent = "Lobby";
    else if (state.phase === "bidding") status.textContent = "Afgiv bud";
    else status.textContent = "Bud låst";
  }

  const btn = el("olBidSubmit");
  if (btn){
    const canBid = (state.phase === "bidding") && (mySeat!==null && mySeat!==undefined) && (myBid===null || myBid===undefined);
    btn.disabled = !canBid;
  }
  if (sel){
    sel.disabled = !((state.phase==="bidding") && (mySeat!==null && mySeat!==undefined) && (myBid===null || myBid===undefined));
  }

  // bids list
  const list = el("olBidsList");
  if (list){
    const n = state?.n || playerCount();
    const names = state?.names || Array.from({length:n}, (_,i)=>`Spiller ${i+1}`);
    const parts = [];
    for (let i=0;i<n;i++){
      const b = bids[i];
      parts.push(`<b>${names[i] || ("Spiller " + (i+1))}</b>: ${(b===null||b===undefined) ? "—" : b}`);
    }
    list.innerHTML = parts.join(" · ");
  }
}

function renderScores(){
  const n = state?.n || playerCount();
  const names = state?.names || Array.from({length:n}, (_,i)=>`Spiller ${i+1}`);
  const total = state?.pointsTotal || Array.from({length:n}, ()=>0);
  const bids = state?.bids || [];
  const taken = state?.tricksRound || Array.from({length:n}, ()=>0);

  const rNo = (state?.roundIndex ?? 0) + 1;
  const cardsPer = ROUND_CARDS[state?.roundIndex ?? 0] ?? "-";
  if (el("olResRound")) el("olResRound").textContent = String(rNo);
  if (el("olResCards")) el("olResCards").textContent = String(cardsPer);

  // Score table (current round snapshot)
  const t = el("olScoreTable");
  if (t){
    t.innerHTML = "";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Spiller</th><th>Bud</th><th>Aktuelle stik</th><th>Total point</th></tr>`;
    const tbody = document.createElement("tbody");
    for (let i=0;i<n;i++){
      const tr = document.createElement("tr");
      const b = bids[i];
      tr.innerHTML = `<td>${names[i] || ("Spiller " + (i+1))}</td>
                      <td>${(b===null||b===undefined) ? "—" : b}</td>
                      <td>${taken[i] ?? 0}</td>
                      <td><b>${total[i] ?? 0}</b></td>`;
      tbody.appendChild(tr);
    }
    t.appendChild(thead);
    t.appendChild(tbody);
  }

  // History table (per round)
  const h = el("olHistoryTable");
  if (h){
    const hist = state?.history || [];
    h.innerHTML = "";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Runde</th><th>Kort</th><th>Bud</th><th>Stik</th><th>Point (runde)</th></tr>`;
    const tbody = document.createElement("tbody");
    for (const row of hist){
      const bidsStr = row.bids.map((x,i)=>`${names[i]||("S"+(i+1))}:${x}`).join(" · ");
      const takeStr = row.taken.map((x,i)=>`${names[i]||("S"+(i+1))}:${x}`).join(" · ");
      const ptsStr  = row.points.map((x,i)=>`${names[i]||("S"+(i+1))}:${x}`).join(" · ");
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.round}</td><td>${row.cardsPer}</td><td>${bidsStr}</td><td>${takeStr}</td><td>${ptsStr}</td>`;
      tbody.appendChild(tr);
    }
    h.appendChild(thead);
    h.appendChild(tbody);
  }
}

function maybeRunAnimations(){
  if (!state) return;

  // Deal animation: when roundIndex changes OR phase enters bidding and previous wasn't bidding for same round
  const pr = prevState?.roundIndex;
  const cr = state.roundIndex;
  const dealKey = `dealDone_${cr}`;
  if (!window.__pwDealDone) window.__pwDealDone = {};
  const shouldDeal = (pr !== cr) || (prevState?.phase !== "bidding" && state.phase === "bidding");
  if (shouldDeal && !window.__pwDealDone[dealKey] && state.hands){
    window.__pwDealDone[dealKey] = true;
    setTimeout(runDealAnimation, 260);
  }

  // Play animations: detect newly placed cards on table
  if (prevState && Array.isArray(prevState.table) && Array.isArray(state.table)){
    for (let i=0;i<state.table.length;i++){
      const a = prevState.table[i];
      const b = state.table[i];
      if (!a && b){
        runPlayAnimation(i, `${b.rank}${b.suit}`);
      }
    }
  }

  // Winner highlight when trick completes
  if (prevState && prevState.phase !== state.phase){
    if (state.phase === "between_tricks" || state.phase === "round_finished"){
      setTimeout(highlightWinner, 120);
    }
  }
}

function render(){
  // lobby names view
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
  const cardsPerEl = el("olCardsPer");

  if (!state){
    if (info) info.textContent = "Ikke startet";
    if (roundSpan) roundSpan.textContent = "-";
    if (cardsPerEl) cardsPerEl.textContent = "-";
    if (el("olLeader")) el("olLeader").textContent = "-";
    if (el("olLeadSuit")) el("olLeadSuit").textContent = "-";
    if (el("olWinner")) el("olWinner").textContent = "-";
    if (el("olTable")) el("olTable").innerHTML = "";
    if (el("olHands")) el("olHands").innerHTML = "";
    if (el("olNextRound")) el("olNextRound").disabled = true;
    if (el("olStartOnline")) el("olStartOnline").disabled = !roomCode;
    setHidden("olScores", true);
    return;
  }

  setHidden("olScores", false);

  const rNo = (state.roundIndex ?? 0) + 1;
  const cardsPer = ROUND_CARDS[state.roundIndex ?? 0] ?? 0;
  if (roundSpan) roundSpan.textContent = String(rNo);
  if (cardsPerEl) cardsPerEl.textContent = String(cardsPer);

  // top info
  if (info){
    if (state.phase === "lobby"){
      const joined = state.names.filter(Boolean).length;
      info.textContent = `Lobby · ${joined}/${state.n} spillere`;
    } else if (state.phase === "bidding"){
      info.textContent = `Runde ${rNo} · Afgiv bud`;
    } else if (state.phase === "game_finished"){
      info.textContent = "Spil færdigt · 14 runder";
    } else if (state.phase === "round_finished"){
      info.textContent = `Runde ${rNo} færdig · Klik “Næste runde”`;
    } else if (state.phase === "between_tricks"){
      info.textContent = `Stik færdig · Vinder: ${state.names[state.winner]}`;
    } else {
      info.textContent = `Runde ${rNo} · Tur: ${state.names[state.turn]}`;
    }
  }

  if (el("olLeader")) el("olLeader").textContent = state.names[state.leader] ?? "-";
  if (el("olLeadSuit")) el("olLeadSuit").textContent = state.leadSuit ? `${state.leadSuit} (${SUIT_NAME[state.leadSuit]})` : "-";
  if (el("olWinner")) el("olWinner").textContent = (state.winner===null || state.winner===undefined) ? "-" : (state.names[state.winner] ?? "-");

  // bidding UI
  renderBidUI(cardsPer);

  // table
  const table = el("olTable");
  if (table){
    table.innerHTML = "";
    table.style.gridTemplateColumns = `repeat(${Math.min(4,state.n)}, minmax(140px, 1fr))`;
    for (let i=0;i<state.n;i++){
      const slot = document.createElement("div");
      slot.className = "slot";

      const nm = document.createElement("div");
      nm.className = "name";
      const totalTricks = (state.tricksTotal && state.tricksTotal[i] !== undefined) ? state.tricksTotal[i] : 0;
      const roundTricks = (state.tricksRound && state.tricksRound[i] !== undefined) ? state.tricksRound[i] : 0;
      nm.textContent = `${state.names[i] || ("Spiller " + (i+1))} · runde: ${roundTricks} · total: ${totalTricks}`;

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

  // my hand only
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

  // buttons
  if (el("olStartOnline")) el("olStartOnline").disabled = !(state.phase === "lobby");
  if (el("olNextRound")){
    el("olNextRound").disabled = !(state.phase === "between_tricks" || state.phase === "round_finished");
    if (state.phase === "between_tricks") el("olNextRound").textContent = "Næste stik";
    else if (state.phase === "round_finished") el("olNextRound").textContent = "Næste runde";
    else el("olNextRound").textContent = "Næste";
  }

  renderScores();
}

el("olCreateRoom")?.addEventListener("click", createRoom);
el("olJoinRoom")?.addEventListener("click", joinRoom);
el("olLeaveRoom")?.addEventListener("click", leaveRoom);
el("olStartOnline")?.addEventListener("click", startOnline);
el("olNextRound")?.addEventListener("click", onNext);
el("olBidSubmit")?.addEventListener("click", submitBid);
el("olPlayerCount")?.addEventListener("change", () => { updateAutoBotCountDisplay(); render(); });

render();
updateAutoBotCountDisplay();


function setOnlinePage(which){
  document.body.classList.remove("ol-show-lobby","ol-show-game");
  if (which === "game") document.body.classList.add("ol-show-game");
  else document.body.classList.add("ol-show-lobby");
}

function updateOnlinePageFromState(){
  // Show lobby until we are in a room and have state
  if (roomCode && state) setOnlinePage("game");
  else setOnlinePage("lobby");
}

document.addEventListener("DOMContentLoaded", () => {
  // Room page: require code + name (from query or sessionStorage)
  const params = new URLSearchParams(window.location.search);
  const codeParam = (params.get("code") || params.get("room") || sessionStorage.getItem("pw_online_code") || "").trim().toUpperCase();
  const nameParam = (params.get("name") || sessionStorage.getItem("pw_online_name") || "").trim();

  if (!codeParam || !nameParam) {
    window.location.href = "/online.html";
    return;
  }

  roomCode = codeParam;
  myName = nameParam;
  sessionStorage.setItem("pw_online_code", roomCode);
  sessionStorage.setItem("pw_online_name", myName);

  const myNameEl = el("olMyName");
  if (myNameEl) myNameEl.value = myName;

  // Join immediately (socket may already be connected)
  if (socket && socket.connected && !autoJoinRequested) {
    socket.emit("online_join_room", { code: roomCode, name: myName });
    autoJoinRequested = true;
  }

  const backBtn = document.getElementById("olBackToLobbyBtn");
  if (backBtn){
    backBtn.addEventListener("click", () => {
      try{
        if (roomCode){
          socket.emit("online_leave", { room: roomCode });
        }
      }catch(e){}
      roomCode = "";
      state = null;
      mySeat = null;
      updateOnlinePageFromState();
      syncPlayerCount();
      updateAutoBotCountDisplay();
    });
  }
  updateOnlinePageFromState();
  // Apply config (host only)
  el("olApplyConfig")?.addEventListener("click", () => {
    if (!roomCode) return;
    const pc = parseInt(el("olPlayerCount")?.value || "4", 10);
    socket.emit("online_set_config", { code: roomCode, player_count: pc, bot_count: 0 });
  });

});
