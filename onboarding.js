// Piratwhist Onboarding v1.3.0 (Stable)

(function(){
  if (window.__PW_ONBOARDING__) return;
  window.__PW_ONBOARDING__ = true;

  const KEY="pw_onboarding_step";
  const get=()=>parseInt(sessionStorage.getItem(KEY)||"0",10);
  const set=i=>sessionStorage.setItem(KEY,String(Math.max(0,i)));

  function page(){return (location.pathname||"").split("/").pop()||"";}

  function highlight(el){
    document.querySelectorAll(".pw-guide-highlight")
      .forEach(e=>e.classList.remove("pw-guide-highlight"));
    if(!el) return;
    el.classList.add("pw-guide-highlight");
    el.scrollIntoView({behavior:"smooth",block:"center"});
  }

  function injectCSS(){
    if(document.getElementById("pwGuideCSS")) return;
    const s=document.createElement("style");
    s.id="pwGuideCSS";
    s.textContent=`
      .pw-guide-highlight{outline:3px solid #2563eb!important;outline-offset:4px!important;box-shadow:0 0 0 6px rgba(37,99,235,.2)!important;border-radius:10px}
      .pw-guide-box{position:fixed;left:12px;right:12px;bottom:12px;z-index:99999}
      .pw-guide-card{background:#fff;border-radius:14px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.2)}
      .pw-guide-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
      .pw-guide-btns button{padding:8px 12px;border-radius:10px;border:1px solid #cbd5e1;font-weight:600}
      .pw-primary{background:#2563eb;color:#fff;border:none}
    `;
    document.head.appendChild(s);
  }

  const steps=[
    {pages:["piratwhist.html",""],sel:"#pwGoOnline",title:"Kom i gang 1/4",text:"Vælg spiltype."},
    {pages:["online.html"],sel:"#olCreateRoom",title:"Kom i gang 2/4",text:"Opret eller deltag i rum."},
    {pages:["online_lobby.html","online_room.html"],sel:"#olRoomLabel",title:"Kom i gang 3/4",text:"Del rumkoden."},
    {pages:["online_play.html","online_game.html"],sel:"#olHands",title:"Kom i gang 4/4",text:"Spil kort ved at trykke på dem."}
  ];

  function show(step,i){
    injectCSS();
    const el=document.querySelector(step.sel);
    if(!el){setTimeout(run,400);return;}
    highlight(el);

    let box=document.getElementById("pwGuideBox");
    if(!box){
      box=document.createElement("div");
      box.id="pwGuideBox";
      box.className="pw-guide-box";
      document.body.appendChild(box);
    }

    box.innerHTML=`
      <div class="pw-guide-card">
        <h3>${step.title}</h3>
        <p>${step.text}</p>
        <div class="pw-guide-btns">
          <button id="pwBack">Tilbage</button>
          <button id="pwNext" class="pw-primary">Næste</button>
        </div>
      </div>
    `;

    document.getElementById("pwBack").onclick=()=>{set(i-1);run();};
    document.getElementById("pwNext").onclick=()=>{set(i+1);run();};
  }

  function run(){
    const i=get();
    const step=steps[i];
    if(!step) return;
    if(!step.pages.includes(page())){setTimeout(run,400);return;}
    show(step,i);
  }

  window.addEventListener("load",()=>setTimeout(run,400));
})();