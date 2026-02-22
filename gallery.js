const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const grid = document.getElementById("gallery-grid");
const empty = document.getElementById("gallery-empty");

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function renderGallery() {
  try {
    const response = await fetch("./assets/gallery/meta.json", { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`meta fetch failed: ${response.status}`);
    }

    const items = await response.json();
    if (!Array.isArray(items) || items.length === 0) {
      empty.hidden = false;
      return;
    }

    const html = items
      .map((item) => {
        const thumb = escapeHtml(item.thumb || item.file || "");
        const full = escapeHtml(item.full || item.file || "");
        const title = escapeHtml(item.title || "Untitled");
        const desc = escapeHtml(item.description || "");
        const date = escapeHtml(item.date || "");
        return `
          <article class="gallery-card">
            <a href="./assets/gallery/${full}" target="_blank" rel="noreferrer">
              <img src="./assets/gallery/${thumb}" alt="${title}" loading="lazy" />
            </a>
            <div class="gallery-meta">
              <h3>${title}</h3>
              ${desc ? `<p>${desc}</p>` : ""}
              ${date ? `<time>${date}</time>` : ""}
            </div>
          </article>
        `;
      })
      .join("");

    grid.innerHTML = html;
  } catch (err) {
    empty.hidden = false;
    empty.textContent =
      "Gallery metadata not found. Add assets/gallery/meta.json and image files.";
  }
}

renderGallery();
