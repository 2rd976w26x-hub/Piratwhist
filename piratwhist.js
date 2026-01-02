const APP_VERSION = "0.0.7";
const STORAGE_KEY = "piratwhist_v3";

const el = (id) => document.getElementById(id);

const state = {
  players: [],
  rounds: 14,
  maxByRound: [7,6,5,4,3,2,1,1,2,3,4,5,6,7],
  data: [],
  currentRound: 0,
};

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

function defaultNames(n){return Array.from({length:n},(_,i)=>`Spiller ${i+1}`);}

function ensureNameFields(){
  const n = clamp(parseInt(el("playerCount").value||"4",10),2,8);
  el("playerCount").value=n;
  const c=el("nameFields"); c.innerHTML="";
  defaultNames(n).forEach((name,i)=>{
    const l=document.createElement("label");
    l.className="field";
    l.innerHTML=`<span>Navn ${i+1}</span><input id="name_${i}" type="text" value="${name}">`;
    c.appendChild(l);
  });
}

function makeEmptyData(){return Array.from({length:14},()=>Array.from({length:state.players.length},()=>({bid:null,tricks:null})));}

function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}

function load(){
  const r=localStorage.getItem(STORAGE_KEY);
  if(!r) return false;
  Object.assign(state,JSON.parse(r));
  return true;
}

function startGame(){
  const n=parseInt(el("playerCount").value,10);
  state.players=Array.from({length:n},(_,i)=>({name:el(`name_${i}`).value}));
  state.data=makeEmptyData();
  state.currentRound=0;
  save();
  location.reload();
}

document.getElementById("btnStart").onclick=startGame;
ensureNameFields();

const b=document.getElementById("appVersion");
const f=document.getElementById("footerVersion");
if(b) b.textContent="v"+APP_VERSION;
if(f) f.textContent=APP_VERSION;
