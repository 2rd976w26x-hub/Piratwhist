// Piratwhist Online (prototype) - local pass-and-play, no networking yet.
const SUITS = ["♠","♥","♦","♣"]; // spades trump
const SUIT_NAME = {"♠":"spar","♥":"hjerter","♦":"ruder","♣":"klør"};
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));

function el(id){ return document.getElementById(id); }
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

function makeDeck(){
  const deck=[];
  for (const s of SUITS){
    for (const r of RANKS){
      deck.push({suit:s, rank:r});
    }
  }
  return deck;
}
function shuffle(a){
  for (let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function cardText(c){ return `${c.rank}${c.suit}`; }
function cardKey(c){ return `${c.rank}${c.suit}`; }

function compareCards(a,b,leadSuit){
  // return 1 if a beats b, -1 if b beats a
  const aTrump = a.suit === "♠";
  const bTrump = b.suit === "♠";
  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;

  // Both trump or both non-trump
  if (a.suit === b.suit){
    return Math.sign(RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
  }
  // Neither is trump and suits differ: only cards of lead suit are eligible
  const aLead = a.suit === leadSuit;
  const bLead = b.suit === leadSuit;
  if (aLead && !bLead) return 1;
  if (!aLead && bLead) return -1;
  // otherwise neither matches lead (shouldn't happen if follow suit exists), compare by rank fallback
  return Math.sign(RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
}

let state = null;

function defaultNames(n){
  return Array.from({length:n}, (_,i)=>`Spiller ${i+1}`);
}

function renderNames(){
  const n = parseInt(el("olPlayerCount").value, 10);
  const wrap = el("olNames");
  wrap.innerHTML = "";
  const names = state?.names && state.names.length===n ? state.names : defaultNames(n);
  for (let i=0;i<n;i++){
    const input = document.createElement("input");
    input.className = "input";
    input.value = names[i];
    input.addEventListener("input", () => {
      if (!state) state = {};
      if (!state.names) state.names = defaultNames(n);
      state.names[i] = input.value.trim() || `Spiller ${i+1}`;
      render();
    });
    wrap.appendChild(input);
  }
}

function dealHands(n){
  const deck = shuffle(makeDeck());
  const per = Math.floor(deck.length / n);
  const hands = Array.from({length:n}, ()=>[]);
  for (let i=0;i<per*n;i++){
    hands[i % n].push(deck[i]);
  }
  // sort hands for readability: suit then rank
  for (const h of hands){
    h.sort((a,b)=>{
      const sa = SUITS.indexOf(a.suit), sb = SUITS.indexOf(b.suit);
      if (sa !== sb) return sa - sb;
      return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    });
  }
  return hands;
}

function canFollowSuit(hand, leadSuit){
  return hand.some(c => c.suit === leadSuit);
}

function isPlayable(playerIndex, card){
  if (!state) return false;
  if (state.phase !== "playing") return false;
  if (playerIndex !== state.turn) return false;
  if (state.leadSuit === null) return true;
  const hand = state.hands[playerIndex];
  const hasLead = canFollowSuit(hand, state.leadSuit);
  if (!hasLead) return true;
  return card.suit === state.leadSuit;
}

function showWarn(msg){
  const w = el("olWarn");
  if (!msg){
    w.classList.add("hidden");
    w.textContent = "";
    return;
  }
  w.textContent = msg;
  w.classList.remove("hidden");
}

function playCard(playerIndex, cardKeyStr){
  const hand = state.hands[playerIndex];
  const idx = hand.findIndex(c => cardKey(c)===cardKeyStr);
  if (idx === -1) return;
  const card = hand[idx];

  if (!isPlayable(playerIndex, card)){
    if (state.leadSuit){
      showWarn(`Du skal bekende kulør (${state.leadSuit} / ${SUIT_NAME[state.leadSuit]}) hvis muligt.`);
    } else {
      showWarn("Det er ikke din tur.");
    }
    return;
  }
  showWarn("");

  hand.splice(idx,1);

  if (state.leadSuit === null){
    state.leadSuit = card.suit;
  }
  state.table[playerIndex] = card;

  // advance turn to next player who hasn't played yet this trick
  let next = (playerIndex + 1) % state.n;
  for (let i=0;i<state.n;i++){
    if (state.table[next] === null){
      state.turn = next;
      break;
    }
    next = (next + 1) % state.n;
  }

  // if trick complete
  if (state.table.every(x => x !== null)){
    let winner = state.leader;
    let best = state.table[winner];
    for (let i=0;i<state.n;i++){
      const c = state.table[i];
      if (!c) continue;
      const cmp = compareCards(c, best, state.leadSuit);
      if (cmp > 0){
        best = c;
        winner = i;
      }
    }
    state.winner = winner;
    state.tricksWon[winner] += 1;
    state.phase = "done";
  }

  render();
}

function nextTrick(){
  if (!state) return;
  // allow next trick even if previous not completed? we'll require completion.
  if (state.phase !== "done"){
    showWarn("Runden er ikke færdig endnu.");
    return;
  }
  showWarn("");
  state.trickIndex += 1;

  // if hands empty: end game
  const anyCards = state.hands.some(h => h.length>0);
  if (!anyCards){
    state.phase = "finished";
    render();
    return;
  }

  state.leader = state.winner;
  state.turn = state.leader;
  state.leadSuit = null;
  state.table = Array.from({length:state.n}, ()=>null);
  state.winner = null;
  state.phase = "playing";
  render();
}

function newGame(){
  const n = parseInt(el("olPlayerCount").value, 10);
  const names = [];
  // collect current name inputs
  const inputs = el("olNames").querySelectorAll("input");
  for (let i=0;i<n;i++){
    const v = inputs[i]?.value?.trim();
    names.push(v || `Spiller ${i+1}`);
  }
  state = {
    n,
    names,
    hands: dealHands(n),
    tricksWon: Array.from({length:n}, ()=>0),
    trickIndex: 1,
    leader: 0,
    turn: 0,
    leadSuit: null,
    table: Array.from({length:n}, ()=>null),
    winner: null,
    phase: "playing"
  };
  render();
}

function render(){
  renderNames();

  const info = el("olInfo");
  if (!state){
    info.textContent = "Ikke startet";
    el("olLeader").textContent = "-";
    el("olLeadSuit").textContent = "-";
    el("olWinner").textContent = "-";
    el("olTable").innerHTML = "";
    el("olHands").innerHTML = "";
    return;
  }

  const totalTricks = Math.max(...state.hands.map(h=>h.length)) + (state.trickIndex-1);
  info.textContent = state.phase === "finished"
    ? `Færdig · ${totalTricks} runder`
    : `Runde ${state.trickIndex} · Tur: ${state.names[state.turn]}`;

  el("olLeader").textContent = state.names[state.leader];
  el("olLeadSuit").textContent = state.leadSuit ? `${state.leadSuit} (${SUIT_NAME[state.leadSuit]})` : "-";
  el("olWinner").textContent = state.winner===null ? "-" : state.names[state.winner];

  // table
  const table = el("olTable");
  table.innerHTML = "";
  // adapt columns based on player count
  table.style.gridTemplateColumns = `repeat(${Math.min(4,state.n)}, minmax(140px, 1fr))`;
  for (let i=0;i<state.n;i++){
    const slot = document.createElement("div");
    slot.className = "slot";
    const nm = document.createElement("div");
    nm.className = "name";
    nm.textContent = `${state.names[i]} · stik: ${state.tricksWon[i]}`;
    const cd = document.createElement("div");
    cd.className = "card";
    cd.textContent = state.table[i] ? cardText(state.table[i]) : "—";
    slot.appendChild(nm);
    slot.appendChild(cd);
    table.appendChild(slot);
  }

  // hands
  const hands = el("olHands");
  hands.innerHTML = "";
  for (let i=0;i<state.n;i++){
    const h = document.createElement("div");
    h.className = "hand";
    const head = document.createElement("div");
    head.className = "head";
    const left = document.createElement("div");
    left.innerHTML = `<b>${state.names[i]}</b> <span class="sub">(${state.hands[i].length} kort)</span>`;
    const right = document.createElement("div");
    right.className = "sub";
    right.textContent = (state.turn===i && state.phase==="playing") ? "Din tur" : "";
    head.appendChild(left);
    head.appendChild(right);

    const cards = document.createElement("div");
    cards.className = "cards";
    for (const c of state.hands[i]){
      const b = document.createElement("button");
      b.className = "cardbtn";
      b.textContent = cardText(c);
      b.disabled = !isPlayable(i, c);
      b.addEventListener("click", ()=>playCard(i, cardKey(c)));
      cards.appendChild(b);
    }

    h.appendChild(head);
    h.appendChild(cards);
    hands.appendChild(h);
  }

  // next trick button enabled only when done/finished
  el("olNextTrick").disabled = !(state.phase === "done" || state.phase === "finished");
}

el("olPlayerCount").addEventListener("change", () => {
  renderNames();
  render();
});

el("olNewGame").addEventListener("click", newGame);
el("olNextTrick").addEventListener("click", nextTrick);

renderNames();
render();
