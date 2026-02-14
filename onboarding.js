// Piratwhist Onboarding (Mini-video-mode) v1.2.6
(function(){
  const LS_MODE = "pw_onboard_mode";          // "video" | "steps"
  const LS_STEP = "pw_onboard_step";          // integer index
  const LS_ACTIVE = "pw_onboard_active";      // "1"/"0"
  const LS_AI_URL = "pw_ai_url";              // already used for AI
  const DEFAULT_MODE = "video";
  // --- Mobile audio unlock (prevents autoplay blocking) ---
  let __pwAudioUnlocked = false;
  async function unlockAudio(){
    if (__pwAudioUnlocked) return true;
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC){
        const ctx = new AC();
        if (ctx.state === "suspended") { try{ await ctx.resume(); }catch(e){} }
        // Play an inaudible blip to unlock
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.02);
        __pwAudioUnlocked = true;
        return true;
      }
    }catch(e){}
    // Fallback: try to play a muted audio element
    try{
      const a = new Audio();
      a.volume = 0;
      // Use a tiny data-uri wav header (very short). Some mobiles still require a real file; this is best-effort.
      a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
      await a.play();
      a.pause();
      __pwAudioUnlocked = true;
      return true;
    }catch(e){}
    return false;
  }


  function isHost(){
    try{ return (typeof mySeat !== 'undefined') && (mySeat === 0); }catch(e){ return false; }
  }
  function phase(){
    try{ return (typeof state !== 'undefined' && state && state.phase) ? state.phase : null; }catch(e){ return null; }
  }

  // --- Steps across pages ---
  const steps = [
    // Start page
    {
      id:"start_choose",
      pages:["/piratwhist.html","/"],
      selector:"#pwGoOnline",
      title:"Kom i gang · 1/7",
      text:"Vælg spiltype. Fysisk spil eller online spil.",
      wait:"choice",
      choices:[
        { selector:"#pwGoPhysical", next:"physical_info" },
        { selector:"#pwGoOnline", next:"online_create" }
      ],
    },
    // Physical chosen (under development)
    {
      id:"physical_info",
      pages:["/score.html"],
      selector:"body",
      title:"Kom i gang · 2/2",
      text:"Du har valgt fysisk spil. Denne del er under udarbejdelse og kommer senere. Du kan gå tilbage og vælge online spil for at spille nu.",
      wait:"done"
    },
    // Online lobby page (create/join)
    {
      id:"online_create",
      pages:["/online.html"],
      selector:"#olCreateRoom",
      title:"Kom i gang · 2/7",
      text:"Tryk på 'Opret online-rum' for at starte et nyt spil som vært. Du får en rumkode, som du kan dele med andre.",
      wait:"click",
    },
    // Online room page: show room code
    {
      id:"room_code",
      pages:["/online_room.html","/online_lobby.html"],
      selector:"#olRoomLabel",
      title:"Kom i gang · 3/7",
      text:"Her ser du rumkoden. Del rumkoden med de spillere, der skal være med, så de kan joine rummet.",
      wait:"next",
      delayAfterMs:800
    },
    // Choose number of players
    {
      id:"room_players",
      pages:["/online_room.html","/online_lobby.html"],
      selector:"#olPlayerCount",
      title:"Kom i gang · 4/7",
      textFn:()=>{
        if (!isHost()){
          return "Kun værten kan ændre antal spillere. Hvis du ikke er vært, skal du bare vente her.";
        }
        return "Vælg antal spillere her. Tryk på feltet og vælg antal spillere.";
      },
      ready:()=> (phase()==="lobby") && (typeof mySeat !== 'undefined'),
      wait:"change",
      maxWaitMs: 8000,
      delayAfterMs:800
    },
    // Choose cards per player = tricks to bid
    {
      id:"room_cardsper",
      pages:["/online_room.html","/online_lobby.html"],
      selector:"#olStartOnline",
      title:"Kom i gang · 5/7",
      text:"Antal stik der bydes på følger antal kort der deles ud i runden. Når spillet starter, kan du se hvor mange kort pr. spiller der deles, og det er også antal stik til bud.",
      wait:"next",
      delayAfterMs:900
    },
    // Wait in room (guide resumes automatically when game starts)
    {
      id:"room_wait",
      pages:["/online_room.html","/online_lobby.html"],
      selectorFn:()=> isHost() ? "#olStartOnline" : "#olRoomStatus",
      title:"Kom i gang · 6/7",
      textFn:()=>{
        if (isHost()){
          return "Nu er rummet klar. Vent til alle spillere er med. Som vært starter du spillet ved at trykke på 'Start spil'.";
        }
        return "Nu er rummet klar. Vent til alle spillere er med. Når værten starter spillet, fortsætter guiden automatisk inde i spillet.";
      },
      ready:()=> (typeof state !== 'undefined') && !!state,
      waitFn:()=> isHost() ? "click" : "next",
      maxWaitMs: 6000,
      delayAfterMs:2300,
      autoClick:false
    },
    // In game page: your hand and help
    {
      id:"play_hand",
      pages:["/online_play.html","/online_game.html"],
      selector:"#olHands",
      title:"Kom i gang · 7/7",
      text:"I spillet ligger dine kort nederst. Når det er din tur, trykker du på et kort for at spille. Hvis du er i tvivl, kan du trykke på 'Spørg AI'.",
      wait:"done",
    },
  ];


  function normPath(){
    const p = location.pathname || "/";
    return p === "/" ? "/piratwhist.html" : p;
  }
  function getStepIdx(){
    return parseInt(localStorage.getItem(LS_STEP) || "0", 10) || 0;
  }
  function setStepIdx(i){
    localStorage.setItem(LS_STEP, String(i));
  }
  function isActive(){
    return localStorage.getItem(LS_ACTIVE) === "1";
  }
  function setActive(v){
    localStorage.setItem(LS_ACTIVE, v ? "1" : "0");
  }
  function mode(){
    return (localStorage.getItem(LS_MODE) || DEFAULT_MODE);
  }
  function setMode(m){
    localStorage.setItem(LS_MODE, m);
  }

  function baseAiUrl(){
    const u = (localStorage.getItem(LS_AI_URL) || "").trim().replace(/\/+$/,"");
    if (!u) return "";
    return u.replace(/\/(health|ask|speak)$/i,"");
  }

  async function speak(text){
    const url = baseAiUrl();
    if (!url) return; // silently skip if not set
    try{
      const res = await fetch(url + "/speak", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ text })
      });
      if (!res.ok) return;
      const blob = await res.blob(); // audio/wav
      const objUrl = URL.createObjectURL(blob);

      // Stop previous onboarding audio to avoid overlap
      try{
        if (window.__pwOnboardAudio) {
          window.__pwOnboardAudio.pause();
          window.__pwOnboardAudio.currentTime = 0;
        }
      }catch(e){}

      const a = new Audio(objUrl);
      window.__pwOnboardAudio = a;

      // Soft start (prevents click at beginning)
      try{ a.volume = 0; }catch(e){}
      const __fadeSteps = 6;
      let __fadeI = 0;
      const __fadeT = setInterval(() => {
        __fadeI++;
        try{ a.volume = Math.min(1, __fadeI/__fadeSteps); }catch(e){}
        if (__fadeI >= __fadeSteps) clearInterval(__fadeT);
      }, 10);
      a.play().catch(()=>{});

      // Wait for audio end (with fallback)
      await new Promise(resolve=>{
        a.onended = resolve;
        setTimeout(resolve, 8000);
      });

      try{ URL.revokeObjectURL(objUrl); }catch(e){}
    }catch(e){}
  }

  // --- UI overlay ---
  let overlayEl, boxEl, hiEl;
  function ensureUI(){
    if (overlayEl) return;
    overlayEl = document.createElement("div");
    overlayEl.id = "pwOnboardOverlay";
    document.body.appendChild(overlayEl);

    hiEl = document.createElement("div");
    hiEl.id = "pwOnboardHighlight";
    document.body.appendChild(hiEl);

    boxEl = document.createElement("div");
    boxEl.id = "pwOnboardBox";
    boxEl.innerHTML = `
      <div id="pwOnboardTitle"></div>
      <p id="pwOnboardText"></p>
      <div id="pwOnboardControls">
        
        <button class="pwOnBtn secondary" id="pwOnBack">⏮ Tilbage</button>
<button class="pwOnBtn secondary" id="pwOnPause">⏸ Pause</button>
        <button class="pwOnBtn secondary" id="pwOnResume" style="display:none;">▶️ Fortsæt</button>
        <button class="pwOnBtn secondary" id="pwOnRestart">🔁 Start forfra</button>
        <button class="pwOnBtn" id="pwOnSkip">⏭ Spring over</button>
      </div>
    `;
    document.body.appendChild(boxEl);

    document.getElementById("pwOnSkip").addEventListener("click", stop);
    document.getElementById("pwOnBack").addEventListener("click", back);
    document.getElementById("pwOnRestart").addEventListener("click", restart);
    document.getElementById("pwOnPause").addEventListener("click", pause);
    document.getElementById("pwOnResume").addEventListener("click", resume);

    window.addEventListener("resize", () => positionCurrent(), {passive:true});
    window.addEventListener("scroll", () => positionCurrent(), {passive:true});
  }

  let paused = false;
  function pause(){
    paused = true;
    document.getElementById("pwOnPause").style.display = "none";
    document.getElementById("pwOnResume").style.display = "";
  }
  function resume(){
    paused = false;
    document.getElementById("pwOnPause").style.display = "";
    document.getElementById("pwOnResume").style.display = "none";
    run();
  }

  function stop(){
    setActive(false);
    setStepIdx(0);
    cleanup();
  }
  function restart(){
    setActive(true);
    setStepIdx(0);
    paused = false;
    run(true);
  }

  function back(){
    // Go to previous step and re-render; if previous step lives on another page, navigate there.
    let idx = getStepIdx();
    if (idx <= 0) idx = 0;
    else idx = idx - 1;

    setStepIdx(idx);
    paused = false;
    try{
      // Stop any ongoing onboarding audio
      if (window.__pwOnboardAudio){
        window.__pwOnboardAudio.pause();
        window.__pwOnboardAudio.currentTime = 0;
      }
    }catch(e){}

    const step = steps[idx];
    const p = normPath();
    if (step && step.pages && !step.pages.includes(p)){
      // Navigate to the first declared page for that step
      let target = step.pages[0] || "/piratwhist.html";
      if (target === "/") target = "/piratwhist.html";
      // Keep query clean; onboarding will auto-resume on DOMContentLoaded
      location.href = target;
      return;
    }
    run(true);
  }
  function cleanup(){
    [overlayEl, boxEl, hiEl].forEach(el=>{ try{ el && el.remove(); }catch(e){} });
    overlayEl = boxEl = hiEl = null;
  }

  function positionBoxNear(rect){
    const margin = 12;
    const w = boxEl.offsetWidth;
    const h = boxEl.offsetHeight;

    // Prefer above, else below
    let top = rect.top - h - 10;
    if (top < margin) top = rect.bottom + 10;
    if (top + h > window.innerHeight - margin) top = window.innerHeight - margin - h;

    let left = rect.left;
    if (left + w > window.innerWidth - margin) left = window.innerWidth - margin - w;
    if (left < margin) left = margin;

    boxEl.style.top = `${Math.max(margin, top)}px`;
    boxEl.style.left = `${Math.max(margin, left)}px`;
  }

  let currentStep = null;
  function positionCurrent(){
    if (!currentStep) return;
    const el = document.querySelector(currentStep.selector);
    if (!el) return;
    const r = el.getBoundingClientRect();

    hiEl.style.left = (r.left - 6) + "px";
    hiEl.style.top = (r.top - 6) + "px";
    hiEl.style.width = (r.width + 12) + "px";
    hiEl.style.height = (r.height + 12) + "px";

    positionBoxNear(r);
  }

  async function run(force=false){
    if (!isActive()) return;
    if (paused) return;

    const p = normPath();
    let idx = getStepIdx();
    if (idx >= steps.length) { stop(); return; }
    const baseStep = steps[idx];

    // Allow dynamic selector/text/wait based on current context
    let step = baseStep;
    try{
      const eff = Object.assign({}, baseStep);
      if (typeof baseStep.selectorFn === "function") eff.selector = baseStep.selectorFn();
      if (typeof baseStep.textFn === "function") eff.text = baseStep.textFn();
      if (typeof baseStep.waitFn === "function") eff.wait = baseStep.waitFn();
      step = eff;
    }catch(_){ step = baseStep; }

    // Optional: wait for app state / permissions (e.g., only host can change lobby settings)
    if (typeof step.ready === "function"){
      let ok = false;
      try{ ok = !!step.ready(); }catch(e){ ok = false; }
      if (!ok){
        setTimeout(()=>run(), 400);
        return;
      }
    }

    // If on wrong page, keep polling until navigation happens (create/join can take time)
    if (!step.pages.includes(p)){
      setTimeout(()=>run(), 400);
      return;
    }

    const el = document.querySelector(step.selector);
    if (!el){
      // element not ready yet, retry
      setTimeout(()=>run(), 400);
      return;
    }

    ensureUI();
    currentStep = step;

    // Scroll into view
    try{ el.scrollIntoView({behavior:"smooth", block:"center"}); }catch(e){}

    // Render text
    document.getElementById("pwOnboardTitle").textContent = step.title || "Kom i gang";
    document.getElementById("pwOnboardText").textContent = step.text || "";
    positionCurrent();

    // Speak in video mode
    if (mode()==="video"){
      await speak(step.text || "");
    }

    // Determine progression
    if (step.wait === "click"){
      // Video mode: allow user to click, but also auto-advance after a short delay (so it never locks)
      if (mode()==="video"){
        let done = false;
        const handler = ()=>{
          if (done) return;
          done = true;
          try{ el.removeEventListener("click", handler, true); }catch(e){}
          setStepIdx(idx + 1);
          setTimeout(()=>run(true), 250);
        };
        try{ el.addEventListener("click", handler, true); }catch(e){}
        const d = step.maxWaitMs || step.delayAfterMs || 1800;
        setTimeout(()=>{
          if (done || !isActive() || paused) return;
          done = true;
          try{ el.removeEventListener("click", handler, true); }catch(e){}
          setStepIdx(idx + 1);
          // optional auto-click for navigation/demo
          if (step.autoClick !== false){
            try{ el.click(); }catch(e){}
          }
          setTimeout(()=>run(true), 250);
        }, d);
        return;
      }

      // Step-by-step mode: wait for user click on the highlighted element
      const handler = ()=>{
        el.removeEventListener("click", handler, true);
        setStepIdx(idx + 1);
        setTimeout(()=>run(true), 250);
      };
      el.addEventListener("click", handler, true);
      return;
    }

    
    if (step.wait === "choice"){
      // Choice-based progression (e.g., Physical vs Online). Never auto-picks.
      const choices = Array.isArray(step.choices) ? step.choices : [];
      let finished = false;

      const cleanup = ()=>{
        choices.forEach(ch=>{
          try{
            const e = document.querySelector(ch.selector);
            if (e && ch._handler) e.removeEventListener("click", ch._handler, true);
          }catch(_){}
        });
      };

      choices.forEach(ch=>{
        try{
          const e = document.querySelector(ch.selector);
          if (!e) return;
          ch._handler = ()=>{
            if (finished) return;
            finished = true;
            cleanup();
            // jump to step by id
            const targetId = ch.next;
            const targetIdx = steps.findIndex(s=>s.id===targetId);
            if (targetIdx >= 0){
              setStepIdx(targetIdx);
            }else{
              setStepIdx(idx + 1);
            }
            setTimeout(()=>run(true), 250);
          };
          e.addEventListener("click", ch._handler, true);
        }catch(_){}
      });

      return;
    }

    if (step.wait === "change"){
      // Wait for user to change a select/input. In video mode, auto-advance after maxWaitMs.
      let done = false;
      const handler = ()=>{
        if (done) return;
        done = true;
        try{ el.removeEventListener("change", handler, true); }catch(e){}
        setStepIdx(idx + 1);
        setTimeout(()=>run(true), 250);
      };
      try{ el.addEventListener("change", handler, true); }catch(e){}

      if (mode()==="video"){
        const d = step.maxWaitMs || 8000;
        setTimeout(()=>{
          if (done || !isActive() || paused) return;
          done = true;
          try{ el.removeEventListener("change", handler, true); }catch(e){}
          setStepIdx(idx + 1);
          run(true);
        }, d);
      }
      return;
    }
if (step.wait === "next"){
      const d = step.delayAfterMs || 800;
      setTimeout(()=>{
        if (!isActive() || paused) return;
        setStepIdx(idx + 1);
        run(true);
      }, d);
      return;
    }

    if (step.wait === "done"){
      // Show final message until user skips/restarts
      // Auto stop after a short delay in video mode
      if (mode()==="video"){
        setTimeout(()=>stop(), 2500);
      }
      return;
    }
  }

  // Public start function
  window.PW_OnboardStart = function(m){
    setMode(m || DEFAULT_MODE);
    setActive(true);
    setStepIdx(0);
    paused = false;
    run(true);
  };

  
  // Wire start buttons (supports multiple ids across versions)
    function wireStartButtons(){
    const ids = ["pwStartOnboardVideo","pwStartOnboard","pwStartGuideVideo","pwStartGuide"];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if (el && !el.__pwOnWired){
        el.__pwOnWired = true;
        el.addEventListener("click", async ()=>{ try{ await unlockAudio(); }catch(e){} window.PW_OnboardStart && window.PW_OnboardStart("video"); });
      }
    });
  }

  // Boot on each page: wire start buttons, and resume if active
  document.addEventListener("DOMContentLoaded", ()=>{
    try{ wireStartButtons(); }catch(e){}
    try{ if (isActive()) run(true); }catch(e){}
  });
})();