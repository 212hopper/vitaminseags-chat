(() => {
  const liveState = document.getElementById("live-state");
  const uptime = document.getElementById("uptime");
  const viewers = document.getElementById("viewers");
  const chatState = document.getElementById("chat-state");
  const flash = document.getElementById("flash");
  const chatLog = document.getElementById("chat-log");
  const activityLog = document.getElementById("activity-log");
  const player = document.getElementById("twitch-player");
  const playerChannelLabel = document.getElementById("player-channel");

  let startedAt = null;
  let playerChannel = "";

  function setText(node, value) {
    if (node) {
      node.textContent = value;
    }
  }

  function formatClock(ts) {
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    return [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }

  function twitchParents() {
    const host = location.hostname;
    const parents = new Set([host]);
    if (host === "localhost" || host === "127.0.0.1") {
      parents.add("localhost");
      parents.add("127.0.0.1");
    }
    return [...parents];
  }

  function mountPlayer(channel) {
    if (!player || !channel || channel === playerChannel) {
      return;
    }
    playerChannel = channel;
    setText(playerChannelLabel, `#${channel}`);
    const params = new URLSearchParams({
      channel,
      muted: "true",
      autoplay: "true",
    });
    for (const parent of twitchParents()) {
      params.append("parent", parent);
    }
    player.src = `https://player.twitch.tv/?${params.toString()}`;
  }

  function formatUptime(iso) {
    const start = new Date(iso).getTime();
    if (!Number.isFinite(start)) {
      return "—";
    }
    const total = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function renderStream(stream) {
    const live = Boolean(stream?.live);
    liveState.classList.toggle("is-live", live);
    liveState.classList.toggle("is-offline", !live);
    setText(liveState, live ? "Live" : "Offline");
    startedAt = live ? stream.startedAt : null;
    setText(viewers, live ? String(stream.viewerCount ?? 0) : "—");
    setText(uptime, live && startedAt ? formatUptime(startedAt) : "—");
  }

  async function readJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }
    return body;
  }

  function capFeed(node) {
    while (node.children.length > 200) {
      node.firstElementChild?.remove();
    }
  }

  function addChatLine(payload, ts) {
    if (!chatLog || !payload) {
      return;
    }
    const existing = chatLog.querySelector(`[data-id="${CSS.escape(payload.id)}"]`);
    if (existing) {
      return;
    }
    const row = document.createElement("div");
    row.className = "feed__item";
    row.dataset.id = payload.id;
    const time = document.createElement("span");
    time.className = "feed__time";
    time.textContent = formatClock(ts ?? Date.now());
    const name = document.createElement("strong");
    name.textContent = payload.user?.displayName ?? payload.user?.name ?? "Unknown";
    if (payload.user?.color) {
      name.style.color = payload.user.color;
    }
    const text = document.createElement("span");
    text.textContent = ` ${payload.text ?? ""}`;
    row.append(time, name, text);
    chatLog.append(row);
    capFeed(chatLog);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function removeChatLine(id) {
    chatLog?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
  }

  function addActivity(payload) {
    if (!activityLog || !payload) {
      return;
    }
    const row = document.createElement("div");
    row.className = "feed__item";
    const kind = document.createElement("span");
    kind.className = "feed__kind";
    kind.textContent = payload.kind ?? "event";
    const text = document.createElement("span");
    text.textContent = payload.text ?? "";
    row.append(kind, text);
    activityLog.append(row);
    capFeed(activityLog);
    activityLog.scrollTop = activityLog.scrollHeight;
  }

  function handleEvent(event) {
    if (event.type === "hello") {
      for (const entry of event.payload?.recentChat ?? []) {
        addChatLine(entry.payload ?? entry, entry.ts);
      }
      for (const entry of event.payload?.recentActivity ?? []) {
        addActivity(entry);
      }
      return;
    }
    if (event.type === "chat.message") {
      addChatLine(event.payload, event.ts);
      return;
    }
    if (event.type === "chat.message.delete") {
      removeChatLine(event.payload.id);
      return;
    }
    if (event.type === "channel.activity") {
      addActivity(event.payload);
    }
  }

  function connectFeed() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    let delay = 500;
    const open = () => {
      const socket = new WebSocket(`${protocol}://${location.host}/ws`);
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

  async function refreshStatus() {
    try {
      const status = await readJson("/api/status");
      renderStream(status.stream);
      mountPlayer(status.broadcaster?.login);
    } catch {
      setText(liveState, "Unreachable");
    }
  }

  async function refreshSettings() {
    try {
      const overlay = await readJson("/api/settings");
      setText(chatState, overlay.chatVisible ? "Chat is visible" : "Chat is hidden");
    } catch {
      setText(chatState, "Could not load overlay state.");
    }
  }

  async function patchSettings(partial, message) {
    flash.classList.remove("is-error");
    const overlay = await readJson("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partial),
    });
    setText(chatState, overlay.chatVisible ? "Chat is visible" : "Chat is hidden");
    setText(flash, message);
    return overlay;
  }

  document.getElementById("show-chat")?.addEventListener("click", () => {
    void patchSettings({ chatVisible: true }, "Chat shown on overlay.").catch((error) => {
      flash.classList.add("is-error");
      setText(flash, error.message);
    });
  });

  document.getElementById("hide-chat")?.addEventListener("click", () => {
    void patchSettings({ chatVisible: false }, "Chat hidden on overlay.").catch((error) => {
      flash.classList.add("is-error");
      setText(flash, error.message);
    });
  });

  void refreshStatus();
  void refreshSettings();
  connectFeed();
  window.setInterval(() => {
    void refreshStatus();
  }, 2000);
  window.setInterval(() => {
    void refreshSettings();
  }, 4000);
  window.setInterval(() => {
    if (startedAt) {
      setText(uptime, formatUptime(startedAt));
    }
  }, 1000);
})();
