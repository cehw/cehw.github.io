(() => {
  const canvas = document.querySelector(".bg-planet-particles");
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

  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    active: false,
    strength: 0,
  };

  const sphere = {
    cx: 0,
    cy: 0,
    radius: 0,
    tilt: -0.32,
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rotation = 0;
  let tick = 0;
  let lastTime = 0;
  let rafId = null;

  let colors = { ...fallbackColor };
  let particles = [];
  let sprites = {
    ocean: null,
    land: null,
    city: null,
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function mixColor(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function isDarkTheme() {
    return root.getAttribute("data-theme") === "dark";
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
    colors = {
      dot: parseColorVariable(styles.getPropertyValue("--network-dot-rgb"), fallbackColor.dot),
      line: parseColorVariable(styles.getPropertyValue("--network-line-rgb"), fallbackColor.line),
      pointer: parseColorVariable(styles.getPropertyValue("--network-pointer-rgb"), fallbackColor.pointer),
    };
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
    grad.addColorStop(0.48, rgba(outerRgb, outerAlpha));
    grad.addColorStop(1, rgba(outerRgb, 0));

    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(c, c, c, 0, Math.PI * 2);
    sctx.fill();
    return sprite;
  }

  function buildSprites() {
    const oceanCore = mixColor(colors.line, colors.pointer, 0.56);
    const oceanOuter = mixColor(colors.dot, colors.line, 0.54);

    const landCore = [
      clamp(Math.round(colors.pointer[0] * 0.62 + 18), 0, 255),
      clamp(Math.round(colors.pointer[1] * 0.78 + 28), 0, 255),
      clamp(Math.round(colors.pointer[2] * 0.6 + 16), 0, 255),
    ];
    const landOuter = mixColor(landCore, colors.line, 0.48);

    const cityCore = [255, 216, 154];
    const cityOuter = [255, 170, 90];

    sprites = {
      ocean: createParticleSprite(26, oceanCore, oceanOuter, 0.9, 0.36),
      land: createParticleSprite(24, landCore, landOuter, 0.94, 0.34),
      city: createParticleSprite(30, cityCore, cityOuter, 0.95, 0.34),
    };
  }

  function pseudoNoise(x, y, z) {
    const n1 =
      Math.sin((x + 0.19) * 5.8) * 0.9 +
      Math.cos((y - 0.13) * 6.2) * 0.82 +
      Math.sin((z + 0.05) * 4.9) * 0.75;
    const n2 =
      Math.sin((x + y) * 7.4) * 0.52 +
      Math.cos((x - z) * 6.9) * 0.44 +
      Math.sin((y + z) * 8.1) * 0.38;
    return (n1 + n2) / 2.6;
  }

  function buildParticles() {
    const dark = isDarkTheme();
    const mobile = window.innerWidth <= 760 || coarsePointerQuery.matches;
    const count = dark ? (mobile ? 820 : 1320) : mobile ? 500 : 820;
    const golden = Math.PI * (3 - Math.sqrt(5));

    particles = [];

    for (let i = 0; i < count; i += 1) {
      const t = i / Math.max(1, count - 1);
      const y = 1 - t * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const x = Math.cos(theta) * ring;
      const z = Math.sin(theta) * ring;

      const n = pseudoNoise(x, y, z);
      const landness = n + y * 0.1 - Math.abs(z) * 0.08;

      let kind = "ocean";
      if (landness > 0.18) kind = "land";
      if (landness > 0.44 && Math.random() < 0.36) kind = "city";

      particles.push({
        x,
        y,
        z,
        kind,
        size: randomBetween(0.52, 1.5),
        alpha: randomBetween(0.2, 0.94),
        twinkle: randomBetween(0.0012, 0.0058),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    dpr = clamp(window.devicePixelRatio || 1, 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    sphere.radius = Math.min(width, height) * 0.47;
    sphere.cx = width * 0.57;
    sphere.cy = height * 0.61;

    buildSprites();
    buildParticles();
    drawFrame();
  }

  function updatePointer() {
    pointer.x += (pointer.targetX - pointer.x) * 0.1;
    pointer.y += (pointer.targetY - pointer.y) * 0.1;
    const targetStrength = pointer.active ? 1 : 0;
    pointer.strength += (targetStrength - pointer.strength) * 0.08;
  }

  function projectPoint(point, rotY, tiltX) {
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x1 = point.x * cosY - point.z * sinY;
    const z1 = point.x * sinY + point.z * cosY;

    const cosX = Math.cos(tiltX);
    const sinX = Math.sin(tiltX);
    const y2 = point.y * cosX - z1 * sinX;
    const z2 = point.y * sinX + z1 * cosX;

    const depth = (z2 + 1) * 0.5;
    const perspective = 0.62 + depth * 0.44;
    const px = sphere.cx + x1 * sphere.radius * perspective;
    const py = sphere.cy + y2 * sphere.radius * perspective;

    return { px, py, z: z2, depth, perspective };
  }

  function drawBase() {
    const dark = isDarkTheme();
    const coreColor = dark ? [10, 34, 72] : [110, 162, 182];
    const edgeColor = dark ? [3, 12, 28] : [70, 122, 148];
    const glowColor = dark ? [68, 152, 232] : [118, 186, 210];

    const baseGrad = ctx.createRadialGradient(
      sphere.cx - sphere.radius * 0.24,
      sphere.cy - sphere.radius * 0.35,
      sphere.radius * 0.14,
      sphere.cx,
      sphere.cy,
      sphere.radius * 1.04
    );
    baseGrad.addColorStop(0, rgba(coreColor, dark ? 0.42 : 0.22));
    baseGrad.addColorStop(0.58, rgba(coreColor, dark ? 0.26 : 0.16));
    baseGrad.addColorStop(1, rgba(edgeColor, dark ? 0.62 : 0.28));
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(sphere.cx, sphere.cy, sphere.radius, 0, Math.PI * 2);
    ctx.fill();

    const halo = ctx.createRadialGradient(
      sphere.cx,
      sphere.cy,
      sphere.radius * 0.66,
      sphere.cx,
      sphere.cy,
      sphere.radius * 1.28
    );
    halo.addColorStop(0, rgba(glowColor, dark ? 0.2 : 0.12));
    halo.addColorStop(0.64, rgba(glowColor, dark ? 0.12 : 0.06));
    halo.addColorStop(1, rgba(glowColor, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sphere.cx, sphere.cy, sphere.radius * 1.28, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAtmosphere(rotY) {
    const dark = isDarkTheme();
    const sky = dark ? [126, 214, 255] : [110, 176, 205];
    const green = dark ? [112, 228, 182] : [102, 176, 162];

    const edgeX = sphere.cx + Math.cos(rotY) * sphere.radius * 0.08;
    const edgeY = sphere.cy - sphere.radius * 0.44;

    const atm = ctx.createRadialGradient(edgeX, edgeY, 0, edgeX, edgeY, sphere.radius * 0.82);
    atm.addColorStop(0, rgba(sky, dark ? 0.36 : 0.2));
    atm.addColorStop(0.44, rgba(green, dark ? 0.22 : 0.14));
    atm.addColorStop(1, rgba(green, 0));
    ctx.fillStyle = atm;
    ctx.beginPath();
    ctx.arc(edgeX, edgeY, sphere.radius * 0.82, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(sky, dark ? 0.36 : 0.22);
    ctx.lineWidth = Math.max(1.2, sphere.radius * 0.012);
    ctx.beginPath();
    ctx.arc(sphere.cx, sphere.cy, sphere.radius * 1.005, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawParticlePass(frontPass, rotY, tiltX) {
    const dark = isDarkTheme();
    const spriteScale = dark ? 1 : 0.86;

    for (let i = 0; i < particles.length; i += 1) {
      const point = particles[i];
      const projected = projectPoint(point, rotY, tiltX);
      if (frontPass && projected.z < 0) continue;
      if (!frontPass && projected.z >= 0) continue;

      const twinkle = 0.72 + 0.28 * Math.sin(tick * point.twinkle + point.phase);
      const depthAlpha = frontPass ? 0.28 + projected.depth * 0.9 : 0.1 + projected.depth * 0.36;
      const alpha = point.alpha * twinkle * depthAlpha;
      const size =
        point.size *
        (0.64 + projected.perspective * 1.08) *
        (point.kind === "city" ? 1.16 : 1) *
        spriteScale *
        4.0;

      const sprite =
        point.kind === "city"
          ? sprites.city
          : point.kind === "land"
            ? sprites.land
            : sprites.ocean;
      if (!sprite) continue;

      ctx.globalAlpha = clamp(alpha, 0.02, frontPass ? 0.92 : 0.28);
      ctx.drawImage(sprite, projected.px - size / 2, projected.py - size / 2, size, size);
    }
  }

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);
    drawBase();

    const parallaxRot = rotation + pointer.x * 0.18 * pointer.strength;
    const tilt = sphere.tilt + pointer.y * 0.06 * pointer.strength;

    ctx.globalCompositeOperation = "lighter";
    drawParticlePass(false, parallaxRot, tilt);
    drawParticlePass(true, parallaxRot, tilt);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    drawAtmosphere(parallaxRot);
  }

  function animate(timestamp) {
    const delta = lastTime > 0 ? clamp(timestamp - lastTime, 8, 40) : 16;
    lastTime = timestamp;
    tick += delta;

    const reduced = reduceMotionQuery.matches;
    rotation += delta * (reduced ? 0.00002 : 0.00006);
    updatePointer();
    drawFrame();

    rafId = requestAnimationFrame(animate);
  }

  function start() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    lastTime = 0;
    rafId = requestAnimationFrame(animate);
  }

  function onPointerMove(event) {
    if (coarsePointerQuery.matches) return;
    pointer.targetX = ((event.clientX / Math.max(1, window.innerWidth)) - 0.5) * 2;
    pointer.targetY = ((event.clientY / Math.max(1, window.innerHeight)) - 0.5) * 2;
    pointer.active = true;
  }

  function onPointerLeave() {
    pointer.active = false;
  }

  function onThemeChange() {
    readThemeColors();
    buildSprites();
    buildParticles();
    drawFrame();
  }

  root.classList.add("has-particle-planet");
  readThemeColors();
  resizeCanvas();
  start();

  window.addEventListener("resize", resizeCanvas, { passive: true });
  if (window.PointerEvent) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointercancel", onPointerLeave);
  } else {
    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("mouseleave", onPointerLeave);
  }
  window.addEventListener("blur", onPointerLeave);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      return;
    }
    start();
  });

  if (typeof reduceMotionQuery.addEventListener === "function") {
    reduceMotionQuery.addEventListener("change", start);
  } else if (typeof reduceMotionQuery.addListener === "function") {
    reduceMotionQuery.addListener(start);
  }

  if (typeof coarsePointerQuery.addEventListener === "function") {
    coarsePointerQuery.addEventListener("change", resizeCanvas);
  } else if (typeof coarsePointerQuery.addListener === "function") {
    coarsePointerQuery.addListener(resizeCanvas);
  }

  const observer = new MutationObserver(onThemeChange);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
})();
