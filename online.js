// Piratwhist Online Multiplayer (v0.2.49-preview)
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
const APP_VERSION = "0.2.47";
// v0.2.40:
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

  const my = (typeof mySeat === "number" && mySeat >= 0) ? mySeat : 0;
  // Seat ring radius in %.
  // NOTE: The board container has overflow:hidden, so on small screens we must
  // keep top seats inside the box (otherwise they get clipped and appear "missing").
  const isMobile = (typeof window !== "undefined" && window.matchMedia)
    ? window.matchMedia("(max-width: 520px)").matches
    : false;
  // Mobile tweak (preview): pull seats slightly inward so top seats never get clipped.
  // This is a temporary, conservative setting while we finalize the approved mobile layout.
  const seatR = isMobile
    ? ((n <= 2) ? 34 : (n <= 4 ? 36 : 38))
    : ((n <= 2) ? 42 : (n <= 4 ? 44 : 46));
  const slotR = isMobile ? 16 : 18;

  for (let i=0;i<n;i++){
    const rel = (i - my + n) % n;
    const ang = (90 + (rel * 360 / n)) * Math.PI / 180;
    const x = 50 + seatR * Math.cos(ang);
    const y = 50 + seatR * Math.sin(ang);

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
  const msg = (data?.message || "Ukendt fejl");

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

socket.on("online_state", (payload) => {
  joinInProgress = false;
  pendingJoinRoom = null;
  pendingCreateRoom = false;
  joinRetryCount = 0;
  roomCode = payload.room;
  if (payload.seat !== null && payload.seat !== undefined) mySeat = payload.seat;
  prevState = state;
  state = payload.state;

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
  if (PW_ANIM?.dealInProgress) return false;
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

  // Remove winner toast/marking on the board. The trick sweep animation
  // (cards moving to the winner) is the visual cue.
  (function hideWinnerToast(){
    const t = el("olWinnerToast");
    if (!t) return;
    t.classList.add("hidden");
    t.textContent = "";
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
      const mineSorted = sortHand(mine);
      for (const c of mineSorted){
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
// Play-page: user toggle for the left players panel
(function initPlayersPanelToggle(){
  const btn = el("olTogglePlayersPanel");
  if (!btn) return;
  const key = "pw_hide_players_panel";
  const apply = () => {
    let hidden = false;
    try{ hidden = localStorage.getItem(key) === "1"; }catch(e){ hidden = false; }
    document.body.classList.toggle("hidePlayersPanel", hidden);
    btn.textContent = hidden ? "Vis panel" : "Skjul panel";
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
  };
  btn.addEventListener("click", () => {
    let hidden = false;
    try{ hidden = localStorage.getItem(key) === "1"; }catch(e){ hidden = false; }
    const next = !hidden;
    try{ localStorage.setItem(key, next ? "1" : "0"); }catch(e){ /* ignore */ }
    apply();
  });
  apply();
})();
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