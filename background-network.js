(() => {
  const canvas = document.querySelector(".bg-network");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    return;
  }

  const root = document.documentElement;
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointerQuery = window.matchMedia("(pointer: coarse)");

  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    active: false,
    strength: 0,
  };

  const settings = {
    desktop: {
      stars: 170,
      globeParticles: 560,
      nebulaBursts: 7,
      globeScale: 0.34,
      starSpeed: 0.034,
    },
    mobile: {
      stars: 95,
      globeParticles: 340,
      nebulaBursts: 5,
      globeScale: 0.28,
      starSpeed: 0.026,
    },
    mouseRadius: 220,
    mouseRepel: 3.8,
  };

  const fallbackColor = {
    dot: [68, 99, 107],
    line: [86, 126, 137],
    pointer: [62, 105, 117],
  };

  let color = { ...fallbackColor };
  let stars = [];
  let globeParticles = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = null;
  let lastFrame = 0;
  let tick = 0;

  let globeCx = 0;
  let globeCy = 0;
  let globeRadius = 0;
  let rotY = 0;

  function currentPreset() {
    if (window.innerWidth <= 760 || coarsePointerQuery.matches) {
      return settings.mobile;
    }
    return settings.desktop;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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
      pointer: parseColorVariable(
        styles.getPropertyValue("--network-pointer-rgb"),
        fallbackColor.pointer
      ),
    };
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

  function updateGlobeGeometry() {
    const preset = currentPreset();
    const base = Math.min(width, height);
    globeRadius = base * preset.globeScale;
    globeCx = width * 0.93;
    globeCy = height * 0.92;
  }

  function createStar(speedScale) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(0.35, 1.05) * speedScale;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: randomBetween(0.45, 1.95),
      alpha: randomBetween(0.16, 0.48),
      twinkle: randomBetween(0.002, 0.007),
      phase: Math.random() * Math.PI * 2,
    };
  }

  function createGlobeParticle() {
    const lon = Math.random() * Math.PI * 2;
    const lat = Math.asin(randomBetween(-1, 1));
    const shell = randomBetween(0.68, 1.02);
    const continentSeed =
      Math.sin(lon * 1.9 + 0.7) * 0.54 +
      Math.cos(lat * 2.6 - 0.9) * 0.36 +
      Math.sin((lon + lat) * 2.3 + 0.2) * 0.22;

    return {
      lon,
      lat,
      shell,
      size: randomBetween(0.75, 2.15),
      alpha: randomBetween(0.2, 0.72),
      phase: Math.random() * Math.PI * 2,
      drift: randomBetween(0.6, 1.5),
      isLand: continentSeed > 0.38,
    };
  }

  function rebuildParticles() {
    const preset = currentPreset();
    stars = Array.from({ length: preset.stars }, () => createStar(preset.starSpeed));
    globeParticles = Array.from({ length: preset.globeParticles }, createGlobeParticle);
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
    updateGlobeGeometry();
    rebuildParticles();
    drawFrame();
  }

  function updatePointer() {
    const easing = 0.13;
    pointer.x += (pointer.targetX - pointer.x) * easing;
    pointer.y += (pointer.targetY - pointer.y) * easing;
    const targetStrength = pointer.active ? 1 : 0;
    pointer.strength += (targetStrength - pointer.strength) * 0.08;
  }

  function updateStars(deltaScale) {
    const windX = Math.sin(tick * 0.00029) * 0.028;
    const windY = Math.cos(tick * 0.00021) * 0.022;

    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      star.x += (star.vx + windX) * deltaScale;
      star.y += (star.vy + windY) * deltaScale;

      if (pointer.strength > 0.01 && !coarsePointerQuery.matches) {
        const dx = star.x - pointer.x;
        const dy = star.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.01 && distance < settings.mouseRadius) {
          const repel = (1 - distance / settings.mouseRadius) * settings.mouseRepel * pointer.strength;
          star.x += (dx / distance) * repel;
          star.y += (dy / distance) * repel;
        }
      }

      if (star.x < -6) {
        star.x = width + 6;
      } else if (star.x > width + 6) {
        star.x = -6;
      }
      if (star.y < -6) {
        star.y = height + 6;
      } else if (star.y > height + 6) {
        star.y = -6;
      }
    }
  }

  function drawNebula() {
    const preset = currentPreset();
    const nebulaColorA = mixColor(color.line, color.pointer, 0.45);
    const nebulaColorB = mixColor(color.dot, color.pointer, 0.6);

    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < preset.nebulaBursts; i += 1) {
      const ring = i / Math.max(1, preset.nebulaBursts - 1);
      const sweep = tick * 0.00008 + i * 0.9;
      const nx = globeCx + Math.cos(sweep) * globeRadius * (0.5 + ring * 0.48);
      const ny = globeCy + Math.sin(sweep * 0.82) * globeRadius * (0.32 + ring * 0.36);
      const nr = globeRadius * (0.44 + ring * 0.42);

      const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      grad.addColorStop(0, rgba(nebulaColorA, 0.085));
      grad.addColorStop(0.54, rgba(nebulaColorB, 0.035));
      grad.addColorStop(1, rgba(nebulaColorB, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function drawStars() {
    const starColor = mixColor(color.dot, color.line, 0.5);

    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      const twinkle = 0.72 + 0.28 * Math.sin(tick * star.twinkle + star.phase);
      const alpha = star.alpha * twinkle;
      const glowRadius = star.size * 5.2;

      const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowRadius);
      glow.addColorStop(0, rgba(starColor, alpha * 0.72));
      glow.addColorStop(1, rgba(starColor, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(star.x, star.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba(starColor, alpha);
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGlobeHalo() {
    const outer = ctx.createRadialGradient(globeCx, globeCy, globeRadius * 0.18, globeCx, globeCy, globeRadius * 1.22);
    outer.addColorStop(0, rgba(color.pointer, 0.1));
    outer.addColorStop(0.62, rgba(color.line, 0.05));
    outer.addColorStop(1, rgba(color.pointer, 0));
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(globeCx, globeCy, globeRadius * 1.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(color.pointer, 0.14);
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.ellipse(globeCx, globeCy, globeRadius * 1.03, globeRadius * 0.38, -0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawGlobeParticles() {
    const pointerInfluence = pointer.strength > 0.01 && !coarsePointerQuery.matches;
    const projected = [];

    const rotX = Math.sin(tick * 0.00022) * 0.2;
    const rotYLocal = rotY;
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);

    for (let i = 0; i < globeParticles.length; i += 1) {
      const p = globeParticles[i];

      const lon = p.lon + rotYLocal + Math.sin(tick * 0.00012 + p.phase) * 0.03;
      const lat = p.lat + Math.cos(tick * 0.00009 + p.phase * 0.7) * 0.01;

      let x = Math.cos(lat) * Math.cos(lon);
      let y = Math.sin(lat);
      let z = Math.cos(lat) * Math.sin(lon);

      const y2 = y * cosX - z * sinX;
      const z2 = y * sinX + z * cosX;

      const perspective = 0.64 + (z2 + 1) * 0.42;
      let px = globeCx + x * globeRadius * p.shell * perspective;
      let py = globeCy + y2 * globeRadius * p.shell * perspective;

      let localBoost = 1;
      if (pointerInfluence) {
        const dx = px - pointer.x;
        const dy = py - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.1 && distance < settings.mouseRadius * 0.95) {
          const repel =
            (1 - distance / (settings.mouseRadius * 0.95)) *
            settings.mouseRepel *
            0.42 *
            pointer.strength;
          px += (dx / distance) * repel;
          py += (dy / distance) * repel;
          localBoost = 1.18;
        }
      }

      const depth = (z2 + 1) * 0.5;
      const alpha = p.alpha * (0.18 + depth * 0.92) * localBoost;
      const size = p.size * (0.62 + perspective * 0.88);

      projected.push({
        x: px,
        y: py,
        z: depth,
        alpha,
        size,
        isLand: p.isLand,
      });
    }

    projected.sort((a, b) => a.z - b.z);

    const oceanColor = mixColor(color.line, color.pointer, 0.52);
    const landColor = [
      clamp(Math.round(color.pointer[0] * 0.68 + 32), 0, 255),
      clamp(Math.round(color.pointer[1] * 0.78 + 52), 0, 255),
      clamp(Math.round(color.pointer[2] * 0.58 + 24), 0, 255),
    ];

    for (let i = 0; i < projected.length; i += 1) {
      const p = projected[i];
      const base = p.isLand ? landColor : oceanColor;

      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.9);
      glow.addColorStop(0, rgba(base, p.alpha * 0.78));
      glow.addColorStop(1, rgba(base, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3.9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba(base, clamp(p.alpha * 1.08, 0, 0.96));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPointerField() {
    if (!pointer.active || coarsePointerQuery.matches) {
      return;
    }

    const grad = ctx.createRadialGradient(
      pointer.x,
      pointer.y,
      0,
      pointer.x,
      pointer.y,
      settings.mouseRadius * 0.8
    );
    grad.addColorStop(0, rgba(color.pointer, 0.09 * pointer.strength));
    grad.addColorStop(0.5, rgba(color.pointer, 0.04 * pointer.strength));
    grad.addColorStop(1, rgba(color.pointer, 0));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, settings.mouseRadius * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateFrame(delta) {
    const reduced = reduceMotionQuery.matches;
    const speedFactor = reduced ? 0.32 : 1;

    tick += delta;
    rotY += delta * 0.00008 * speedFactor;
    updatePointer();
    updateStars(speedFactor);
  }

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);
    drawNebula();
    drawStars();
    drawGlobeHalo();
    drawGlobeParticles();
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
    const minFrameDelta = reduced ? 90 : 24;
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
  resizeCanvas();
  startAnimation();

  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("mousemove", onPointerMove, { passive: true });
  window.addEventListener("pointerleave", onPointerExit);
  window.addEventListener("mouseleave", onPointerExit);
  window.addEventListener("pointercancel", onPointerExit);
  window.addEventListener("blur", onPointerExit);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAnimation();
    } else {
      startAnimation();
    }
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
    drawFrame();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
})();
