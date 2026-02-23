(() => {
  const cfg = window.__PRIVATE_ANALYTICS__ || {};
  if (!cfg.enabled) return;

  const host = String(window.location.hostname || "").toLowerCase();
  const onlyOnDomains = Array.isArray(cfg.onlyOnDomains)
    ? cfg.onlyOnDomains.map((x) => String(x || "").toLowerCase()).filter(Boolean)
    : [];

  if (onlyOnDomains.length > 0 && !onlyOnDomains.includes(host)) return;

  const oncePerSession = cfg.oncePerSession !== false;

  function markSessionKey(key) {
    if (!oncePerSession) return true;
    try {
      if (window.sessionStorage.getItem(key) === "1") return false;
      window.sessionStorage.setItem(key, "1");
    } catch (_) {}
    return true;
  }

  async function lookupIp() {
    const endpoints = [
      "https://api64.ipify.org?format=json",
      "https://api.ipify.org?format=json",
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        const ip = String(data.ip || "").trim();
        if (ip) return ip;
      } catch (_) {}
    }
    return "";
  }

  function sendWithFallback(url, body) {
    const payload = JSON.stringify(body);
    const canBeacon = typeof navigator.sendBeacon === "function";
    if (canBeacon) {
      try {
        const ok = navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        if (ok) return;
      } catch (_) {}
    }

    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      mode: "cors",
      keepalive: true,
    }).catch(() => {});
  }

  async function sendWebhook() {
    const wb = cfg.webhook || {};
    const url = String(wb.url || "").trim();
    if (!url) return;

    const key = `private-analytics:webhook:${window.location.pathname}`;
    if (!markSessionKey(key)) return;

    const includeIp = wb.includeIp !== false;
    const ip = includeIp ? await lookupIp() : "";

    const payload = {
      ts: new Date().toISOString(),
      host: window.location.host,
      path: window.location.pathname,
      href: window.location.href,
      referrer: document.referrer || "",
      title: document.title || "",
      ua: navigator.userAgent || "",
      lang: navigator.language || "",
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screen: `${window.screen.width || 0}x${window.screen.height || 0}`,
      viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
      ip,
    };

    sendWithFallback(url, payload);
  }

  const delayMs = Math.max(0, Number((cfg.webhook || {}).delayMs || 0));
  if (delayMs > 0) {
    window.setTimeout(() => {
      sendWebhook().catch(() => {});
    }, delayMs);
  } else {
    sendWebhook().catch(() => {});
  }
})();
