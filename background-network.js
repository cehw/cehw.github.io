(() => {
  const canvas = document.querySelector(".bg-network");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const root = document.documentElement;
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointerQuery = window.matchMedia("(pointer: coarse)");

  const fallbackColor = {
    dot: [68, 99, 107],
    line: [86, 126, 137],
    pointer: [62, 105, 117],
  };

  const settings = {
    desktop: {
      stars: 140,
      cloudParticles: 360,
      warmParticles: 90,
      cloudBands: 6,
      starSpeed: 0.024,
      cloudSpeed: 0.095,
    },
    mobile: {
      stars: 80,
      cloudParticles: 220,
      warmParticles: 52,
      cloudBands: 4,
      starSpeed: 0.017,
      cloudSpeed: 0.07,
    },
    mouseRadius: 210,
    mouseForce: 0.11,
  };

  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    active: false,
    strength: 0,
  };

  let color = { ...fallbackColor };
  let stars = [];
  let clouds = [];
  let warm = [];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = null;
  let tick = 0;
  let lastFrame = 0;

  let pageQuality = 1;
  let adaptiveQuality = 1;
  let perfSumMs = 0;
  let perfSamples = 0;
  let lastAdaptiveAdjustAt = 0;

  let horizonCx = 0;
  let horizonCy = 0;
  let horizonRx = 0;
  let horizonRy = 0;

  let sprites = {
    star: null,
    cloud: null,
    warm: null,
  };

  function currentPreset() {
    if (window.innerWidth <= 760 || coarsePointerQuery.matches) return settings.mobile;
    return settings.desktop;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function mixColor(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function parseColorVariable(value, fallback) {
    const parts = String(value || "")
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((part) => Number.isFinite(part) && part >= 0 && part <= 255);
    return parts.length >= 3 ? parts.slice(0, 3) : fallback;
  }

  function readThemeColors() {
    const styles = getComputedStyle(root);
    color = {
      dot: parseColorVariable(styles.getPropertyValue("--network-dot-rgb"), fallbackColor.dot),
      line: parseColorVariable(styles.getPropertyValue("--network-line-rgb"), fallbackColor.line),
      pointer: parseColorVariable(styles.getPropertyValue("--network-pointer-rgb"), fallbackColor.pointer),
    };
  }

  function isDarkTheme() {
    return root.getAttribute("data-theme") === "dark";
  }

  function createParticleSprite(size, innerRgb, outerRgb, innerAlpha, outerAlpha) {
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const sctx = sprite.getContext("2d", { alpha: true });
    if (!sctx) return null;

    const c = size / 2;
    const grad = sctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, rgba(innerRgb, innerAlpha));
    grad.addColorStop(0.42, rgba(outerRgb, outerAlpha));
    grad.addColorStop(1, rgba(outerRgb, 0));

    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(c, c, c, 0, Math.PI * 2);
    sctx.fill();
    return sprite;
  }

  function buildSprites() {
    const starCore = mixColor(color.dot, color.pointer, 0.62);
    const starOuter = mixColor(color.line, color.pointer, 0.35);

    const cloudCore = mixColor(color.line, color.pointer, 0.55);
    const cloudOuter = mixColor(color.dot, color.line, 0.62);

    const warmCore = [255, 206, 128];
    const warmOuter = [255, 172, 92];

    sprites = {
      star: createParticleSprite(30, starCore, starOuter, 0.95, 0.48),
      cloud: createParticleSprite(42, cloudCore, cloudOuter, 0.92, 0.38),
      warm: createParticleSprite(34, warmCore, warmOuter, 0.95, 0.28),
    };
  }

  function updateHorizonGeometry() {
    horizonCx = width * 0.5;
    horizonCy = height * 1.07;
    horizonRx = width * 0.9;
    horizonRy = height * 0.42;
  }

  function createStar(starSpeedScale) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(0.34, 0.92) * starSpeedScale;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: randomBetween(0.45, 1.9),
      alpha: randomBetween(0.12, 0.44),
      twinkle: randomBetween(0.0015, 0.007),
      phase: Math.random() * Math.PI * 2,
    };
  }

  function horizonPoint() {
    const t = randomBetween(-Math.PI * 0.95, -Math.PI * 0.05);
    const x = horizonCx + Math.cos(t) * horizonRx;
    const y = horizonCy + Math.sin(t) * horizonRy;
    return {
      x,
      y,
      arcT: t,
    };
  }

  function createCloudParticle(cloudSpeedScale) {
    const h = horizonPoint();
    const depth = Math.random();
    const jitterX = randomBetween(-width * 0.03, width * 0.03);
    const jitterY = randomBetween(-height * 0.025, height * 0.02);

    return {
      x: h.x + jitterX,
      y: h.y + jitterY,
      vx: randomBetween(-0.4, 0.4) * cloudSpeedScale,
      vy: randomBetween(-0.12, 0.1) * cloudSpeedScale,
      size: randomBetween(0.5, 1.5),
      alpha: randomBetween(0.08, 0.46),
      phase: Math.random() * Math.PI * 2,
      twinkle: randomBetween(0.0012, 0.004),
      depth,
      drift: randomBetween(0.2, 1.1),
      band: Math.floor(randomBetween(0, 6)),
    };
  }

  function createWarmParticle(cloudSpeedScale) {
    const h = horizonPoint();
    return {
      x: h.x + randomBetween(-width * 0.02, width * 0.02),
      y: h.y + randomBetween(-height * 0.012, height * 0.012),
      vx: randomBetween(-0.3, 0.3) * cloudSpeedScale,
      vy: randomBetween(-0.08, 0.08) * cloudSpeedScale,
      size: randomBetween(0.55, 1.4),
      alpha: randomBetween(0.12, 0.5),
      phase: Math.random() * Math.PI * 2,
      pulse: randomBetween(0.002, 0.006),
    };
  }

  function rebuildParticles() {
    const preset = currentPreset();
    const qualityScale = clamp(pageQuality * adaptiveQuality, 0.5, 1);
    const themeScale = isDarkTheme() ? 1 : 0.58;

    const starCount = Math.max(22, Math.round(preset.stars * qualityScale * themeScale));
    const cloudCount = Math.max(64, Math.round(preset.cloudParticles * qualityScale * themeScale));
    const warmCount = Math.max(10, Math.round(preset.warmParticles * qualityScale * themeScale));

    stars = Array.from({ length: starCount }, () => createStar(preset.starSpeed));
    clouds = Array.from({ length: cloudCount }, () => createCloudParticle(preset.cloudSpeed));
    warm = Array.from({ length: warmCount }, () => createWarmParticle(preset.cloudSpeed));
  }

  function maybeAdjustAdaptiveQuality() {
    // Intentionally disabled for now to avoid visible re-seeding jitter.
  }

  function resizeCanvas() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    updateHorizonGeometry();
    rebuildParticles();
    buildSprites();
    drawFrame();
  }

  function updatePointer() {
    pointer.x += (pointer.targetX - pointer.x) * 0.14;
    pointer.y += (pointer.targetY - pointer.y) * 0.14;
    const target = pointer.active ? 1 : 0;
    pointer.strength += (target - pointer.strength) * 0.08;
  }

  function applyPointerInfluence(particle, scale) {
    if (pointer.strength < 0.01 || coarsePointerQuery.matches) return;

    const dx = particle.x - pointer.x;
    const dy = particle.y - pointer.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.001 || dist >= settings.mouseRadius) return;

    const n = 1 - dist / settings.mouseRadius;
    const force = n * settings.mouseForce * pointer.strength * scale;
    particle.x += (dx / dist) * force;
    particle.y += (dy / dist) * force;
  }

  function updateStars(deltaScale) {
    const windX = Math.sin(tick * 0.00025) * 0.012;
    const windY = Math.cos(tick * 0.00019) * 0.01;

    for (let i = 0; i < stars.length; i += 1) {
      const s = stars[i];
      s.x += (s.vx + windX) * deltaScale;
      s.y += (s.vy + windY) * deltaScale;

      applyPointerInfluence(s, 0.28);

      if (s.x < -8) s.x = width + 8;
      else if (s.x > width + 8) s.x = -8;
      if (s.y < -8) s.y = height + 8;
      else if (s.y > height + 8) s.y = -8;
    }
  }

  function updateCloudParticles(deltaScale) {
    const driftX = Math.sin(tick * 0.00015) * 0.06;
    const driftY = Math.cos(tick * 0.00012) * 0.03;

    for (let i = 0; i < clouds.length; i += 1) {
      const p = clouds[i];
      const wobble = Math.sin(tick * p.twinkle + p.phase) * 0.14;
      p.x += (p.vx + driftX * p.drift + wobble * 0.03) * deltaScale;
      p.y += (p.vy + driftY * p.drift + Math.cos(tick * 0.00009 + p.phase) * 0.012) * deltaScale;

      applyPointerInfluence(p, 0.55);

      if (p.x < -80) p.x = width + 80;
      else if (p.x > width + 80) p.x = -80;
      if (p.y < -80) p.y = height + 80;
      else if (p.y > height + 80) p.y = -80;
    }

    for (let i = 0; i < warm.length; i += 1) {
      const w = warm[i];
      w.x += (w.vx + driftX * 0.5) * deltaScale;
      w.y += (w.vy + driftY * 0.35) * deltaScale;

      applyPointerInfluence(w, 0.65);

      if (w.x < -60) w.x = width + 60;
      else if (w.x > width + 60) w.x = -60;
      if (w.y < -60) w.y = height + 60;
      else if (w.y > height + 60) w.y = -60;
    }
  }

  function drawStarLayer() {
    if (!sprites.star) return;
    const themeAlpha = isDarkTheme() ? 1 : 0.62;
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < stars.length; i += 1) {
      const s = stars[i];
      const twinkle = 0.72 + 0.28 * Math.sin(tick * s.twinkle + s.phase);
      const alpha = s.alpha * twinkle * themeAlpha;
      const size = s.size * 7.5;

      ctx.globalAlpha = alpha;
      ctx.drawImage(sprites.star, s.x - size / 2, s.y - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawCloudBands() {
    const preset = currentPreset();
    const bands = preset.cloudBands;
    const themeAlpha = isDarkTheme() ? 1 : 0.44;
    const a = mixColor(color.line, color.pointer, 0.5);
    const b = mixColor(color.dot, color.line, 0.6);

    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < bands; i += 1) {
      const n = i / Math.max(1, bands - 1);
      const sweep = tick * 0.000035 + i * 0.8;
      const cx = width * (0.18 + n * 0.64) + Math.sin(sweep) * width * 0.02;
      const cy = height * (0.78 + n * 0.16) + Math.cos(sweep * 1.2) * height * 0.02;
      const r = Math.max(width, height) * (0.14 + n * 0.22);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgba(a, 0.08 * themeAlpha));
      grad.addColorStop(0.45, rgba(b, 0.04 * themeAlpha));
      grad.addColorStop(1, rgba(b, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function drawCloudParticles() {
    if (!sprites.cloud || !sprites.warm) return;
    const themeAlpha = isDarkTheme() ? 1 : 0.5;

    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < clouds.length; i += 1) {
      const p = clouds[i];
      const pulse = 0.74 + 0.26 * Math.sin(tick * p.twinkle + p.phase);
      const alpha = p.alpha * pulse * (0.5 + p.depth * 0.7) * themeAlpha;
      const size = p.size * (12 + p.depth * 12);

      ctx.globalAlpha = clamp(alpha, 0.03, 0.78);
      ctx.drawImage(sprites.cloud, p.x - size / 2, p.y - size / 2, size, size);
    }

    for (let i = 0; i < warm.length; i += 1) {
      const w = warm[i];
      const pulse = 0.66 + 0.34 * Math.sin(tick * w.pulse + w.phase);
      const alpha = w.alpha * pulse * themeAlpha;
      const size = w.size * 10.5;

      ctx.globalAlpha = clamp(alpha, 0.06, 0.86);
      ctx.drawImage(sprites.warm, w.x - size / 2, w.y - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawPointerField() {
    if (!pointer.active || coarsePointerQuery.matches) return;

    const grad = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, settings.mouseRadius * 0.85);
    grad.addColorStop(0, rgba(color.pointer, 0.08 * pointer.strength));
    grad.addColorStop(0.48, rgba(color.pointer, 0.032 * pointer.strength));
    grad.addColorStop(1, rgba(color.pointer, 0));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, settings.mouseRadius * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateFrame(deltaMs) {
    const reduced = reduceMotionQuery.matches;
    const frameScale = clamp(deltaMs / 16.666, 0.6, 1.8);
    const speed = (reduced ? 0.3 : 1) * frameScale;

    tick += deltaMs;
    updatePointer();
    updateStars(speed);
    updateCloudParticles(speed);
  }

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);
    drawCloudBands();
    drawStarLayer();
    drawCloudParticles();
    drawPointerField();
  }

  function stopAnimation() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function animate(timestamp) {
    if (document.hidden) {
      rafId = requestAnimationFrame(animate);
      return;
    }

    const reduced = reduceMotionQuery.matches;
    const minFrameDelta = reduced ? 66 : 16;
    const delta = lastFrame > 0 ? timestamp - lastFrame : 16;

    if (delta >= minFrameDelta || lastFrame === 0) {
      updateFrame(delta);
      drawFrame();
      lastFrame = timestamp;
    }

    rafId = requestAnimationFrame(animate);
  }

  function startAnimation() {
    stopAnimation();
    lastFrame = 0;
    perfSumMs = 0;
    perfSamples = 0;
    drawFrame();
    rafId = requestAnimationFrame(animate);
  }

  function onPointerMove(event) {
    pointer.targetX = event.clientX;
    pointer.targetY = event.clientY;
    if (!pointer.active) {
      pointer.x = pointer.targetX;
      pointer.y = pointer.targetY;
    }
    pointer.active = true;
  }

  function onPointerExit() {
    pointer.active = false;
  }

  readThemeColors();
  const isGalleryPage = Boolean(document.querySelector(".gallery-main"));
  const cores = Number(navigator.hardwareConcurrency || 4);
  const coreScale = cores <= 2 ? 0.72 : cores <= 4 ? 0.86 : 1;
  pageQuality = (isGalleryPage ? 0.8 : 1) * coreScale;

  resizeCanvas();
  startAnimation();

  window.addEventListener("resize", resizeCanvas, { passive: true });

  if (window.PointerEvent) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerExit);
    window.addEventListener("pointercancel", onPointerExit);
  } else {
    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("mouseleave", onPointerExit);
  }

  window.addEventListener("blur", onPointerExit);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAnimation();
    else startAnimation();
  });

  if (typeof reduceMotionQuery.addEventListener === "function") {
    reduceMotionQuery.addEventListener("change", startAnimation);
  } else if (typeof reduceMotionQuery.addListener === "function") {
    reduceMotionQuery.addListener(startAnimation);
  }

  if (typeof coarsePointerQuery.addEventListener === "function") {
    coarsePointerQuery.addEventListener("change", resizeCanvas);
  } else if (typeof coarsePointerQuery.addListener === "function") {
    coarsePointerQuery.addListener(resizeCanvas);
  }

  const observer = new MutationObserver(() => {
    readThemeColors();
    buildSprites();
    drawFrame();
  });

  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
})();
