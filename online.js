// Piratwhist Online (prototype) - local pass-and-play (no networking yet).
const SUITS = ["♠","♥","♦","♣"]; // spar is trump
const SUIT_NAME = {"♠":"spar","♥":"hjerter","♦":"ruder","♣":"klør"};
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));
const ROUND_CARDS = [7,6,5,4,3,2,1,1,2,3,4,5,6,7]; // 14 rounds

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
function cardKey(c){ return `${c.rank}${c.suit}`; }

function compareCards(a,b,leadSuit){
  const aTrump = a.suit === "♠";
  const bTrump = b.suit === "♠";
  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;

  if (a.suit === b.suit){
    return Math.sign(RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
  }
  const aLead = a.suit === leadSuit;
  const bLead = b.suit === leadSuit;
  if (aLead && !bLead) return 1;
  if (!aLead && bLead) return -1;
  return Math.sign(RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
}

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

function dealHandsForRound(n, roundIndex){
  const cardsPer = ROUND_CARDS[roundIndex];
  const needed = cardsPer * n;
  const deck = shuffle(makeDeck());
  const take = deck.slice(0, needed);
  const hands = Array.from({length:n}, ()=>[]);
  for (let i=0;i<take.length;i++){
    hands[i % n].push(take[i]);
  }
  // sort hands for readability: suit then rank
  for (const h of hands){
    h.sort((a,b)=>{
      const sa = SUITS.indexOf(a.suit), sb = SUITS.indexOf(b.suit);
      if (sa !== sb) return sa - sb;
      return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    });
  }
  return {hands, cardsPer};
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

// Graphical card element
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
  div.appendChild(c1);
  div.appendChild(mid);
  div.appendChild(c2);
  btn.appendChild(div);
  return btn;
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

    // finish trick
    state.phase = "between_tricks";
  }

  // If all hands empty, round finished
  if (state.hands.every(h => h.length === 0)){
    state.phase = "round_finished";
  }

  render();
}

function startTrickFromLeader(){
  state.turn = state.leader;
  state.leadSuit = null;
  state.table = Array.from({length:state.n}, ()=>null);
  state.winner = null;
  state.phase = "playing";
}

function nextTrick(){
  if (!state) return;
  if (state.phase !== "between_tricks"){
    return;
  }
  // leader becomes previous winner
  state.leader = state.winner;
  startTrickFromLeader();
  render();
}

function nextRound(){
  if (!state) return;

  // If we're mid-trick, don't allow advancing
  if (state.phase === "playing"){
    showWarn("Afslut stikket før du går til næste runde.");
    return;
  }
  showWarn("");

  if (state.roundIndex >= 13){
    state.phase = "game_finished";
    render();
    return;
  }

  state.roundIndex += 1;
  const dealt = dealHandsForRound(state.n, state.roundIndex);
  state.hands = dealt.hands;
  state.cardsPerPlayer = dealt.cardsPer;
  state.tricksWonRound = Array.from({length:state.n}, ()=>0);
  state.trickNumber = 1;

  // rotate leader each round (simple): player 0 always starts, or keep previous?
  state.leader = 0;
  startTrickFromLeader();
  render();
}

function newGame(){
  const n = parseInt(el("olPlayerCount").value, 10);
  const names = [];
  const inputs = el("olNames").querySelectorAll("input");
  for (let i=0;i<n;i++){
    const v = inputs[i]?.value?.trim();
    names.push(v || `Spiller ${i+1}`);
  }

  const dealt = dealHandsForRound(n, 0);
  state = {
    n,
    names,
    roundIndex: 0,
    cardsPerPlayer: dealt.cardsPer,
    hands: dealt.hands,
    tricksWon: Array.from({length:n}, ()=>0), // total across game
    tricksWonRound: Array.from({length:n}, ()=>0),
    trickNumber: 1,
    leader: 0,
    turn: 0,
    leadSuit: null,
    table: Array.from({length:n}, ()=>null),
    winner: null,
    phase: "playing" // playing | between_tricks | round_finished | game_finished
  };
  render();
}

function render(){
  renderNames();

  const info = el("olInfo");
  const roundSpan = el("olRound");
  const cardsPer = el("olCardsPer");

  if (!state){
    info.textContent = "Ikke startet";
    if (roundSpan) roundSpan.textContent = "-";
    if (cardsPer) cardsPer.textContent = "-";
    el("olLeader").textContent = "-";
    el("olLeadSuit").textContent = "-";
    el("olWinner").textContent = "-";
    el("olTable").innerHTML = "";
    el("olHands").innerHTML = "";
    el("olNextRound").disabled = true;
    return;
  }

  const rNo = state.roundIndex + 1;
  if (roundSpan) roundSpan.textContent = String(rNo);
  if (cardsPer) cardsPer.textContent = String(state.cardsPerPlayer);

  // status text
  if (state.phase === "game_finished"){
    info.textContent = `Spil færdigt · 14 runder`;
  } else if (state.phase === "round_finished"){
    info.textContent = `Runde ${rNo} færdig · Klik “Næste runde”`;
  } else if (state.phase === "between_tricks"){
    info.textContent = `Runde ${rNo} · Stik ${state.trickNumber} færdig · Vinder: ${state.names[state.winner]}`;
  } else {
    info.textContent = `Runde ${rNo} · Stik ${state.trickNumber} · Tur: ${state.names[state.turn]}`;
  }

  el("olLeader").textContent = state.names[state.leader];
  el("olLeadSuit").textContent = state.leadSuit ? `${state.leadSuit} (${SUIT_NAME[state.leadSuit]})` : "-";
  el("olWinner").textContent = state.winner===null ? "-" : state.names[state.winner];

  // table
  const table = el("olTable");
  table.innerHTML = "";
  table.style.gridTemplateColumns = `repeat(${Math.min(4,state.n)}, minmax(140px, 1fr))`;
  for (let i=0;i<state.n;i++){
    const slot = document.createElement("div");
    slot.className = "slot";
    const nm = document.createElement("div");
    nm.className = "name";
    nm.textContent = `${state.names[i]} · total stik: ${state.tricksWon[i]}`;
    const cd = document.createElement("div");
    cd.className = "card";
    if (state.table[i]){
      const ce = makeCardEl(state.table[i]);
      ce.disabled = true;
      cd.appendChild(ce.firstChild); // append just card graphic
    } else {
      cd.textContent = "—";
    }
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
      const b = makeCardEl(c);
      b.disabled = !(state.phase==="playing" && isPlayable(i, c));
      b.addEventListener("click", ()=>playCard(i, cardKey(c)));
      cards.appendChild(b);
    }

    h.appendChild(head);
    h.appendChild(cards);
    hands.appendChild(h);
  }

  // When trick finished, allow continuing (auto-next trick button not shown; user keeps playing by clicking Next Round?)
  // We'll auto-start next trick only when user clicks "Næste runde"? Instead, we keep a simple flow:
  // If between_tricks, clicking "Næste runde" advances to next trick if cards remain; if round finished, it advances round.
  const btn = el("olNextRound");
  if (state.phase === "between_tricks"){
    btn.disabled = false;
    btn.textContent = "Næste stik";
  } else if (state.phase === "round_finished"){
    btn.disabled = false;
    btn.textContent = "Næste runde";
  } else if (state.phase === "game_finished"){
    btn.disabled = true;
    btn.textContent = "Færdig";
  } else {
    btn.disabled = true;
    btn.textContent = "Næste stik/runde";
  }
}

function onNext(){
  if (!state) return;
  if (state.phase === "between_tricks"){
    // move to next trick in same round
    state.tricksWon[state.winner] += 1; // count trick for total when trick finishes
    state.tricksWonRound[state.winner] += 1;
    state.trickNumber += 1;

    // if more cards remain, continue; else round finished is already set by playCard, but double-check
    if (state.hands.every(h => h.length === 0)){
      state.phase = "round_finished";
      render();
      return;
    }

    nextTrick();
    return;
  }
  if (state.phase === "round_finished"){
    nextRound();
    return;
  }
}

let state = null;

el("olPlayerCount").addEventListener("change", () => {
  renderNames();
  render();
});

el("olNewGame").addEventListener("click", newGame);
el("olNextRound").addEventListener("click", onNext);

renderNames();
render();
