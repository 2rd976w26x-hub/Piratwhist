// Piratwhist Online Lobby - v1.0.3
(() => {
  const socket = io();

  const el = (id) => document.getElementById(id);

  function goToRoom(code, name) {
    sessionStorage.setItem("pw_online_code", code);
    sessionStorage.setItem("pw_online_name", name);
    const url = `/online_room.html?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`;
    window.location.href = url;
  }

  function getName() {
    const name = (el("olMyName")?.value || "").trim();
    return name || "Spiller";
  }

  function getCode() {
    return (el("olRoomCode")?.value || "").trim().toUpperCase();
  }

  function setStatus(msg) {
    const box = el("olRoomStatus");
    if (box) box.textContent = msg;
  }

  socket.on("connect", () => setStatus("Forbundet."));
  socket.on("disconnect", () => setStatus("Afbrudt."));

  // Create room
  el("olCreateRoom")?.addEventListener("click", () => {
    const name = getName();
    sessionStorage.setItem("pw_online_name", name);
    setStatus("Opretter rum...");
    socket.emit("online_create_room", {
      name,
      player_count: 4,
      bot_count: 0,
    });
  });

  socket.on("online_created", (data) => {
    const code = (data?.code || "").toUpperCase();
    const name = sessionStorage.getItem("pw_online_name") || getName();
    if (!code) {
      setStatus("Kunne ikke oprette rum.");
      return;
    }
    goToRoom(code, name);
  });

  // Join room
  el("olJoinRoom")?.addEventListener("click", () => {
    const name = getName();
    const code = getCode();
    if (!code) {
      setStatus("Indtast en rumkode.");
      return;
    }
    sessionStorage.setItem("pw_online_name", name);
    sessionStorage.setItem("pw_online_code", code);
    setStatus("Tjekker rum...");
    socket.emit("online_join_room", { code, name });
  });

  socket.on("online_joined", (data) => {
    const code = (data?.code || sessionStorage.getItem("pw_online_code") || "").toUpperCase();
    const name = sessionStorage.getItem("pw_online_name") || getName();
    if (!code) {
      setStatus("Kunne ikke joine rum.");
      return;
    }
    goToRoom(code, name);
  });

  socket.on("online_error", (data) => {
    setStatus(data?.message || "Fejl.");
  });
})();
