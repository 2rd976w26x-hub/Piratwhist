// Piratwhist Onboarding (Mini-video-mode) v1.3.0
// Stable guide: highlights + choice steps + audio + no lockups

(function(){
  if (window.__PW_ONBOARDING__) return;
  window.__PW_ONBOARDING__ = true;

  const KEY = "pw_onboarding_step";
  const AUDIO_DIR = "/assets/audio/guide/";
  const getIdx = () => parseInt(sessionStorage.getItem(KEY) || "0", 10);
  const setIdx = (i) => sessionStorage.setItem(KEY, String(Math.max(0, i)));

  const page = () => (location.pathname || "").split("/").pop() || "";
  const phase = () => (window.state && window.state.phase) || "";
  const isHost = () => !!(window.state && window.state.isHost);
  const now = () => Date.now();

  (function injectStyles(){
    if (document.getElementById("pwOnboardingStyles")) return;
    const style = document.createElement("style");
    style.id = "pwOnboardingStyles";
    style.textContent = `
      .pw-guide-highlight{ outline:3px solid #2563eb !important; outline-offset:4px !important;
        box-shadow:0 0 0 6px rgba(37,99,235,.15) !important; border-radius:10px; }
      .pw-guide-dialog{ position:fixed; left:12px; right:12px; bottom:12px; z-index:99999; }
      .pw-guide-card{ background:#fff; color:#111827; border:1px solid #e5e7eb; border-radius:14px;
        padding:12px; box-shadow:0 10px 30px rgba(0,0,0,.18); max-width:720px; margin:0 auto; }
      .pw-guide-buttons{ display:flex; gap:10px; justify-content:flex-end; margin-top:8px; }
      .pw-guide-buttons button{ border:1px solid #cbd5e1; background:#f8fafc; padding:8px 12px;
        border-radius:10px; font-weight:600; cursor:pointer; }
      .pw-guide-buttons .pw-primary{ background:#2563eb; color:#fff; border:none; }
    `;
    document.head.appendChild(style);
  })();

  const audio = new Audio();
  audio.preload = "auto";

  function tryPlay(src){
    try{
      audio.pause();
      audio.src = src;
      audio.play().catch(()=>{});
    }catch(e){}
  }

  function clearHighlights(){
    document.querySelectorAll(".pw-guide-highlight")
      .forEach(el=>el.classList.remove("pw-guide-highlight"));
  }

  function resolveTarget(step){
    if (typeof step.selectorFn === "function"){
      try{ return document.querySelector(step.selectorFn()); }catch(e){ return null; }
    }
    try{ return document.querySelector(step.selector); }catch(e){ return null; }
  }

  function showDialog(step, idx){
    let dlg = document.getElementById("pwGuideDialog");
    if (!dlg){
      dlg = document.createElement("div");
      dlg.id = "pwGuideDialog";
      dlg.className = "pw-guide-dialog";
      document.body.appendChild(dlg);
    }

    const text = typeof step.textFn === "function" ? step.textFn() : step.text;

    dlg.innerHTML = `
      <div class="pw-guide-card">
        <h3>${step.title}</h3>
        <p>${text}</p>
        <div class="pw-guide-buttons">
          <button id="pwGuideBack">Tilbage</button>
          <button id="pwGuideNext" class="pw-primary">Næste</button>
        </div>
      </div>
    `;

    document.getElementById("pwGuideBack").onclick = ()=>{ setIdx(idx-1); run(true); };
    document.getElementById("pwGuideNext").onclick = ()=>{ setIdx(idx+1); run(true); };
  }

  const steps = [
    { id:"start_choose", pages:["piratwhist.html",""], selector:"#pwGoOnline",
      title:"Kom i gang · 1/4",
      text:"Vælg spiltype. Fysisk spil eller online spil." },

    { id:"online_entry", pages:["online.html"], selector:"#olCreateRoom",
      title:"Kom i gang · 2/4",
      text:"Opret et online rum eller deltag med en rumkode." },

    { id:"room_code", pages:["online_lobby.html","online_room.html","online-room.html"],
      selector:"#olRoomLabel",
      title:"Kom i gang · 3/4",
      text:"Del rumkoden med de andre spillere." },

    { id:"play_in_game",
      pages:["online_bidding.html","online_play.html","online_game.html","online_result.html"],
      selector:"#olHands",
      title:"Kom i gang · 4/4",
      text:"Nu er I i spillet. Dine kort ligger nederst." }
  ];

  function run(force=false){
    const idx = getIdx();
    const step = steps[idx];
    if (!step) return;

    if (!step.pages.includes(page())){
      setTimeout(()=>run(), 400);
      return;
    }

    const target = resolveTarget(step);
    if (!target){
      setTimeout(()=>run(), 400);
      return;
    }

    clearHighlights();
    target.classList.add("pw-guide-highlight");
    target.scrollIntoView({ behavior:"smooth", block:"center" });

    showDialog(step, idx);
  }

  window.addEventListener("load", ()=> setTimeout(()=>run(true), 400));
})();