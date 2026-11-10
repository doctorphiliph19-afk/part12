(function () {
  try {
    var p = JSON.parse(localStorage.getItem("kcz-theme") || "{}");
    var r = document.documentElement;
    if (p.mode === "dark" || p.mode === "light") r.setAttribute("data-theme", p.mode);
    if (["amber", "emerald", "indigo", "rose", "violet"].indexOf(p.accent) > -1) r.setAttribute("data-accent", p.accent);
  } catch (_) { /* ignore */ }
})();
