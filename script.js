const themeButtons = [...document.querySelectorAll('.theme-toggle')];
const queryTheme = new URLSearchParams(location.search).get('theme');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let savedTheme = null;
try { savedTheme = localStorage.getItem('site-theme'); } catch (_) {}
const validTheme = value => value === 'dark' || value === 'light';
let explicitTheme = validTheme(queryTheme) || validTheme(savedTheme);
let activeTheme = validTheme(queryTheme) ? queryTheme : validTheme(savedTheme) ? savedTheme : systemTheme.matches ? 'dark' : 'light';
const sun = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2v3M12 19v3M22 12h-3M5 12H2M19 5l-2 2M7 17l-2 2M19 19l-2-2M7 7 5 5"></path></svg>';
const moon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.2A8.8 8.8 0 1 1 9.8 4a7.2 7.2 0 1 0 10.2 10.2Z"></path></svg>';
function applyTheme(theme) {
  activeTheme = theme;
  document.documentElement.dataset.theme = theme;
  themeButtons.forEach(button => {
    button.innerHTML = theme === 'dark' ? sun : moon;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  });
}
applyTheme(activeTheme);
themeButtons.forEach(button => button.addEventListener('click', () => {
  explicitTheme = true;
  applyTheme(activeTheme === 'dark' ? 'light' : 'dark');
  try { localStorage.setItem('site-theme', activeTheme); } catch (_) {}
}));
systemTheme.addEventListener('change', event => {
  if (!explicitTheme) applyTheme(event.matches ? 'dark' : 'light');
});
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
const header = document.querySelector('.site-header');
const sentinel = document.querySelector('.header-sentinel');
if (header) {
  const sizeHeader = () => document.documentElement.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`);
  sizeHeader();
  if (window.ResizeObserver) new ResizeObserver(sizeHeader).observe(header);
  if (sentinel && window.IntersectionObserver) new IntersectionObserver(([entry]) => {
    header.classList.toggle('is-stuck', !entry.isIntersecting);
  }).observe(sentinel);
}
const sectionLinks = [...document.querySelectorAll('.site-nav a')].filter(link => link.getAttribute('href').startsWith('#'));
if (window.IntersectionObserver) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      sectionLinks.forEach(link => {
        const active = link.getAttribute('href') === `#${entry.target.id}`;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-25% 0px -60% 0px', threshold: 0 });
  sectionLinks.forEach(link => {
    const section = document.querySelector(link.getAttribute('href'));
    if (section) observer.observe(section);
  });
}
