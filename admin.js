(() => {
  const telemetry = window.PW_TELEMETRY;
  const STORAGE = telemetry?.STORAGE_KEYS || {
    feedback: "PW_FEEDBACK_ENTRIES",
    logins: "PW_LOGIN_EVENTS",
    rounds: "PW_ROUND_EVENTS",
    sessions: "PW_ACTIVE_SESSIONS"
  };
  const PLAYER_NAME_KEY = "pw_player_name";

  function readCookie(name) {
    if (typeof document === "undefined") return "";
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function writeCookie(name, value, maxAgeDays = 30) {
    if (typeof document === "undefined") return;
    const maxAge = Math.max(1, Number(maxAgeDays) || 1) * 24 * 60 * 60;
    const host = window.location?.hostname || "";
    const parts = host.split(".");
    const domain = parts.length > 1 ? `; domain=.${parts.slice(-2).join(".")}` : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax${domain}`;
  }

  const provider = window.PW_ADMIN_PROVIDER || {
    async getFeedback() {
      return telemetry?.readJson ? telemetry.readJson(STORAGE.feedback, []) : [];
    },
    async getLogins() {
      return telemetry?.readJson ? telemetry.readJson(STORAGE.logins, []) : [];
    },
    async getRounds() {
      return telemetry?.readJson ? telemetry.readJson(STORAGE.rounds, []) : [];
    },
    async getSessions() {
      return telemetry?.readJson ? telemetry.readJson(STORAGE.sessions, {}) : {};
    }
  };

  function parseDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateTime(value) {
    const date = parseDate(value);
    if (!date) return "–";
    return date.toLocaleString("da-DK");
  }

  function countRecent(list, minutes) {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return list.filter((entry) => {
      const ts = parseDate(entry.createdAt || entry.timestamp || entry.at)?.getTime();
      return ts && ts >= cutoff;
    }).length;
  }

  function groupByDate(list) {
    return list.reduce((acc, entry) => {
      const date = parseDate(entry.createdAt || entry.timestamp || entry.at);
      if (!date) return acc;
      const key = date.toISOString().slice(0, 10);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function renderDailyList(targetId, grouped) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const entries = Object.entries(grouped).sort((a, b) => {
      const da = parseDate(a[0])?.getTime() || 0;
      const db = parseDate(b[0])?.getTime() || 0;
      return db - da;
    });
    target.innerHTML = "";
    if (!entries.length) {
      target.innerHTML = '<p class="adminEmpty">Ingen historik endnu.</p>';
      return;
    }
    entries.forEach(([date, count]) => {
      const row = document.createElement("div");
      row.className = "adminHint";
      const label = parseDate(date)?.toLocaleDateString("da-DK") || date;
      row.textContent = `${label}: ${count}`;
      target.appendChild(row);
    });
  }

  function renderFeedbackList(list) {
    const target = document.getElementById("admFeedbackList");
    if (!target) return;
    target.innerHTML = "";
    if (!list.length) {
      target.innerHTML = '<p class="adminEmpty">Ingen feedback endnu.</p>';
      return;
    }

    list.sort((a, b) => {
      const ta = parseDate(a.createdAt)?.getTime() || 0;
      const tb = parseDate(b.createdAt)?.getTime() || 0;
      return tb - ta;
    });

    list.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "adminFeedbackItem";

      const header = document.createElement("h3");
      header.textContent = entry.contact ? `${entry.contact}` : "Anonym bruger";

      const meta = document.createElement("div");
      meta.className = "adminFeedbackMeta";
      meta.textContent = `${formatDateTime(entry.createdAt)} · ${entry.url || "ukendt side"}`;

      const msg = document.createElement("p");
      msg.className = "adminFeedbackMessage";
      msg.textContent = entry.message || "";

      const tags = document.createElement("div");
      const context = entry.context || {};
      const client = entry.client || {};
      const tagList = [
        context.roomCode ? `Rum ${context.roomCode}` : null,
        context.playerName ? `Spiller ${context.playerName}` : null,
        context.seat !== undefined && context.seat !== null ? `Sæde ${context.seat + 1}` : null,
        context.phase ? `Fase ${context.phase}` : null,
        client?.platform ? `Platform ${client.platform}` : null,
        client?.language ? `Sprog ${client.language}` : null
      ].filter(Boolean);

      if (tagList.length) {
        tagList.forEach((tag) => {
          const span = document.createElement("span");
          span.className = "adminTag";
          span.textContent = tag;
          tags.appendChild(span);
        });
      }

      item.appendChild(header);
      item.appendChild(meta);
      item.appendChild(msg);
      if (tagList.length) item.appendChild(tags);
      target.appendChild(item);
    });
  }

  function getStoredName(){
    try{ return (localStorage.getItem(PLAYER_NAME_KEY) || "").trim(); }catch(e){ return ""; }
  }

  function updatePcLayoutStatus() {
    const status = document.getElementById("admPcLayoutStatus");
    if (!status) return;
    const name = getStoredName();
    const enabled = name === "LaBA";
    status.textContent = enabled ? "Synlig (LaBA)" : "Skjult";
  }

  async function refresh() {
    const [feedback, logins, rounds, sessions] = await Promise.all([
      provider.getFeedback(),
      provider.getLogins(),
      provider.getRounds(),
      provider.getSessions()
    ]);

    const sessionsList = Object.values(sessions || {});
    const activeSessions = sessionsList.filter((entry) => {
      return entry?.lastSeen && entry.lastSeen >= Date.now() - 10 * 60 * 1000;
    }).length;

    const liveLogins = countRecent(logins || [], 60);
    const liveRounds = countRecent(rounds || [], 60);

    const totalLogins = (logins || []).length;
    const totalRounds = (rounds || []).length;

    const activeEl = document.getElementById("admLiveActive");
    const loginEl = document.getElementById("admLiveLogins");
    const roundsEl = document.getElementById("admLiveRounds");
    const totalLoginEl = document.getElementById("admTotalLogins");
    const totalRoundsEl = document.getElementById("admTotalRounds");

    if (activeEl) activeEl.textContent = String(activeSessions);
    if (loginEl) loginEl.textContent = String(liveLogins);
    if (roundsEl) roundsEl.textContent = String(liveRounds);
    if (totalLoginEl) totalLoginEl.textContent = String(totalLogins);
    if (totalRoundsEl) totalRoundsEl.textContent = String(totalRounds);

    renderDailyList("admLoginHistory", groupByDate(logins || []));
    renderDailyList("admRoundHistory", groupByDate(rounds || []));
    renderFeedbackList(feedback || []);
  }

  document.addEventListener("DOMContentLoaded", () => {
    updatePcLayoutStatus();
    refresh();
    setInterval(refresh, 15000);
  });
})();
