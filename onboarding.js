// Piratwhist Onboarding (Mini-video-mode) v1.1.4
(function(){
  const LS_MODE = "pw_onboard_mode";          // "video" | "steps"
  const LS_STEP = "pw_onboard_step";          // integer index
  const LS_ACTIVE = "pw_onboard_active";      // "1"/"0"
  const LS_AI_URL = "pw_ai_url";              // already used for AI
  const DEFAULT_MODE = "video";

  // --- Steps across pages ---
  const steps = [
    // Start page
    {
      id:"start_choose",
      pages:["/piratwhist.html","/"],
      selector:"#pwGoOnline",
      title:"Kom i gang · 1/7",
      text:"Vælg spiltype. Fysisk spil er under udarbejdelse. For at spille online, tryk på 'Online spil'.",
      wait:"click",
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
      text:"Vælg antal spillere her. Det bestemmer hvor mange der skal være med i spillet.",
      wait:"next",
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
      selector:"#olRoomStatus",
      title:"Kom i gang · 6/7",
      text:"Nu er rummet klar. Vent til alle spillere er med. Når værten starter spillet, fortsætter guiden automatisk inde i spillet.",
      wait:"next",
      delayAfterMs:2300
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
      const blob = await res.blob();
      const a = new Audio(URL.createObjectURL(blob));
      a.play().catch(()=>{});
      // wait roughly for audio to finish if possible
      await new Promise(resolve=>{
        a.onended = resolve;
        setTimeout(resolve, 7000); // fallback
      });
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
        <button class="pwOnBtn secondary" id="pwOnPause">⏸ Pause</button>
        <button class="pwOnBtn secondary" id="pwOnResume" style="display:none;">▶️ Fortsæt</button>
        <button class="pwOnBtn secondary" id="pwOnRestart">🔁 Start forfra</button>
        <button class="pwOnBtn" id="pwOnSkip">⏭ Spring over</button>
      </div>
    `;
    document.body.appendChild(boxEl);

    document.getElementById("pwOnSkip").addEventListener("click", stop);
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
    const step = steps[idx];

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
      // In mini-video-mode we must NOT block on user interaction (mobile friendly).
      // Instead we auto-advance, and optionally auto-click the highlighted element to demonstrate navigation.
      if (mode()==="video"){
        const d = step.delayAfterMs || 900;
        setTimeout(()=>{
          if (!isActive() || paused) return;
          // advance first (so navigation lands on next step)
          setStepIdx(idx + 1);
          // auto-click unless explicitly disabled
          if (step.autoClick !== false){
            try{ el.click(); }catch(e){}
          }
          // continue; if navigation happens, next page will resume on DOMContentLoaded
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

  // Auto-continue if active
  document.addEventListener("DOMContentLoaded", ()=>{
    if (isActive()) run(true);
  });
})();
