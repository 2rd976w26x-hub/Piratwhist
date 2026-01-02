const APP_VERSION = "0.0.6";
const badge = document.getElementById("appVersion");
const foot = document.getElementById("footerVersion");
if (badge) badge.textContent = "v" + APP_VERSION;
if (foot) foot.textContent = APP_VERSION;
