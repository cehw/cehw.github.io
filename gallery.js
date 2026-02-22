const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const indexContainer = document.getElementById("gallery-index");
const groupsContainer = document.getElementById("gallery-groups");
const empty = document.getElementById("gallery-empty");

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "group";
}

function inferGroup(item) {
  if (item.group && String(item.group).trim()) {
    return String(item.group).trim();
  }
  const hint = `${item.title || ""} ${item.thumb || item.file || ""} ${item.full || ""}`.toLowerCase();
  if (hint.includes("austria")) return "Austria";
  if (hint.includes("australia")) return "Australia";
  if (hint.includes("portrait")) return "Portraits";
  return "Other";
}

function parseDate(dateText) {
  if (!dateText) return Number.NEGATIVE_INFINITY;
  const raw = String(dateText).trim();
  const normalized = raw.replaceAll("/", "-").replaceAll(".", "-");

  const yearRange = normalized.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (yearRange) {
    const endYear = Number(yearRange[2]);
    return new Date(endYear, 11, 31).getTime();
  }

  const direct = Date.parse(normalized);
  if (!Number.isNaN(direct)) return direct;

  const ym = normalized.match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (ym) {
    const year = Number(ym[1]);
    const month = Number(ym[2] || 1);
    return new Date(year, month - 1, 1).getTime();
  }
  return Number.NEGATIVE_INFINITY;
}

function extractYears(dateText) {
  if (!dateText) return [];
  const raw = String(dateText).trim();
  const normalized = raw.replaceAll("/", "-").replaceAll(".", "-");
  const range = normalized.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    return [Number(range[1]), Number(range[2])];
  }
  const ym = normalized.match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (ym) {
    return [Number(ym[1])];
  }
  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) {
    return [new Date(parsed).getFullYear()];
  }
  return [];
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

    const grouped = new Map();
    items.forEach((item, index) => {
      const key = inferGroup(item);
      const candidateOrder = Number(item.group_order);
      const order = Number.isFinite(candidateOrder) ? candidateOrder : 1000 + index;
      if (!grouped.has(key)) {
        grouped.set(key, { key, order, items: [] });
      }
      const group = grouped.get(key);
      group.order = Math.min(group.order, order);
      group.items.push(item);
    });

    const groups = [...grouped.values()];
    groups.forEach((group) => {
      group.items.sort((a, b) => {
        const dateDiff = parseDate(b.date) - parseDate(a.date);
        if (dateDiff !== 0) return dateDiff;
        const titleA = String(a.title || "").toLowerCase();
        const titleB = String(b.title || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });

      group.latestDate = Math.max(...group.items.map((item) => parseDate(item.date)));
      const allYears = group.items.flatMap((item) => extractYears(item.date));
      group.minYear = allYears.length ? Math.min(...allYears) : null;
      group.maxYear = allYears.length ? Math.max(...allYears) : null;
    });
    const sortedGroups = groups.sort((a, b) => {
      const dateDiff = b.latestDate - a.latestDate;
      if (dateDiff !== 0) return dateDiff;
      return a.order - b.order || a.key.localeCompare(b.key);
    });

    if (indexContainer) {
      if (sortedGroups.length > 1) {
        const used = new Set();
        const chips = sortedGroups
          .map((group) => {
            let id = slugify(group.key);
            while (used.has(id)) id = `${id}-x`;
            used.add(id);
            group.anchorId = id;
            return `<a class="gallery-index-chip" href="#group-${id}">${escapeHtml(group.key)}</a>`;
          })
          .join("");
        indexContainer.innerHTML = chips;
        indexContainer.hidden = false;
      } else {
        indexContainer.hidden = true;
      }
    }

    const html = sortedGroups
      .map((group) => {
        const cards = group.items
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

        const groupTitle = escapeHtml(group.key);
        const count = group.items.length;
        const yearLabel =
          group.minYear !== null && group.maxYear !== null
            ? group.minYear === group.maxYear
              ? String(group.maxYear)
              : `${group.minYear}-${group.maxYear}`
            : "";
        const countLabel = `${yearLabel ? `${yearLabel} · ` : ""}${count} photo${count > 1 ? "s" : ""}`;
        const anchorId = escapeHtml(group.anchorId || slugify(group.key));
        return `
          <section class="gallery-group" id="group-${anchorId}">
            <header class="gallery-group-head">
              <h2 class="gallery-group-title">${groupTitle}</h2>
              <span class="gallery-group-count">${countLabel}</span>
            </header>
            <div class="gallery-grid">
              ${cards}
            </div>
          </section>
        `;
      })
      .join("");

    groupsContainer.innerHTML = html;
  } catch (err) {
    empty.hidden = false;
    empty.textContent =
      "Gallery metadata not found. Add assets/gallery/meta.json and image files.";
  }
}

renderGallery();
