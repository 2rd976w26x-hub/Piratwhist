// Piratwhist Onboarding (Mini-video-mode) v1.3.0
// Fix: choice-steps work, highlights + voice work, never locks

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

  // Inject minimal styles for highlight + dialog (so it always works)
  (function injectStyles(){
    if (document.getElementById("pwOnboardingStyles")) return;
    const css = `
      .pw-guide-highlight{ outline: 3px solid #2563eb !important; outline-offset: 4px !important; box-shadow: 0 0 0 6px rgba(37,99,235,.15) !important; border-radius: 10px; }
      .pw-guide-dialog{ position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 99999; }
      .pw-guide-card{ background: #ffffff; color:#111827; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px 12px 10px; box-shadow: 0 10px 30px rgba(0,0,0,.18); max-width: 720px; margin: 0 auto; }
      .pw-guide-card h3{ margin: 0 0 6px; font-size: 16px; }
      .pw-guide-card p{ margin: 0 0 10px; font-size: 14px; line-height: 1.35; }
      .pw-guide-buttons{ display:flex; gap:10px; justify-content:flex-end; align-items:center; flex-wrap: wrap; }
      .pw-guide-buttons button{ appearance:none; border:1px solid #cbd5e1; background:#f8fafc; color:#0f172a; padding:8px 12px; border-radius: 10px; font-weight:600; cursor:pointer; }
      .pw-guide-buttons button.pw-primary{ border:none; background: linear-gradient(135deg, #2563eb, #1d4ed8); color:#fff; }
      .pw-guide-buttons button:disabled{ opacity: 1; background:#e2e8f0; color:#64748b; border:1px solid #cbd5e1; cursor:not-allowed; }
      .pw-guide-hint{ font-size:12px; color:#334155; margin-top:6px; }
    `;
    const style = document.createElement("style");
    style.id = "pwOnboardingStyles";
    style.textContent = css;
    document.head.appendChild(style);
  })();

  const audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";

  function tryPlay(src){
    try{
      audio.pause();
      audio.src = src;
      audio.play().catch(()=>{});
    }catch(e){}
  }

  function clearHighlights(){
    document.querySelectorAll(".pw-guide-highlight").forEach(el=>el.classList.remove("pw-guide-highlight"));
  }

  function resolveTarget(step){
    if (typeof step.selectorFn === "function"){
      try{ return document.querySelector(step.selectorFn()); }catch(e){ return null; }
    }
    if (!step.selector) return null;
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

    const title = step.title || `Kom i gang · ${idx+1}/${steps.length}`;
    const text = typeof step.textFn === "function" ? step.textFn() : (step.text || "");
    const hint = step.hint || "";

    dlg.innerHTML = `
      <div class="pw-guide-card">
        <h3>${title}</h3>
        <p>${text}</p>
        ${hint ? `<div class="pw-guide-hint">${hint}</div>` : ``}
        <div class="pw-guide-buttons">
          <button id="pwGuideBack">Tilbage</button>
          <button id="pwGuideNext" class="pw-primary">Næste</button>
        </div>
      </div>
    `;

    const backBtn = document.getElementById("pwGuideBack");
    const nextBtn = document.getElementById("pwGuideNext");

    backBtn.disabled = idx <= 0;

    backBtn.onclick = ()=>{ setIdx(idx-1); run(true); };
    nextBtn.onclick = ()=>{ setIdx(idx+1); run(true); };
  }

  function stepAudio(stepId){
    const map = {
      start_choose: "step1_choose_game_type.wav",
      online_entry: "step2_online_entry.wav",
      room_code: "step3_room_created.wav",
      room_players: "step4_choose_players.wav",
      room_wait: "step5_waiting.wav",
      room_start: "step6_start_game.wav",
      play_in_game: "step7_in_game.wav"
    };
    const f = map[stepId];
    return f ? (AUDIO_DIR + f) : "";
  }

  const steps = [
    {
      id:"start_choose",
      pages:["piratwhist.html",""],
      selector:"#pwGoOnline",
      title:"Kom i gang · 1/7",
      text:"Vælg spiltype. Fysisk spil eller online spil.",
      wait:"choice",
      choices:[
        { selector:"#pwGoPhysical", nextId:"physical_info" },
        { selector:"#pwGoOnline", nextId:"online_entry" }
      ]
    },
    {
      id:"physical_info",
      pages:["piratwhist.html",""],
      selector:"#pwGoPhysical",
      title:"Kom i gang · 2/2",
      text:"Fysisk spil er under udarbejdelse. Vælg online spil for at spille nu.",
      wait:"done"
    },
    {
      id:"online_entry",
      pages:["online.html"],
      selector:"#olCreateRoom",
      title:"Kom i gang · 2/7",
      text:"Her kan du oprette et online rum eller deltage med en rumkode. Som vært trykker du på 'Opret online-rum'.",
      wait:"choice",
      choices:[
        { selector:"#olCreateRoom", nextId:"room_code" },
        { selector:"#olJoinRoom", nextId:"room_code" }
      ]
    },
    {
      id:"room_code",
      pages:["online_lobby.html","online_room.html","online-room.html"],
      selector:"#olRoomLabel",
      title:"Kom i gang · 3/7",
      text:"Her ser du rumkoden. Del rumkoden med de andre spillere, så de kan joine rummet.",
      wait:"next"
    },
    {
      id:"room_players",
      pages:["online_lobby.html","online_room.html","online-room.html"],
      selector:"#olPlayerCount",
      title:"Kom i gang · 4/7",
      textFn:()=> isHost()
        ? "Som vært kan du vælge antal spillere her."
        : "Kun værten kan ændre antal spillere. Som deltager skal du bare vente her.",
      ready:()=> phase()==="lobby" || !phase(),
      wait:"next"
    },
    {
      id:"room_wait",
      pages:["online_lobby.html","online_room.html","online-room.html"],
      selector:"#olNames",
      title:"Kom i gang · 5/7",
      textFn:()=> isHost()
        ? "Vent på at andre spillere joiner. Du kan se spillerlisten her."
        : "Du er i lobbyen. Vent på at værten starter spillet.",
      ready:()=> phase()==="lobby" || !phase(),
      wait:"next"
    },
    {
      id:"room_start",
      pages:["online_lobby.html","online_room.html","online-room.html"],
      selectorFn:()=> isHost() ? "#olStartOnline" : "#olRoomStatus",
      title:"Kom i gang · 6/7",
      textFn:()=> isHost()
        ? "Når alle er klar, tryk på 'Start spil'."
        : "Når værten starter spillet, fortsætter guiden automatisk.",
      ready:()=> phase()==="lobby" || !phase(),
      wait:"next"
    },
    {
      id:"play_in_game",
      pages:["online_bidding.html","online_play.html","online_game.html","online_result.html"],
      selector:"#olHands",
      title:"Kom i gang · 7/7",
      text:"Nu er I i spillet. Dine kort ligger nederst. Når det er din tur, trykker du på et kort. Du kan altid trykke 'Spørg AI' hvis du er i tvivl.",
      wait:"done"
    }
  ];

  function stepMatchesPage(step){
    const p = page();
    return step.pages.includes(p) || (p==="" && step.pages.includes(""));
  }

  function attachChoiceHandlers(step, idx){
    if (!step.choices || !step.choices.length) return;
    step.choices.forEach(ch=>{
      const el = document.querySelector(ch.selector);
      if (!el) return;
      if (el.__pw_choice_bound) return;
      el.__pw_choice_bound = true;
      el.addEventListener("click", ()=>{
        // user gesture: unlock audio
        const sid = stepAudio(step.id);
        if (sid) tryPlay(sid);

        const nextIndex = steps.findIndex(s=>s.id===ch.nextId);
        setIdx(nextIndex >= 0 ? nextIndex : (idx+1));
        setTimeout(()=>run(true), 300);
      }, { passive:true });
    });
  }

  function run(force=false){
    const idx = getIdx();
    const step = steps[idx];
    if (!step) return;

    if (!stepMatchesPage(step)){
      setTimeout(()=>run(), 500);
      return;
    }

    if (typeof step.ready === "function"){
      let ok = false;
      try{ ok = !!step.ready(); }catch(e){ ok = false; }
      if (!ok){
        const safety = step.maxWaitMs || 8000;
        if (!step.__waitStart) step.__waitStart = now();
        if (now() - step.__waitStart > safety){
          step.__waitStart = null;
          setIdx(idx+1);
          setTimeout(()=>run(true), 250);
          return;
        }
        setTimeout(()=>run(), 400);
        return;
      }
      step.__waitStart = null;
    }

    const target = resolveTarget(step);
    if (!target){
      const safety = step.maxWaitMs || 8000;
      if (!step.__waitStart) step.__waitStart = now();
      if (now() - step.__waitStart > safety){
        step.__waitStart = null;
        setIdx(idx+1);
        setTimeout(()=>run(true), 250);
        return;
      }
      setTimeout(()=>run(), 400);
      return;
    }
    step.__waitStart = null;

    clearHighlights();
    target.classList.add("pw-guide-highlight");
    try{ target.scrollIntoView({ behavior:"smooth", block:"center" }); }catch(e){}

    showDialog(step, idx);

    const audioSrc = stepAudio(step.id);
    if (audioSrc) tryPlay(audioSrc);

    attachChoiceHandlers(step, idx);

    // guest auto-continue when leaving lobby
    if (step.id === "room_start" && !isHost()){
      const t0 = now();
      const timer = setInterval(()=>{
        if (!stepMatchesPage(step)){ clearInterval(timer); return; }
        if (phase() && phase() !== "lobby"){
          clearInterval(timer);
          setIdx(idx+1);
          run(true);
        }
        if (now() - t0 > 30000) clearInterval(timer);
      }, 800);
    }
  }

  window.addEventListener("load", ()=> setTimeout(()=>run(true), 400));
  window.addEventListener("pageshow", ()=> setTimeout(()=>run(true), 400));
})();