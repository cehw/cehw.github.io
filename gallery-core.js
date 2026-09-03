/* Pure helpers for the gallery renderer. Browser global (window.GalleryCore)
   and CommonJS export so Node can unit-test it. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.GalleryCore = api;
})(typeof window !== "undefined" ? window : null, function () {
  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Strip a leading "<group> · " / "<group>: " / "<group> - " prefix.
  function stripGroupPrefix(rawTitle, groupTitle) {
    const title = String(rawTitle || "").trim();
    const group = String(groupTitle || "").trim();
    if (!group) return title;
    const prefixPattern = new RegExp(`^${escapeRegExp(group)}(?:\\s*[·:|-]\\s*|\\s+|$)`, "i");
    return title.replace(prefixPattern, "").trim();
  }

  // Camera / phone file-name titles carry no information for a visitor.
  const FILE_NAME_TITLE =
    /^(dsc|dsc[a-z]?|img|dji|pxl|mvimg|screenshot|photo|image|p)[\s_-]?\d{2,}(?:[\s_-]*(?:enhanced|nr|pano|hdr|edit|copy|final|\d+))*$/i;

  function isFileNameTitle(text) {
    const t = String(text || "").trim();
    if (!t) return true;
    return FILE_NAME_TITLE.test(t);
  }

  // Title to display on a card: "" when it should be hidden.
  function displayTitle(rawTitle, groupTitle) {
    const stripped = stripGroupPrefix(rawTitle, groupTitle);
    if (isFileNameTitle(stripped)) return "";
    return stripped;
  }

  return { stripGroupPrefix, isFileNameTitle, displayTitle };
});
