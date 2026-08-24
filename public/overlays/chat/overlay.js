(() => {
  const chat = document.getElementById("chat");
  const stage = document.getElementById("stage");
  const disco = document.getElementById("disco");
  const dvd = document.getElementById("dvd");
  const dvdLogo = document.getElementById("dvd-logo");
  const spotlight = document.getElementById("spotlight");
  const spotlightCanvas = document.getElementById("spotlight-canvas");
  if (!chat || !stage) {
    return;
  }

  const previewSpotlight = /(?:^|[?&])preview=sbon(?:&|$)/.test(location.search);

  const settings = {
    maxMessages: 14,
    holdMs: 25_000,
    fadeOutMs: 600,
    chatVisible: true,
    spotlightEnabled: false,
    spotlightDarknessPct: 40,
    spotlightCount: 3,
    spotlightHoles: [
      { x: 418, y: 428, w: 610, h: 610, feather: 70, shape: "circle" },
      { x: 1502, y: 428, w: 610, h: 610, feather: 70, shape: "circle" },
      { x: 960, y: 858, w: 636, h: 636, feather: 70, shape: "circle" },
      { x: 960, y: 400, w: 440, h: 440, feather: 70, shape: "circle" },
      { x: 240, y: 860, w: 360, h: 360, feather: 70, shape: "circle" },
      { x: 1680, y: 860, w: 360, h: 360, feather: 70, shape: "circle" },
    ],
  };

  const timers = new Map();

  function wsUrl() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}/ws`;
  }

  function fitStage() {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `scale(${scale})`;
  }

  function applyLayout(overlay) {
    const root = document.documentElement;
    if (typeof overlay.fontFamily === "string" && overlay.fontFamily) {
      root.style.setProperty("--font", overlay.fontFamily);
    }
    if (typeof overlay.fontSizePx === "number") {
      root.style.setProperty("--font-size", `${overlay.fontSizePx}px`);
      root.style.setProperty("--emote-size", `${Math.round(overlay.fontSizePx * 1.6)}px`);
    }
    if (typeof overlay.posX === "number") {
      root.style.setProperty("--chat-x", `${overlay.posX}px`);
    }
    if (typeof overlay.posY === "number") {
      root.style.setProperty("--chat-y", `${overlay.posY}px`);
    }
    if (typeof overlay.boxWidth === "number") {
      root.style.setProperty("--chat-w", `${overlay.boxWidth}px`);
    }
    if (typeof overlay.boxHeight === "number") {
      root.style.setProperty("--chat-h", `${overlay.boxHeight}px`);
    }
  }

  function holeAxes(hole) {
    const width = Number(hole.w);
    const height = Number(hole.h);
    const radius = Number(hole.r);
    const w = Number.isFinite(width) ? width : Number.isFinite(radius) ? radius * 2 : 610;
    const h = Number.isFinite(height) ? height : Number.isFinite(radius) ? radius * 2 : 610;
    return {
      rx: Math.max(1, w / 2),
      ry: Math.max(1, h / 2),
    };
  }

  function punchEllipse(ctx, x, y, rx, ry, feather) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const inner = Math.min(1 - 1 / Math.max(rx, ry), Math.max(0, 1 - feather));
    const gradient = ctx.createRadialGradient(0, 0, inner, 0, 0, 1);
    gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function punchRect(ctx, x, y, rx, ry, feather) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const minPx = 1 / Math.max(1, Math.min(rx, ry));
    const inner = Math.min(1 - minPx, Math.max(0, 1 - feather));
    const band = 1 - inner;
    if (band <= minPx) {
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
      return;
    }
    const steps = 20;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const outerS = 1 - t0 * band;
      const innerS = 1 - t1 * band;
      ctx.fillStyle = `rgba(0, 0, 0, ${(t0 + t1) / 2})`;
      ctx.beginPath();
      ctx.rect(-outerS, -outerS, outerS * 2, outerS * 2);
      ctx.rect(-innerS, -innerS, innerS * 2, innerS * 2);
      ctx.fill("evenodd");
    }
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fillRect(-inner, -inner, inner * 2, inner * 2);
    ctx.restore();
  }

  function drawSpotlight() {
    if (!spotlightCanvas) {
      return;
    }
    const ctx = spotlightCanvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const dark = Math.max(0, Math.min(100, settings.spotlightDarknessPct)) / 100;
    const holes = (settings.spotlightHoles ?? []).slice(0, Math.max(0, settings.spotlightCount ?? 0));
    ctx.clearRect(0, 0, 1920, 1080);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0, 0, 0, ${dark})`;
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.globalCompositeOperation = "destination-out";
    for (const hole of holes) {
      const { rx, ry } = holeAxes(hole);
      const feather = Math.max(0, Math.min(100, hole.feather ?? 70)) / 100;
      if (hole.shape === "rect") {
        punchRect(ctx, hole.x, hole.y, rx, ry, feather);
      } else {
        punchEllipse(ctx, hole.x, hole.y, rx, ry, feather);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function syncSpotlight() {
    if (!spotlight) {
      return;
    }
    const visible = settings.spotlightEnabled && !isPartyLive();
    spotlight.hidden = !visible;
    if (visible) {
      drawSpotlight();
    }
  }

  function clearChat() {
    stopParty();
    chat.replaceChildren();
    for (const handle of timers.values()) {
      clearTimeout(handle);
    }
    timers.clear();
  }

  function applyOverlayConfig(overlay) {
    if (!overlay) {
      return;
    }
    applyLayout(overlay);
    if (typeof overlay.maxMessages === "number") {
      settings.maxMessages = overlay.maxMessages;
      capMessages();
    }
    if (typeof overlay.holdMs === "number") {
      settings.holdMs = overlay.holdMs;
    }
    if (typeof overlay.fadeOutMs === "number") {
      settings.fadeOutMs = overlay.fadeOutMs;
      document.documentElement.style.setProperty("--fade-ms", `${overlay.fadeOutMs}ms`);
    }
    if (typeof overlay.chatVisible === "boolean") {
      settings.chatVisible = overlay.chatVisible;
      document.body.classList.toggle("chat-hidden", !overlay.chatVisible);
      if (!overlay.chatVisible) {
        clearChat();
      }
    }
    if (typeof overlay.spotlightEnabled === "boolean") {
      settings.spotlightEnabled = overlay.spotlightEnabled;
    }
    if (typeof overlay.spotlightDarknessPct === "number") {
      settings.spotlightDarknessPct = overlay.spotlightDarknessPct;
    }
    if (typeof overlay.spotlightCount === "number") {
      settings.spotlightCount = overlay.spotlightCount;
    }
    if (Array.isArray(overlay.spotlightHoles)) {
      settings.spotlightHoles = overlay.spotlightHoles.map((hole) => ({ ...hole }));
    }
    if (previewSpotlight) {
      settings.spotlightEnabled = true;
    }
    syncSpotlight();
  }

  function removeMessage(id, animate) {
    const node = stage.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!node) {
      return;
    }
    const existing = timers.get(id);
    if (existing) {
      clearTimeout(existing);
      timers.delete(id);
    }
    if (!animate || settings.fadeOutMs <= 0) {
      node.remove();
      return;
    }
    void node.offsetWidth;
    node.classList.add("is-leaving");
    window.setTimeout(() => node.remove(), settings.fadeOutMs);
  }

  function capMessages() {
    const nodes = [...stage.querySelectorAll(".msg")];
    while (nodes.length > settings.maxMessages) {
      const oldest = nodes.shift();
      if (!oldest) {
        break;
      }
      const id = oldest.getAttribute("data-id");
      if (id) {
        removeMessage(id, true);
      } else {
        oldest.remove();
      }
    }
  }

  function scheduleHold(id) {
    const previous = timers.get(id);
    if (previous) {
      clearTimeout(previous);
    }
    if (settings.holdMs <= 0) {
      return;
    }
    const handle = window.setTimeout(() => removeMessage(id, true), settings.holdMs);
    timers.set(id, handle);
  }

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    return node;
  }

  function safeUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function renderEmote(fragment) {
    const wrap = el("span", fragment.extra?.length ? "emote-stack" : "");
    const img = el("img", "emote");
    img.alt = fragment.name;
    img.src = safeUrl(fragment.url);
    wrap.append(img);
    for (const extra of fragment.extra ?? []) {
      const overlay = el("img", "emote emote--zw");
      overlay.alt = extra.name;
      overlay.src = safeUrl(extra.url);
      wrap.append(overlay);
    }
    return wrap;
  }

  function renderFragments(target, fragments) {
    for (const fragment of fragments ?? []) {
      if (fragment.type === "text") {
        target.append(document.createTextNode(fragment.text));
        continue;
      }
      if (fragment.type === "mention") {
        const mention = el("span", "mention");
        mention.textContent = fragment.text;
        target.append(mention);
        continue;
      }
      if (fragment.type === "cheer") {
        const cheer = el("span", "cheer");
        cheer.textContent = fragment.text;
        target.append(cheer);
        continue;
      }
      if (fragment.type === "emote") {
        target.append(renderEmote(fragment));
      }
    }
  }

  function renderMessage(payload) {
    const node = el("article", payload.isRedemption ? "msg is-redemption" : "msg");
    node.dataset.id = payload.id;

    const tick = el("div", "msg__tick");
    const body = el("div", "msg__body");
    const meta = el("div", "msg__meta");

    if (payload.badges?.length) {
      const badges = el("span", "badges");
      for (const badge of payload.badges) {
        const img = el("img", "badge");
        img.alt = badge.title || badge.setId;
        img.src = safeUrl(badge.url);
        badges.append(img);
      }
      meta.append(badges);
    }

    const name = el("span", "msg__name");
    name.textContent = payload.user.displayName;
    if (payload.user.color) {
      name.style.setProperty("--name-color", payload.user.color);
    }
    meta.append(name);

    const text = el("div", "msg__text");
    renderFragments(text, payload.fragments);

    body.append(meta, text);
    node.append(tick, body);
    chat.append(node);
    if (isPartyLive()) {
      enlistParty(node);
    } else {
      scheduleHold(payload.id);
    }
    capMessages();
  }

  let partyUntil = 0;
  let partyTimer = 0;
  let partyTick = 0;
  let discoTick = 0;
  const partyAudio = new Audio("./party.wav");
  partyAudio.preload = "auto";

  function stopPartySound() {
    partyAudio.pause();
    partyAudio.currentTime = 0;
  }

  function playPartySound() {
    stopPartySound();
    const play = partyAudio.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        // OBS may block audio until the Browser Source is allowed to control/output sound
      });
    }
  }

  function spawnDiscoOrb() {
    if (!disco) {
      return;
    }
    const size = 90 + Math.round(Math.random() * 220);
    const orb = document.createElement("span");
    orb.className = "disco-orb";
    orb.style.width = `${size}px`;
    orb.style.height = `${size}px`;
    orb.style.left = `${Math.round(Math.random() * 1920 - size / 2)}px`;
    orb.style.top = `${Math.round(Math.random() * 1080 - size / 2)}px`;
    orb.style.background = `hsl(${Math.round(Math.random() * 360)} 95% 58%)`;
    disco.append(orb);
    window.setTimeout(() => orb.remove(), 950);
  }

  function stopDisco() {
    window.clearInterval(discoTick);
    discoTick = 0;
    disco?.replaceChildren();
  }

  function startDisco() {
    stopDisco();
    spawnDiscoOrb();
    discoTick = window.setInterval(spawnDiscoOrb, 160);
  }

  function isPartyLive() {
    return Date.now() < partyUntil;
  }

  function scatterNode(node) {
    const x = Math.round(Math.random() * 1680);
    const y = Math.round(Math.random() * 960);
    const rot = Math.round(Math.random() * 360 - 180);
    const scale = 0.55 + Math.random() * 1.25;
    const hue = Math.round(Math.random() * 360);
    const color = `hsl(${hue} 95% 62%)`;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.transform = `rotate(${rot}deg) scale(${scale})`;
    node.style.setProperty("--party-color", color);
    node.style.filter = `hue-rotate(${hue}deg) saturate(2.2) drop-shadow(0 0 12px ${color})`;
  }

  function enlistParty(node) {
    const id = node.getAttribute("data-id");
    const existing = id ? timers.get(id) : null;
    if (existing) {
      clearTimeout(existing);
      timers.delete(id);
    }
    node.classList.add("is-partying");
    stage.append(node);
    scatterNode(node);
  }

  function scatterParty() {
    for (const node of stage.querySelectorAll(".msg.is-partying")) {
      scatterNode(node);
    }
  }

  function stopParty() {
    window.clearInterval(partyTick);
    window.clearTimeout(partyTimer);
    partyTick = 0;
    partyTimer = 0;
    partyUntil = 0;
    stopPartySound();
    stopDisco();
    const flying = [...stage.querySelectorAll(".msg.is-partying")];
    for (const node of flying) {
      node.classList.remove("is-partying");
      node.style.left = "";
      node.style.top = "";
      node.style.transform = "";
      node.style.filter = "";
      node.style.color = "";
      node.style.removeProperty("--party-color");
      chat.append(node);
    }
    for (const node of [...chat.children]) {
      const id = node.getAttribute("data-id");
      if (id) {
        scheduleHold(id);
      }
    }
    syncSpotlight();
  }

  function startParty(durationMs) {
    partyUntil = Date.now() + durationMs;
    window.clearInterval(partyTick);
    window.clearTimeout(partyTimer);
    partyTick = 0;
    partyTimer = 0;
    stopPartySound();
    stopDisco();
    const flying = [...stage.querySelectorAll(".msg.is-partying")];
    for (const node of flying) {
      node.classList.remove("is-partying");
      node.style.left = "";
      node.style.top = "";
      node.style.transform = "";
      node.style.filter = "";
      node.style.color = "";
      node.style.removeProperty("--party-color");
      chat.append(node);
    }
    syncSpotlight();
    for (const node of [...chat.querySelectorAll(".msg")]) {
      enlistParty(node);
    }
    scatterParty();
    playPartySound();
    startDisco();
    partyTick = window.setInterval(scatterParty, 140);
    partyTimer = window.setTimeout(() => stopParty(), durationMs);
  }

  const STAGE_W = 1920;
  const STAGE_H = 1080;
  const DVD_W = 280;
  const DVD_H = 126;
  const DVD_SPEED = 210;
  const DVD_COLORS = ["#ff2d55", "#ffd60a", "#32d74b", "#64d2ff", "#bf5af2", "#ff9f0a", "#ffffff"];

  let dvdRaf = 0;
  let dvdTimer = 0;
  let dvdLastTs = 0;
  let dvdX = 0;
  let dvdY = 0;
  let dvdVx = DVD_SPEED;
  let dvdVy = DVD_SPEED;
  let dvdColor = 0;
  let dvdCornerTimer = 0;

  function setDvdColor(index) {
    dvdColor = index % DVD_COLORS.length;
    dvdLogo?.style.setProperty("--dvd-color", DVD_COLORS[dvdColor]);
  }

  function placeDvd() {
    dvdLogo?.style.setProperty("--dvd-x", `${dvdX}px`);
    dvdLogo?.style.setProperty("--dvd-y", `${dvdY}px`);
  }

  function stopDvd() {
    if (dvdRaf) {
      window.cancelAnimationFrame(dvdRaf);
      dvdRaf = 0;
    }
    window.clearTimeout(dvdTimer);
    window.clearTimeout(dvdCornerTimer);
    dvdTimer = 0;
    dvdCornerTimer = 0;
    dvdLastTs = 0;
    dvdLogo?.classList.remove("is-corner");
    if (dvd) {
      dvd.hidden = true;
    }
  }

  function bounceDvdColor() {
    setDvdColor(dvdColor + 1);
  }

  function hitDvdCorner() {
    if (!dvdLogo) {
      return;
    }
    dvdLogo.classList.add("is-corner");
    window.clearTimeout(dvdCornerTimer);
    dvdCornerTimer = window.setTimeout(() => {
      dvdLogo.classList.remove("is-corner");
    }, 220);
  }

  function tickDvd(ts) {
    if (!dvdLastTs) {
      dvdLastTs = ts;
    }
    const dt = Math.min(0.05, (ts - dvdLastTs) / 1000);
    dvdLastTs = ts;
    dvdX += dvdVx * dt;
    dvdY += dvdVy * dt;

    const maxX = STAGE_W - DVD_W;
    const maxY = STAGE_H - DVD_H;
    let hitX = false;
    let hitY = false;
    if (dvdX <= 0) {
      dvdX = 0;
      dvdVx = Math.abs(dvdVx);
      hitX = true;
    } else if (dvdX >= maxX) {
      dvdX = maxX;
      dvdVx = -Math.abs(dvdVx);
      hitX = true;
    }
    if (dvdY <= 0) {
      dvdY = 0;
      dvdVy = Math.abs(dvdVy);
      hitY = true;
    } else if (dvdY >= maxY) {
      dvdY = maxY;
      dvdVy = -Math.abs(dvdVy);
      hitY = true;
    }
    if (hitX || hitY) {
      bounceDvdColor();
    }
    if (hitX && hitY) {
      hitDvdCorner();
    }
    placeDvd();
    dvdRaf = window.requestAnimationFrame(tickDvd);
  }

  function startDvd(durationMs) {
    stopDvd();
    if (!dvd || !dvdLogo) {
      return;
    }
    dvd.hidden = false;
    dvdX = Math.random() * (STAGE_W - DVD_W);
    dvdY = Math.random() * (STAGE_H - DVD_H);
    dvdVx = DVD_SPEED * (Math.random() < 0.5 ? 1 : -1);
    dvdVy = DVD_SPEED * (Math.random() < 0.5 ? 1 : -1);
    setDvdColor(Math.floor(Math.random() * DVD_COLORS.length));
    placeDvd();
    dvdRaf = window.requestAnimationFrame(tickDvd);
    dvdTimer = window.setTimeout(() => stopDvd(), durationMs);
  }

  function handleEvent(event) {
    if (event.type === "hello") {
      applyOverlayConfig(event.payload?.overlay);
      return;
    }
    if (event.type === "overlay.settings") {
      applyOverlayConfig(event.payload);
      return;
    }
    if (event.type === "overlay.party") {
      startParty(event.payload?.durationMs ?? 10_000);
      return;
    }
    if (event.type === "overlay.dvd") {
      startDvd(event.payload?.durationMs ?? 60_000);
      return;
    }
    if (event.type === "chat.message") {
      if (settings.chatVisible) {
        renderMessage(event.payload);
      }
      return;
    }
    if (event.type === "chat.message.delete") {
      removeMessage(event.payload.id, true);
      return;
    }
    if (event.type === "chat.clear") {
      clearChat();
    }
  }

  function connect() {
    let delay = 500;
    const open = () => {
      const socket = new WebSocket(wsUrl());
      socket.addEventListener("open", () => {
        delay = 500;
      });
      socket.addEventListener("message", (message) => {
        try {
          handleEvent(JSON.parse(message.data));
        } catch {
          // ignore malformed frames
        }
      });
      socket.addEventListener("close", () => {
        window.setTimeout(open, delay);
        delay = Math.min(delay * 2, 10_000);
      });
      socket.addEventListener("error", () => {
        socket.close();
      });
    };
    open();
  }

  connect();
  fitStage();
  window.addEventListener("resize", fitStage);
  if (/(?:^|[?&])preview=dvd(?:&|$)/.test(location.search)) {
    startDvd(60_000);
  }
  if (/(?:^|[?&])preview=sbon(?:&|$)/.test(location.search)) {
    settings.spotlightEnabled = true;
    syncSpotlight();
  }
})();
