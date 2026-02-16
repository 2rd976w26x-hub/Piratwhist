
// Piratwhist online.js v1.3.0
// Situationsbevidst AI + UI snapshot + no strategy

(function(){

  function baseUrl(){
    return localStorage.getItem("pw_ai_url") || "";
  }

  function uiSnapshot(){
    try{
      const els = Array.from(document.querySelectorAll("button, a, select, input, textarea"))
        .filter(el => el && el.offsetParent !== null)
        .slice(0, 35);

      return {
        page: (location.pathname || "").split("/").pop() || "",
        title: document.title || "",
        controls: els.map(el => ({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          text: (el.innerText || el.value || "").toString().trim().slice(0, 60),
          disabled: !!el.disabled
        })).filter(x => x.id || x.text)
      };
    }catch(e){
      return { page:"", title:"", controls:[] };
    }
  }

  async function askAI(question, game){
    const url = baseUrl();
    if (!url){
      alert("AI URL mangler. Gå til admin og indsæt global AI URL.");
      return "";
    }

    const payload = {
      question,
      game,
      ui: uiSnapshot(),
      policy: {
        noStrategy: true,
        style: "neutral_regel_og_ui_assistent"
      }
    };

    const res = await fetch(url + "/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok){
      throw new Error("AI fejl: " + res.status);
    }

    const data = await res.json();
    return data.answer || "";
  }

  window.PW_AskAI = askAI;

})();
