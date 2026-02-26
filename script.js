const THEME_STORAGE_KEY = "site-theme";
const themeButtons = [...document.querySelectorAll(".theme-toggle")];
const SUN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.2 2.2M7.5 16.5l-2.2 2.2M18.7 18.7l-2.2-2.2M7.5 7.5 5.3 5.3"></path></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.2A8.8 8.8 0 1 1 9.8 4a7.2 7.2 0 1 0 10.2 10.2Z"></path></svg>';
const storedTheme = (() => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch (_) {
    return null;
  }
})();
const hasStoredTheme = storedTheme === "light" || storedTheme === "dark";
let activeTheme = hasStoredTheme ? storedTheme : "dark";

function renderThemeButtons(theme) {
  const nextThemeLabel = theme === "dark" ? "Light" : "Dark";
  themeButtons.forEach((button) => {
    button.innerHTML = theme === "dark" ? SUN_ICON : MOON_ICON;
    button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    button.setAttribute("aria-label", `Switch to ${nextThemeLabel.toLowerCase()} mode`);
    button.setAttribute("title", `Switch to ${nextThemeLabel.toLowerCase()} mode`);
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
const sectionLinks = links.filter((link) => {
  const href = link.getAttribute("href");
  return typeof href === "string" && href.startsWith("#");
});
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
