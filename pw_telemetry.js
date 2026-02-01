(() => {
  const STORAGE_KEYS = {
    feedback: "PW_FEEDBACK_ENTRIES",
    logins: "PW_LOGIN_EVENTS",
    rounds: "PW_ROUND_EVENTS",
    sessions: "PW_ACTIVE_SESSIONS",
    errors: "PW_CLIENT_ERRORS",
    games: "PW_GAME_EVENTS"
  };

  const LIMITS = {
    feedback: 200,
    logins: 500,
    rounds: 1000,
    errors: 200,
    games: 500
  };

  function safeParse(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (err) {
      return fallback;
    }
  }

  function readJson(key, fallback) {
    try {
      return safeParse(localStorage.getItem(key), fallback);
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // ignore
    }
  }

  function ensureSessionId() {
    try {
      let id = sessionStorage.getItem("PW_SESSION_ID");
      if (!id) {
        if (window.crypto?.randomUUID) {
          id = window.crypto.randomUUID();
        } else {
          id = `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        }
        sessionStorage.setItem("PW_SESSION_ID", id);
      }
      return id;
    } catch (err) {
      return `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
  }

  function collectClientInfo() {
    const uaData = navigator.userAgentData;
    return {
      userAgent: navigator.userAgent || null,
      platform: navigator.platform || null,
      language: navigator.language || null,
      languages: navigator.languages || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      screen: {
        width: window.screen?.width || null,
        height: window.screen?.height || null,
        pixelRatio: window.devicePixelRatio || 1
      },
      viewport: {
        width: window.innerWidth || null,
        height: window.innerHeight || null
      },
      userAgentData: uaData ? {
        mobile: uaData.mobile,
        platform: uaData.platform,
        brands: uaData.brands
      } : null
    };
  }

  function collectDebugLog(limit = 40) {
    try {
      const raw = localStorage.getItem("PW_DEBUG_LOG");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const buf = Array.isArray(parsed?.buf) ? parsed.buf.slice(-limit) : [];
      return {
        meta: parsed?.meta || null,
        events: buf
      };
    } catch (err) {
      return null;
    }
  }

  function pushEvent(key, entry, limit) {
    const list = readJson(key, []);
    list.push(entry);
    const max = limit || list.length;
    if (list.length > max) {
      list.splice(0, list.length - max);
    }
    writeJson(key, list);
    return list;
  }

  function logClientError(entry = {}) {
    if (!entry) return;
    const payload = {
      id: `${ensureSessionId?.() || "pw"}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      page: window.location.pathname,
      ...entry,
      client: entry.client || collectClientInfo(),
      debugLog: entry.debugLog || collectDebugLog()
    };
    pushEvent(
      STORAGE_KEYS.errors,
      payload,
      LIMITS.errors
    );
  }

  function recordSessionPing(extra = {}) {
    const sessionId = ensureSessionId();
    const sessions = readJson(STORAGE_KEYS.sessions, {});
    const now = Date.now();
    sessions[sessionId] = {
      lastSeen: now,
      page: window.location.pathname,
      referrer: document.referrer || null,
      ...extra
    };

    const cutoff = now - 1000 * 60 * 60 * 24; // 24h
    Object.keys(sessions).forEach((key) => {
      if (sessions[key]?.lastSeen < cutoff) {
        delete sessions[key];
      }
    });

    writeJson(STORAGE_KEYS.sessions, sessions);
    return sessionId;
  }

  window.PW_TELEMETRY = {
    STORAGE_KEYS,
    LIMITS,
    readJson,
    writeJson,
    pushEvent,
    ensureSessionId,
    collectClientInfo,
    collectDebugLog,
    logClientError,
    recordSessionPing
  };

  if (window?.addEventListener) {
    window.addEventListener("error", (event) => {
      const error = event?.error;
      logClientError({
        type: "window_error",
        message: event?.message || error?.message || "Ukendt fejl",
        name: error?.name || null,
        stack: error?.stack || null,
        source: event?.filename || null,
        line: event?.lineno ?? null,
        column: event?.colno ?? null
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      logClientError({
        type: "unhandledrejection",
        message: reason?.message || String(reason || "Ukendt fejl"),
        name: reason?.name || null,
        stack: reason?.stack || null
      });
    });
  }

  recordSessionPing({ client: collectClientInfo() });
  setInterval(() => recordSessionPing({ client: collectClientInfo() }), 60000);
})();
