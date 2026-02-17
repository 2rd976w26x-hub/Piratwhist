// Piratwhist Onboarding v1.2.7 (audio-sync fix)
// Fix: prevent double speech by pausing previous audio + gating Next while audio plays.
// Uses pre-generated guide audio files when available (solution A).

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

  // --- Styles (always visible highlights + readable dialog) ---
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
      .pw-guide-buttons button:disabled{ opacity: .7; cursor:not-allowed; }
      .pw-guide-hint{ font-size:12px; color:#334155; margin-top:6px; }
    `;
    const style = document.createElement("style");
    style.id = "pwOnboardingStyles";
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // --- One shared audio element (prevents double audio) ---
  const audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";

  function stopAudio(){
    try{
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
    }catch(e){}
  }

  // If file missing, we just don't play (fallback can be added later)
  function playAudioFile(filename){
    if (!filename) return;
    try{
      audio.pause();
      audio.currentTime = 0;
      audio.src = AUDIO_DIR + filename;
      return audio.play().catch(()=>{});
    }catch(e){}
  }

  // Map step -> pre-generated file
  const AUDIO_MAP = {
    start_choose: "step1_choose_game_type.wav",
    physical_info: "step1_choose_game_type.wav",
    online_entry: "step2_online_entry.wav",
    room_code: "step3_room_created.wav",
    room_players: "step4_choose_players.wav",
    room_wait: "step5_waiting.wav",
    room_start: "step6_start_game.wav",
    play_in_game: "step7_in_game.wav"
  };

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
          <button id="pwGuideOff">Slå fra</button>
          <button id="pwGuideNext" class="pw-primary">Næste</button>
        </div>
      </div>
    `;

    const backBtn = document.getElementById("pwGuideBack");
    const offBtn  = document.getElementById("pwGuideOff");
    const nextBtn = document.getElementById("pwGuideNext");

    backBtn.disabled = idx <= 0;

    // IMPORTANT: clicking Next/Back stops audio first (prevents overlap)
    backBtn.onclick = ()=>{ stopAudio(); setIdx(idx-1); run(true); };
    if (offBtn){ offBtn.onclick = ()=>{ stopAudio(); try{ window.PW_OnboardingStop(); }catch(e){}; }; }
    nextBtn.onclick = ()=>{ stopAudio(); setIdx(idx+1); run(true); };

    return { backBtn, nextBtn };
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

  function attachChoiceHandlers(step, idx, nextBtn){
    if (!step.choices || !step.choices.length) return;
    step.choices.forEach(ch=>{
      const el = document.querySelector(ch.selector);
      if (!el) return;
      if (el.__pw_choice_bound) return;
      el.__pw_choice_bound = true;
      el.addEventListener("click", ()=>{
        // Stop any current audio, then play this step audio (user gesture unlocks)
        stopAudio();

        const nextIndex = steps.findIndex(s=>s.id===ch.nextId);
        setIdx(nextIndex >= 0 ? nextIndex : (idx+1));
        setTimeout(()=>run(true), 250);
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

    // ready gate with timeout fallback
    if (typeof step.ready === "function"){
      let ok = false;
      try{ ok = !!step.ready(); }catch(e){ ok = false; }
      if (!ok){
        const safety = step.maxWaitMs || 8000;
        if (!step.__waitStart) step.__waitStart = Date.now();
        if (Date.now() - step.__waitStart > safety){
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
      if (!step.__waitStart) step.__waitStart = Date.now();
      if (Date.now() - step.__waitStart > safety){
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

    const { nextBtn } = showDialog(step, idx);

    // --- AUDIO SYNC: disable Next while audio plays to avoid overlap ---
    stopAudio();
    const file = AUDIO_MAP[step.id];
    if (file){
      nextBtn.disabled = true;
      playAudioFile(file);
      const enableNext = ()=>{ nextBtn.disabled = false; audio.removeEventListener("ended", enableNext); audio.removeEventListener("error", enableNext); };
      audio.addEventListener("ended", enableNext);
      audio.addEventListener("error", enableNext);

      // Safety: never block forever
      setTimeout(()=>{ nextBtn.disabled = false; }, 8000);
    }

    attachChoiceHandlers(step, idx, nextBtn);

    // guest auto-continue when leaving lobby (no auto-advance during audio; we just switch step when phase changes)
    if (step.id === "room_start" && !isHost()){
      const t0 = Date.now();
      const timer = setInterval(()=>{
        if (!stepMatchesPage(step)){ clearInterval(timer); return; }
        if (phase() && phase() !== "lobby"){
          clearInterval(timer);
          stopAudio();
          setIdx(idx+1);
          run(true);
        }
        if (Date.now() - t0 > 30000) clearInterval(timer);
      }, 800);
    }
  }
  // --- Opt-in start/stop (never auto-start) ---
  const ENABLE_KEY = "pw_onboarding_enabled";
  function isEnabled(){ return localStorage.getItem(ENABLE_KEY) === "1"; }
  function setEnabled(v){ localStorage.setItem(ENABLE_KEY, v ? "1" : "0"); }

  // Expose controls for UI buttons
  window.PW_OnboardingStart = function(){ setEnabled(true); setIdx(0); run(true); };
  window.PW_OnboardingStop  = function(){ setEnabled(false); stopAudio(); try{ clearHighlights(); }catch(e){};
    const dlg=document.getElementById("pwGuideDialog"); if(dlg) dlg.remove(); };

  // If user reloads mid-guide and it is enabled, resume; otherwise do nothing
  window.addEventListener("load", ()=>{ if(isEnabled()) setTimeout(()=>run(true), 250); });
  window.addEventListener("pageshow", ()=>{ if(isEnabled()) setTimeout(()=>run(true), 250); });
})();
