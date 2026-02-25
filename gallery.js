(() => {
const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const indexContainer = document.getElementById("gallery-index");
const groupsContainer = document.getElementById("gallery-groups");
const empty = document.getElementById("gallery-empty");
const lightbox = document.getElementById("gallery-lightbox");
const lightboxImage = document.getElementById("gallery-lightbox-image");
const lightboxCaption = document.getElementById("gallery-lightbox-caption");
const lightboxOpen = document.getElementById("gallery-lightbox-open");
const lightboxClose = document.getElementById("gallery-lightbox-close");
const lightboxPrev = document.getElementById("gallery-lightbox-prev");
const lightboxNext = document.getElementById("gallery-lightbox-next");
let lightboxLastFocus = null;
let lightboxReady = false;
let lightboxItems = [];
let lightboxCurrentIndex = -1;
const groupsWithoutSmallTitles = new Set(["Easter Painted Egg at UG Hall · 1"]);
const GALLERY_META_PATH = "./assets/gallery/meta.json";

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

function isPanoramaItem(item) {
  const hint = `${item.title || ""} ${item.thumb || item.file || ""} ${item.full || ""}`.toLowerCase();
  return /(^|[^a-z])(pano|panorama|panoramic)([^a-z]|$)/.test(hint);
}

function assetUrl(relPath) {
  const safe = String(relPath || "").trim();
  return `./assets/gallery/${replaceAllCompat(replaceAllCompat(encodeURI(safe), "#", "%23"), "?", "%3F")}`;
}

function markPanoramaCardsByRatio(root) {
  if (!root) return;
  const images = root.querySelectorAll(".gallery-card img");
  const panoramaRatioThreshold = 2.0;
  images.forEach((img) => {
    const card = img.closest(".gallery-card");
    if (!card) return;
    const apply = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio >= panoramaRatioThreshold) {
        card.classList.add("is-panorama");
      }
    };
    if (img.complete) {
      apply();
      return;
    }
    img.addEventListener("load", apply, { once: true });
  });
}

function getLightboxPayload(link) {
  if (!link) return { fullUrl: "", titleText: "Gallery image" };
  const fullUrl = link.getAttribute("data-full-url") || link.getAttribute("href") || "";
  const titleText =
    link.getAttribute("data-lightbox-title") ||
    (link.querySelector("img") ? link.querySelector("img").alt : "Gallery image");
  return { fullUrl, titleText };
}

function syncLightboxNavState() {
  const canNavigate = lightboxItems.length > 1;
  if (lightboxPrev) lightboxPrev.disabled = !canNavigate;
  if (lightboxNext) lightboxNext.disabled = !canNavigate;
}

function refreshLightboxItems() {
  if (!groupsContainer) {
    lightboxItems = [];
    lightboxCurrentIndex = -1;
    syncLightboxNavState();
    return;
  }
  lightboxItems = [...groupsContainer.querySelectorAll(".gallery-card-link")];
  if (!lightboxItems.length) lightboxCurrentIndex = -1;
  syncLightboxNavState();
}

function closeLightbox() {
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-lightbox-open");
  if (lightboxImage) {
    lightboxImage.removeAttribute("src");
    lightboxImage.alt = "";
  }
  if (lightboxCaption) lightboxCaption.textContent = "";
  if (lightboxOpen) lightboxOpen.setAttribute("href", "#");
  if (lightboxLastFocus && typeof lightboxLastFocus.focus === "function") {
    lightboxLastFocus.focus();
  }
  lightboxLastFocus = null;
  lightboxCurrentIndex = -1;
}

function openLightbox(fullUrl, titleText) {
  if (!lightbox || !lightboxImage || !lightboxOpen) return;
  if (lightbox.hidden) {
    lightboxLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  lightboxImage.src = fullUrl;
  lightboxImage.alt = titleText || "Gallery image";
  if (lightboxCaption) lightboxCaption.textContent = titleText || "";
  lightboxOpen.href = fullUrl;
  lightbox.hidden = false;
  lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-lightbox-open");
  if (lightboxClose && typeof lightboxClose.focus === "function") {
    lightboxClose.focus();
  }
}

function openLightboxAt(index) {
  if (!lightboxItems.length) return;
  const total = lightboxItems.length;
  const normalized = ((index % total) + total) % total;
  const link = lightboxItems[normalized];
  const { fullUrl, titleText } = getLightboxPayload(link);
  if (!fullUrl) return;
  lightboxCurrentIndex = normalized;
  openLightbox(fullUrl, titleText);
  syncLightboxNavState();
}

function navigateLightbox(step) {
  if (!lightbox || lightbox.hidden || !lightboxItems.length) return;
  if (lightboxCurrentIndex < 0) {
    openLightboxAt(0);
    return;
  }
  openLightboxAt(lightboxCurrentIndex + step);
}

function setupLightboxEvents() {
  if (lightboxReady) return;
  if (!groupsContainer || !lightbox || !lightboxImage || !lightboxOpen || !lightboxClose) return;
  lightboxReady = true;

  groupsContainer.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest(".gallery-card-link") : null;
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    refreshLightboxItems();
    const itemIndex = lightboxItems.indexOf(link);
    if (itemIndex >= 0) {
      openLightboxAt(itemIndex);
      return;
    }
    const { fullUrl, titleText } = getLightboxPayload(link);
    if (!fullUrl) return;
    openLightbox(fullUrl, titleText);
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  lightboxClose.addEventListener("click", () => {
    closeLightbox();
  });

  if (lightboxPrev) {
    lightboxPrev.addEventListener("click", () => {
      navigateLightbox(-1);
    });
  }

  if (lightboxNext) {
    lightboxNext.addEventListener("click", () => {
      navigateLightbox(1);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (!lightbox || lightbox.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigateLightbox(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      navigateLightbox(1);
    }
  });
}

async function loadGalleryItems() {
  const response = await fetch(GALLERY_META_PATH, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`meta fetch failed: ${response.status}`);
  }
  const items = await response.json();
  if (Array.isArray(items)) {
    return items;
  }
  throw new Error("meta.json is not an array");
}

async function renderGallery() {
  if (!groupsContainer || !empty) return;

  try {
    const items = await loadGalleryItems();
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
      item._dateTs = itemDate;

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
      yearBucket.anchorId = `year-${slugify(yearBucket.key)}`;
      yearBucket.sortedGroups = [...yearBucket.groups.values()].sort((a, b) => {
        if (a.latestDate !== b.latestDate) return b.latestDate - a.latestDate;
        if (a.order !== b.order) return a.order - b.order;
        return a.key.localeCompare(b.key);
      });

      yearBucket.sortedGroups.forEach((groupBucket) => {
        groupBucket.items.sort((a, b) => {
          const dateDiff = Number(b._dateTs || Number.NEGATIVE_INFINITY) - Number(a._dateTs || Number.NEGATIVE_INFINITY);
          if (dateDiff !== 0) return dateDiff;
          const titleA = String(a.title || "").toLowerCase();
          const titleB = String(b.title || "").toLowerCase();
          return titleA.localeCompare(titleB);
        });
      });
    });

    if (indexContainer) {
      const chips = sortedYears
        .map((yearBucket) => {
          const label = yearBucket.key;
          const yearId = yearBucket.anchorId;
          return `<a class="gallery-index-chip" href="#${yearId}">${escapeHtml(label)}</a>`;
        })
        .join("");
      indexContainer.innerHTML = chips;
      indexContainer.hidden = !chips;
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
                const panoClass = isPanoramaItem(item) ? " is-panorama" : "";
                const cardMetaParts = [];
                if (!hideSmallTitles) cardMetaParts.push(`<h3>${displayTitle}</h3>`);
                if (desc) cardMetaParts.push(`<p>${desc}</p>`);
                if (date) cardMetaParts.push(`<time>${date}</time>`);
                const cardMetaHtml = cardMetaParts.length
                  ? `<div class="gallery-meta">${cardMetaParts.join("")}</div>`
                  : "";
                return `
                  <article class="gallery-card${panoClass}">
                    <a class="gallery-card-link" href="${fullUrl}" target="_blank" rel="noreferrer" data-full-url="${fullUrl}" data-lightbox-title="${displayTitle}">
                      <img src="${thumbUrl}" alt="${displayTitle}" loading="lazy" decoding="async" fetchpriority="low" />
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
    markPanoramaCardsByRatio(groupsContainer);
    setupLightboxEvents();
    refreshLightboxItems();
  } catch (err) {
    console.error("Gallery render failed:", err);
    if (indexContainer) indexContainer.hidden = true;
    empty.hidden = false;
    empty.textContent = `Gallery failed to load from ${GALLERY_META_PATH}. Please refresh and try again.`;
  }
}

renderGallery();
})();
