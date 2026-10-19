// Runs before first paint: choose the edition (light/dark) and flag that JS is available.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var theme = null;
  try { theme = localStorage.getItem("edition"); } catch (e) { /* storage unavailable */ }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.setAttribute("data-theme", theme);
})();
