// Piratwhist Online Multiplayer (v0.2.23)
// Online flow: lobby -> bidding -> playing -> between_tricks -> round_finished -> bidding ...
const SUIT_NAME = {"♠":"spar","♥":"hjerter","♦":"ruder","♣":"klør"};
const APP_VERSION = "0.2.23";
// v0.2.23: Only winner sweep animation. No per-card flying during normal play.
const ENABLE_FLY = false;
const ROUND_CARDS = [7,6,5,4,3,2,1,1,2,3,4,5,6,7];

// Stable client identity across page navigations (keeps host seat on redirect)
function getClientId(){
  try {
    const k = "pw_client_id";
    let v = localStorage.getItem(k);
    if (!v){
      v = (crypto?.randomUUID ? crypto.randomUUID() : ("cid_" + Math.random().toString(16).slice(2) + Date.now()));
      localStorage.setItem(k, v);
    }
    return v;
  } catch(e){
    return "cid_" + Math.random().toString(16).slice(2);
  }
}

// Persist player display name across page redirects (multi-page online UI)
function getStoredName(){
  try { return (localStorage.getItem("pw_player_name") || "").trim(); } catch(e){ return ""; }
}
function setStoredName(v){
  try { localStorage.setItem("pw_player_name", (v||"").trim()); } catch(e){}
}

let joinInProgress = false;
let pendingJoinRoom = null;
let pendingCreateRoom = false;


function el(id){ return document.getElementById(id); }

// --- v0.2.23: dynamic round-table board (2–8 players) ---
let __pwBoardBuiltFor = null;

function ensurePlayBoard(n){
  const seatsWrap = el("olBoardSeats");
  const slotsWrap = el("olTrickSlots");
  if (!seatsWrap || !slotsWrap) return;
  if (__pwBoardBuiltFor === n && seatsWrap.children.length === n && slotsWrap.children.length === n) return;
  __pwBoardBuiltFor = n;
  seatsWrap.innerHTML = "";
  slotsWrap.innerHTML = "";

  for (let i=0;i<n;i++){
    // Seat UI
    const seat = document.createElement("div");
    seat.className = "seat dyn";
    seat.dataset.seat = String(i);
    seat.innerHTML = `
      <div class="seatName" id="olSeatName${i}">-</div>
      <div class="seatBadges">
        <span class="chip budChip">Bud: <span id="olSeatBid${i}">—</span></span>
        <span class="chip trickChip">Stik: <span id="olSeatTricks${i}">0</span></span>
        <span class="chip totalChip ghost">Total: <span id="olSeatTotal${i}">0</span></span>
      </div>
      <div class="seatPile" id="olSeatPile${i}" title="Stik vundet"></div>
    `;
    seatsWrap.appendChild(seat);

    // Trick slot (played card position near center)
    const slot = document.createElement("div");
    slot.className = "played dyn";
    slot.id = `olTrickSlot${i}`;
    slotsWrap.appendChild(slot);
  }
}

function positionPlayBoard(n){
  const seatsWrap = el("olBoardSeats");
  const slotsWrap = el("olTrickSlots");
  const board = document.querySelector(".board");
  if (!seatsWrap || !slotsWrap || !board) return;

  const my = (typeof mySeat === "number" && mySeat >= 0) ? mySeat : 0;
  // Seat ring radius in % (tuned for desktop + responsive CSS scales it)
  const seatR = (n <= 2) ? 42 : (n <= 4 ? 44 : 46);
  const slotR = 18;

  for (let i=0;i<n;i++){
    const rel = (i - my + n) % n;
    const ang = (90 + (rel * 360 / n)) * Math.PI / 180;
    const x = 50 + seatR * Math.cos(ang);
    const y = 50 + seatR * Math.sin(ang);

    const seatEl = seatsWrap.querySelector(`[data-seat="${i}"]`);
    if (seatEl){
      seatEl.style.left = x.toFixed(2) + "%";
      seatEl.style.top  = y.toFixed(2) + "%";
    }

    const sx = 50 + slotR * Math.cos(ang);
    const sy = 50 + slotR * Math.sin(ang);
    const slotEl = el(`olTrickSlot${i}`);
    if (slotEl){
      slotEl.style.left = sx.toFixed(2) + "%";
      slotEl.style.top  = sy.toFixed(2) + "%";
    }
  }
}

function desiredPathForPhase(phase){
  const map = {
    "lobby": "/online_lobby.html",
    "bidding": "/online_bidding.html",
    "playing": "/online_play.html",
    "between_tricks": "/online_play.html",
    "round_finished": "/online_result.html",
    "game_finished": "/online_result.html"
  };
  return map[phase] || "/online_lobby.html";
}

function currentPathName(){
  try { return window.location.pathname || ""; } catch(e){ return ""; }
}

function maybeRedirectForPhase(){
  if (!state || !roomCode) return false;
  const desired = desiredPathForPhase(state.phase);
  const here = currentPathName();
  const isEntry = here.endsWith("/online.html") || here === "/online.html" || here.endsWith("online.html");
  const desiredFile = desired.split("/").pop();
  const onDesired = here.endsWith("/" + desiredFile) || here.endsWith(desiredFile);

  const target = `${desired}?code=${encodeURIComponent(roomCode)}`;
  if (isEntry){
    // entry always moves into the phase pages once joined
    window.location.replace(target);
    return true;
  }
  if (!onDesired){
    window.location.replace(target);
    return true;
  }
  return false;
}


function rectCenter(elm){
  const r = elm.getBoundingClientRect();
  return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
}

function spawnFlyCard(x, y, cardOrText, isBack){
  const d = document.createElement("div");
  const w = 72, h = 102;
  d.dataset.hw = String(w/2);
  d.dataset.hh = String(h/2);
  d.className = "flycard" + (isBack ? " back" : " cardface");
  d.style.left = (x - w/2) + "px";
  d.style.top  = (y - h/2) + "px";

  if (!isBack){
    // Render a real playingcard so you can actually see it fly.
    // Accept either {rank,suit} or a compact string like "Q♣".
    let card = null;
    if (cardOrText && typeof cardOrText === "object") card = cardOrText;
    else if (typeof cardOrText === "string" && cardOrText.length >= 2){
      const suit = cardOrText.slice(-1);
      const rank = cardOrText.slice(0, -1);
      card = { rank, suit };
    }
    if (card){
      const btn = makeCardEl(card);
      const face = btn.firstChild;
      face.style.transform = "none";
      d.appendChild(face);
    }
  }
  document.body.appendChild(d);
  return d;
}

function flyTo(elm, tx, ty, scale, opacity){
  const hw = parseFloat(elm.dataset.hw || "32");
  const hh = parseFloat(elm.dataset.hh || "45");
  const dx = tx - (parseFloat(elm.style.left) + hw);
  const dy = ty - (parseFloat(elm.style.top) + hh);
  elm.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
  if (opacity !== undefined) elm.style.opacity = String(opacity);
}

function flyArc(elm, tx, ty, opts){
  const hw = parseFloat(elm.dataset.hw || "32");
  const hh = parseFloat(elm.dataset.hh || "45");
  const sx = parseFloat(elm.style.left) + hw;
  const sy = parseFloat(elm.style.top) + hh;
  const dx = tx - sx;
  const dy = ty - sy;

  const dur = (opts && opts.duration) ? opts.duration : 2400;
  const peak = (opts && typeof opts.peak === "number") ? opts.peak : Math.max(26, Math.min(70, Math.abs(dy) * 0.18));
  const rot  = (opts && typeof opts.rotate === "number") ? opts.rotate : (dx >= 0 ? 6 : -6);
  const scl  = (opts && typeof opts.scale === "number") ? opts.scale : 0.98;
  const easing = (opts && opts.easing) ? opts.easing : "cubic-bezier(.18,.92,.22,1)";

  // WAAPI animation so we can create a visible arc and ensure the card is clearly flying.
  // Return the Animation object so callers can reliably clean up on finish.
  if (!elm.animate){
    // Fallback (very old browsers): use a straight flight
    flyTo(elm, tx, ty, scl, 1);
    return null;
  }
  return elm.animate([
    { transform: `translate3d(0px, 0px, 0) rotate(0deg) scale(1)` },
    { transform: `translate3d(${dx*0.55}px, ${dy*0.55 - peak}px, 0) rotate(${rot*0.7}deg) scale(${(1+scl)/2})` },
    { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg) scale(${scl})` },
  ], { duration: dur, easing, fill: "forwards" });
}

function runDealAnimation(){
  if (!ENABLE_FLY) return;
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

function runPlayAnimation(seat, cardObj, srcRect){
  if (!ENABLE_FLY) return;
  const pile = el("olPile");
  const deck = el("olDeck");
  if (!pile) return;

  // Prefer a dedicated trick slot on the board (one per seat)
  const dst = el(`olTrickSlot${seat}`) || pile;

  // Prefer the seat box on the board as source (fallback to deck)
  let sc = null;
  if (srcRect && typeof srcRect.left === "number"){
    sc = { x: srcRect.left + srcRect.width/2, y: srcRect.top + srcRect.height/2 };
  } else {
    const srcEl = document.querySelector(`.board [data-seat="${seat}"]`) ||
                  document.querySelector(`[data-seat="${seat}"]`) ||
                  deck;
    if (!srcEl) return;
    sc = rectCenter(srcEl);
  }
  const dc = rectCenter(dst);

  // IMPORTANT stability rule:
  // Never hide the real destination slot. If animation fails or is interrupted
  // (reload, phase change, race), hidden slots can leave the table looking empty.
  // Instead we always animate a ghost card above the board.

  const fc = spawnFlyCard(sc.x, sc.y, cardObj, false);
  // Slightly slower + arc so it is clearly visible
  fc.style.opacity = "1";
  const dur = 3000;
  const anim = flyArc(fc, dc.x, dc.y, { duration: dur, rotate: (seat === 0 ? -4 : 4), scale: 1.0 });

  const finish = () => {
    fc.style.opacity = "0";
    setTimeout(()=> fc.remove(), 260);
  };

  if (anim && typeof anim.finished !== "undefined"){
    anim.finished.then(finish).catch(finish);
  } else {
    // fallback
    setTimeout(finish, dur + 80);
  }
}


function spawnFlyStack(x, y, label){
  const d = document.createElement("div");
  d.className = "flystack";
  d.style.left = (x - 48) + "px";
  d.style.top  = (y - 66) + "px";
  d.textContent = label || "STIK";
  document.body.appendChild(d);
  return d;
}

function runTrickSweepAnimation(winnerSeat, cardsBySeat){
  const pile = el("olPile");
  if (!pile) return;

  // Destination: winner seat's pile/label; fallback to winner seat container.
  const dstEl = el(`olSeatPile${winnerSeat}`) ||
    document.querySelector(`.seat[data-seat="${winnerSeat}"] .seatName`) ||
    document.querySelector(`.seat[data-seat="${winnerSeat}"]`) ||
    pile;

  const dstRect = dstEl.getBoundingClientRect();
  const dstX = dstRect.left + dstRect.width/2;
  const dstY = dstRect.top + dstRect.height/2;

  // Animate every card currently in the center pile to the winner.
  // cardsBySeat is an array indexed by seat; each entry is the card object played by that seat (or null).
  const seatCount = playerCount();

  for (let s=0; s<seatCount; s++){
    const card = (cardsBySeat && cardsBySeat[s]) ? cardsBySeat[s] : null;
    if (!card) continue;

    // Find the rendered center slot for that seat (we render slots with data-seat).
    const srcEl = document.querySelector(`#olTrickSlot${s} .playingcard`) || document.getElementById(`olTrickSlot${s}`) || pile;

    const srcRect = srcEl.getBoundingClientRect();
    const srcX = srcRect.left + srcRect.width/2;
    const srcY = srcRect.top + srcRect.height/2;

    // Ghost card – real face so the user can see it move.
    const ghost = document.createElement("div");
    ghost.className = "flycard";
    ghost.style.left = (srcRect.left) + "px";
    ghost.style.top = (srcRect.top) + "px";
    ghost.style.width = srcRect.width + "px";
    ghost.style.height = srcRect.height + "px";
    ghost.style.pointerEvents = "none";
    ghost.style.transformOrigin = "center center";

    // Render the actual card face inside the ghost
    ghost.appendChild(renderCardFace(card));
    document.body.appendChild(ghost);

    const dx = (dstX - srcX);
    const dy = (dstY - srcY);

    const anim = ghost.animate([
      { transform: "translate(0px, 0px) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.88) rotate(6deg)`, opacity: 0.98 }
    ], {
      duration: 1600,
      easing: "cubic-bezier(0.2,0.8,0.2,1)",
      fill: "forwards"
    });

    anim.finished.then(() => {
      ghost.remove();
    }).catch(()=>{ try{ghost.remove();}catch(e){} });
  }
}


function highlightWinner(){
  const w = state?.winner;
  if (w === null || w === undefined) return;

  const els = [];
  const cardEl = document.querySelector(`#olTable [data-seat-card="${w}"]`);
  if (cardEl) els.push(cardEl);
  const slot = el(`olTrickSlot${w}`);
  if (slot) els.push(slot);

  els.forEach(e=> e.classList.add("winnerGlow"));
  setTimeout(()=> els.forEach(e=> e.classList.remove("winnerGlow")), 950);
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
  btn.appendChild(renderCardFace(card));
  return btn;
}

function renderCardFace(card){
  const red = (card.suit === "♥" || card.suit === "♦");
  const wrap = document.createElement("div");
  wrap.className = "playingcard" + (red ? " red" : "");

  const c1 = document.createElement("div");
  c1.className = "corner tl";
  c1.innerHTML = `<div class="rk">${card.rank}</div><div class="st">${card.suit}</div>`;

  const c2 = document.createElement("div");
  c2.className = "corner br";
  c2.innerHTML = `<div class="rk">${card.rank}</div><div class="st">${card.suit}</div>`;

  const svg = buildCardSVG(card);
  wrap.appendChild(c1);
  wrap.appendChild(svg);
  wrap.appendChild(c2);
  return wrap;
}

// SVG card face (no copyrighted art). Normal playing-card pips for 2–10,
// and a simple vector "portrait" for J/Q/K.
function buildCardSVG(card){
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 140");
  svg.setAttribute("class", "cardface-svg");

  const suit = card.suit;
  const rank = String(card.rank);

  function pip(x, y, size, rotate){
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("font-size", String(size));
    t.setAttribute("class", "pip");
    t.textContent = suit;
    if (rotate){
      t.setAttribute("transform", `rotate(${rotate} ${x} ${y})`);
    }
    svg.appendChild(t);
  }

  const isFace = (rank === "J" || rank === "Q" || rank === "K");
  const isAce  = (rank === "A");

  if (isFace){
    // Vector "portrait" in a classic card style (no copyrighted art).
    const frame = document.createElementNS(NS, "rect");
    frame.setAttribute("x","18"); frame.setAttribute("y","28");
    frame.setAttribute("width","64"); frame.setAttribute("height","84");
    frame.setAttribute("rx","10");
    frame.setAttribute("class","face-bg");
    svg.appendChild(frame);

    // Head + body
    const head = document.createElementNS(NS, "circle");
    head.setAttribute("cx","50"); head.setAttribute("cy","60");
    head.setAttribute("r","10");
    head.setAttribute("class","face-fill");
    svg.appendChild(head);

    const body = document.createElementNS(NS, "path");
    body.setAttribute("d","M34 108 Q50 86 66 108 L66 112 Q50 124 34 112 Z");
    body.setAttribute("class","face-fill");
    svg.appendChild(body);

    // Crown/tiara/helmet hint
    const hat = document.createElementNS(NS, "path");
    if (rank === "K"){
      hat.setAttribute("d","M34 56 L38 46 L44 58 L50 44 L56 58 L62 46 L66 56 L66 62 L34 62 Z");
    } else if (rank === "Q"){
      hat.setAttribute("d","M34 58 Q50 40 66 58 L62 50 Q50 46 38 50 Z");
    } else {
      hat.setAttribute("d","M34 56 Q50 48 66 56 L66 66 Q50 70 34 66 Z");
    }
    hat.setAttribute("class","face-line");
    svg.appendChild(hat);

    // Big center suit
    pip(50, 84, 38, 0);

    // Rank banner
    const banner = document.createElementNS(NS, "rect");
    banner.setAttribute("x","30"); banner.setAttribute("y","94");
    banner.setAttribute("width","40"); banner.setAttribute("height","18");
    banner.setAttribute("rx","6");
    banner.setAttribute("class","face-banner");
    svg.appendChild(banner);

    const rt = document.createElementNS(NS, "text");
    rt.setAttribute("x","50"); rt.setAttribute("y","103");
    rt.setAttribute("text-anchor","middle");
    rt.setAttribute("dominant-baseline","middle");
    rt.setAttribute("class","face-rank");
    rt.textContent = rank;
    svg.appendChild(rt);

    return svg;
  }

  if (isAce){
    pip(50, 74, 64, 0);
    pip(26, 46, 18, 0);
    pip(74, 102, 18, 180);
    return svg;
  }

  const n = parseInt(rank, 10);
  const layouts = {
    2:  [[50, 44],[50, 104]],
    3:  [[50, 38],[50, 74],[50, 110]],
    4:  [[34, 44],[66, 44],[34, 104],[66, 104]],
    5:  [[34, 44],[66, 44],[50, 74],[34, 104],[66, 104]],
    6:  [[34, 40],[66, 40],[34, 74],[66, 74],[34, 108],[66, 108]],
    7:  [[34, 38],[66, 38],[34, 68],[66, 68],[50, 74],[34, 108],[66, 108]],
    8:  [[34, 36],[66, 36],[34, 62],[66, 62],[34, 86],[66, 86],[34, 112],[66, 112]],
    9:  [[34, 34],[66, 34],[34, 58],[66, 58],[50, 74],[34, 92],[66, 92],[34, 116],[66, 116]],
    10: [[30, 34],[70, 34],[34, 56],[66, 56],[30, 78],[70, 78],[34, 100],[66, 100],[30, 122],[70, 122]],
  };

  const pts = layouts[n] || [[50,74]];
  for (const [x,y] of pts){
    const rot = (y > 74) ? 180 : 0;
    const size = (n >= 8) ? 20 : 22;
    pip(x, y, size, rot);
  }
  return svg;
}

function normalizeCode(s){ return (s || "").trim(); }



function bootFromUrl(){
  const qp = new URLSearchParams(window.location.search || "");
  const code = normalizeCode(qp.get("code"));
  if (!code) return;

  // Keep any visible input in sync (only exists on the entry page)
  const rc = el("olRoomCode");
  if (rc) rc.value = code;

  // Important: phase pages may not have an input field, so we must
  // join using the URL code directly.
  // Guard against duplicate joins: bootFromUrl runs both on DOMContentLoaded and on
  // socket connect. Without a guard we can join twice and get a new seat.
  if (!roomCode && !joinInProgress) joinRoom(code);
}
const socket = io({ transports: ["websocket", "polling"] });


function emitWhenConnected(fn){
  if (socket && socket.connected){
    fn();
    return;
  }
  // Socket.IO will connect automatically, but we defer emits until we are connected
  try { socket.connect(); } catch(e){ /* ignore */ }
  const once = () => {
    socket.off("connect", once);
    fn();
  };
  socket.on("connect", once);
}
let roomCode = null;
let mySeat = null;
let state = null;
let prevState = null;

socket.on("connect", () => {
  const s = el("olRoomStatus");
  if (s) s.textContent = "Forbundet.";
  bootFromUrl();
});

document.addEventListener("DOMContentLoaded", () => {
  // In case the socket connects after DOM is ready or the page is restored
  // from bfcache.
  bootFromUrl();

  // Keep the round-table layout stable on resize / orientation change.
  window.addEventListener("resize", () => {
    try{
      if (state && el("olCenter")){
        ensurePlayBoard(state.n);
        positionPlayBoard(state.n);
      }
    }catch(e){ /* ignore */ }
  });
  pendingCreateRoom = false;
});

socket.on("error", (data) => {
  joinInProgress = false;
  pendingJoinRoom = null;
  pendingCreateRoom = false;
  showRoomWarn(data?.message || "Ukendt fejl");
});

socket.on("online_state", (payload) => {
  joinInProgress = false;
  pendingJoinRoom = null;
  pendingCreateRoom = false;
  roomCode = payload.room;
  if (payload.seat !== null && payload.seat !== undefined) mySeat = payload.seat;
  prevState = state;
  state = payload.state;

  // Expose the current phase to CSS (for responsive layout + hiding side panels during play)
  try{
    const phases = ["lobby","bidding","playing","between_tricks","round_finished","game_finished"];
    phases.forEach(p=> document.body.classList.remove(`phase-${p}`));
    if (state?.phase) document.body.classList.add(`phase-${state.phase}`);
  }catch(e){ /* ignore */ }

  const rl = el("olRoomLabel"); if (rl) rl.textContent = roomCode || "-";
  const sl = el("olSeatLabel");
  if (sl){
    if (mySeat===null || mySeat===undefined) sl.textContent = "-";
    else sl.textContent = (state?.names?.[mySeat] ? state.names[mySeat] : `Spiller ${mySeat+1}`);
  }
  showRoomWarn("");
  showWarn("");
  syncPlayerCount();
  syncBotCount();
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

function myName(){
  const v = (el("olMyName")?.value || "").trim();
  const s = getStoredName();
  return v || s || "Spiller";
}
function playerCount(){ return parseInt(el("olPlayerCount")?.value || "4", 10); }

function populateBotOptions(){
  const players = playerCount();
  const sel = el("olBotCount");
  if (!sel) return;
  const prev = sel.value || "0";
  sel.innerHTML = "";
  const maxBots = Math.max(0, players - 1);
  for (let i=0;i<=maxBots;i++){
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    sel.appendChild(opt);
  }
  if (parseInt(prev,10) <= maxBots) sel.value = prev;
  else sel.value = String(maxBots);
}
function botCount(){
  return parseInt(el("olBotCount")?.value || "0", 10);
}
function syncBotCount(){
  const sel = el("olBotCount");
  if (!sel) return;
  const isHost = (mySeat === 0);
  const inLobby = (state && state.phase === "lobby");
  if (roomCode && state && Array.isArray(state.botSeats)){
    sel.value = String(state.botSeats.length);
    // Host may change bot count while alone in lobby
    sel.disabled = !(isHost && inLobby);
  } else {
    sel.disabled = false;
  }
  populateBotOptions();
}



function syncPlayerCount(){
  const sel = el("olPlayerCount");
  if (!sel) return;
  const isHost = (mySeat === 0);
  const inLobby = (state && state.phase === "lobby");
  if (roomCode && state && typeof state.n === "number"){
    sel.value = String(state.n);
    // Host may change player count while alone in lobby
    sel.disabled = !(isHost && inLobby);
  } else {
    sel.disabled = false;
  }
}

function updateLobbyConfig(){
  if (!roomCode) return;
  if (!state || state.phase !== "lobby") return;
  if (mySeat !== 0) return;
  socket.emit("online_update_lobby", {
    room: roomCode,
    players: playerCount(),
    bots: botCount(),
    name: myName(),
  });
}


function createRoom(){
  // Persist the name before navigating/redirecting across pages
  setStoredName(myName());
  joinInProgress = true;
  pendingCreateRoom = true;
  emitWhenConnected(() => {
    socket.emit("online_create_room", {
      clientId: getClientId(),
      name: myName(),
      players: playerCount(),
      bots: botCount()
    });
    pendingCreateRoom = false;
  });
}
function joinRoom(roomOverride){
  const room = normalizeCode(roomOverride ?? el("olRoomCode")?.value);
  if (!room) return;
  setStoredName(myName());
  joinInProgress = true;
  pendingJoinRoom = room;
  emitWhenConnected(() => socket.emit("online_join_room", { room, clientId: getClientId(), name: myName() }));
}
function leaveRoom(){ if (roomCode) socket.emit("online_leave_room", { room: roomCode, clientId: getClientId() }); }
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
  if (!ENABLE_FLY) return;
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
        const lp = window.__pwLastPlayed;
        const useRect = (lp && lp.seat===i && lp.key===`${b.rank}${b.suit}`) ? lp.rect : null;
        runPlayAnimation(i, b, useRect);
        if (useRect) window.__pwLastPlayed = null;
      }
    }
  }

  // If we navigated to the play page mid-trick, prevState may be null.
  // In that case, animate any already-present table cards once so they don't just "pop" in.
  if ((!prevState || !Array.isArray(prevState.table)) && Array.isArray(state.table)){
    try{
      const sig = JSON.stringify(state.table);
      window.__pwInitTableDone = window.__pwInitTableDone || {};
      const key = `${roomCode}|${state.roundIndex}|${sig}`;
      if (!window.__pwInitTableDone[key]){
        window.__pwInitTableDone[key] = true;
        for (let i=0;i<state.table.length;i++){
          const b = state.table[i];
          if (b) setTimeout(()=> runPlayAnimation(i, b, null), 120 + i*60);
        }
      }
    }catch(e){ /* ignore */ }
  }

  // Winner + sweep when a trick completes.
  // NOTE: In some edge cases (page navigation mid-trick, fast state updates)
  // the client may miss a phase transition but still receive winner + table.
  // Therefore we trigger the sweep based on (phase in between_tricks/round_finished)
  // AND presence of winner+table, not solely on phase changes.
  if (state && (state.phase === "between_tricks" || state.phase === "round_finished")){
    if (state.winner !== null && state.winner !== undefined){
      try{
        const sig = JSON.stringify((prevState && prevState.table) ? prevState.table : (state.table || []));
        const key = `${roomCode}|${state.roundIndex}|${state.winner}|${sig}`;
        window.__pwSweepDone = window.__pwSweepDone || {};
        if (!window.__pwSweepDone[key]){
          window.__pwSweepDone[key] = true;
          setTimeout(()=> runTrickSweepAnimation(state.winner, (prevState && prevState.table) ? prevState.table : (state.table || [])), 30);
          setTimeout(highlightWinner, 120);
        }
      }catch(e){ /* ignore */ }
    }
  }
}

function render(){
  if (maybeRedirectForPhase()) return;
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

  // Winner toast on the round table (play page)
  (function updateWinnerToast(){
    const t = el("olWinnerToast");
    if (!t) return;
    let msg = "";
    if (state.phase === "between_tricks" && state.winner !== null && state.winner !== undefined){
      msg = `${state.names[state.winner] || ("Spiller " + (state.winner+1))} vandt stikket`;
    } else if (state.phase === "round_finished"){
      // Round winner (most tricks). If tie, list the tied names.
      const tr = Array.isArray(state.tricksRound) ? state.tricksRound : [];
      if (tr.length){
        const mx = Math.max(...tr.map(x=> Number(x||0)));
        const ws = tr.map((x,i)=>({x:Number(x||0),i})).filter(o=>o.x===mx).map(o=>o.i);
        const names = ws.map(i=> state.names[i] || ("Spiller " + (i+1))).join(ws.length>1 ? ", " : "");
        msg = ws.length>1 ? `Runden uafgjort: ${names} (${mx} stik)` : `${names} vandt runden (${mx} stik)`;
      }
    }

    if (!msg){
      t.classList.add("hidden");
      t.textContent = "";
      return;
    }
    t.textContent = msg;
    t.classList.remove("hidden");
    // Auto-hide after a moment (except round_finished where it can stay until next round)
    if (state.phase !== "round_finished"){
      clearTimeout(updateWinnerToast._timer);
      updateWinnerToast._timer = setTimeout(()=>{
        t.classList.add("hidden");
      }, 2200);
    }
  })();

  if (el("olLeader")) el("olLeader").textContent = state.names[state.leader] ?? "-";
  if (el("olLeadSuit")) el("olLeadSuit").textContent = state.leadSuit ? `${state.leadSuit} (${SUIT_NAME[state.leadSuit]})` : "-";
  if (el("olWinner")) el("olWinner").textContent = (state.winner===null || state.winner===undefined) ? "-" : (state.names[state.winner] ?? "-");

  // bidding UI
  renderBidUI(cardsPer);

  // Round table board (play page)
  if (el("olCenter")){
    // Build + position the dynamic board DOM (2–8 players)
    ensurePlayBoard(state.n);
    positionPlayBoard(state.n);

    const bids = state.bids || [];
    const taken = state.tricksRound || [];
    const total = state.tricksTotal || [];

    for (let i=0;i<state.n;i++){
      const nm = el(`olSeatName${i}`);
      if (nm) nm.textContent = state.names[i] || ("Spiller " + (i+1));
      const b = el(`olSeatBid${i}`);
      if (b) b.textContent = (bids[i]===null || bids[i]===undefined) ? "—" : String(bids[i]);
      const tr = el(`olSeatTricks${i}`);
      if (tr) tr.textContent = String(taken[i] ?? 0);
      const tt = el(`olSeatTotal${i}`);
      if (tt) tt.textContent = String(total[i] ?? 0);

      const slot = el(`olTrickSlot${i}`);
      if (slot){
        // Defensive: ensure slots are never left hidden by a previous animation.
        slot.style.opacity = "";
        slot.style.visibility = "";
        slot.innerHTML = "";
        const c = state.table ? state.table[i] : null;
        if (c){
          const ce = makeCardEl(c);
          ce.disabled = true;
          slot.appendChild(ce.firstChild);
        }
      }
    }
  }


  // table
  const table = el("olTable");
  if (table){
    const isPlayPage = !!el("olCenter");
    table.innerHTML = "";

    if (isPlayPage){
      // Compact scoreboard (prevents overflow into the board column)
      const bids = state.bids || [];
      const taken = state.tricksRound || [];
      const total = state.tricksTotal || [];
      const wrap = document.createElement("div");
      wrap.className = "scoreMini";

      const head = document.createElement("div");
      head.className = "sub small";
      head.textContent = "Bud · stik (runde) · total";
      wrap.appendChild(head);

      for (let i=0;i<state.n;i++){
        const row = document.createElement("div");
        row.className = "scoreRow";
        const nm = state.names[i] || ("Spiller " + (i+1));
        const b  = (bids[i]===null || bids[i]===undefined) ? "—" : bids[i];
        const tr = taken[i] ?? 0;
        const tt = total[i] ?? 0;
        row.innerHTML = `<b>${nm}</b><span class="pill tiny">Bud: ${b}</span><span class="pill tiny">Stik: ${tr}</span><span class="pill tiny ghost">Total: ${tt}</span>`;
        table.appendChild(row);
      }
    } else {
      // Original table with current trick cards (used on other pages)
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
      const isPlayPage = document.body.classList.contains("page-play");
      left.innerHTML = isPlayPage ? `<span class="sub">${mine.length} kort</span>`
                                : `<b>Din hånd</b> <span class="sub">(${mine.length} kort)</span>`;
      const right = document.createElement("div");
      right.className = "sub";
      right.textContent = (state.turn===mySeat && state.phase==="playing") ? "Din tur" : "";
      head.appendChild(left); head.appendChild(right);

      const cards = document.createElement("div");
      cards.className = "cards";
      for (const c of mine){
        const b = makeCardEl(c);
        b.disabled = !isPlayable(c);
        b.addEventListener("click", () => {
          // Save a precise start position for the fly-in animation (only for your own plays)
          if (ENABLE_FLY) window.__pwLastPlayed = { seat: mySeat, key: `${c.rank}${c.suit}`, rect: b.getBoundingClientRect() };
          playCard(`${c.rank}${c.suit}`);
        });
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
el("olPlayerCount")?.addEventListener("change", () => {
  populateBotOptions();
  updateLobbyConfig();
  render();
});

render();

el("olBotCount")?.addEventListener("change", () => {
  updateLobbyConfig();
  render();
});

// Update host name in lobby (and keep server state in sync)
el("olMyName")?.addEventListener("blur", () => {
  setStoredName(el("olMyName")?.value || "");
  updateLobbyConfig();
  render();
});

// Pre-fill name inputs on pages that have them
if (el("olMyName")) {
  const s = getStoredName();
  if (s && !el("olMyName").value) el("olMyName").value = s;
}