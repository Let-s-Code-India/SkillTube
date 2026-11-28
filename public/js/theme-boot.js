(function () {
  "use strict";
  var allowed = ["light","dark","hacker","midnight","sunrise","contrast"];
  var value = null;
  try {
    var stored = localStorage.getItem("skilltube.theme");
    if (allowed.indexOf(stored) !== -1) value = stored;
  } catch (_) {}
  if (value) document.documentElement.setAttribute("data-theme", value);
  else document.documentElement.removeAttribute("data-theme");
  var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var effective = value || (dark ? "dark" : "light");
  var color = effective === "dark" || effective === "hacker" || effective === "midnight" || effective === "contrast"
    ? (effective === "hacker" ? "#050b07" : effective === "midnight" ? "#0e1020" : effective === "contrast" ? "#000000" : "#17151d")
    : (effective === "sunrise" ? "#fff4e6" : "#fffdf7");
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
  document.documentElement.style.colorScheme = effective === "dark" || effective === "hacker" || effective === "midnight" || effective === "contrast" ? "dark" : "light";
})();
