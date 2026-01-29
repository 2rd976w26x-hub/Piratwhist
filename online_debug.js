(() => {
  const STORAGE_KEY = "PW_DEBUG_LOG";
  const MAX_EVENTS = 500;
  const statusEl = document.getElementById("dbgStatus");
  const countEl = document.getElementById("dbgCount");
  const updatedEl = document.getElementById("dbgUpdated");
  const outputEl = document.getElementById("dbgOutput");

  function readLog(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    }catch(e){
      return null;
    }
  }

  function formatTime(ts){
    return new Date(ts).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function updateView(){
    const data = readLog();
    if (!data){
      statusEl.textContent = "Ingen debug-log fundet. Åbn online spil med ?debug=1 først.";
      countEl.textContent = "0";
      updatedEl.textContent = "-";
      outputEl.value = "";
      return;
    }
    const buf = Array.isArray(data.buf) ? data.buf.slice(-MAX_EVENTS) : [];
    const dump = { meta: data.meta || {}, buf };
    statusEl.textContent = "Log fundet.";
    countEl.textContent = String(buf.length);
    updatedEl.textContent = formatTime(Date.now());
    outputEl.value = JSON.stringify(dump, null, 2);
  }

  updateView();
  setInterval(updateView, 1000);
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY){
      updateView();
    }
  });
})();
