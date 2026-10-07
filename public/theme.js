// Theme cycle: system -> dark -> light -> system.
// data-theme is set pre-paint in index.html/404.html; this module only wires
// the toggle button and keeps the theme in sync afterwards.

const KEY = "schedule.theme";

function media() {
  return matchMedia("(prefers-color-scheme: dark)");
}

function resolve(theme) {
  return theme === "system" ? (media().matches ? "dark" : "light") : theme;
}

function apply(theme) {
  const effective = resolve(theme);
  document.documentElement.dataset.theme = effective;
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.setAttribute("aria-label", `Тема: ${label(theme)} (сменить)`);
  btn.innerHTML = ICONS[theme];
}

const ICONS = {
  system:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="3" width="13" height="8.5" rx="1.5"/><path d="M5.5 14.5h5"/></svg>',
  dark:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z"/></svg>',
  light:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13"/></svg>',
};

function label(theme) {
  return theme === "system" ? "системная" : theme === "dark" ? "тёмная" : "светлая";
}

function current() {
  return localStorage.getItem(KEY) || "system";
}

export function initTheme() {
  apply(current());

  // While following the system, keep up with OS-level changes.
  media().addEventListener("change", () => {
    if (current() === "system") apply("system");
  });

  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const order = ["system", "dark", "light"];
    const next = order[(order.indexOf(current()) + 1) % order.length];
    localStorage.setItem(KEY, next);
    apply(next);
  });
}

initTheme();
