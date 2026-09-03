const THEME_STORAGE_KEY = "site-theme";
const themeButtons = [...document.querySelectorAll(".theme-toggle")];
const SUN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.2 2.2M7.5 16.5l-2.2 2.2M18.7 18.7l-2.2-2.2M7.5 7.5 5.3 5.3"></path></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.2A8.8 8.8 0 1 1 9.8 4a7.2 7.2 0 1 0 10.2 10.2Z"></path></svg>';
const pageQuery = new URLSearchParams(window.location.search);
const queryTheme = pageQuery.get("theme");
// QA aid: ?bgonly=1 hides page chrome so the background scene can be inspected.
if (pageQuery.get("bgonly") === "1") document.documentElement.classList.add("qa-bg-only");
const storedTheme = (() => {
  if (queryTheme === "light" || queryTheme === "dark") return queryTheme;
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

applyTheme(activeTheme, hasStoredTheme && queryTheme === null);

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

// Sticky header: blurred backdrop once the page has scrolled past the top.
const siteHeader = document.querySelector(".site-header");
const headerSentinel = document.querySelector(".header-sentinel");
if (siteHeader && headerSentinel && "IntersectionObserver" in window) {
  const stuckObserver = new IntersectionObserver(
    ([entry]) => {
      siteHeader.classList.toggle("is-stuck", !entry.isIntersecting);
    },
    { threshold: 0 }
  );
  stuckObserver.observe(headerSentinel);
}
if (siteHeader && pageQuery.get("stuck") === "1") siteHeader.classList.add("is-stuck");

// Scroll reveal: sections fade up once when they enter the viewport.
const reduceMotion =
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealTargets = [...document.querySelectorAll(".reveal")];
if (revealTargets.length && !reduceMotion && "IntersectionObserver" in window) {
  document.documentElement.classList.add("js-reveal");
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );
  revealTargets.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add("is-visible");
    } else {
      revealObserver.observe(el);
    }
  });
}

// Portrait micro-parallax (<= 3 degrees) on pointer devices.
const portrait = document.querySelector(".portrait-card");
const heroWrap = document.querySelector(".hero-wrap");
const finePointer =
  typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
if (portrait && heroWrap && finePointer && !reduceMotion) {
  const MAX_DEG = 3;
  heroWrap.addEventListener(
    "pointermove",
    (event) => {
      const rect = portrait.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(-1, Math.min(1, (event.clientX - cx) / (rect.width || 1)));
      const dy = Math.max(-1, Math.min(1, (event.clientY - cy) / (rect.height || 1)));
      portrait.classList.add("is-tilting");
      portrait.style.setProperty("--ry", `${(dx * MAX_DEG).toFixed(2)}deg`);
      portrait.style.setProperty("--rx", `${(-dy * MAX_DEG).toFixed(2)}deg`);
    },
    { passive: true }
  );
  heroWrap.addEventListener("pointerleave", () => {
    portrait.classList.remove("is-tilting");
    portrait.style.setProperty("--rx", "0deg");
    portrait.style.setProperty("--ry", "0deg");
  });
}
