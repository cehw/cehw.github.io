const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const indexContainer = document.getElementById("gallery-index");
const groupsContainer = document.getElementById("gallery-groups");
const empty = document.getElementById("gallery-empty");
const groupsWithoutSmallTitles = new Set(["Easter Painted Egg at UG Hall · 1"]);
const isFileProtocol = window.location.protocol === "file:";

function replaceAllCompat(text, search, replacement) {
  return String(text).split(search).join(replacement);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  const normalized = replaceAllCompat(replaceAllCompat(raw, "/", "-"), ".", "-");

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
  const normalized = replaceAllCompat(replaceAllCompat(raw, "/", "-"), ".", "-");
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

function extractPrimaryYear(dateText) {
  const years = extractYears(dateText);
  if (!years.length) return null;
  return Math.max(...years);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactCardTitle(rawTitle, groupTitle) {
  const title = String(rawTitle || "Untitled").trim();
  const group = String(groupTitle || "").trim();
  if (!group) return title || "Untitled";
  const prefixPattern = new RegExp(`^${escapeRegExp(group)}\\s*[·:|-]\\s*`, "i");
  const compacted = title.replace(prefixPattern, "").trim();
  return compacted || title || "Untitled";
}

function assetUrl(relPath) {
  const safe = String(relPath || "").trim();
  return `./assets/gallery/${replaceAllCompat(replaceAllCompat(encodeURI(safe), "#", "%23"), "?", "%3F")}`;
}

async function renderGallery() {
  if (!groupsContainer || !empty) return;

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

    const yearsMap = new Map();

    items.forEach((item, index) => {
      const groupKey = inferGroup(item);
      const primaryYear = extractPrimaryYear(item.date);
      const yearKey = primaryYear !== null ? String(primaryYear) : "Unknown";
      const yearSort = primaryYear !== null ? primaryYear : -1;
      const candidateOrder = Number(item.group_order);
      const groupOrder = Number.isFinite(candidateOrder) ? candidateOrder : 1000 + index;
      const itemDate = parseDate(item.date);

      if (!yearsMap.has(yearKey)) {
        yearsMap.set(yearKey, {
          key: yearKey,
          sortYear: yearSort,
          groups: new Map(),
          totalCount: 0,
          latestDate: Number.NEGATIVE_INFINITY,
        });
      }

      const yearBucket = yearsMap.get(yearKey);
      yearBucket.totalCount += 1;
      yearBucket.latestDate = Math.max(yearBucket.latestDate, itemDate);

      if (!yearBucket.groups.has(groupKey)) {
        yearBucket.groups.set(groupKey, {
          key: groupKey,
          order: groupOrder,
          items: [],
          latestDate: Number.NEGATIVE_INFINITY,
        });
      }

      const groupBucket = yearBucket.groups.get(groupKey);
      groupBucket.order = Math.min(groupBucket.order, groupOrder);
      groupBucket.latestDate = Math.max(groupBucket.latestDate, itemDate);
      groupBucket.items.push(item);
    });

    const sortedYears = [...yearsMap.values()].sort((a, b) => {
      if (a.sortYear !== b.sortYear) return b.sortYear - a.sortYear;
      if (a.latestDate !== b.latestDate) return b.latestDate - a.latestDate;
      return a.key.localeCompare(b.key);
    });

    sortedYears.forEach((yearBucket) => {
      yearBucket.sortedGroups = [...yearBucket.groups.values()].sort((a, b) => {
        if (a.latestDate !== b.latestDate) return b.latestDate - a.latestDate;
        if (a.order !== b.order) return a.order - b.order;
        return a.key.localeCompare(b.key);
      });

      yearBucket.sortedGroups.forEach((groupBucket) => {
        groupBucket.items.sort((a, b) => {
          const dateDiff = parseDate(b.date) - parseDate(a.date);
          if (dateDiff !== 0) return dateDiff;
          const titleA = String(a.title || "").toLowerCase();
          const titleB = String(b.title || "").toLowerCase();
          return titleA.localeCompare(titleB);
        });
      });
    });

    if (indexContainer) {
      if (sortedYears.length > 1) {
        const chips = sortedYears
          .map((yearBucket) => {
            const label = yearBucket.key;
            const yearId = `year-${slugify(label)}`;
            yearBucket.anchorId = yearId;
            return `<a class="gallery-index-chip" href="#${yearId}">${escapeHtml(label)}</a>`;
          })
          .join("");
        indexContainer.innerHTML = chips;
        indexContainer.hidden = false;
      } else {
        indexContainer.hidden = true;
      }
    }

    const html = sortedYears
      .map((yearBucket) => {
        const yearLabel = escapeHtml(yearBucket.key);
        const yearCount = yearBucket.totalCount;
        const yearCountLabel = `${yearCount} photo${yearCount > 1 ? "s" : ""}`;
        const yearAnchorId = escapeHtml(yearBucket.anchorId || `year-${slugify(yearBucket.key)}`);

        const groupsHtml = yearBucket.sortedGroups
          .map((groupBucket) => {
            const groupKey = String(groupBucket.key || "").trim();
            const groupTitle = escapeHtml(groupKey);
            const hideSmallTitles = groupsWithoutSmallTitles.has(groupKey);
            const groupCount = groupBucket.items.length;
            const groupCountLabel = `${groupCount} photo${groupCount > 1 ? "s" : ""}`;
            const groupNote =
              groupKey === "Hong Kong Basel Art Fair" ? "Credit: Yijia's ticket." : "";
            const groupNoteHtml = groupNote
              ? `<p class="gallery-group-note">${escapeHtml(groupNote)}</p>`
              : "";
            const rawDescs = groupBucket.items.map((item) => String(item.description || "").trim());
            const descValues = [...new Set(rawDescs.filter((value) => value))];
            const nonEmptyDescCount = rawDescs.filter((value) => value).length;
            const rawDates = groupBucket.items.map((item) => String(item.date || "").trim());
            const dateValues = [...new Set(rawDates.filter((value) => value))];
            const nonEmptyDateCount = rawDates.filter((value) => value).length;
            const sharedDesc =
              !hideSmallTitles && groupCount > 1 && nonEmptyDescCount === groupCount && descValues.length === 1
                ? descValues[0]
                : "";
            const sharedDate =
              !hideSmallTitles && groupCount > 1 && nonEmptyDateCount === groupCount && dateValues.length === 1
                ? dateValues[0]
                : "";
            const sharedMetaHtml = sharedDesc || sharedDate
              ? `
                <div class="gallery-group-shared">
                  ${sharedDesc ? `<p class="gallery-group-desc">${escapeHtml(sharedDesc)}</p>` : ""}
                  ${sharedDate ? `<time class="gallery-group-date">${escapeHtml(sharedDate)}</time>` : ""}
                </div>
              `
              : "";

            const cards = groupBucket.items
              .map((item) => {
                const thumbRaw = item.thumb || item.file || "";
                const fullRaw = item.full || item.file || "";
                const thumbUrl = escapeHtml(assetUrl(thumbRaw));
                const fullUrl = escapeHtml(assetUrl(fullRaw));
                const displayTitle = escapeHtml(compactCardTitle(item.title || "Untitled", groupBucket.key));
                const rawDesc = String(item.description || "").trim();
                const rawDate = String(item.date || "").trim();
                const desc = !sharedDesc && rawDesc ? escapeHtml(rawDesc) : "";
                const date = !sharedDate && rawDate ? escapeHtml(rawDate) : "";
                const cardMetaParts = [];
                if (!hideSmallTitles) cardMetaParts.push(`<h3>${displayTitle}</h3>`);
                if (desc) cardMetaParts.push(`<p>${desc}</p>`);
                if (date) cardMetaParts.push(`<time>${date}</time>`);
                const cardMetaHtml = cardMetaParts.length
                  ? `<div class="gallery-meta">${cardMetaParts.join("")}</div>`
                  : "";
                return `
                  <article class="gallery-card">
                    <a href="${fullUrl}" target="_blank" rel="noreferrer">
                      <img src="${thumbUrl}" alt="${displayTitle}" loading="lazy" />
                    </a>
                    ${cardMetaHtml}
                  </article>
                `;
              })
              .join("");

            return `
              <section class="gallery-group">
                <header class="gallery-group-head">
                  <h3 class="gallery-group-title">${groupTitle}</h3>
                  <span class="gallery-group-count">${groupCountLabel}</span>
                </header>
                ${groupNoteHtml}
                ${sharedMetaHtml}
                <div class="gallery-grid">
                  ${cards}
                </div>
              </section>
            `;
          })
          .join("");

        return `
          <section class="gallery-year" id="${yearAnchorId}">
            <header class="gallery-year-head">
              <h2 class="gallery-year-title">${yearLabel}</h2>
              <span class="gallery-year-count">${yearCountLabel}</span>
            </header>
            <div class="gallery-year-groups">
              ${groupsHtml}
            </div>
          </section>
        `;
      })
      .join("");

    groupsContainer.innerHTML = html;
  } catch (err) {
    console.error("Gallery render failed:", err);
    empty.hidden = false;
    if (isFileProtocol) {
      empty.textContent =
        "Gallery cannot load from file://. Open this site via GitHub Pages or run a local HTTP server.";
      return;
    }
    empty.textContent =
      "Gallery failed to load. Please hard refresh and try again. If the issue persists, deployment may still be syncing.";
  }
}

renderGallery();
