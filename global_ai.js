// global_ai.js
// Henter global AI-URL fra serveren (samme domæne) så alle spillere får den automatisk.
// Admin/LaBA kan sætte den via /set-ai-url (admin-siden).
(() => {
  const CACHE_KEY = "pw_ai_url_global_cache";
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
  const ENDPOINT = "/ai-url";

  function norm(u){
    let s = (u || "").trim();
    s = s.replace(/^["']|["']$/g, "").trim();
    s = s.replace(/\/(health|ask|speak)\s*$/i, "");
    s = s.replace(/\/+$/, "");
    if (s && !/^https?:\/\//i.test(s)) s = "https://" + s;
    return s;
  }

  function readCache(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return { url:"", at:0 };
      const j = JSON.parse(raw);
      return { url: norm(j.url||""), at: Number(j.at||0) };
    }catch(e){ return { url:"", at:0 }; }
  }

  function writeCache(url){
    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify({ url: norm(url), at: Date.now() }));
    }catch(e){}
  }

  async function refresh(){
    try{
      const r = await fetch(ENDPOINT, { cache:"no-store" });
      if(!r.ok) return;
      const j = await r.json();
      const u = norm(j.aiUrl || "");
      if(u){
        window.PW_GLOBAL_AI_URL = u;
        writeCache(u);
      }
    }catch(e){}
  }

  // Public helper used by other scripts
  window.PW_getAiBaseUrl = function(){
    const u1 = norm(window.PW_GLOBAL_AI_URL || "");
    if(u1) return u1;

    const c = readCache();
    if(c.url && (Date.now() - c.at) < CACHE_TTL_MS){
      window.PW_GLOBAL_AI_URL = c.url;
      return c.url;
    }

    // Fallback: local device URL (LaBA kan stadig teste lokalt)
    try{
      const local = norm(localStorage.getItem("pw_ai_url") || "");
      if(local) return local;
    }catch(e){}

    return "";
  };

  // Kick off refresh (do not block UI)
  const c = readCache();
  if(c.url) window.PW_GLOBAL_AI_URL = c.url;
  refresh();
})();
