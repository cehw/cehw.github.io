(() => {
  if (window.__SPACE_EARTH_BG_INIT__) return;

  const THREE_NS = window.THREE;
  if (!THREE_NS) {
    console.warn("Three.js is not available for cinematic earth background.");
    return;
  }

  const container = document.getElementById("canvas-container");
  if (!container) return;

  window.__SPACE_EARTH_BG_INIT__ = true;

  const root = document.documentElement;
  root.classList.add("has-cinematic-earth-bg");

  const scene = new THREE_NS.Scene();
  scene.fog = new THREE_NS.FogExp2(0x000000, 0.0005);

  const camera = new THREE_NS.PerspectiveCamera(
    40,
    Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight),
    0.1,
    5000
  );

  const earthRadius = 520;
  const earthYOffset = -390;

  camera.position.set(0, 88, 560);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE_NS.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  container.replaceChildren(renderer.domElement);

  function isDarkTheme() {
    return root.getAttribute("data-theme") === "dark";
  }

  const earthGroup = new THREE_NS.Group();
  earthGroup.position.y = earthYOffset;
  earthGroup.rotation.z = (23.5 * Math.PI) / 180;
  earthGroup.rotation.x = Math.PI / 8;
  earthGroup.rotation.y = -Math.PI / 2;
  scene.add(earthGroup);

  const earthGeometry = new THREE_NS.SphereGeometry(earthRadius, 96, 96);
  const earthMaterial = new THREE_NS.MeshBasicMaterial({ color: 0x010408 });
  const earthSphere = new THREE_NS.Mesh(earthGeometry, earthMaterial);
  earthGroup.add(earthSphere);

  const atmosVertexShader = `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const atmosUniforms = {
    sunDir: { value: new THREE_NS.Vector3(0, 1, 0) },
    dayMix: { value: 0 },
  };

  const atmosFragmentShader = `
    uniform vec3 sunDir;
    uniform float dayMix;
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.5);
      vec3 greenEdge = vec3(0.3, 0.8, 0.5);
      vec3 blueSpace = vec3(0.0, 0.2, 0.8);
      vec3 finalColor = mix(blueSpace, greenEdge, intensity * 1.2);
      // Daytime: the limb facing the sun brightens toward a pale sky blue.
      float sun = pow(max(dot(normalize(vNormal), sunDir), 0.0), 1.5) * dayMix;
      finalColor = mix(finalColor, vec3(0.78, 0.90, 1.0), sun);
      gl_FragColor = vec4(finalColor, intensity * 1.5 * (1.0 + 1.1 * sun));
    }
  `;

  const atmosphereGeometry = new THREE_NS.SphereGeometry(earthRadius * 1.025, 96, 96);
  const atmosphereMaterial = new THREE_NS.ShaderMaterial({
    uniforms: atmosUniforms,
    vertexShader: atmosVertexShader,
    fragmentShader: atmosFragmentShader,
    blending: THREE_NS.AdditiveBlending,
    side: THREE_NS.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const atmosphere = new THREE_NS.Mesh(atmosphereGeometry, atmosphereMaterial);
  earthGroup.add(atmosphere);

  const cityLightsUniforms = { time: { value: 0.0 }, dim: { value: 0.0 } };

  function createParticles(posArray, colorArray) {
    const particlesGeometry = new THREE_NS.BufferGeometry();
    particlesGeometry.setAttribute("position", new THREE_NS.Float32BufferAttribute(posArray, 3));
    particlesGeometry.setAttribute("customColor", new THREE_NS.Float32BufferAttribute(colorArray, 3));

    const phaseArray = new Float32Array(posArray.length / 3);
    for (let i = 0; i < phaseArray.length; i += 1) {
      phaseArray[i] = Math.random() * Math.PI * 2;
    }
    particlesGeometry.setAttribute("phase", new THREE_NS.Float32BufferAttribute(phaseArray, 1));

    const particlesMaterial = new THREE_NS.ShaderMaterial({
      uniforms: cityLightsUniforms,
      vertexShader: `
        attribute vec3 customColor;
        attribute float phase;
        varying vec3 vColor;
        varying float vPhase;
        void main() {
          vColor = customColor;
          vPhase = phase;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float size = 1.8 * (300.0 / -mvPosition.z);
          gl_PointSize = max(1.8, size);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float dim;
        varying vec3 vColor;
        varying float vPhase;
        void main() {
          vec2 ptC = gl_PointCoord - vec2(0.5);
          float r = length(ptC);
          if (r > 0.5) discard;
          float alpha = (0.5 - r) * 2.0;

          float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
          float twinkleAmt = smoothstep(0.4, 0.8, lum);

          float w1 = sin(time * 1.8 + vPhase);
          float w2 = sin(time * 4.0 + vPhase * 2.0);
          float w3 = sin(time * 9.0 - vPhase * 1.5);

          float noise = (w1 * 0.5 + w2 * 0.35 + w3 * 0.15) * 0.5 + 0.5;
          float sharpTwinkle = pow(noise, 3.5);
          float twinkle = 0.5 + (twinkleAmt * 3.5 * sharpTwinkle);

          gl_FragColor = vec4(vColor * twinkle * 1.8 * mix(1.0, 0.6, dim), alpha);
        }
      `,
      transparent: true,
      blending: THREE_NS.AdditiveBlending,
      depthWrite: false,
    });

    const cityLights = new THREE_NS.Points(particlesGeometry, particlesMaterial);
    earthGroup.add(cityLights);
  }

  function generateFallbackParticles() {
    const posArray = [];
    const colorArray = [];
    const colorCore = new THREE_NS.Color(0xffffee);
    const colorCity = new THREE_NS.Color(0xffaa00);
    const colorSuburb = new THREE_NS.Color(0x883300);

    function getNoise(x, y, z) {
      let n = Math.sin(x * 4.0) * Math.cos(y * 4.0) * Math.sin(z * 4.0);
      n += 0.5 * Math.sin(x * 8.0) * Math.cos(y * 8.0) * Math.sin(z * 8.0);
      return n;
    }

    const samples = window.innerWidth <= 760 ? 90000 : 140000;

    for (let i = 0; i < samples; i += 1) {
      const phi = Math.acos(-1 + (2 * i) / samples);
      const theta = Math.sqrt(samples * Math.PI) * phi;
      const nx = Math.cos(theta) * Math.sin(phi);
      const ny = Math.sin(theta) * Math.sin(phi);
      const nz = Math.cos(phi);
      const noiseVal = getNoise(nx, ny, nz);

      if (noiseVal > 0.15) {
        const r = earthRadius + noiseVal * 0.5;
        posArray.push(r * nx, r * ny, r * nz);

        const c = colorSuburb.clone();
        if (noiseVal > 0.4) c.lerp(colorCity, (noiseVal - 0.4) * 2.5);
        if (noiseVal > 0.7) c.lerp(colorCore, (noiseVal - 0.7) * 3.3);
        colorArray.push(c.r, c.g, c.b);
      }
    }

    createParticles(posArray, colorArray);
  }

  function loadRealEarthData() {
    const img = new Image();
    img.src = "./assets/textures/earth_lights_2048.png";

    img.onload = () => {
      try {
        const mapCanvas = document.createElement("canvas");
        mapCanvas.width = img.width;
        mapCanvas.height = img.height;
        const mapCtx = mapCanvas.getContext("2d", { willReadFrequently: true });
        if (!mapCtx) {
          generateFallbackParticles();
          return;
        }

        mapCtx.drawImage(img, 0, 0);
        const imgData = mapCtx.getImageData(0, 0, mapCanvas.width, mapCanvas.height).data;

        const posArray = [];
        const colorArray = [];
        const attempts = window.innerWidth <= 760 ? 300000 : 550000;
        const warmColor = new THREE_NS.Color(0xffbb33);

        for (let i = 0; i < attempts; i += 1) {
          const z = Math.random() * 2 - 1;
          const theta = Math.random() * 2 * Math.PI;
          const radius = Math.sqrt(1 - z * z);
          const x = radius * Math.cos(theta);
          const y = radius * Math.sin(theta);

          const u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
          const v = 0.5 - Math.asin(y) / Math.PI;

          const pixelX = Math.floor(u * mapCanvas.width);
          const pixelY = Math.floor(v * mapCanvas.height);
          const index = (pixelY * mapCanvas.width + pixelX) * 4;

          const r = imgData[index];
          const g = imgData[index + 1];
          const b = imgData[index + 2];
          const luminance = (r + g + b) / 3;

          if (luminance > 15) {
            const rBoost = earthRadius + (luminance / 255) * 1.5;
            posArray.push(x * rBoost, y * rBoost, z * rBoost);

            const color = new THREE_NS.Color(`rgb(${r}, ${g}, ${b})`);
            color.lerp(warmColor, 0.6);
            colorArray.push(color.r, color.g, color.b);
          }
        }

        createParticles(posArray, colorArray);
      } catch (err) {
        console.warn("Falling back to generated city lights.", err);
        generateFallbackParticles();
      }
    };

    img.onerror = () => {
      console.warn("Unable to load real earth lights map, using fallback particles.");
      generateFallbackParticles();
    };
  }

  loadRealEarthData();

  const auroraUniforms = { time: { value: 0.0 } };

  const auroraVertexShader = `
    varying vec3 vPosition;
    void main() {
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const auroraFragmentShader = `
    uniform float time;
    varying vec3 vPosition;
    void main() {
      vec3 pos = normalize(vPosition);
      float latitude = pos.y;
      float auroraZone = smoothstep(0.65, 0.85, latitude) - smoothstep(0.85, 0.95, latitude);
      if (auroraZone <= 0.0) discard;

      float wave1 = sin(pos.x * 12.0 + time * 1.5);
      float wave2 = sin(pos.z * 10.0 - time * 1.0 + wave1);
      float wave3 = sin((pos.x + pos.z) * 8.0 + time * 2.0);
      float noise = (wave1 + wave2 + wave3) / 3.0;
      noise = noise * 0.5 + 0.5;

      float stripes = sin(pos.x * 50.0 + pos.z * 50.0 + time * 3.0) * 0.5 + 0.5;
      float intensity = smoothstep(0.4, 0.8, noise) * (0.5 + 0.5 * stripes) * auroraZone;
      vec3 auroraColor = vec3(0.05, 0.8, 0.5);

      gl_FragColor = vec4(auroraColor, intensity * 0.25);
    }
  `;

  const auroraGeometry = new THREE_NS.SphereGeometry(earthRadius * 1.04, 96, 96);
  const auroraMaterial = new THREE_NS.ShaderMaterial({
    vertexShader: auroraVertexShader,
    fragmentShader: auroraFragmentShader,
    uniforms: auroraUniforms,
    blending: THREE_NS.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const auroraMesh = new THREE_NS.Mesh(auroraGeometry, auroraMaterial);
  earthGroup.add(auroraMesh);

  function createSoftPointTexture(size = 64) {
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = size;
    textureCanvas.height = size;
    const textureCtx = textureCanvas.getContext("2d", { alpha: true });
    if (!textureCtx) return null;

    const c = size / 2;
    const gradient = textureCtx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(210,235,255,0.92)");
    gradient.addColorStop(0.7, "rgba(160,210,245,0.36)");
    gradient.addColorStop(1, "rgba(160,210,245,0)");
    textureCtx.fillStyle = gradient;
    textureCtx.fillRect(0, 0, size, size);

    const texture = new THREE_NS.CanvasTexture(textureCanvas);
    texture.minFilter = THREE_NS.LinearFilter;
    texture.magFilter = THREE_NS.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  // ---------------------------------------------------------------------
  // Weather layer: driven by weather.js via window.__HK_WEATHER__ / "hk-weather".
  // Everything eases toward its target so a weather change fades in.
  // ---------------------------------------------------------------------
  const prefersReducedMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const weather = {
    target: { cover: 0, rain: 0, day: 0, driftX: 0.004, driftY: 0, storm: false },
    cover: 0,
    rain: 0,
    day: 0,
    driftX: 0.004,
    driftY: 0,
    storm: false,
    sunAzimuthDeg: 0,
  };

  function setWeather(detail) {
    if (!detail) return;
    const cover = Math.min(1, Math.max(0, Number(detail.cloud_cover || 0) / 100));
    const cat = detail.category || "clear";
    const rain = cat === "storm" ? 1 : cat === "rain" ? 0.75 : 0;
    const windMs = Number.isFinite(detail.windMs) ? detail.windMs : Number(detail.wind_speed_10m || 0) / 3.6;
    const toward = ((Number(detail.wind_direction_10m || 0) + 180) * Math.PI) / 180;
    const speed = 0.004 + windMs * 0.0012;
    weather.target.cover = Math.max(cover, rain > 0 ? 0.8 : 0);
    weather.target.rain = rain;
    weather.target.day = detail.daypart === "day" ? 1 : 0;
    weather.target.driftX = Math.cos(toward) * speed;
    weather.target.driftY = Math.sin(toward) * speed * 0.35;
    weather.target.storm = cat === "storm";
    weather.storm = cat === "storm";
    if (Number.isFinite(detail.sunAzimuthDeg)) weather.sunAzimuthDeg = detail.sunAzimuthDeg;
    if (typeof updateSunDir === "function") updateSunDir();
  }

  const cloudUniforms = {
    time: { value: 0 },
    cover: { value: 0 },
    rain: { value: 0 },
    lightning: { value: 0 },
    flashPos: { value: new THREE_NS.Vector3(0, 1, 0) },
    drift: { value: new THREE_NS.Vector2(0.004, 0) },
    lightTheme: { value: 0 },
  };

  const cloudVertexShader = `
    varying vec3 vNormal;
    varying vec3 vPos;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const cloudFragmentShader = `
    uniform float time;
    uniform float cover;
    uniform float rain;
    uniform float lightning;
    uniform vec3 flashPos;
    uniform vec2 drift;
    uniform float lightTheme;
    varying vec3 vNormal;
    varying vec3 vPos;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
            mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
            mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
    }
    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p = p * 2.1 + vec3(1.7, 9.2, 3.1);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 p = normalize(vPos);
      vec3 shift = vec3(drift.x * time, drift.y * time, drift.x * time * 0.3);
      float n = fbm(p * 9.0 + shift * 2.5);
      float systems = smoothstep(0.34, 0.70, fbm(p * 2.2 + shift));
      float band = smoothstep(0.50 - cover * 0.22, 0.80, n) * mix(systems, 1.0, cover * 0.55);
      float facing = smoothstep(0.10, 0.55, dot(vNormal, vec3(0.0, 0.0, 1.0)));

      vec3 col = mix(vec3(0.50, 0.56, 0.64), vec3(0.26, 0.29, 0.34), rain);
      float flash = lightning * exp(-distance(p, flashPos) * 5.0);
      col += vec3(0.92, 0.95, 1.0) * flash * 2.2;

      float alpha = band * cover * (0.50 + 0.28 * rain) * facing;
      alpha += flash * 0.9 * facing;
      alpha *= mix(1.0, 0.55, lightTheme);
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    }
  `;

  const cloudSegments = window.innerWidth <= 760 ? 48 : 72;
  const cloudGeometry = new THREE_NS.SphereGeometry(earthRadius * 1.012, cloudSegments, cloudSegments);
  const cloudMaterial = new THREE_NS.ShaderMaterial({
    uniforms: cloudUniforms,
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const cloudMesh = new THREE_NS.Mesh(cloudGeometry, cloudMaterial);
  cloudMesh.renderOrder = 2;
  earthGroup.add(cloudMesh);

  if (window.__HK_WEATHER__) setWeather(window.__HK_WEATHER__);
  window.addEventListener("hk-weather", (event) => setWeather(event.detail));

  // Sun direction in view space from the HK hour angle: sunrise from the
  // right, noon overhead, sunset to the left.
  function updateSunDir() {
    const az = (weather.sunAzimuthDeg * Math.PI) / 180;
    const elevation = Math.max(0, -Math.cos(az)); // 0 at 06:00/18:00, 1 at noon
    atmosUniforms.sunDir.value.set(Math.sin(az) * 0.9, 0.35 + 0.65 * elevation, -0.15).normalize();
  }
  updateSunDir();
  setInterval(() => {
    const wx = window.__HK_WEATHER__;
    if (wx && wx.source === "override") return;
    if (window.WeatherCore) weather.sunAzimuthDeg = window.WeatherCore.sunAzimuthDeg(new Date());
    updateSunDir();
  }, 60 * 1000);

  // Lightning: only in thunderstorms, never for reduced-motion users.
  const lightning = { value: 0, nextAt: 0, followUpAt: 0 };
  const tmpVec = new THREE_NS.Vector3();

  function randomVisiblePoint(target) {
    // A random direction on the camera-facing, upper part of the globe.
    tmpVec.set((Math.random() - 0.5) * 1.2, 0.25 + Math.random() * 0.75, 0.35 + Math.random() * 0.65).normalize();
    const world = tmpVec.clone().multiplyScalar(earthRadius).add(earthGroup.position);
    earthGroup.worldToLocal(world);
    target.copy(world.normalize());
  }

  function triggerFlash(now) {
    randomVisiblePoint(cloudUniforms.flashPos.value);
    lightning.value = 1;
    if (Math.random() < 0.3) lightning.followUpAt = now + 90;
  }

  function stepLightning(now, frameScale) {
    if (qaFlash) {
      if (!lightning.value) randomVisiblePoint(cloudUniforms.flashPos.value);
      lightning.value = 1;
      cloudUniforms.lightning.value = 1;
      return;
    }
    if (!weather.storm || prefersReducedMotion) {
      lightning.value = 0;
      cloudUniforms.lightning.value = 0;
      return;
    }
    if (!lightning.nextAt) lightning.nextAt = now + 1500 + Math.random() * 3000;
    if (now >= lightning.nextAt) {
      triggerFlash(now);
      lightning.nextAt = now + 4000 + Math.random() * 8000;
    } else if (lightning.followUpAt && now >= lightning.followUpAt) {
      lightning.followUpAt = 0;
      lightning.value = Math.max(lightning.value, 0.85);
    }
    if (lightning.value > 0.01) {
      lightning.value *= Math.pow(0.78, frameScale);
    } else {
      lightning.value = 0;
    }
    cloudUniforms.lightning.value = lightning.value;
  }

  // Hong Kong marker. Inverse of the texture sampler used for city lights:
  // u = 0.5 + atan2(z, x) / 2pi, v = 0.5 - asin(y) / pi.
  const HK_LAT = (22.30 * Math.PI) / 180;
  const HK_LON = (114.17 * Math.PI) / 180;
  const hkDir = new THREE_NS.Vector3(
    Math.cos(HK_LAT) * Math.cos(HK_LON),
    Math.sin(HK_LAT),
    Math.cos(HK_LAT) * Math.sin(HK_LON)
  );
  const qaParams = new URLSearchParams(window.location.search);
  const hkDebug = qaParams.get("hkdebug") === "1";
  const qaFlash = qaParams.get("flash") === "1";
  const markerTexture = createSoftPointTexture(64);
  const markerMaterial = new THREE_NS.SpriteMaterial({
    map: markerTexture || undefined,
    color: hkDebug ? 0xff3355 : 0x9fe3ff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    depthTest: false,
    blending: THREE_NS.AdditiveBlending,
  });
  const ringMaterial = new THREE_NS.SpriteMaterial({
    map: markerTexture || undefined,
    color: hkDebug ? 0xff3355 : 0x9fe3ff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    depthTest: false,
    blending: THREE_NS.AdditiveBlending,
  });
  // Choose the initial yaw so Hong Kong faces the camera near the top limb.
  // Under ?hkdebug=1 the globe is frozen there for an alignment check.
  (function orientGlobeToHongKong() {
    // Target = the globe surface point under a screen position on the visible
    // left side (NDC -0.84, 0.0); falls back to a fixed direction when the
    // viewport is too narrow for that ray to hit the sphere.
    const target = new THREE_NS.Vector3(-0.62, 0.62, 0.48).normalize();
    (function unprojectTarget() {
      camera.updateMatrixWorld();
      const origin = camera.position.clone();
      const dir = new THREE_NS.Vector3(-0.84, 0.0, 0.5).unproject(camera).sub(origin).normalize();
      const centre = earthGroup.position.clone();
      const oc = origin.clone().sub(centre);
      const b = oc.dot(dir);
      const c = oc.dot(oc) - earthRadius * earthRadius;
      const disc = b * b - c;
      if (disc < 0) return;
      const t = -b - Math.sqrt(disc);
      if (t <= 0) return;
      target.copy(origin).addScaledVector(dir, t).sub(centre).normalize();
    })();
    // Search yaw and forward tilt (axial tilt kept) so the point is reachable.
    const probe = new THREE_NS.Vector3();
    const euler = new THREE_NS.Euler(earthGroup.rotation.x, 0, earthGroup.rotation.z, earthGroup.rotation.order);
    let bestYaw = earthGroup.rotation.y;
    let bestTilt = earthGroup.rotation.x;
    let bestDot = -Infinity;
    for (let j = 0; j <= 84; j += 1) {
      const tilt = -1.3 + (j / 84) * 2.2;
      euler.x = tilt;
      for (let i = 0; i < 360; i += 1) {
        const yaw = (i / 360) * Math.PI * 2;
        euler.y = yaw;
        probe.copy(hkDir).applyEuler(euler);
        const d = probe.dot(target);
        if (d > bestDot) {
          bestDot = d;
          bestYaw = yaw;
          bestTilt = tilt;
        }
      }
    }
    earthGroup.rotation.x = bestTilt;
    earthGroup.rotation.y = bestYaw;
  })();

  const hkMarker = new THREE_NS.Sprite(markerMaterial);
  const hkRing = new THREE_NS.Sprite(ringMaterial);
  hkMarker.position.copy(hkDir).multiplyScalar(earthRadius * 1.02);
  hkRing.position.copy(hkMarker.position);
  hkMarker.renderOrder = 5;
  hkRing.renderOrder = 4;
  earthGroup.add(hkMarker);
  earthGroup.add(hkRing);
  if (hkDebug) {
    window.__EARTH_DEBUG__ = { scene, camera, earthGroup, hkMarker, hkRing, cloudMesh, weather, THREE: THREE_NS };
  }

  const markerWorld = new THREE_NS.Vector3();
  const markerNormal = new THREE_NS.Vector3();
  function stepMarker(time) {
    const breath = 0.5 + 0.5 * Math.sin(time * 1.6);
    const base = hkDebug ? 40 : 9;
    hkMarker.scale.setScalar(base * (0.8 + 0.4 * breath));
    hkRing.scale.setScalar(base * 2.4 * (0.9 + 0.2 * breath));
    hkMarker.getWorldPosition(markerWorld);
    markerNormal.copy(markerWorld).sub(earthGroup.position).normalize();
    tmpVec.copy(camera.position).sub(markerWorld).normalize();
    const visible = hkDebug || markerNormal.dot(tmpVec) > 0.02;
    hkMarker.visible = visible;
    hkRing.visible = visible;
  }

  function easeWeather(frameScale, now) {
    const k = Math.min(0.2, 0.02 * frameScale);
    weather.cover += (weather.target.cover - weather.cover) * k;
    weather.rain += (weather.target.rain - weather.rain) * k;
    weather.day += (weather.target.day - weather.day) * k;
    weather.driftX += (weather.target.driftX - weather.driftX) * k;
    weather.driftY += (weather.target.driftY - weather.driftY) * k;
    cloudUniforms.cover.value = weather.cover;
    cloudUniforms.rain.value = weather.rain;
    cloudUniforms.drift.value.set(weather.driftX, weather.driftY);
    cloudUniforms.lightTheme.value = isDarkTheme() ? 0 : 1;
    atmosUniforms.dayMix.value = weather.day;
    cityLightsUniforms.dim.value = weather.day;
    stepLightning(now, frameScale);
    stepMarker(sceneTime);
  }

  const starSprite = createSoftPointTexture();

  function createStarField(count, spread, size, opacity) {
    const geometry = new THREE_NS.BufferGeometry();
    const posArray = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 1) {
      posArray[i] = (Math.random() - 0.5) * spread;
    }
    geometry.setAttribute("position", new THREE_NS.BufferAttribute(posArray, 3));
    const material = new THREE_NS.PointsMaterial({
      size,
      color: 0xffffff,
      transparent: true,
      opacity,
      sizeAttenuation: true,
      map: starSprite || undefined,
      alphaMap: starSprite || undefined,
      depthWrite: false,
      blending: THREE_NS.AdditiveBlending,
    });
    material.alphaTest = 0.02;
    return new THREE_NS.Points(geometry, material);
  }

  const isMobile = window.innerWidth <= 760;
  const starsPrimary = createStarField(isMobile ? 5200 : 11000, 4200, 1.2, 0.62);
  const starsFar = createStarField(isMobile ? 3300 : 7200, 5200, 0.8, 0.28);
  scene.add(starsFar);
  scene.add(starsPrimary);

  const baseStarOpacity = {
    primary: starsPrimary.material.opacity,
    far: starsFar.material.opacity,
  };

  const performanceProfile = {
    frameIntervalMs: 1000 / 60,
    motionScale: 1,
    pointerScale: 0.02,
    cameraBlend: 0.02,
    starOpacityScale: 1,
  };

  function applyThemeProfile() {
    const dark = isDarkTheme();
    performanceProfile.frameIntervalMs = dark ? 1000 / 60 : 1000 / 26;
    performanceProfile.motionScale = dark ? 1 : 0.42;
    performanceProfile.pointerScale = dark ? 0.02 : 0.011;
    performanceProfile.cameraBlend = dark ? 0.02 : 0.012;
    performanceProfile.starOpacityScale = dark ? 1 : 0.42;

    starsPrimary.material.opacity = baseStarOpacity.primary * performanceProfile.starOpacityScale;
    starsFar.material.opacity = baseStarOpacity.far * performanceProfile.starOpacityScale;
  }

  let mouseX = 0;
  let mouseY = 0;

  function onMouseMove(event) {
    mouseX = event.clientX - window.innerWidth / 2;
    mouseY = event.clientY - window.innerHeight / 2;
  }

  document.addEventListener("mousemove", onMouseMove, { passive: true });

  let sceneTime = 0;
  let lastRenderAt = 0;

  function animate(now = 0) {
    renderer.__rafId = requestAnimationFrame(animate);
    if (document.hidden) return;

    if (!lastRenderAt) lastRenderAt = now;
    const elapsedMs = now - lastRenderAt;
    if (elapsedMs < performanceProfile.frameIntervalMs) return;
    lastRenderAt = now;

    const deltaSeconds = Math.min(elapsedMs / 1000, 0.08);
    const frameScale = deltaSeconds * 60;
    const motion = performanceProfile.motionScale;
    sceneTime += deltaSeconds * motion;

    auroraUniforms.time.value = sceneTime;
    cityLightsUniforms.time.value = sceneTime;
    cloudUniforms.time.value = sceneTime;
    easeWeather(frameScale, now);

    if (!hkDebug) earthGroup.rotation.y += 0.0003 * motion * frameScale;
    starsPrimary.rotation.y += 0.0001 * motion * frameScale;
    starsFar.rotation.y -= 0.00005 * motion * frameScale;

    const targetX = mouseX * performanceProfile.pointerScale;
    const targetY = mouseY * performanceProfile.pointerScale;
    const blend = Math.min(0.22, performanceProfile.cameraBlend * frameScale);

    camera.position.x += (targetX - camera.position.x) * blend;
    camera.position.y += (60 - targetY - camera.position.y) * blend;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  window.addEventListener("resize", onResize, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (renderer.__rafId) cancelAnimationFrame(renderer.__rafId);
      renderer.__rafId = null;
      lastRenderAt = 0;
      return;
    }
    if (!renderer.__rafId) animate();
  });

  const themeObserver = new MutationObserver(applyThemeProfile);
  themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  applyThemeProfile();
  if (!document.hidden && !renderer.__rafId) animate();
})();
