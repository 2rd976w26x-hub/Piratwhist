(() => {
  const telemetry = window.PW_TELEMETRY;
  const STORAGE_KEY = telemetry?.STORAGE_KEYS?.feedback || "PW_FEEDBACK_ENTRIES";

  function ensureModal() {
    if (document.getElementById("pwFeedbackModal")) return;

    const backdrop = document.createElement("div");
    backdrop.className = "pwFeedbackBackdrop";
    backdrop.id = "pwFeedbackBackdrop";

    const modal = document.createElement("div");
    modal.className = "pwFeedbackModal";
    modal.id = "pwFeedbackModal";

    const card = document.createElement("div");
    card.className = "pwFeedbackCard";
    card.innerHTML = `
      <h2>Send feedback</h2>
      <p>Del gerne fejl, idéer eller forbedringer. Vi gemmer tidspunkt og tekniske oplysninger for at kunne finde problemet.</p>
      <textarea class="pwFeedbackTextarea" id="pwFeedbackMessage" placeholder="Skriv din besked her..."></textarea>
      <input class="pwFeedbackInput" id="pwFeedbackContact" placeholder="Kontaktinfo (valgfrit)" />
      <div class="pwFeedbackActions">
        <div class="pwFeedbackStatus" id="pwFeedbackStatus"></div>
        <button type="button" id="pwFeedbackCancel">Annuller</button>
        <button type="button" class="pwPrimary" id="pwFeedbackSend">Send</button>
      </div>
    `;

    modal.appendChild(card);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    backdrop.addEventListener("click", closeModal);
    card.addEventListener("click", (event) => event.stopPropagation());

    document.getElementById("pwFeedbackCancel")?.addEventListener("click", closeModal);
    document.getElementById("pwFeedbackSend")?.addEventListener("click", submitFeedback);
  }

  function openModal() {
    ensureModal();
    document.getElementById("pwFeedbackBackdrop")?.classList.add("is-open");
    document.getElementById("pwFeedbackModal")?.classList.add("is-open");
    const textarea = document.getElementById("pwFeedbackMessage");
    if (textarea) textarea.focus();
  }

  function closeModal() {
    document.getElementById("pwFeedbackBackdrop")?.classList.remove("is-open");
    document.getElementById("pwFeedbackModal")?.classList.remove("is-open");
    const status = document.getElementById("pwFeedbackStatus");
    if (status) status.textContent = "";
  }

  function getContext() {
    return window.PW_CONTEXT || {};
  }

  function submitFeedback() {
    const messageEl = document.getElementById("pwFeedbackMessage");
    const contactEl = document.getElementById("pwFeedbackContact");
    const statusEl = document.getElementById("pwFeedbackStatus");

    const message = messageEl?.value.trim();
    if (!message) {
      if (statusEl) statusEl.textContent = "Skriv venligst en besked.";
      return;
    }

    const now = new Date();
    const entry = {
      id: telemetry?.ensureSessionId ? `${telemetry.ensureSessionId()}-${Date.now()}` : `pw-${Date.now()}`,
      message,
      contact: contactEl?.value.trim() || null,
      createdAt: now.toISOString(),
      createdAtLocal: now.toLocaleString("da-DK"),
      pageTitle: document.title || null,
      url: window.location.href,
      referrer: document.referrer || null,
      sessionId: telemetry?.ensureSessionId ? telemetry.ensureSessionId() : null,
      context: getContext(),
      client: telemetry?.collectClientInfo ? telemetry.collectClientInfo() : null
    };

    if (telemetry?.pushEvent) {
      telemetry.pushEvent(STORAGE_KEY, entry, telemetry?.LIMITS?.feedback || 200);
    } else {
      const list = (() => {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch (err) {
          return [];
        }
      })();
      list.push(entry);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (err) {
        // ignore
      }
    }

    if (statusEl) statusEl.textContent = "Tak! Din feedback er gemt.";
    if (messageEl) messageEl.value = "";
    if (contactEl) contactEl.value = "";
    setTimeout(closeModal, 900);
  }

  function ensureButton() {
    if (document.querySelector(".pwFeedbackButton")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pwFeedbackButton";
    btn.textContent = "Feedback";
    btn.addEventListener("click", openModal);
    document.body.appendChild(btn);
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureButton();
    ensureModal();
  });
})();
