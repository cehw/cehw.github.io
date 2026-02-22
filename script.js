const THEME_STORAGE_KEY = "site-theme";
const themeButtons = [...document.querySelectorAll(".theme-toggle")];
const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const storedTheme = (() => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch (_) {
    return null;
  }
})();
const hasStoredTheme = storedTheme === "light" || storedTheme === "dark";
let activeTheme = hasStoredTheme ? storedTheme : prefersDarkQuery.matches ? "dark" : "light";

function renderThemeButtons(theme) {
  const nextThemeLabel = theme === "dark" ? "Light" : "Dark";
  themeButtons.forEach((button) => {
    button.textContent = nextThemeLabel;
    button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    button.setAttribute("aria-label", `Switch to ${nextThemeLabel.toLowerCase()} mode`);
  });
}

function applyTheme(theme, persist) {
  activeTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  renderThemeButtons(theme);
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (_) {}
  }
}

applyTheme(activeTheme, hasStoredTheme);

if (!hasStoredTheme) {
  if (typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", (event) => {
      applyTheme(event.matches ? "dark" : "light", false);
    });
  }
}

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const next = activeTheme === "dark" ? "light" : "dark";
    applyTheme(next, true);
  });
});

const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const links = [...document.querySelectorAll("nav a")];
const sectionLinks = links.filter((link) => link.getAttribute("href")?.startsWith("#"));
const sections = sectionLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }
      const id = `#${entry.target.id}`;
      sectionLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === id);
      });
    });
  },
  { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
);

sections.forEach((section) => io.observe(section));
