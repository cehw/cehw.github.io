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

  const pointer = { x: -9999, y: -9999, active: false };

  const settings = {
    desktop: {
      count: 72,
      speed: 0.1,
      radiusMin: 9,
      radiusMax: 38,
      alphaMin: 0.14,
      alphaMax: 0.38,
    },
    mobile: {
      count: 44,
      speed: 0.085,
      radiusMin: 7,
      radiusMax: 30,
      alphaMin: 0.12,
      alphaMax: 0.32,
    },
    pointerDistance: 220,
    pointerForce: 0.02,
    drag: 0.991,
    jitter: 0.0065,
  };

  const fallbackColor = {
    dot: [68, 99, 107],
    line: [86, 126, 137],
    pointer: [62, 105, 117],
  };

  let color = { ...fallbackColor };
  let nodes = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = null;
  let lastStepTime = 0;
  let tick = 0;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
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

  function preset() {
    if (window.innerWidth <= 760 || coarsePointerQuery.matches) {
      return settings.mobile;
    }
    return settings.desktop;
  }

  function createNode(currentPreset) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(0.3, 1) * currentPreset.speed;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomBetween(currentPreset.radiusMin, currentPreset.radiusMax),
      alpha: randomBetween(currentPreset.alphaMin, currentPreset.alphaMax),
      drift: randomBetween(0.25, 1.12),
    };
  }

  function rebuildNodes() {
    const currentPreset = preset();
    nodes = Array.from({ length: currentPreset.count }, () => createNode(currentPreset));
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
    rebuildNodes();
    drawFrame();
  }

  function updateNodes(multiplier) {
    const currentPreset = preset();
    const windX = Math.sin(tick * 0.0011) * 0.009;
    const windY = Math.cos(tick * 0.0013) * 0.007;
    const pointerMaxDistance = settings.pointerDistance;

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      node.vx += windX * node.drift;
      node.vy += windY * node.drift;

      node.vx += (Math.random() - 0.5) * settings.jitter * node.drift;
      node.vy += (Math.random() - 0.5) * settings.jitter * node.drift;

      if (pointer.active && !coarsePointerQuery.matches) {
        const dx = node.x - pointer.x;
        const dy = node.y - pointer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0.1 && distance < pointerMaxDistance) {
          const force =
            (1 - distance / pointerMaxDistance) * settings.pointerForce * node.drift;
          node.vx += (dx / distance) * force;
          node.vy += (dy / distance) * force;
        }
      }

      node.vx *= settings.drag;
      node.vy *= settings.drag;

      node.x += node.vx * multiplier;
      node.y += node.vy * multiplier;

      const margin = node.radius + 28;
      if (node.x < -margin) {
        node.x = width + margin;
        node.y = Math.random() * height;
      } else if (node.x > width + margin) {
        node.x = -margin;
        node.y = Math.random() * height;
      }
      if (node.y < -margin) {
        node.y = height + margin;
        node.x = Math.random() * width;
      } else if (node.y > height + margin) {
        node.y = -margin;
        node.x = Math.random() * width;
      }

      node.radius = Math.max(currentPreset.radiusMin, Math.min(currentPreset.radiusMax, node.radius));
    }
  }

  function drawNodes() {
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const pulse = 0.88 + Math.sin((tick + i * 42) * 0.005) * 0.12;
      const radius = node.radius * pulse;
      const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);

      gradient.addColorStop(0, rgba(color.dot, node.alpha * 0.98));
      gradient.addColorStop(0.55, rgba(color.line, node.alpha * 0.34));
      gradient.addColorStop(1, rgba(color.dot, 0));

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();

      const coreRadius = Math.max(1.4, radius * 0.16);
      ctx.fillStyle = rgba(color.dot, Math.min(0.84, node.alpha * 2.3));
      ctx.beginPath();
      ctx.arc(node.x, node.y, coreRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (pointer.active && !coarsePointerQuery.matches) {
      const pointerGlow = ctx.createRadialGradient(
        pointer.x,
        pointer.y,
        0,
        pointer.x,
        pointer.y,
        settings.pointerDistance * 0.72
      );
      pointerGlow.addColorStop(0, rgba(color.pointer, 0.065));
      pointerGlow.addColorStop(0.62, rgba(color.pointer, 0.03));
      pointerGlow.addColorStop(1, rgba(color.pointer, 0));

      ctx.fillStyle = pointerGlow;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, settings.pointerDistance * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);
    drawNodes();
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
    const minFrameDelta = reduced ? 110 : 22;
    const delta = lastStepTime > 0 ? timestamp - lastStepTime : 16;
    if (delta >= minFrameDelta || lastStepTime === 0) {
      tick += delta;
      updateNodes(reduced ? 0.55 : 1);
      drawFrame();
      lastStepTime = timestamp;
    }
    rafId = requestAnimationFrame(animate);
  }

  function startAnimation() {
    stopAnimation();
    lastStepTime = 0;
    drawFrame();
    rafId = requestAnimationFrame(animate);
  }

  function onPointerMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
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
