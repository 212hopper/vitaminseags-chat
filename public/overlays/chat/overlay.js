(() => {
  const chat = document.getElementById("chat");
  const stage = document.getElementById("stage");
  const disco = document.getElementById("disco");
  if (!chat || !stage) {
    return;
  }

  const settings = {
    maxMessages: 14,
    holdMs: 25_000,
    fadeOutMs: 600,
    chatVisible: true,
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
  }

  function startParty(durationMs) {
    stopParty();
    partyUntil = Date.now() + durationMs;
    for (const node of [...chat.querySelectorAll(".msg")]) {
      enlistParty(node);
    }
    scatterParty();
    playPartySound();
    startDisco();
    partyTick = window.setInterval(scatterParty, 140);
    partyTimer = window.setTimeout(() => stopParty(), durationMs);
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
})();
