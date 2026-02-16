
// Piratwhist Onboarding (Mini-video-mode) v1.3.0
// Robust, role-aware, never-lock guide engine

(function(){
  if (window.__PW_ONBOARDING__) return;
  window.__PW_ONBOARDING__ = true;

  const KEY = "pw_onboarding_step";
  const getStepIdx = () => parseInt(sessionStorage.getItem(KEY) || "0", 10);
  const setStepIdx = (i) => sessionStorage.setItem(KEY, String(i));

  const pageName = () => (location.pathname || "").split("/").pop() || "";
  const phase = () => (window.state && window.state.phase) || "";
  const isHost = () => !!(window.state && window.state.isHost);

  function highlight(el){
    el.classList.add("pw-guide-highlight");
    el.scrollIntoView({ behavior:"smooth", block:"center" });
  }

  function clearHighlights(){
    document.querySelectorAll(".pw-guide-highlight")
      .forEach(el => el.classList.remove("pw-guide-highlight"));
  }

  function showDialog(step, onNext, onBack){
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
        <h3>${step.title || ""}</h3>
        <p>${text || ""}</p>
        <div class="pw-guide-buttons">
          <button id="pwGuideBack">Tilbage</button>
          <button id="pwGuideNext">Næste</button>
        </div>
      </div>
    `;

    document.getElementById("pwGuideNext").onclick = onNext;
    document.getElementById("pwGuideBack").onclick = onBack;
  }

  const steps = [
    {
      id:"start_choose",
      pages:["piratwhist.html",""],
      selector:"#pwGoOnline",
      title:"Kom i gang · 1/11",
      text:"Vælg spiltype. Fysisk spil eller online spil.",
      wait:"choice",
      choices:[
        { selector:"#pwGoPhysical", next:"physical_info" },
        { selector:"#pwGoOnline", next:"online_entry" }
      ]
    },

    {
      id:"physical_info",
      pages:["score.html"],
      selector:"body",
      title:"Kom i gang · 2/2",
      text:"Du har valgt fysisk spil. Denne del er under udarbejdelse.",
      wait:"done"
    },

    {
      id:"online_entry",
      pages:["online.html"],
      selector:"#olCreateRoom",
      title:"Kom i gang · 2/11",
      text:"Her kan du oprette eller deltage i et rum.",
      wait:"choice",
      choices:[
        { selector:"#olCreateRoom", next:"room_code" },
        { selector:"#olJoinRoom", next:"room_code" }
      ]
    },

    {
      id:"room_code",
      pages:["online_lobby.html","online_room.html","online-room.html"],
      selector:"#olRoomLabel",
      title:"Kom i gang · 3/11",
      text:"Her ser du rumkoden. Del den med andre spillere.",
      wait:"next"
    },

    {
      id:"room_players",
      pages:["online_lobby.html","online_room.html","online-room.html"],
      selector:"#olPlayerCount",
      title:"Kom i gang · 4/11",
      textFn:()=> isHost() ?
        "Vælg antal spillere her." :
        "Kun værten kan ændre antal spillere.",
      ready:()=> phase()==="lobby",
      wait:"next",
      maxWaitMs:10000
    },

    {
      id:"room_start",
      pages:["online_lobby.html","online_room.html","online-room.html"],
      selector:"#olStartOnline",
      title:"Kom i gang · 5/11",
      textFn:()=> isHost() ?
        "Tryk på 'Start spil' når I er klar." :
        "Vent til værten starter spillet.",
      ready:()=> phase()==="lobby",
      wait:"next",
      maxWaitMs:15000
    },

    {
      id:"bid_intro",
      pages:["online_bidding.html"],
      selector:"#olBidSelect",
      title:"Kom i gang · 6/11",
      text:"Nu er du i bud-fasen. Vælg hvor mange stik du tror du tager.",
      wait:"next"
    },

    {
      id:"bid_submit",
      pages:["online_bidding.html"],
      selector:"#olBidSubmit",
      title:"Kom i gang · 7/11",
      text:"Når du har valgt bud, tryk 'Afgiv bud'.",
      wait:"next"
    },

    {
      id:"play_phase",
      pages:["online_play.html","online_game.html"],
      selector:"#olHands",
      title:"Kom i gang · 8/11",
      text:"Dine kort ligger nederst. Tryk på et kort når det er din tur.",
      wait:"next"
    },

    {
      id:"results",
      pages:["online_result.html"],
      selector:"#olNextRound",
      title:"Kom i gang · 9/11",
      text:"Her ser du resultatet. Værten kan starte næste runde.",
      wait:"done"
    }
  ];

  function run(force=false){
    const idx = getStepIdx();
    const step = steps[idx];
    if (!step) return;

    if (!step.pages.includes(pageName())) return;

    if (typeof step.ready === "function"){
      let ok = false;
      try{ ok = !!step.ready(); }catch(e){ ok=false; }
      if (!ok){
        if (!step.__waitStart) step.__waitStart = Date.now();
        if (Date.now() - step.__waitStart > (step.maxWaitMs || 8000)){
          step.__waitStart = null;
          setStepIdx(idx+1);
          run(true);
          return;
        }
        setTimeout(run, 400);
        return;
      }
    }

    let el = null;
    try{ el = document.querySelector(step.selector); }catch(e){}
    if (!el){
      setTimeout(run, 400);
      return;
    }

    clearHighlights();
    highlight(el);

    showDialog(step,
      ()=>{ setStepIdx(idx+1); run(true); },
      ()=>{ if(idx>0){ setStepIdx(idx-1); run(true);} }
    );
  }

  window.addEventListener("load", ()=> setTimeout(run, 500));
  window.addEventListener("popstate", ()=> setTimeout(run, 500));
})();
