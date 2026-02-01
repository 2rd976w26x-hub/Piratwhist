// Piratwhist Online Multiplayer (v0.2.115)
// Online flow: lobby -> bidding -> playing -> between_tricks -> round_finished -> bidding ...
const SUIT_NAME = {"♠":"spar","♥":"hjerter","♦":"ruder","♣":"klør"};
// Hand sorting (suit then rank) for the local player's hand.
// Suit order chosen for readability: ♠, ♥, ♦, ♣.
const SUIT_ORDER = {"♠": 0, "♥": 1, "♦": 2, "♣": 3};
// Rank order high-to-low: A, K, Q, J, 10..2.
const RANK_ORDER = (() => {
  const m = {};
  const ranks = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
  for (let i=0;i<ranks.length;i++) m[ranks[i]] = i;
  return m;
})();

function sortHand(cards){
  if (!Array.isArray(cards)) return cards;
  return [...cards].sort((a,b)=>{
    const sa = SUIT_ORDER[a.suit] ?? 99;
    const sb = SUIT_ORDER[b.suit] ?? 99;
    if (sa !== sb) return sa - sb;
    // Normalize ranks (server uses 2-10,J,Q,K,A as strings)
    const ra = RANK_ORDER[String(a.rank)] ?? 99;
    const rb = RANK_ORDER[String(b.rank)] ?? 99;
    return ra - rb;
  });
}

function applyHandOverlap(cardsEl){
  if (!cardsEl) return;
  const cards = Array.from(cardsEl.querySelectorAll(".cardbtn"));
  if (!cards.length) return;
  cards.forEach((card, index) => {
    card.style.zIndex = index;
  });
  const container = cardsEl.getBoundingClientRect();
  if (!container.width) return;
  const cardRect = cards[0].getBoundingClientRect();
  const cardWidth = cardRect.width || 96;

  if (cards.length === 1){
    cardsEl.style.setProperty("--hand-overlap", "0px");
    return;
  }

  const step = (container.width - cardWidth) / (cards.length - 1);
  let overlap = step - cardWidth;
  const minOverlap = -cardWidth * 0.82;
  const maxOverlap = 0;
  overlap = Math.max(minOverlap, Math.min(maxOverlap, overlap));
  cardsEl.style.setProperty("--hand-overlap", `${overlap.toFixed(2)}px`);
}
const APP_VERSION = "0.2.115";
const PW_TELEMETRY = window.PW_TELEMETRY || null;
const GUIDE_MODE = (new URLSearchParams(window.location.search).get("guide") === "1");
const DEBUG_MODE = (new URLSearchParams(window.location.search).get("debug") === "1");

function logOnlineLogin(context = {}) {
  if (!PW_TELEMETRY?.pushEvent) return;
  const entry = {
    id: `${PW_TELEMETRY.ensureSessionId?.() || "pw"}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    roomCode: context.roomCode || null,
    seat: (context.seat ?? null),
    playerName: context.playerName || null,
    phase: context.phase || null,
    client: PW_TELEMETRY.collectClientInfo?.() || null
  };
  PW_TELEMETRY.pushEvent(
    PW_TELEMETRY.STORAGE_KEYS?.logins || "PW_LOGIN_EVENTS",
    entry,
    PW_TELEMETRY.LIMITS?.logins || 500
  );
}

function logRoundFinished(context = {}) {
  if (!PW_TELEMETRY?.pushEvent) return;
  const entry = {
    id: `${PW_TELEMETRY.ensureSessionId?.() || "pw"}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    roomCode: context.roomCode || null,
    roundIndex: context.roundIndex ?? null,
    playerCount: context.playerCount ?? null,
    botCount: context.botCount ?? null,
    cardsPer: context.cardsPer ?? null,
    roundDurationMs: context.roundDurationMs ?? null,
    cardsPlayedBySeat: context.cardsPlayedBySeat || null,
    playerNames: context.playerNames || null,
    client: PW_TELEMETRY.collectClientInfo?.() || null
  };
  PW_TELEMETRY.pushEvent(
    PW_TELEMETRY.STORAGE_KEYS?.rounds || "PW_ROUND_EVENTS",
    entry,
    PW_TELEMETRY.LIMITS?.rounds || 1000
  );
}

function logGameEvent(context = {}) {
  if (!PW_TELEMETRY?.pushEvent) return;
  const entry = {
    id: `${PW_TELEMETRY.ensureSessionId?.() || "pw"}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    roomCode: context.roomCode || null,
    event: context.event || null,
    roundIndex: context.roundIndex ?? null,
    playerCount: context.playerCount ?? null,
    botCount: context.botCount ?? null,
    seat: context.seat ?? null,
    playerName: context.playerName || null,
    startedFromPhase: context.startedFromPhase || null,
    client: PW_TELEMETRY.collectClientInfo?.() || null
  };
  PW_TELEMETRY.pushEvent(
    PW_TELEMETRY.STORAGE_KEYS?.games || "PW_GAME_EVENTS",
    entry,
    PW_TELEMETRY.LIMITS?.games || 500
  );
}

const ROUND_METRICS = {
  roundIndex: null,
  startedAt: null,
  cardsPlayedBySeat: [],
  lastTable: []
};

function updateRoundMetrics(prev, current) {
  if (!current) return;
  const roundIndex = current.roundIndex ?? null;
  if (roundIndex === null || roundIndex === undefined) return;
  const roundChanged = ROUND_METRICS.roundIndex !== roundIndex;
  if (roundChanged) {
    ROUND_METRICS.roundIndex = roundIndex;
    ROUND_METRICS.startedAt = null;
    ROUND_METRICS.cardsPlayedBySeat = Array.from({ length: current.n || 0 }, () => 0);
    ROUND_METRICS.lastTable = Array.isArray(current.table) ? current.table.slice() : [];
  }

  if (!ROUND_METRICS.startedAt && current.phase && current.phase !== "lobby") {
    ROUND_METRICS.startedAt = Date.now();
  }

  const nextTable = Array.isArray(current.table) ? current.table : [];
  const prevTable = Array.isArray(ROUND_METRICS.lastTable) ? ROUND_METRICS.lastTable : [];
  const seatCount = Math.max(current.n || 0, nextTable.length, prevTable.length);
  if (ROUND_METRICS.cardsPlayedBySeat.length < seatCount) {
    const missing = seatCount - ROUND_METRICS.cardsPlayedBySeat.length;
    ROUND_METRICS.cardsPlayedBySeat = ROUND_METRICS.cardsPlayedBySeat.concat(Array.from({ length: missing }, () => 0));
  }

  for (let i = 0; i < seatCount; i += 1) {
    if (!prevTable[i] && nextTable[i]) {
      ROUND_METRICS.cardsPlayedBySeat[i] += 1;
    }
  }
  ROUND_METRICS.lastTable = nextTable.slice();
}

// --- Debug logger (play input freeze tracing) ---
// Enable with: online_play.html?code=XXXX&debug=1
const PW_DEBUG = (() => {
  const enabled = (!GUIDE_MODE) && DEBUG_MODE && /online_play\.html$/.test(window.location.pathname);
  const buf = [];
  const max = 500;
  const storageKey = "PW_DEBUG_LOG";
  const t0 = Date.now();
  let lastStateAt = 0;
  let lastPlaySentAt = 0;
  let lastPlayAttemptAt = 0;
  let lastAdvanceAt = 0;
  let lastTurnKey = "";
  function now(){ return Date.now(); }
  function persist(){
    if (!enabled) return;
    try{
      const dump = JSON.stringify({ meta: snapshot(), buf });
      localStorage.setItem(storageKey, dump);
    }catch(e){}
  }
  function push(type, data){
    if (!enabled) return;
    const rec = { t: now()-t0, type, data };
    buf.push(rec);
    if (buf.length > max) buf.splice(0, buf.length-max);
    persist();
  }
  function snapshot(){
    return {
      version: APP_VERSION,
      url: window.location.pathname + window.location.search,
      room: roomCode || null,
      mySeat: (typeof mySeat === "number") ? mySeat : null,
      phase: state?.phase || null,
      turn: (typeof state?.turn === "number") ? state.turn : null,
      leadSuit: state?.leadSuit || null,
      cardsPer: state?.cardsPer || null,
      anim: { dealInProgress: !!PW_ANIM?.dealInProgress, sweepInProgress: !!PW_ANIM?.sweepInProgress, flyInProgress: !!PW_ANIM?.flyInProgress },
    };
  }
  async function copyDump(){
    const dump = JSON.stringify({ meta: snapshot(), buf }, null, 2);
    try{
      await navigator.clipboard.writeText(dump);
      toast("Fejl-log kopieret ✅");
    }catch(e){
      // fallback: show in prompt
      try{
        window.prompt("Kopiér fejl-log:", dump);
      }catch(_){}
    }
  }
  function toast(msg){
    if (!enabled) return;
    let el = document.getElementById("pwDbgToast");
    if (!el){
      el = document.createElement("div");
      el.id = "pwDbgToast";
      el.style.position = "fixed";
      el.style.left = "12px";
      el.style.bottom = "12px";
      el.style.zIndex = "999999";
      el.style.maxWidth = "80vw";
      el.style.padding = "8px 10px";
      el.style.borderRadius = "10px";
      el.style.background = "rgba(0,0,0,0.75)";
      el.style.color = "#fff";
      el.style.font = "12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(el.__t);
    el.__t = setTimeout(()=>{ el.style.display = "none"; }, 2400);
  }
  function ensureUI(){
    if (!enabled) return;
    if (document.getElementById("pwDbgCopy")) return;
    const makeBtn = (id, label) => {
      const btn = document.createElement("button");
      btn.id = id;
      btn.type = "button";
      btn.textContent = label;
      btn.style.position = "fixed";
      btn.style.right = "12px";
      btn.style.zIndex = "999999";
      btn.style.padding = "10px 12px";
      btn.style.borderRadius = "12px";
      btn.style.border = "1px solid rgba(255,255,255,0.25)";
      btn.style.background = "rgba(0,0,0,0.65)";
      btn.style.color = "white";
      btn.style.font = "13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      btn.style.backdropFilter = "blur(6px)";
      btn.style.webkitBackdropFilter = "blur(6px)";
      return btn;
    };

    const showBtn = makeBtn("pwDbgShow", "Vis fejl-log");
    showBtn.style.bottom = "104px";
    showBtn.addEventListener("click", ()=>showPanel(true));
    document.body.appendChild(showBtn);

    const pageBtn = makeBtn("pwDbgPage", "Åbn log-side");
    pageBtn.style.bottom = "58px";
    pageBtn.addEventListener("click", ()=>{
      const url = `/online_debug.html?room=${encodeURIComponent(roomCode || "")}`;
      window.open(url, "_blank", "noopener");
    });
    document.body.appendChild(pageBtn);

    const copyBtn = makeBtn("pwDbgCopy", "Kopiér fejl-log");
    copyBtn.style.bottom = "12px";
    copyBtn.style.display = "none"; // shown only on freeze detector
    copyBtn.addEventListener("click", ()=>copyDump());
    document.body.appendChild(copyBtn);

    const panel = document.createElement("div");
    panel.id = "pwDbgPanel";
    panel.style.position = "fixed";
    panel.style.right = "12px";
    panel.style.bottom = "110px";
    panel.style.width = "min(520px, 92vw)";
    panel.style.maxHeight = "60vh";
    panel.style.padding = "10px";
    panel.style.borderRadius = "12px";
    panel.style.border = "1px solid rgba(255,255,255,0.18)";
    panel.style.background = "rgba(6,8,16,0.92)";
    panel.style.color = "white";
    panel.style.font = "12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    panel.style.zIndex = "999998";
    panel.style.display = "none";

    const panelHeader = document.createElement("div");
    panelHeader.style.display = "flex";
    panelHeader.style.alignItems = "center";
    panelHeader.style.justifyContent = "space-between";
    panelHeader.style.marginBottom = "8px";
    panelHeader.innerHTML = "<strong>Fejl-log (debug)</strong>";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Luk";
    closeBtn.style.border = "1px solid rgba(255,255,255,0.25)";
    closeBtn.style.background = "rgba(255,255,255,0.08)";
    closeBtn.style.color = "white";
    closeBtn.style.padding = "4px 8px";
    closeBtn.style.borderRadius = "8px";
    closeBtn.style.cursor = "pointer";
    closeBtn.addEventListener("click", ()=>showPanel(false));
    panelHeader.appendChild(closeBtn);

    const textarea = document.createElement("textarea");
    textarea.id = "pwDbgText";
    textarea.readOnly = true;
    textarea.style.width = "100%";
    textarea.style.height = "42vh";
    textarea.style.background = "rgba(0,0,0,0.35)";
    textarea.style.border = "1px solid rgba(255,255,255,0.18)";
    textarea.style.borderRadius = "8px";
    textarea.style.color = "white";
    textarea.style.padding = "8px";
    textarea.style.font = "12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

    panel.appendChild(panelHeader);
    panel.appendChild(textarea);
    document.body.appendChild(panel);
  }
  function showPanel(show){
    if (!enabled) return;
    ensureUI();
    const panel = document.getElementById("pwDbgPanel");
    const textarea = document.getElementById("pwDbgText");
    if (!panel || !textarea) return;
    if (show){
      const dump = JSON.stringify({ meta: snapshot(), buf }, null, 2);
      textarea.value = dump;
      panel.style.display = "block";
    } else {
      panel.style.display = "none";
    }
  }
  function showCopyButton(show){
    if (!enabled) return;
    ensureUI();
    const btn = document.getElementById("pwDbgCopy");
    if (btn) btn.style.display = show ? "block" : "none";
  }
  function setLastState(){ lastStateAt = now(); }
  function markPlayAttempt(){ lastPlayAttemptAt = now(); }
  function markPlaySent(){ lastPlaySentAt = now(); }
  function markAdvance(){ lastAdvanceAt = now(); }
  function getTimes(){ return { lastStateAt, lastPlaySentAt, lastPlayAttemptAt, lastAdvanceAt }; }
  function setTurnKey(k){ lastTurnKey = k; }
  function getTurnKey(){ return lastTurnKey; }
  if (enabled){
    try{ persist(); }catch(e){}
  }
  return { enabled, push, copyDump, toast, showCopyButton, setLastState, markPlayAttempt, markPlaySent, markAdvance, getTimes, setTurnKey, getTurnKey, ensureUI, showPanel };
})();


// --- Navigation robustness (mobile): returning from rules page ---
// On mobile browsers, navigating away to rules.html and coming back can
// restore the play/bidding page in a stale state (timers/socket/raf not resuming).
// The server is authoritative, so a safe full reload (keeping the room code
// in the URL) is the most robust recovery.
(function setupReturnFromRulesReload(){
  try{
    if (!/(online_play|online_bidding)\.html$/.test(window.location.pathname)) return;

    const maybeReload = () => {
      try{
        if (sessionStorage.getItem('PW_RETURN_FROM_RULES') === '1'){
          sessionStorage.removeItem('PW_RETURN_FROM_RULES');
          // Avoid infinite loops if something triggers repeatedly.
          if (sessionStorage.getItem('PW_RELOADING_AFTER_RULES') === '1'){
            sessionStorage.removeItem('PW_RELOADING_AFTER_RULES');
            return;
          }
          sessionStorage.setItem('PW_RELOADING_AFTER_RULES', '1');
          window.location.reload();
        }
      }catch(e){ /* ignore */ }
    };

    window.addEventListener('pageshow', (ev)=>{
      // pageshow fires both on normal load and on BFCache restore.
      maybeReload();
    });
    document.addEventListener('visibilitychange', ()=>{
      if (!document.hidden) maybeReload();
    });
  }catch(e){ /* ignore */ }
})();
// v0.2.115:
// - Remove winner toast/marking on board (cards sweeping to winner is the cue)
// - Delay redirect to results by 4s after the last trick in a round
// so you don't see the sweep start before the played card has landed.
// destination rendering while a fly-in is active, and hiding center slots
// while sweep-to-winner runs.
// 1) Card played: player seat -> center table (ghost card)
// 2) Trick won: all table cards -> winning player's seat
// NOTE: Deal animation can be toggled via console.
//   pwSetFlag('dealAnim', true);  location.reload();
//   pwSetFlag('dealAnim', false); location.reload();
// Flags persist in localStorage under 'pw_flags'.
const PW_FLAGS = (() => {
  try {
    const fromStorage = JSON.parse(localStorage.getItem('pw_flags') || '{}');
    const fromWindow = (typeof window !== 'undefined' && window.PW_FLAGS) ? window.PW_FLAGS : {};
    return Object.assign({}, fromStorage, fromWindow);
  } catch {
    return (typeof window !== 'undefined' && window.PW_FLAGS) ? window.PW_FLAGS : {};
  }
})();
if (typeof window !== 'undefined') {
  window.PW_FLAGS = PW_FLAGS;
  window.pwSetFlag = (k, v) => {
    PW_FLAGS[k] = v;
    try { localStorage.setItem('pw_flags', JSON.stringify(PW_FLAGS)); } catch {}
    console.log('PW_FLAGS:', PW_FLAGS);
  };
  window.pwClearFlags = () => {
    try { localStorage.removeItem('pw_flags'); } catch {}
    for (const k of Object.keys(PW_FLAGS)) delete PW_FLAGS[k];
    console.log('PW_FLAGS cleared');
  };
}

const ENABLE_FLY_CARDS = true;
// Deal animation (backs flying from deck to seats) is intended to be visible by default.
// You can still disable it via console:
//   pwSetFlag('dealAnim', false); location.reload();
const ENABLE_DEAL_ANIM = (PW_FLAGS.dealAnim ?? true) === true;
// Backwards-compat alias used in a few click handlers
const ENABLE_FLY = ENABLE_FLY_CARDS;
const ENABLE_SWEEP = true;
const ROUND_CARDS = [7,6,5,4,3,2,1,1,2,3,4,5,6,7];

// Animation bookkeeping (prevents "double" rendering):
// - flyIn[seat] = cardKey while a played-card animation is running to the center slot
// - flyPromises[seat] = Promise while the fly-in animation runs (used to sequence sweep)
// - sweepHide[seat] = true while a sweep-to-winner is running (hide the real slot so only ghosts move)
const PW_ANIM = (() => {
  if (typeof window === 'undefined') return { flyIn: {}, flyPromises: {}, sweepHide: {} };
  window.__pwAnim = window.__pwAnim || { flyIn: {}, flyPromises: {}, sweepHide: {} };
  window.__pwAnim.flyIn = window.__pwAnim.flyIn || {};
  window.__pwAnim.flyPromises = window.__pwAnim.flyPromises || {};
  window.__pwAnim.sweepHide = window.__pwAnim.sweepHide || {};
  return window.__pwAnim;
})();

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
let joinRetryCount = 0;


function el(id){ return document.getElementById(id); }

// --- v0.2.115: dynamic round-table board (2–8 players) ---
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
      <div class="trickViz" id="olSeatViz${i}" aria-label="Stik i runden"></div>
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

  const boardRect = board.getBoundingClientRect ? board.getBoundingClientRect() : { width: board.clientWidth || 1, height: board.clientHeight || 1 };
  const minBoardDim = Math.max(1, Math.min(boardRect.width || 1, boardRect.height || 1));
  let seatScale = minBoardDim / 680;
  if (n >= 8) seatScale *= 0.82;
  else if (n >= 7) seatScale *= 0.86;
  else if (n >= 6) seatScale *= 0.9;
  else if (n === 5) seatScale *= 0.94;
  seatScale = Math.max(0.66, Math.min(1.02, seatScale));
  board.style.setProperty("--seat-scale", seatScale.toFixed(2));

  const my = (typeof mySeat === "number" && mySeat >= 0) ? mySeat : 0;
  // Seat ring radius in %.
  // NOTE: The board container has overflow:hidden, so on small screens we must
  // keep top seats inside the box (otherwise they get clipped and appear "missing").
  const isMobile = (typeof window !== "undefined" && window.matchMedia)
    ? window.matchMedia("(max-width: 520px)").matches
    : false;

  // --- Mobile rectangular grid layout (approved) ---
  // On small screens we use a deterministic "square" layout instead of the trig/ring layout.
  // This prevents overlap and keeps all seats visible inside the board container.
  if (isMobile){
    // v0.2.115 Dev + layout: SceneShift for mobile to utilize top space and
    // give more room for the hand/HUD area. Moves the center pile + trick slots
    // and the lower side seats (midLeft/midRight/botLeft/botRight) upward together.
    const sceneShiftVh = (n === 4) ? -7.8 : ((n <= 3) ? -7.2 : -4.0); // v3: extra compression for 3–4p (8p unchanged)
    // Extra lift for the *table image + trick cards* only (keeps seats stable)
    // so the center never overlaps the bottom player on small phones.
    const pileExtraVh = (n === 4) ? -3.0 : ((n <= 3) ? -2.4 : -0.9); // v3: lift table more for 3–4p to reduce gap to T
    const lowerSideFactor = 0.85;               // follow the scene, but slightly less

    const boardH = (board.getBoundingClientRect && board.getBoundingClientRect().height)
      ? board.getBoundingClientRect().height
      : (board.clientHeight || 1);

    const vh = (window.innerHeight || 800);
    const shiftPxScene = (sceneShiftVh / 100) * vh;
    const shiftPxPile  = shiftPxScene + ((pileExtraVh / 100) * vh);

    const shiftPctScene = (shiftPxScene / boardH) * 100;
    const shiftPctPile  = (shiftPxPile  / boardH) * 100;

    // Move the center pile itself via transform (keeps CSS top% intact)
    const pile = el("olPile");
    if (pile){
      pile.style.transform = `translate(-50%, -50%) translateY(${shiftPxPile.toFixed(1)}px)`;
    }

    // Slot positions (in % of board), tuned for mobile.
    const slot = {
      // Mobile: keep top seats safely inside the board and pull the bottom seat
      // closer to the hand for shorter travel on tall phones.
      top:      { x: 50, y: 18, anchor: "center", isTop: true },
      topLeft:  { x: 32, y: 22, anchor: "left"   },
      topRight: { x: 68, y: 22, anchor: "right"  },
      midLeft:  { x: 24, y: 40, anchor: "left",  midSide: true },
      midRight: { x: 76, y: 40, anchor: "right", midSide: true },
      botLeft:  { x: 32, y: 66, anchor: "left"   },
      botRight: { x: 68, y: 66, anchor: "right"  },
      bottom:   { x: 50, y: 66, anchor: "center", bottom: true }
    };

    // 4-player mobile layout: reduce the vertical gap between the top seat and the table scene.
    // Keep the same slot *shape* as 8-player, but pull the active seats slightly upward.
    if (n === 4){
      // v3: 4p mobile needs the whole scene higher (reduce empty gap between T and table)
      slot.top.y      = 16;
      slot.midLeft.y  = 34;
      slot.midRight.y = 34;
      slot.bottom.y   = 62;
    }

    // Trick-slot positions aligned with the player who played the card.
    const trick = {
      top:      { x: 50, y: 20 },
      topLeft:  { x: 40, y: 24 },
      topRight: { x: 60, y: 24 },
      midLeft:  { x: 36, y: 36 },
      midRight: { x: 64, y: 36 },
      botLeft:  { x: 42, y: 44 },
      botRight: { x: 58, y: 44 },
      bottom:   { x: 50, y: 50 }
    };

    // Per player-count mapping: relOffset 0 is always local player at "bottom".
    // Offsets 1..n-1 are assigned to fixed slots in clockwise-ish order that
    // matches the desired mobile UI (not the ring math).
    const orderByN = {
      2: ["top"],
      3: ["top","topRight"],
      4: ["midLeft","top","midRight"],
      5: ["botLeft","topLeft","topRight","botRight"],
      6: ["botLeft","midLeft","top","midRight","botRight"],
      7: ["botLeft","midLeft","topLeft","topRight","midRight","botRight"],
      8: ["botLeft","midLeft","topLeft","top","topRight","midRight","botRight"]
    };

    const ord = orderByN[n] || orderByN[8];

    for (let i=0;i<n;i++){
      const rel = (i - my + n) % n;
      let slotName = "bottom";
      if (rel === 0) slotName = "bottom";
      else slotName = ord[rel - 1] || "top";

      const p = slot[slotName] || slot.bottom;
      const seatEl = seatsWrap.querySelector(`[data-seat="${i}"]`);
      if (seatEl){
        const isLowerSide = (slotName === "midLeft" || slotName === "midRight" || slotName === "botLeft" || slotName === "botRight");
        const yAdj = isLowerSide ? (p.y + (shiftPctScene * lowerSideFactor)) : (p.y + shiftPctScene);
        seatEl.style.left = p.x.toFixed(2) + "%";
        seatEl.style.top  = yAdj.toFixed(2) + "%";

        seatEl.classList.remove("anchor-left","anchor-right","anchor-center","mid-side");
        seatEl.classList.add(
          p.anchor === "left" ? "anchor-left" : (p.anchor === "right" ? "anchor-right" : "anchor-center")
        );
        if (p.midSide) seatEl.classList.add("mid-side");

        seatEl.classList.toggle("seat-bottom", !!p.bottom);
        seatEl.classList.toggle("seat-top", !!p.isTop);

        // Apply transform anchoring directly
        if (p.anchor === "left") seatEl.style.transform = "translate(-100%, -50%) scale(var(--seat-scale))";
        else if (p.anchor === "right") seatEl.style.transform = "translate(0%, -50%) scale(var(--seat-scale))";
        else {
          // On mobile, the bottom (local) seat must not be vertically centered,
          // otherwise it can overlap the center pile when the scene is shifted.
          const isBottomSeat = seatEl.classList.contains("seat-bottom");
          if (isMobile && isBottomSeat) seatEl.style.transform = "translate(-50%, -20%) scale(var(--seat-scale))";
          else seatEl.style.transform = "translate(-50%, -50%) scale(var(--seat-scale))";
        }
      }

      const sp = trick[slotName] || { x: 50, y: 50 };
      const slotEl = el(`olTrickSlot${i}`);
      if (slotEl){
        slotEl.style.left = sp.x.toFixed(2) + "%";
        slotEl.style.top  = (sp.y + shiftPctPile).toFixed(2) + "%";
      }
    }

    // Deck anchor (if present) stays below bottom seat; on the play board the deck is hidden.
    const deck = el("olDeck");
    if (deck){
      deck.style.left = "50%";
      deck.style.top = "88%";
      deck.style.transform = "translate(-50%, -50%)";
    }
    return;
  }
  // Mobile tweak (stable): pull seats slightly inward so top seats never get clipped.
  // This is a temporary, conservative setting while we finalize the approved mobile layout.
  const seatR = isMobile
    ? ((n <= 2) ? 34 : (n <= 4 ? 36 : 38))
    : ((n <= 2) ? 42 : (n <= 4 ? 44 : 46));
  const slotR = isMobile ? 16 : 18;

  for (let i=0;i<n;i++){
    const rel = (i - my + n) % n;
    const ang = (90 + (rel * 360 / n)) * Math.PI / 180;
    let x = 50 + seatR * Math.cos(ang);
    let y = 50 + seatR * Math.sin(ang);


    // --- PC fixed layout v3 for 4 players (deterministic, avoids hand overlap) ---
    if (!isMobile && n === 4 && window.innerWidth >= 900){
      const fixedSeat = {
        0: { x: 66, y: 78 }, // bottom (local) slightly right + toward center
        1: { x: 24, y: 58 }, // left
        2: { x: 50, y: 28 }, // top
        3: { x: 76, y: 58 }  // right
      };
      const fixedSlot = {
        0: { x: 56, y: 62 },
        1: { x: 44, y: 50 },
        2: { x: 50, y: 38 },
        3: { x: 56, y: 50 }
      };
      const p = fixedSeat[rel] || { x: x, y: y };
      x = p.x; y = p.y;

      const seatEl = seatsWrap.querySelector(`[data-seat="${i}"]`);
      if (seatEl){
        seatEl.style.left = x.toFixed(2) + "%";
        seatEl.style.top  = y.toFixed(2) + "%";
        seatEl.classList.toggle("seat-bottom", rel === 0);
        seatEl.classList.toggle("seat-top", rel === 2);
      }
      const sp = fixedSlot[rel] || { x: 50, y: 50 };
      const slotEl = el(`olTrickSlot${i}`);
      if (slotEl){
        slotEl.style.left = sp.x.toFixed(2) + "%";
        slotEl.style.top  = sp.y.toFixed(2) + "%";
      }
      continue;
    }

    // PC polish (approved): bring top + bottom seats closer to the center,
    // and shift the bottom seat slightly right so the docked hand has room.
    if (!isMobile && window.innerWidth >= 900) {
      const topRel = Math.floor(n/2);
      if (rel === 0) { // local (bottom)
        x += 8;   // slightly right
        y -= 10;  // up toward center
      }
      if (n >= 2 && rel === topRel) { // top seat
        y += 12;  // down toward center
      }
      // Clamp to keep seats safely inside the board container.
      x = Math.max(6, Math.min(94, x));
      y = Math.max(6, Math.min(94, y));
    }

    const seatEl = seatsWrap.querySelector(`[data-seat="${i}"]`);
    if (seatEl){
      seatEl.style.left = x.toFixed(2) + "%";
      seatEl.style.top  = y.toFixed(2) + "%";

      // Tag relative positions so CSS can treat bottom seat (me) differently.
      // rel==0 is always the local player (bottom).
      seatEl.classList.toggle("seat-bottom", rel === 0);
      seatEl.classList.toggle("seat-top", n >= 2 && rel === Math.floor(n/2));
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
    "dealing": "/online_bidding.html",
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

  // Clear any pending delayed redirect if we're no longer in round_finished.
  if (state.phase !== "round_finished"){
    clearTimeout(maybeRedirectForPhase._timer);
    maybeRedirectForPhase._pendingKey = null;
  }

  // UX: After the LAST trick in a round, keep the play board visible a bit
  // before moving to the results page.
  // (Avoid immediate redirect when the server flips to round_finished.)
  if (state.phase === "round_finished"){
    const onPlay = here.endsWith("/online_play.html") || here.endsWith("online_play.html");
    if (onPlay){
      const key = `${roomCode}|${state.roundIndex}`;
      if (maybeRedirectForPhase._pendingKey !== key){
        clearTimeout(maybeRedirectForPhase._timer);
        maybeRedirectForPhase._pendingKey = key;
        // Wait for any in-flight animations to finish (last card fly-in + sweep-out)
        // and then keep the board visible for 4 seconds before redirecting.
        maybeRedirectForPhase._timer = setTimeout(()=>{
          (async ()=>{
            try{
              const pending = Object.values(PW_ANIM?.flyPromises || {}).filter(Boolean);
              if (pending.length) await Promise.allSettled(pending);
              if (PW_ANIM?.sweepPromise) await PW_ANIM.sweepPromise;
            }catch(e){ /* ignore */ }

            // Extra pause requested by UX (show the finished board before results).
            await new Promise((res)=>setTimeout(res, 4000));

            // Only redirect if we're still in the same room+round and still finished.
            if (state && roomCode && state.phase === "round_finished" && `${roomCode}|${state.roundIndex}` === key){
              window.location.replace(`${desired}?code=${encodeURIComponent(roomCode)}`);
            }
          })();
        }, 0);
      }
      return false;
    }
  }

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

async function runDealAnimation(seq){
  if (!ENABLE_FLY_CARDS || !ENABLE_DEAL_ANIM) return;
  const deck = el("olDeck");
  if (!deck) return;

  // Mark animation lock (prevents clicks + suppresses immediate hand render)
  PW_ANIM.dealInProgress = true;

  const deckC = rectCenter(deck);
  const n = state?.n || 0;

  // Targets: prefer board seats (play page). Fallback to the hand container (bidding page).
  const seatEls = {};
  for (let i=0;i<n;i++){
    const seatEl = document.querySelector(`.board [data-seat="${i}"]`) ||
                   document.querySelector(`[data-seat="${i}"]`);
    if (seatEl) seatEls[i] = seatEl;
  }
  const handWrap = el("olHands");
  const fallbackTarget = handWrap || deck;

  const sleep = (ms) => new Promise((res)=>setTimeout(res, ms));
  // Faster deal so it doesn't feel sluggish, but still clearly visible.
  const perCardGap = 55;
  const flightMs = 280;

  // If we're on the page that shows "Din hånd" (bidding/dealing), we want each
  // dealt card to fly into its *final* slot in the hand area (not out of view).
  // We create invisible hand slots up-front so we can target exact positions.
  const cardsPer = (state?.cardsPer || 0);
      // Reset opponent-cards reveal container each render
      const __oppWrap = document.getElementById("olOppCardsWrap");
      const __oppCards = document.getElementById("olOppCards");
      if (__oppWrap) __oppWrap.classList.add("hidden");
      if (__oppCards) __oppCards.innerHTML = "";

  const me = (typeof mySeat === "number") ? mySeat : null;
  // Hand slots are the *buttons* (final layout boxes). We animate to each slot
  // so the flying card lands exactly where the real card will appear.
  let handSlots = [];
  if (handWrap && me !== null && cardsPer > 0){
    try{
      handWrap.innerHTML = "";
      const h = document.createElement("div");
      h.className = "hand dealHand";
      const head = document.createElement("div");
      head.className = "head";
      const left = document.createElement("div");
      left.innerHTML = `<b>Din hånd</b> <span class="sub">(deales...)</span>`;
      const right = document.createElement("div");
      right.className = "sub";
      right.textContent = "";
      head.appendChild(left);
      head.appendChild(right);

      const cards = document.createElement("div");
      cards.className = "cards dealSlots";

      for (let i=0;i<cardsPer;i++){
        const b = document.createElement("button");
        b.className = "cardbtn dealSlot";
        b.disabled = true;
        b.setAttribute("aria-hidden", "true");

        const pc = document.createElement("div");
        pc.className = "playingcard back";
        pc.style.opacity = "0"; // become visible as each card lands
        b.appendChild(pc);

        cards.appendChild(b);
        handSlots.push(b);
      }

      h.appendChild(head);
      h.appendChild(cards);
      handWrap.appendChild(h);
    }catch(e){
      handSlots = [];
    }
  }

  // Deal animation should be shown ONLY to the current player.
  // We keep server-authoritative dealing (the hand is still taken from state),
  // but we only animate the cards that belong to "mySeat".
  let useSeq;
  if (me !== null){
    if (Array.isArray(seq) && seq.length){
      useSeq = seq.filter(s => s === me);
    } else {
      useSeq = Array.from({length: cardsPer}, () => me);
    }
  } else {
    useSeq = Array.isArray(seq) && seq.length ? seq : Array.from({length: cardsPer * n}, (_,i)=>i % Math.max(1,n));
  }

  for (let i=0;i<useSeq.length;i++){
    const seat = (typeof useSeq[i] === "number") ? useSeq[i] : (i % Math.max(1,n));

    // If dealing to me and we have hand slots, target the *i'th final slot*.
    // Otherwise fall back to seat/hand container center.
    let dc;
    if (me !== null && seat === me && handSlots[i]){
      const r = handSlots[i].getBoundingClientRect();
      dc = { x: r.left + r.width/2, y: r.top + r.height/2 };
    } else {
      const targetEl = seatEls[seat] || fallbackTarget;
      dc = rectCenter(targetEl);
    }

    const fc = spawnFlyCard(deckC.x, deckC.y, "", true);
    fc.style.opacity = "1";
    const rot = (seat % 2 === 0) ? -6 : 6;
    const anim = flyArc(fc, dc.x, dc.y, { duration: flightMs, rotate: rot, scale: 0.94, peak: 34 });
    try{
      if (anim && anim.finished) await anim.finished;
      else await sleep(flightMs + 30);
    }catch(e){ await sleep(flightMs + 30); }
    try{ fc.remove(); }catch(e){ /* ignore */ }

    // Make the landed card visible in the slot (still face-down during deal)
    if (me !== null && seat === me && handSlots[i]){
      try{
        const pc = handSlots[i].querySelector('.playingcard');
        if (pc) pc.style.opacity = "1";
      }catch(e){ /* ignore */ }
    }

    await sleep(perCardGap);
  }

  PW_ANIM.dealInProgress = false;
  try{ render(); }catch(e){ /* ignore */ }
}

function runPlayAnimation(seat, cardObj, srcRect){
  if (!ENABLE_FLY_CARDS) return;
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

  // Suppress destination rendering while the ghost flies in (prevents double).
  try{
    const k = `${cardObj.rank}${cardObj.suit}`;
    PW_ANIM.flyIn[seat] = k;
  }catch(e){ /* ignore */ }

  // IMPORTANT stability rule:
  // Never hide the real destination slot. If animation fails or is interrupted
  // (reload, phase change, race), hidden slots can leave the table looking empty.
  // Instead we always animate a ghost card above the board.

  const fc = spawnFlyCard(sc.x, sc.y, cardObj, false);
  // Slightly slower + arc so it is clearly visible
  fc.style.opacity = "1";
  const dur = 2000;
  const anim = flyArc(fc, dc.x, dc.y, { duration: dur, rotate: (seat === 0 ? -4 : 4), scale: 1.0 });

  // Track the promise so the trick-sweep can wait until the last played
  // card has fully landed (prevents "unnatural" overlap of animations).
  try{
    PW_ANIM.flyPromises[seat] = (anim && anim.finished) ? anim.finished : new Promise((res)=>setTimeout(res, dur + 80));
  }catch(e){ /* ignore */ }

  const finish = () => {
    try{ delete PW_ANIM.flyIn[seat]; }catch(e){}
    try{ delete PW_ANIM.flyPromises[seat]; }catch(e){}
    fc.style.opacity = "0";
    setTimeout(()=> fc.remove(), 260);
    // Re-render so the real card appears at destination after the fly-in completes.
    try{ render(); }catch(e){ /* ignore */ }
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

  // Expose a promise so other flows (e.g. end-of-round redirect) can
  // reliably wait until the sweep has fully completed.
  // (We must avoid cutting the animation short on the last trick.)
  let resolveSweep = null;
  PW_ANIM.sweepPromise = new Promise((res)=>{ resolveSweep = res; });

  // Hide the real center slots during the sweep so the user only sees
  // the moving ghost cards (prevents "double" cards).
  try{
    const seatCount0 = playerCount();
    for (let s=0; s<seatCount0; s++){
      if (cardsBySeat && cardsBySeat[s]) PW_ANIM.sweepHide[s] = true;
    }
    // Render once so the slots are hidden immediately.
    try{ render(); }catch(e){}
  }catch(e){ /* ignore */ }

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

  const finished = [];

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
      duration: 2000,
      easing: "cubic-bezier(0.2,0.8,0.2,1)",
      fill: "forwards"
    });

    if (anim && anim.finished) finished.push(anim.finished);

    anim.finished.then(() => {
      ghost.remove();
    }).catch(()=>{ try{ghost.remove();}catch(e){} });
  }

  // Clear sweep-hide after the animation time.
  setTimeout(() => {
    try{
      for (let s=0; s<seatCount; s++) delete PW_ANIM.sweepHide[s];
      render();
    }catch(e){ /* ignore */ }
    try{ resolveSweep && resolveSweep(); }catch(e){ /* ignore */ }
  }, 2100);
}

// Ensure sweep waits for any in-flight "played card" animations.
// This makes the sequence feel natural: card lands -> trick sweeps to winner.
function runTrickSweepAnimationQueued(winnerSeat, cardsBySeat){
  try{
    const pending = Object.values(PW_ANIM.flyPromises || {}).filter(Boolean);
    if (pending.length){
      return Promise.allSettled(pending).then(() => {
        setTimeout(() => runTrickSweepAnimation(winnerSeat, cardsBySeat), 20);
        return PW_ANIM.sweepPromise;
      });
    }
  }catch(e){ /* ignore */ }
  runTrickSweepAnimation(winnerSeat, cardsBySeat);
  return PW_ANIM.sweepPromise;
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

function makeCardBackEl(){
  const btn = document.createElement("button");
  btn.className = "cardbtn";
  btn.disabled = true;
  const pc = document.createElement("div");
  pc.className = "playingcard back";
  btn.appendChild(pc);
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
    // Face cards use the shared CardKit images (K, Q, J).
    const img = document.createElementNS(NS, "image");
    const href = (rank === "K") ? "assets/face_K.png"
               : (rank === "Q") ? "assets/face_D.png"
               : "assets/face_J.png";
    img.setAttribute("href", href);
    img.setAttribute("x", "18");
    img.setAttribute("y", "24");
    img.setAttribute("width", "64");
    img.setAttribute("height", "92");
    img.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.appendChild(img);

    // Small watermark suit
    pip(50, 116, 24, 0);
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
const socket = GUIDE_MODE ? {
  connected:false,
  on(){}, off(){}, emit(){}, connect(){}, disconnect(){},
} : io({ transports: ["websocket", "polling"] });


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
let lastLoggedRoom = null;
let lastRoundLoggedKey = null;
let lastGameStartKey = null;
let lastGameFinishKey = null;
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

  // Mobile Safari/Chrome can restore the play page from the back-forward cache
  // when navigating to rules.html and back. In that case, JS timers/listeners
  // and socket state can become stale, causing the game UI to "lock".
  // When this happens, the safest behavior is to reload the current page so
  // we re-attach to the room and re-render state.
  window.addEventListener("pageshow", (ev) => {
    try{
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      const backForward = nav && nav.type === "back_forward";
      const restored = !!ev.persisted || backForward;
      if (restored && document.body){
        const isPhasePage = document.body.classList.contains("page-play")
          || document.body.classList.contains("page-bidding");
        if (isPhasePage){
          // Preserve URL (room code) and force a clean re-init.
          window.location.reload();
        }
      }
    }catch(e){ /* ignore */ }
  }, { passive: true });

  // Keep the round-table layout stable on resize / orientation change / zoom.
  let layoutRaf = null;
  const scheduleLayoutUpdate = () => {
    if (layoutRaf) cancelAnimationFrame(layoutRaf);
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = null;
      try{
        if (state && el("olCenter")){
          ensurePlayBoard(state.n);
          positionPlayBoard(state.n);
        }
        const cards = document.querySelectorAll("#olHands .cards");
        cards.forEach((el) => applyHandOverlap(el));
        alignHandDockToBottomSeat();
        applyPcNoFlyZoneForSeats();
      }catch(e){ /* ignore */ }
    });
  };
  window.addEventListener("resize", scheduleLayoutUpdate, { passive: true });
  window.addEventListener("scroll", scheduleLayoutUpdate, { passive: true });
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", scheduleLayoutUpdate, { passive: true });
    window.visualViewport.addEventListener("scroll", scheduleLayoutUpdate, { passive: true });
  }
  pendingCreateRoom = false;
});

socket.on("error", (data) => {
  const msg = (data?.message || "Ukendt fejl");
  if (PW_TELEMETRY?.logClientError) {
    PW_TELEMETRY.logClientError({
      type: "socket_error",
      message: msg,
      roomCode: roomCode || null
    });
  }

  // Robust join: During fast redirects between pages, the server may still be
  // finishing room creation / re-attachment. If we get "Rum ikke fundet" while
  // we *do* have a join pending, retry a few times before showing the error.
  if (msg === "Rum ikke fundet." && pendingJoinRoom && joinRetryCount < 6){
    joinInProgress = false;
    pendingCreateRoom = false;
    joinRetryCount += 1;
    const waitMs = 200 + (joinRetryCount * 150);
    const status = el("olRoomStatus");
    if (status) status.textContent = `Forbinder… (forsøg ${joinRetryCount}/6)`;
    setTimeout(() => {
      // Keep the pendingJoinRoom; try again.
      joinRoom(pendingJoinRoom);
    }, waitMs);
    return;
  }

  joinInProgress = false;
  pendingJoinRoom = null;
  pendingCreateRoom = false;
  joinRetryCount = 0;
  showRoomWarn(msg);
});

function handleOnlineState(payload){
  joinInProgress = false;
  pendingJoinRoom = null;
  pendingCreateRoom = false;
  joinRetryCount = 0;
  roomCode = payload.room;
  if (payload.seat !== null && payload.seat !== undefined) mySeat = payload.seat;
  prevState = state;
  state = payload.state;
  try{ if (PW_DEBUG?.enabled){ PW_DEBUG.setLastState(); PW_DEBUG.push('state', {phase: state?.phase, turn: state?.turn, leadSuit: state?.leadSuit, n: state?.n, cardsPer: state?.cardsPer}); } }catch(e){}
  const playerName = (typeof mySeat === "number") ? (state?.names?.[mySeat] || null) : null;
  updateRoundMetrics(prevState, state);
  window.PW_CONTEXT = {
    roomCode: roomCode || null,
    seat: (typeof mySeat === "number") ? mySeat : null,
    playerName,
    phase: state?.phase || null,
    roundIndex: state?.roundIndex ?? null
  };
  const playerCount = state?.n ?? state?.names?.length ?? null;
  const botCount = Array.isArray(state?.botSeats) ? state.botSeats.length : null;

  if (roomCode && roomCode !== lastLoggedRoom) {
    logOnlineLogin({
      roomCode,
      seat: (typeof mySeat === "number") ? mySeat : null,
      playerName,
      phase: state?.phase || null
    });
    lastLoggedRoom = roomCode;
  }

  if (roomCode && state?.phase && state.phase !== "lobby") {
    const startKey = `${roomCode}|${state?.roundIndex ?? "?"}|start`;
    if ((!prevState || prevState?.phase === "lobby") && startKey !== lastGameStartKey) {
      logGameEvent({
        event: "game_started",
        roomCode,
        roundIndex: state?.roundIndex ?? null,
        playerCount,
        botCount,
        seat: (typeof mySeat === "number") ? mySeat : null,
        playerName,
        startedFromPhase: prevState?.phase || null
      });
      lastGameStartKey = startKey;
    }
  }

  if (roomCode && state?.phase === "game_finished") {
    const finishKey = `${roomCode}|${state?.roundIndex ?? "?"}|finish`;
    if (finishKey !== lastGameFinishKey) {
      logGameEvent({
        event: "game_completed",
        roomCode,
        roundIndex: state?.roundIndex ?? null,
        playerCount,
        botCount,
        seat: (typeof mySeat === "number") ? mySeat : null,
        playerName,
        startedFromPhase: prevState?.phase || null
      });
      lastGameFinishKey = finishKey;
    }
  }

  if (roomCode && state?.phase === "round_finished") {
    const roundKey = `${roomCode}|${state?.roundIndex ?? "?"}`;
    if (roundKey !== lastRoundLoggedKey) {
      logRoundFinished({
        roomCode,
        roundIndex: state?.roundIndex ?? null,
        playerCount,
        botCount,
        cardsPer: state?.cardsPer ?? null,
        roundDurationMs: ROUND_METRICS.startedAt ? Date.now() - ROUND_METRICS.startedAt : null,
        cardsPlayedBySeat: ROUND_METRICS.cardsPlayedBySeat?.slice?.() || null,
        playerNames: Array.isArray(state?.names) ? state.names.slice() : null
      });
      lastRoundLoggedKey = roundKey;
    }
  }

  // Expose the current phase to CSS (for responsive layout + hiding side panels during play)
  try{
    const phases = ["lobby","dealing","bidding","playing","between_tricks","round_finished","game_finished"];
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
  updateAutoBotCountDisplay();
  maybeRunAnimations();

render();
updateAutoBotCountDisplay();

// Ensure the "Regler" link returns to the current page after reading rules.
// We do this by adding ?from=<current path> to any rules links on the page.
try{
  const from = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
  document.querySelectorAll('a[href$="/rules.html"], a[href$="rules.html"]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href || href.includes('from=')) return;
    const sep = href.includes('?') ? '&' : '?';
    a.setAttribute('href', `${href}${sep}from=${from}`);
    // Mark that we navigated to rules so we can safely recover on return.
    a.addEventListener('click', ()=>{
      try { sessionStorage.setItem('PW_RETURN_FROM_RULES','1'); } catch(e){}
    }, {passive:true});
  });
}catch(e){ /* ignore */ }
}

if (!GUIDE_MODE){
  socket.on("online_state", handleOnlineState);
}
if (GUIDE_MODE){
  // Guide mode renders deterministic demo scenes without server/socket.
  window.addEventListener('DOMContentLoaded', ()=>{
    try{
      const qs = new URLSearchParams(window.location.search);
      const scene = qs.get('scene') || 'onecard';
      const clean = (qs.get('clean') === '1');
      try{ if (clean) document.body.classList.add('guide-clean'); }catch(e){}
      try{ document.body.classList.add('guide-mode'); }catch(e){}
      try{
        if (!clean && !document.querySelector('.guideBadge')){
          const b = document.createElement('div');
          b.className = 'guideBadge';
          b.textContent = 'GUIDE MODE · ' + scene;
          document.body.appendChild(b);
        }
      }catch(e){}
      try{
        if (!clean && !document.querySelector('.guideBack')){
          const back = document.createElement('a');
          back.className = 'guideBack';
          back.href = '/guide.html';
          back.textContent = '← Tilbage';
          document.body.appendChild(back);
        }
      }catch(e){}
      const scenes = window.PW_GUIDE_SCENES || {};
      const st = scenes[scene];
      if (!st){ console.warn('Guide scene not found:', scene); return; }
      handleOnlineState({ room: 'GUIDE', seat: 0, state: st });
      if (window.PW_GUIDE_OVERLAYS && typeof window.PW_GUIDE_OVERLAYS[scene] === 'function'){
        window.PW_GUIDE_OVERLAYS[scene]();
      }
    }catch(e){ console.warn('Guide mode init failed', e); }
  });
}

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
  const isHost = (mySeat === 0);
  const inLobby = (state && state.phase === "lobby");
  if (roomCode && state && typeof state.n === "number"){
    sel.value = String(state.n);
    // Host may change player count while alone in lobby
    sel.disabled = !(isHost && inLobby);
  } else {
    sel.disabled = false;
  }
  updateAutoBotCountDisplay();
}

function updateLobbyConfig(){
  if (!roomCode) return;
  if (!state || state.phase !== "lobby") return;
  if (mySeat !== 0) return;
  socket.emit("online_update_lobby", {
    room: roomCode,
    players: playerCount(),
    bots: 0,
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
      bots: 0
    });
    pendingCreateRoom = false;
  });
}
function joinRoom(roomOverride){
  // If used as a click handler, the browser passes an Event object – ignore it.
  if (roomOverride && typeof roomOverride === "object" && ("preventDefault" in roomOverride || "currentTarget" in roomOverride)){
    roomOverride = null;
  }
  const room = normalizeCode((roomOverride !== undefined && roomOverride !== null) ? roomOverride : el("olRoomCode")?.value);
  if (!room) return;
  setStoredName(myName());
  joinInProgress = true;
  pendingJoinRoom = room;
  emitWhenConnected(() => socket.emit("online_join_room", { room, clientId: getClientId(), name: myName() }));
}
function leaveRoom(){
  // Emit leave-room (server authoritative) and navigate user back immediately.
  // This makes the "Forlad" button feel responsive even if network/server is slow.
  try{
    if (roomCode) socket.emit("online_leave_room", { room: roomCode, clientId: getClientId() });
  } catch(_) {}

  // Clear local room so redirects don't bounce back into play.
  try{
    roomCode = null;
    state = null;
  } catch(_) {}

  // Go to the official start page.
  window.location.href = "/piratwhist.html";
}
function startOnline(){ if (roomCode) socket.emit("online_start_game", { room: roomCode }); }
function onNext(){ if (roomCode) socket.emit("online_next", { room: roomCode }); }
function submitBid(){ 
  if (!roomCode) return;
  const v = parseInt(el("olBidSelect")?.value || "0", 10);
  socket.emit("online_set_bid", { room: roomCode, bid: v });
}
function playCard(cardKey){ if (roomCode) socket.emit("online_play_card", { room: roomCode, card: cardKey }); }

function getPlayableReason(card){
  if (!state) return 'NO_STATE';
  if (PW_ANIM?.dealInProgress) return 'DEAL_ANIM';
  if (state.phase !== 'playing') return 'NOT_PLAYING';
  if (mySeat === null || mySeat === undefined) return 'NO_SEAT';
  if (state.turn !== mySeat) return 'NOT_MY_TURN';
  const hand = state.hands ? state.hands[mySeat] : null;
  if (!hand) return 'NO_HAND';
  if (!state.leadSuit) return 'OK';
  const hasLead = hand.some(c => c.suit === state.leadSuit);
  if (!hasLead) return 'OK';
  return (card.suit === state.leadSuit) ? 'OK' : 'MUST_FOLLOW';
}

function isPlayable(card){
  const r = getPlayableReason(card);
  return r === 'OK';
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
    else if (state.phase === "dealing") status.textContent = "Dealer";
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
      // Each item gets data-seat so the deal-animation can target ALL players
      // even on the bidding page (where the round-table board isn't visible).
      parts.push(
        `<span class="bidItem" data-seat="${i}"><b>${names[i] || ("Spiller " + (i+1))}</b>: ${(b===null||b===undefined) ? "—" : b}</span>`
      );
    }
    list.innerHTML = parts.join(" ");
  }
}

function renderScores(){
  const n = state?.n || playerCount();
  const names = state?.names || Array.from({length:n}, (_,i)=>`Spiller ${i+1}`);
  const total = state?.pointsTotal || Array.from({length:n}, ()=>0);
  const bids = state?.bids || [];
  const taken = state?.tricksRound || Array.from({length:n}, ()=>0);

  const rNo = (state?.roundIndex ?? 0) + 1;
  const cardsPerNow = (state?.cardsPer ?? "-");
  if (el("olResRound")) el("olResRound").textContent = String(rNo);
  if (el("olResCards")) el("olResCards").textContent = String(cardsPerNow);

  // Legacy current-round table is no longer used; hide if present
  const t = el("olScoreTable");
  if (t){
    t.innerHTML = "";
    t.style.display = "none";
  }

  // Unified table: TOTAL row at top, then rounds sorted newest -> oldest.
  // Cell format: "Bud / Stik (Point)" (points show "—" if round not finished).
  const h = el("olHistoryTable");
  if (!h) return;

  const histFinished = Array.isArray(state?.history) ? state.history : [];

  // Build a "current round snapshot" row (may be unfinished)
  const currentRow = {
    round: rNo,
    cardsPer: cardsPerNow,
    bids: Array.from({length:n}, (_,i)=> (bids[i]===null||bids[i]===undefined) ? "—" : bids[i]),
    taken: Array.from({length:n}, (_,i)=> (taken[i]===null||taken[i]===undefined) ? 0 : taken[i]),
    points: null,          // unfinished
    unfinished: true
  };

  // Merge: avoid duplicating if server already included current round in history
  const hasCurrentInHist = histFinished.some(r => Number(r.round) === Number(rNo));
  const merged = hasCurrentInHist ? [...histFinished] : [currentRow, ...histFinished];

  // Sort newest -> oldest by round number (ignore TOTAL row)
  merged.sort((a,b)=> (Number(b.round)||0) - (Number(a.round)||0));

  h.innerHTML = "";

  const thead = document.createElement("thead");
  const playerHeads = Array.from({length:n}, (_,i)=>`<th>${names[i] || ("Spiller " + (i+1))}</th>`).join("");
  thead.innerHTML = `<tr><th>Runde</th>${playerHeads}<th>Antal stik</th></tr>`;

  const tbody = document.createElement("tbody");

  // TOTAL row
  {
    const tr = document.createElement("tr");
    let cells = `<td><b>Total</b></td>`;
    for (let i=0;i<n;i++){
      const p = (total[i] ?? 0);
      const pStr = (typeof p === "number" && p >= 0) ? `+${p}` : String(p);
      // Total line should ONLY show points (no bud/stik)
      cells += `<td class="rCell">${pStr}</td>`;
    }
    cells += `<td> </td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  }

  // Round rows
  for (const row of merged){
    const tr = document.createElement("tr");
    const roundNo = row.round ?? "";
    const cards = row.cardsPer ?? row.cardsPerNow ?? "";
    let cells = `<td><b>${roundNo}</b></td>`;

    for (let i=0;i<n;i++){
      const b = (row.bids && row.bids[i] !== undefined && row.bids[i] !== null) ? row.bids[i] : "—";
      const tk = (row.taken && row.taken[i] !== undefined && row.taken[i] !== null) ? row.taken[i] : "—";

      let pVal = null;
      if (row.points && row.points[i] !== undefined && row.points[i] !== null) pVal = row.points[i];

      const pStr = (pVal===null || pVal===undefined) ? "—" :
        ((typeof pVal === "number" && pVal >= 0) ? `+${pVal}` : String(pVal));

      cells += `<td class="rCell">${b} / ${tk} (${pStr})</td>`;
    }

    cells += `<td>${cards}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  }

  h.appendChild(thead);
  h.appendChild(tbody);
}

function maybeRunAnimations(){
  if (!ENABLE_FLY_CARDS) return;
  if (!state) return;

  // Deal animation: when roundIndex changes OR phase enters bidding and previous wasn't bidding for same round
  if (ENABLE_DEAL_ANIM && state.phase === "dealing" && state.dealId){
    window.__pwDealDone = window.__pwDealDone || {};
    const key = `dealId_${state.dealId}`;
    if (!window.__pwDealDone[key]){
      window.__pwDealDone[key] = true;
      setTimeout(() => runDealAnimation(state.dealSeq || []), 120);
    }
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
  if (ENABLE_SWEEP && state && (state.phase === "between_tricks" || state.phase === "round_finished")){
    if (state.winner !== null && state.winner !== undefined){
      try{
        const sig = JSON.stringify((prevState && prevState.table) ? prevState.table : (state.table || []));
        const key = `${roomCode}|${state.roundIndex}|${state.winner}|${sig}`;
        window.__pwSweepDone = window.__pwSweepDone || {};
        if (!window.__pwSweepDone[key]){
          window.__pwSweepDone[key] = true;
          setTimeout(()=> runTrickSweepAnimationQueued(state.winner, (prevState && prevState.table) ? prevState.table : (state.table || [])), 30);
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
      const name = (names[i] || `Spiller ${i+1}`).trim();
      const row = document.createElement("div");
      row.className = "nameItem";
      row.textContent = name;
      row.title = name; // tooltip for full name
      namesWrap.appendChild(row);
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
  // Server-authoritative cards-per-round (52-card safe).
  const cardsPer = Number(state.cardsPer || 0);
  if (roundSpan) roundSpan.textContent = String(rNo);
  if (cardsPerEl) cardsPerEl.textContent = String(cardsPer);

  // top info
  if (info){
    if (state.phase === "lobby"){
      const joined = state.names.filter(Boolean).length;
      info.textContent = `Lobby · ${joined}/${state.n} spillere`;
    } else if (state.phase === "dealing"){
      info.textContent = `Runde ${rNo} · Dealer kort...`;
    } else if (state.phase === "bidding"){
      info.textContent = `Runde ${rNo} · Afgiv bud`;
    } else if (state.phase === "game_finished"){
      info.textContent = "Spil færdigt · 14 runder";
    } else if (state.phase === "round_finished"){
      info.textContent = `Runde ${rNo} færdig · Klik “Næste runde”`;
    } else if (state.phase === "between_tricks"){
      // Winner is shown via the sweep-to-winner animation; keep text neutral.
      info.textContent = "Stik færdig";
    } else {
      info.textContent = `Runde ${rNo} · Tur: ${state.names[state.turn]}`;
    }
  }

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
      if (nm){ const name = (state.names[i] || ("Spiller " + (i+1))).trim(); nm.textContent = name; nm.title = name; }
      const b = el(`olSeatBid${i}`);
      if (b) b.textContent = (bids[i]===null || bids[i]===undefined) ? "—" : String(bids[i]);
      const tr = el(`olSeatTricks${i}`);
      if (tr) tr.textContent = String(taken[i] ?? 0);

      // Visual trick counter: dots/chips so the user can read trick counts at a glance.
      const viz = el(`olSeatViz${i}`);
      if (viz){
        const k = Math.max(0, Number(taken[i] ?? 0));
        const maxDots = 10;
        let dots = "";
        const show = Math.min(k, maxDots);
        for (let d=0; d<show; d++) dots += '<span class="dot" aria-hidden="true"></span>';
        if (k > maxDots) dots += `<span class="more">+${k-maxDots}</span>`;
        viz.innerHTML = dots || '<span class="zero">0</span>';
      }
      const tt = el(`olSeatTotal${i}`);
      if (tt) tt.textContent = String(total[i] ?? 0);

      const slot = el(`olTrickSlot${i}`);
      if (slot){
        // Defensive: ensure slots are never left hidden by a previous animation.
        slot.style.opacity = "";
        slot.style.visibility = "";
        slot.innerHTML = "";
        const c = state.table ? state.table[i] : null;
        if (PW_ANIM.sweepHide[i]){
          // While sweep-to-winner runs, hide the real slot so only the moving ghosts are visible.
          slot.style.visibility = "hidden";
        } else if (c){
          // While fly-in runs, suppress rendering at destination to avoid "double" (ghost + final).
          const key = `${c.rank}${c.suit}`;
          if (!PW_ANIM.flyIn[i] || PW_ANIM.flyIn[i] !== key){
            const ce = makeCardEl(c);
            ce.disabled = true;
            slot.appendChild(ce.firstChild);
          }
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
    if (state.phase === "dealing" || PW_ANIM?.dealInProgress){
      const p = document.createElement("div");
      p.className = "sub";
      p.textContent = "Dealer kort...";
      hands.appendChild(p);
    } else {
    const mine = (mySeat!==null && mySeat!==undefined && state.hands) ? state.hands[mySeat] : null;
    const cardsPer = (state?.cardsPer || 0);

    // Reset opponent-cards reveal container each render
    const __oppWrap = document.getElementById("olOppCardsWrap");
    const __oppCards = document.getElementById("olOppCards");
    if (__oppWrap) __oppWrap.classList.add("hidden");
    if (__oppCards) __oppCards.innerHTML = "";

    // Special bidding rule (cardsPer==1): show opponents' single cards face-up,
    // but hide your own card (show back) before bidding. Symmetric for all players.
    // IMPORTANT: When this rule is active, the server sends hands[] for opponents,
    // but sets YOUR hand to null. Therefore we must render this section even when
    // `mine` is null.
    const __isSingleCardBid = document.body.classList.contains("page-bidding")
      && (cardsPer === 1 || cardsPer == 1)
      && (state.phase === "dealing" || state.phase === "bidding");

    if (__isSingleCardBid){
      // Show opponents' cards in the dedicated section (preferred)
      const oppWrap = document.getElementById("olOppCardsWrap");
      const oppCards = document.getElementById("olOppCards");
      if (oppWrap) oppWrap.classList.remove("hidden");
      if (oppCards){
        oppCards.innerHTML = "";
        const nSeats = state.n || playerCount();
        for (let i=0;i<nSeats;i++){
          if (i === mySeat) continue; // never show your own card here
          const slot = document.createElement("div");
          slot.className = "bidCardSlot";

          const nm = document.createElement("div");
          nm.className = "bidName";
          nm.textContent = (state.names && state.names[i]) ? state.names[i] : `Spiller ${i+1}`;
          slot.appendChild(nm);

          const cardObj = (state.hands && state.hands[i] && state.hands[i][0]) ? state.hands[i][0] : null;
          let cardEl;
          if (cardObj) {
            cardEl = makeCardEl(cardObj);
            cardEl.disabled = true;
          } else {
            cardEl = makeCardBackEl();
            cardEl.disabled = true;
          }
          slot.appendChild(cardEl);
          oppCards.appendChild(slot);
        }
      }

      // Always render your own hidden card as a single back in the hand area,
      // so the player has a consistent "Din hånd" section.
      const h = document.createElement("div");
      h.className = "hand";
      const head = document.createElement("div");
      head.className = "head";
      const left = document.createElement("div");
      left.innerHTML = `<b>Din hånd</b> <span class="sub">(1 kort)</span>`;
      const right = document.createElement("div");
      right.className = "sub";
      right.textContent = "";
      head.appendChild(left); head.appendChild(right);

      const cards = document.createElement("div");
      cards.className = "cards";
      const mineBack = makeCardBackEl();
      mineBack.disabled = true;
      cards.appendChild(mineBack);

      h.appendChild(head);
      h.appendChild(cards);
      hands.appendChild(h);
      requestAnimationFrame(() => applyHandOverlap(cards));
      return; // do not render normal hand UI
    }

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
      const canPlayTurn = (state.phase === "playing") && (state.turn === mySeat);
      right.textContent = canPlayTurn ? "Din tur" : "";
      head.appendChild(left); head.appendChild(right);

      const cards = document.createElement("div");
      cards.className = "cards";

      const cardsPer = (state?.cardsPer || 0);
      // Reset opponent-cards reveal container each render
      const __oppWrap = document.getElementById("olOppCardsWrap");
      const __oppCards = document.getElementById("olOppCards");
      if (__oppWrap) __oppWrap.classList.add("hidden");
      if (__oppCards) __oppCards.innerHTML = "";


      // Special bidding rule (cardsPer==1): show opponents' single cards face-up,
      // but hide your own card (show back) before bidding. Symmetric for all players.
      if (document.body.classList.contains("page-bidding") && (cardsPer === 1 || cardsPer == 1) && (state.phase === "dealing" || state.phase === "bidding")) {
        // Special bidding rule (cardsPer==1): show opponents' single cards face-up,
        // but hide your own card (show back) before bidding. Symmetric for all players.
        const oppWrap = document.getElementById("olOppCardsWrap");
        const oppCards = document.getElementById("olOppCards");
        if (oppCards){
          oppCards.innerHTML = "";
          if (oppWrap) oppWrap.classList.remove("hidden");

          const nSeats = state.n || playerCount();
          for (let i=0;i<nSeats;i++){
            if (i === mySeat) continue; // never show your own card here
            const slot = document.createElement("div");
            slot.className = "bidCardSlot";

            const nm = document.createElement("div");
            nm.className = "bidName";
            nm.textContent = (state.names && state.names[i]) ? state.names[i] : `Spiller ${i+1}`;
            slot.appendChild(nm);

            const cardObj = (state.hands && state.hands[i] && state.hands[i][0]) ? state.hands[i][0] : null;
            let cardEl;
            if (cardObj) {
              cardEl = makeCardEl(cardObj);
              cardEl.disabled = true;
            } else {
              // Fallback: show back if card is not available yet
              cardEl = makeCardBackEl();
            }
            slot.appendChild(cardEl);
            oppCards.appendChild(slot);
          }
        } else {
          // Fallback for older HTML: render everything into the hand area
          cards.classList.add("bidReveal");
          const nSeats = state.n || playerCount();
          for (let i=0;i<nSeats;i++){
            const slot = document.createElement("div");
            slot.className = "bidCardSlot";

            const nm = document.createElement("div");
            nm.className = "bidName";
            nm.textContent = (state.names && state.names[i]) ? state.names[i] : `Spiller ${i+1}`;
            slot.appendChild(nm);

            const cardObj = (state.hands && state.hands[i] && state.hands[i][0]) ? state.hands[i][0] : null;
            let cardEl;
            if (i === mySeat) {
              cardEl = makeCardBackEl();
            } else if (cardObj) {
              cardEl = makeCardEl(cardObj);
              cardEl.disabled = true;
            } else {
              cardEl = makeCardBackEl();
            }
            slot.appendChild(cardEl);
            cards.appendChild(slot);
          }
        }

        // Always hide your own card in the hand area (show back only)
        const mineBack = makeCardBackEl();
        mineBack.disabled = true;
        cards.appendChild(mineBack);
      } else {
        const mineSorted = sortHand(mine);
        for (const c of mineSorted){
          const b = makeCardEl(c);
          b.disabled = !(canPlayTurn && isPlayable(c));
          // Debug: trace touch/pointer events on hand cards (mobile freeze cases)
        try{
          if (PW_DEBUG?.enabled){
            ["pointerdown","pointerup","pointercancel","touchstart","touchend","touchcancel"].forEach(evt=>{
              b.addEventListener(evt, (ev)=>{
                PW_DEBUG.push(evt, {card: `${c.rank}${c.suit}`, type: ev.type, touches: ev.touches?.length || 0});
              }, {passive:true});
            });
          }
        }catch(e){}
        b.addEventListener("click", () => {
          try{ if (PW_DEBUG?.enabled){ PW_DEBUG.markPlayAttempt(); const reason=getPlayableReason(c); PW_DEBUG.push("click", {card:`${c.rank}${c.suit}`, reason, turn: state?.turn, mySeat}); } }catch(e){}
          const reason = getPlayableReason(c);
          if (reason !== "OK"){
            try{ if (PW_DEBUG?.enabled){ PW_DEBUG.toast("Kan ikke spille: "+reason); } }catch(e){}
            return;
          }
          // Save a precise start position for the fly-in animation (only for your own plays)
          if (ENABLE_FLY) window.__pwLastPlayed = { seat: mySeat, key: `${c.rank}${c.suit}`, rect: b.getBoundingClientRect() };
          try{ if (PW_DEBUG?.enabled){ PW_DEBUG.markPlaySent(); PW_DEBUG.push("send_play", {card:`${c.rank}${c.suit}`}); } }catch(e){}
          playCard(`${c.rank}${c.suit}`);
        });
        cards.appendChild(b);
      }
        cards.classList.toggle("handLocked", !canPlayTurn);
      }

      h.appendChild(head);
      h.appendChild(cards);
      hands.appendChild(h);
      requestAnimationFrame(() => applyHandOverlap(cards));
    } else {
      const p = document.createElement("div");
      p.className = "sub";
      p.textContent = roomCode ? "Vent på start." : "Opret eller join et rum.";
      hands.appendChild(p);
    }
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

  // PC HUD: keep values in the corners (and wire buttons, incl. Regler)
  syncPcHud();
  wirePcHudButtons();
  const rulesBtn = el("olRules");
  if (rulesBtn) rulesBtn.onclick = goToRules;
  const pcRules = el("pcRules");
  if (pcRules) pcRules.onclick = goToRules;

  // PC layout: enforce the hand no-fly zone after seats have been positioned
  applyPcNoFlyZoneForSeats();
  requestAnimationFrame(() => alignHandDockToBottomSeat());

  renderScores();
}

el("olCreateRoom")?.addEventListener("click", createRoom);
el("olJoinRoom")?.addEventListener("click", joinRoom);
el("olLeaveRoom")?.addEventListener("click", leaveRoom);
el("olStartOnline")?.addEventListener("click", startOnline);
el("olNextRound")?.addEventListener("click", onNext);
el("olBidSubmit")?.addEventListener("click", submitBid);
el("olPlayerCount")?.addEventListener("change", () => {
  updateAutoBotCountDisplay();
  updateLobbyConfig();
  render();
});


// --- Debug freeze detector (play input) ---
// Shows "Kopiér fejl-log" if it looks like your turn but no play is being sent/advanced.
(function setupPlayFreezeDetector(){
  try{
    if (!(PW_DEBUG?.enabled)) return;
    PW_DEBUG.ensureUI();
    let lastShown = 0;
    setInterval(()=>{
      try{
        if (!state || state.phase !== "playing") { PW_DEBUG.showCopyButton(false); return; }
        if (typeof mySeat !== "number") { PW_DEBUG.showCopyButton(false); return; }
        if (state.turn !== mySeat) { PW_DEBUG.showCopyButton(false); return; }
        const hand = state.hands ? state.hands[mySeat] : null;
        if (!Array.isArray(hand) || hand.length === 0) { PW_DEBUG.showCopyButton(false); return; }
        if (PW_ANIM?.dealInProgress || PW_ANIM?.sweepInProgress || PW_ANIM?.flyInProgress) { PW_DEBUG.showCopyButton(false); return; }
        // At least one playable card exists
        const anyPlayable = hand.some(c => getPlayableReason(c) === "OK");
        if (!anyPlayable) { PW_DEBUG.showCopyButton(false); return; }

        const t = Date.now();
        const times = PW_DEBUG.getTimes();
        // If no play was sent and no state arrived for a while, likely stuck input layer.
        const sinceState = t - (times.lastStateAt || 0);
        const sinceSent = t - (times.lastPlaySentAt || 0);
        const sinceAttempt = t - (times.lastPlayAttemptAt || 0);

        const stuck = (sinceState > 8000) || ((times.lastPlayAttemptAt && sinceAttempt > 8000 && sinceSent > 8000));
        if (stuck){
          PW_DEBUG.showCopyButton(true);
          if (t - lastShown > 6000){
            lastShown = t;
            PW_DEBUG.toast("Hvis spillet er låst: tryk 'Kopiér fejl-log'");
            PW_DEBUG.push("freeze_hint", {sinceState, sinceSent, sinceAttempt});
          }
        } else {
          PW_DEBUG.showCopyButton(false);
        }
      }catch(e){ /* ignore */ }
    }, 1200);
  }catch(e){ /* ignore */ }
})();

render();

// Update host name in lobby (and keep server state in sync)
el("olMyName")?.addEventListener("blur", () => {
  setStoredName(el("olMyName")?.value || "");
  updateLobbyConfig();
  render();
});

// Pre-fill name inputs on pages that have them
if (el("olMyName")) {
  const s = getStoredName();
  const cur = (el("olMyName").value || "").trim();
  // If the field still contains the default placeholder name, replace it so the user
  // does not have to type their name twice (online.html -> lobby/bidding/play).
  if (s && (!cur || cur === "Spiller 1" || cur === "Spiller")) el("olMyName").value = s;
}
// v0.2.115 PC HUD sync + button wiring
function syncPcHud(){
  const seatLbl = el("olSeatLabel")?.textContent || "-";
  const leader = el("olLeader")?.textContent || "-";
  const suit = el("olLeadSuit")?.textContent || "-";
  const info = el("olInfo")?.textContent || "-";
  const round = (el("olRoundLabel")?.textContent || el("olRound")?.textContent || "-");

  const pcSeat = el("pcSeatLabel"); if (pcSeat) pcSeat.textContent = seatLbl;
  const pcLeader = el("pcLeader"); if (pcLeader) pcLeader.textContent = leader;
  const pcSuit = el("pcLeadSuit"); if (pcSuit) pcSuit.textContent = suit;
  const pcRound = el("pcRoundLabel"); if (pcRound) pcRound.textContent = round;

  // Optional: mirror olInfo into TL if present as ghost pill (not added now)
}

function wirePcHudButtons(){
  const map = [
    ["pcNextRound","olNextRound"],
    ["pcLeave","olLeaveRoom"]
  ];
  for (const [pcId, srcId] of map){
    const pcBtn = el(pcId);
    const srcBtn = el(srcId);
    if (pcBtn && srcBtn){
      pcBtn.onclick = () => srcBtn.click();
      pcBtn.disabled = !!srcBtn.disabled;
      pcBtn.style.display = (getComputedStyle(srcBtn).display === "none") ? "none" : "";
    }
  }
}

function goToRules(){
  try {
    // Remember the exact URL so the rules page can return even if browser back is unavailable.
    sessionStorage.setItem("pw_rules_return", window.location.href);
  } catch(_) {}
  const from = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
  window.location.href = `/rules.html?from=${from}`;
}

function alignHandDockToBottomSeat(){
  if (!document.body.classList.contains("page-play")) return;
  const handDock = document.querySelector(".handDock");
  const bottomSeat = document.querySelector(".boardSeats .seat-bottom");
  const panel = document.querySelector(".boardPanel");
  if (!handDock || !bottomSeat || !panel) return;

  const panelRect = panel.getBoundingClientRect();
  const seatRect = bottomSeat.getBoundingClientRect();
  const handRect = handDock.getBoundingClientRect();
  const gap = window.innerWidth < 900 ? 10 : 14;

  const desiredTop = seatRect.bottom + gap;
  const maxTop = panelRect.bottom - 8 - handRect.height;
  const minTop = panelRect.top + 8;
  const top = Math.max(minTop, Math.min(desiredTop, maxTop));
  const offsetTop = top - panelRect.top;

  handDock.style.top = `${offsetTop.toFixed(1)}px`;
  handDock.style.bottom = "auto";
  handDock.classList.add("handDockAuto");
}

// v0.2.115 no-fly zone: avoid overlap between hand area and the bottom-left opponent seat on PC
function applyPcNoFlyZoneForSeats(){
  if (window.innerWidth < 900) return;
  const nf = document.querySelector(".handNoFly");
  if (!nf) return;
  const nfRect = nf.getBoundingClientRect();
  // Find the bottom-left seat (closest to left+bottom among non-local seats)
  const seats = Array.from(document.querySelectorAll(".boardSeats .seat"));
  seats.forEach((s) => {
    if (s.dataset.baseTransform !== undefined){
      s.style.transform = s.dataset.baseTransform;
    }
  });
  let best = null;
  let bestScore = 1e18;
  for (const s of seats){
    if (s.classList.contains("seat-bottom")) continue; // skip local seat
    const r = s.getBoundingClientRect();
    const score = (r.left + (window.innerWidth - r.right)) + (window.innerHeight - r.bottom);
    if (score < bestScore){ bestScore = score; best = s; }
  }
  if (!best) return;
  const r = best.getBoundingClientRect();
  const overlap = !(r.right < nfRect.left || r.left > nfRect.right || r.bottom < nfRect.top || r.top > nfRect.bottom);
  if (overlap){
    // Solution A: move the offending seat slightly up/left
    const base = best.dataset.baseTransform ?? best.style.transform ?? "translate(-50%, -50%)";
    best.dataset.baseTransform = base;
    best.style.transform = base + " translate(-18px, -42px)";
  }
}

// =========================================================
// Dev debug overlay (toggle with ?debug=1 or localStorage PW_DEBUG_OVERLAY=1)
// =========================================================
(function initPwDebugOverlay(){
  try {
    const qs = new URLSearchParams(location.search);
    const urlHasDebug = qs.get("debug") === "1";
    const lsHasDebug = (typeof localStorage !== "undefined") && localStorage.getItem("PW_DEBUG_OVERLAY") === "1";
    const enabled = urlHasDebug || lsHasDebug;
    if (!enabled) return;

    const SEL = {
      table: "#olPile",       // center pile
      hand:  "#olHands",      // hand row
      hud:   ".mobileHud",    // mobile bottom HUD wrapper
      seats: ".seat"          // seats
    };

    let overlay = document.getElementById("pwDebugOverlay");
    if (!overlay){
      overlay = document.createElement("div");
      overlay.id = "pwDebugOverlay";
      document.body.appendChild(overlay);
    }

    function clear(){ overlay.innerHTML = ""; }

    function addBox(rect, label, cls){
      const d = document.createElement("div");
      d.className = cls || "pwDbgBox";
      d.style.left = rect.left + "px";
      d.style.top = rect.top + "px";
      d.style.width = rect.width + "px";
      d.style.height = rect.height + "px";

      const l = document.createElement("div");
      l.className = "pwDbgLabel";
      l.textContent = label;
      d.appendChild(l);
      overlay.appendChild(d);
    }

    function rectOf(sel){
      const el = document.querySelector(sel);
      if (!el) return null;
      return el.getBoundingClientRect();
    }

    function draw(){
      clear();

      const rTable = rectOf(SEL.table);
      if (rTable) addBox(rTable, "TABLE (#olPile)", "pwDbgBox");

      const rHand = rectOf(SEL.hand);
      if (rHand) addBox(rHand, "HAND (#olHands)", "pwDbgZone");

      const rHud = rectOf(SEL.hud);
      if (rHud) addBox(rHud, "HUD (.mobileHud)", "pwDbgZone");

      const seats = Array.from(document.querySelectorAll(SEL.seats));
      seats.forEach((s, idx) => {
        const r = s.getBoundingClientRect();
        const name = (s.querySelector(".seatName")?.textContent || "").trim();
        addBox(r, `SEAT ${idx+1}${name ? " – " + name : ""}`, "pwDbgBox");
      });

      // If we can't find a HUD element, still show a conservative bottom reserved band.
      if (!rHud){
        const bottomReservedPx = 140; // conservative dev band
        addBox({ left:0, top: window.innerHeight - bottomReservedPx, width: window.innerWidth, height: bottomReservedPx }, "BOTTOM RESERVED (fallback)", "pwDbgZone");
      }
    }

    window.addEventListener("resize", () => draw());
    window.addEventListener("orientationchange", () => setTimeout(draw, 250));

    const t = setInterval(draw, 500);
    window.__PW_STOP_DEBUG_OVERLAY = () => { try { clearInterval(t); } catch(e){} };
    draw();
  } catch(e) {
    // no-op
  }
})();
