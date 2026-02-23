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
    desktop: { count: 64, maxDistance: 138, speed: 0.26, radiusMin: 1, radiusMax: 2.2 },
    mobile: { count: 34, maxDistance: 98, speed: 0.2, radiusMin: 0.9, radiusMax: 1.8 },
    pointerDistance: 240,
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
    const speed = randomBetween(0.35, 1) * currentPreset.speed;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomBetween(currentPreset.radiusMin, currentPreset.radiusMax),
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
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      node.x += node.vx * multiplier;
      node.y += node.vy * multiplier;

      if (node.x <= 0 || node.x >= width) {
        node.vx *= -1;
        node.x = Math.max(0, Math.min(width, node.x));
      }
      if (node.y <= 0 || node.y >= height) {
        node.vy *= -1;
        node.y = Math.max(0, Math.min(height, node.y));
      }
    }
  }

  function drawConnections(currentPreset) {
    const maxDistance = currentPreset.maxDistance;
    const maxDistanceSq = maxDistance * maxDistance;

    for (let i = 0; i < nodes.length; i += 1) {
      const nodeA = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const nodeB = nodes[j];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const distSq = dx * dx + dy * dy;

        if (distSq > maxDistanceSq) {
          continue;
        }

        const dist = Math.sqrt(distSq);
        const alpha = (1 - dist / maxDistance) * 0.55;
        ctx.strokeStyle = rgba(color.line, alpha);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nodeA.x, nodeA.y);
        ctx.lineTo(nodeB.x, nodeB.y);
        ctx.stroke();
      }
    }
  }

  function drawPointerConnections() {
    if (!pointer.active || coarsePointerQuery.matches) {
      return;
    }

    const maxDistance = settings.pointerDistance;
    const maxDistanceSq = maxDistance * maxDistance;

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const dx = node.x - pointer.x;
      const dy = node.y - pointer.y;
      const distSq = dx * dx + dy * dy;

      if (distSq > maxDistanceSq) {
        continue;
      }

      const dist = Math.sqrt(distSq);
      const alpha = (1 - dist / maxDistance) * 0.82;
      ctx.strokeStyle = rgba(color.pointer, alpha);
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(pointer.x, pointer.y);
      ctx.lineTo(node.x, node.y);
      ctx.stroke();
    }
  }

  function drawNodes() {
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      ctx.fillStyle = rgba(color.dot, 0.88);
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFrame() {
    const currentPreset = preset();
    ctx.clearRect(0, 0, width, height);
    drawConnections(currentPreset);
    drawPointerConnections();
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
    const minFrameDelta = reduced ? 180 : 16;
    if (timestamp - lastStepTime >= minFrameDelta) {
      updateNodes(reduced ? 0.35 : 1);
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
    if (reduceMotionQuery.matches) {
      drawFrame();
    }
  }

  function onPointerExit() {
    pointer.active = false;
    if (reduceMotionQuery.matches) {
      drawFrame();
    }
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
