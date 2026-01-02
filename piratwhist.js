/* Piratwhist – offline scorekeeper (bids + tricks + points). */
const APP_NAME = "Piratwhist";
const APP_VERSION = "0.0.3";
const STORAGE_KEY = "piratwhist_v1"; // storage namespace

const el = (id) => document.getElementById(id);

const state = {
  players: [],
  rounds: 14,
  maxByRound: [],
  data: [], // data[roundIndex][playerIndex] = { bid, tricks }
  currentRound: 0,
};

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

/**
 * Points:
 * - If tricks === bid => +10
 * - Else => -abs(tricks - bid)
 */
function pointsFor(bid, tricks){
  bid = parseInt(bid ?? 0, 10);
  tricks = parseInt(tricks ?? 0, 10);
  if (tricks === bid) return 10;
  return -Math.abs(tricks - bid);
}

function totalForPlayer(playerIndex){
  let sum = 0;
  for (let r = 0; r < state.rounds; r++){
    const row = state.data[r][playerIndex];
    sum += pointsFor(row.bid, row.tricks);
  }
  return sum;
}

/**
 * Max-stik mønster (0 er altid tilladt):
 * 1: 7
 * 2: 6
 * 3: 4
 * 4: 3
 * 5: 2
 * 6: 1
 * 7: 2
 * 8: 3
 * 9: 4
 * 10: 5
 * 11: 6
 * 12: 7
 *
 * For 4–14 runder: vi tager starten af sekvensen og gentager hvis nødvendigt.
 */
function buildMaxByRound(roundCount){
  const base = [7,6,4,3,2,1,2,3,4,5,6,7];
  const out = [];
  for(let i=0;i<roundCount;i++){
    out.push(base[i % base.length]);
  }
  return out;
}

function defaultNames(n){
  return Array.from({length:n}, (_,i) => `Spiller ${i+1}`);
}

function ensureNameFields(){
  const n = clamp(parseInt(el("playerCount").value || "4", 10), 2, 8);
  el("playerCount").value = n;

  const container = el("nameFields");
  container.innerHTML = "";
  const names = defaultNames(n);

  for(let i=0;i<n;i++){
    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.textContent = `Navn ${i+1}`;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = names[i];
    inp.id = `name_${i}`;
    wrap.appendChild(span);
    wrap.appendChild(inp);
    container.appendChild(wrap);
  }
}

function makeEmptyData(rounds, players){
  return Array.from({length: rounds}, () =>
    Array.from({length: players.length}, () => ({ bid: 0, tricks: 0 }))
  );
}

function save(){
  const payload = {
    players: state.players,
    rounds: state.rounds,
    maxByRound: state.maxByRound,
    data: state.data,
    currentRound: state.currentRound,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return false;
  try{
    const p = JSON.parse(raw);
    if(!p || !Array.isArray(p.players) || !Array.isArray(p.data)) return false;
    state.players = p.players;
    state.rounds = p.rounds;
    state.maxByRound = p.maxByRound;
    state.data = p.data;
    state.currentRound = clamp(p.currentRound ?? 0, 0, (p.rounds ?? 1)-1);
    return true;
  }catch{
    return false;
  }
}

function resetStorage(){
  localStorage.removeItem(STORAGE_KEY);
}

function showSetup(){
  el("setup").classList.remove("hidden");
  el("game").classList.add("hidden");
}

function showGame(){
  el("setup").classList.add("hidden");
  el("game").classList.remove("hidden");
}

function startGameFromSetup(){
  const playerCount = clamp(parseInt(el("playerCount").value || "4", 10), 2, 8);
  const roundCount = clamp(parseInt(el("roundCount").value || "14", 10), 4, 14);

  const players = [];
  for(let i=0;i<playerCount;i++){
    const name = (el(`name_${i}`)?.value || "").trim() || `Spiller ${i+1}`;
    players.push({ name });
  }

  state.players = players;
  state.rounds = roundCount;
  state.maxByRound = buildMaxByRound(roundCount);
  state.data = makeEmptyData(roundCount, players);
  state.currentRound = 0;

  save();
  renderAll();
  showGame();
}

function renderRound(){
  const r = state.currentRound;
  const max = state.maxByRound[r];
  el("roundInfo").textContent = `Runde ${r+1} / ${state.rounds}  ·  Max (1..${max}) + 0 tilladt`;

  const card = el("roundCard");
  card.innerHTML = "";

  const title = document.createElement("div");
  title.className = "sub";
  title.textContent = "Udfyld bud og stik for denne runde:";
  card.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "roundGrid";
  grid.style.marginTop = "10px";

  const h1 = document.createElement("div"); h1.className="head"; h1.textContent="Spiller";
  const h2 = document.createElement("div"); h2.className="head"; h2.textContent="Bud (0..max)";
  const h3 = document.createElement("div"); h3.className="head"; h3.textContent="Stik taget (0..max)";
  grid.appendChild(h1); grid.appendChild(h2); grid.appendChild(h3);

  state.players.forEach((p, i) => {
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;

    const bid = document.createElement("input");
    bid.type = "number";
    bid.min = "0";
    bid.max = String(max);
    bid.value = String(state.data[r][i].bid ?? 0);
    bid.addEventListener("input", () => {
      const v = clamp(parseInt(bid.value || "0", 10), 0, max);
      bid.value = String(v);
      state.data[r][i].bid = v;
      save();
      renderOverview();
      renderRoundTotalsLine();
    });

    const tricks = document.createElement("input");
    tricks.type = "number";
    tricks.min = "0";
    tricks.max = String(max);
    tricks.value = String(state.data[r][i].tricks ?? 0);
    tricks.addEventListener("input", () => {
      const v = clamp(parseInt(tricks.value || "0", 10), 0, max);
      tricks.value = String(v);
      state.data[r][i].tricks = v;
      save();
      renderOverview();
      renderRoundTotalsLine();
    });

    grid.appendChild(name);
    grid.appendChild(bid);
    grid.appendChild(tricks);
  });

  card.appendChild(grid);

  // Totals line (live)
  const totalsLine = document.createElement("div");
  totalsLine.id = "totalsLine";
  totalsLine.className = "sub";
  totalsLine.style.marginTop = "12px";
  card.appendChild(totalsLine);
  renderRoundTotalsLine();

  el("btnPrev").disabled = (state.currentRound === 0);
  el("btnNext").disabled = (state.currentRound === state.rounds - 1);
}

function renderRoundTotalsLine(){
  const totalsLine = document.getElementById("totalsLine");
  if(!totalsLine) return;
  totalsLine.textContent = "Total lige nu: " + state.players
    .map((p,i) => `${p.name}: ${totalForPlayer(i)}`)
    .join(" · ");
}

function renderOverview(){
  const t = el("overview");
  t.innerHTML = "";

  // Header
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
  thMax.textContent = "Max";
  hr.appendChild(thMax);

  thead.appendChild(hr);
  t.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");

  for(let r=0;r<state.rounds;r++){
    const tr = document.createElement("tr");

    const tdR = document.createElement("td");
    tdR.innerHTML = `<strong>${r+1}</strong> <span class="small">${r === state.currentRound ? "(nu)" : ""}</span>`;
    tr.appendChild(tdR);

    // spiller-celler: bud / stik / point
    for(let i=0;i<state.players.length;i++){
      const cell = document.createElement("td");
      const b = state.data[r][i].bid ?? 0;
      const s = state.data[r][i].tricks ?? 0;
      const pts = pointsFor(b, s);
      cell.textContent = `${b} / ${s}  (${pts >= 0 ? "+" : ""}${pts})`;
      tr.appendChild(cell);
    }

    const tdM = document.createElement("td");
    tdM.textContent = String(state.maxByRound[r]);
    tr.appendChild(tdM);

    // klik på række -> gå til runden
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      state.currentRound = r;
      save();
      renderRound();
      renderOverview();
    });

    tbody.appendChild(tr);
  }

  // Totals række nederst
  const trSum = document.createElement("tr");
  const tdLabel = document.createElement("td");
  tdLabel.innerHTML = "<strong>Totals</strong>";
  trSum.appendChild(tdLabel);

  for(let i=0;i<state.players.length;i++){
    const td = document.createElement("td");
    const tot = totalForPlayer(i);
    td.innerHTML = `<strong>${tot}</strong>`;
    trSum.appendChild(td);
  }

  const tdBlank = document.createElement("td");
  tdBlank.textContent = "";
  trSum.appendChild(tdBlank);

  tbody.appendChild(trSum);

  t.appendChild(tbody);
}

function renderAll(){
  renderRound();
  renderOverview();
}

function wireUI(){
  el("playerCount").addEventListener("input", ensureNameFields);

  el("btnStart").addEventListener("click", () => {
    startGameFromSetup();
  });

  el("btnPrev").addEventListener("click", () => {
    state.currentRound = clamp(state.currentRound - 1, 0, state.rounds - 1);
    save();
    renderAll();
  });

  el("btnNext").addEventListener("click", () => {
    state.currentRound = clamp(state.currentRound + 1, 0, state.rounds - 1);
    save();
    renderAll();
  });

  el("btnNew").addEventListener("click", () => {
    showSetup();
  });

  el("btnReset").addEventListener("click", () => {
    resetStorage();
    ensureNameFields();
    showSetup();
  });
}

function init(){
  // show version in UI
  const badge = document.getElementById("appVersion");
  const foot = document.getElementById("footerVersion");
  if (badge) badge.textContent = `v${APP_VERSION}`;
  if (foot) foot.textContent = APP_VERSION;

  wireUI();
  ensureNameFields();

  if(load()){
    renderAll();
    showGame();
  }else{
    showSetup();
  }
}

init();
