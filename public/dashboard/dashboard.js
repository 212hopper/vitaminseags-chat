(() => {
  const liveState = document.getElementById("live-state");
  const uptime = document.getElementById("uptime");
  const viewers = document.getElementById("viewers");
  const chatState = document.getElementById("chat-state");
  const holdSeconds = document.getElementById("hold-seconds");
  const fadeMs = document.getElementById("fade-ms");
  const maxMessages = document.getElementById("max-messages");
  const hideCommands = document.getElementById("hide-commands");
  const settingsFlash = document.getElementById("settings-flash");
  const form = document.getElementById("settings-form");
  const layoutForm = document.getElementById("layout-form");
  const layoutFlash = document.getElementById("layout-flash");
  const fontPreset = document.getElementById("font-preset");
  const fontCustom = document.getElementById("font-custom");
  const fontCustomWrap = document.getElementById("font-custom-wrap");
  const fontSize = document.getElementById("font-size");
  const posX = document.getElementById("pos-x");
  const posY = document.getElementById("pos-y");
  const boxWidth = document.getElementById("box-width");
  const boxHeight = document.getElementById("box-height");
  const canvasChat = document.getElementById("canvas-chat");

  let startedAt = null;
  let formDirty = false;
  let layoutDirty = false;

  function setText(node, value) {
    if (node) {
      node.textContent = value;
    }
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

  function currentFontFamily() {
    if (fontPreset.value === "custom") {
      return fontCustom.value.trim();
    }
    return fontPreset.value;
  }

  function setFontPreset(family) {
    const match = [...fontPreset.options].find((option) => option.value === family);
    if (match && match.value !== "custom") {
      fontPreset.value = family;
      fontCustomWrap.hidden = true;
      return;
    }
    fontPreset.value = "custom";
    fontCustom.value = family ?? "";
    fontCustomWrap.hidden = false;
  }

  function updatePreview() {
    if (!canvasChat) {
      return;
    }
    canvasChat.style.left = `${(Number(posX.value) / 1920) * 100}%`;
    canvasChat.style.top = `${(Number(posY.value) / 1080) * 100}%`;
    canvasChat.style.width = `${(Number(boxWidth.value) / 1920) * 100}%`;
    canvasChat.style.height = `${(Number(boxHeight.value) / 1080) * 100}%`;
  }

  function fillSettings(overlay) {
    if (!formDirty) {
      holdSeconds.value = String(Math.round((overlay.holdMs ?? 0) / 1000));
      fadeMs.value = String(overlay.fadeOutMs ?? 0);
      maxMessages.value = String(overlay.maxMessages ?? 14);
      hideCommands.checked = Boolean(overlay.hideCommands);
    }
    setText(chatState, overlay.chatVisible ? "Chat is visible" : "Chat is hidden");
    if (!layoutDirty) {
      setFontPreset(overlay.fontFamily ?? fontPreset.value);
      fontSize.value = String(overlay.fontSizePx ?? 17);
      posX.value = String(overlay.posX ?? 16);
      posY.value = String(overlay.posY ?? 200);
      boxWidth.value = String(overlay.boxWidth ?? 420);
      boxHeight.value = String(overlay.boxHeight ?? 860);
      updatePreview();
    }
  }

  async function readJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }
    return body;
  }

  async function refreshStatus() {
    try {
      const status = await readJson("/api/status");
      renderStream(status.stream);
    } catch {
      setText(liveState, "Unreachable");
    }
  }

  async function refreshSettings() {
    try {
      fillSettings(await readJson("/api/settings"));
    } catch {
      setText(settingsFlash, "Could not load overlay settings.");
      settingsFlash.classList.add("is-error");
    }
  }

  async function patchSettings(partial, reset) {
    settingsFlash.classList.remove("is-error");
    const overlay = await readJson("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (reset === "timers") {
      formDirty = false;
    } else if (reset === "layout") {
      layoutDirty = false;
    }
    fillSettings(overlay);
    return overlay;
  }

  document.getElementById("show-chat")?.addEventListener("click", () => {
    void patchSettings({ chatVisible: true }).then(() => {
      setText(settingsFlash, "Chat shown on overlay.");
    });
  });

  document.getElementById("hide-chat")?.addEventListener("click", () => {
    void patchSettings({ chatVisible: false }).then(() => {
      setText(settingsFlash, "Chat hidden on overlay.");
    });
  });

  for (const input of [holdSeconds, fadeMs, maxMessages, hideCommands]) {
    input?.addEventListener("input", () => {
      formDirty = true;
    });
    input?.addEventListener("change", () => {
      formDirty = true;
    });
  }

  for (const input of [fontPreset, fontCustom, fontSize, posX, posY, boxWidth, boxHeight]) {
    input?.addEventListener("input", () => {
      layoutDirty = true;
      updatePreview();
    });
    input?.addEventListener("change", () => {
      layoutDirty = true;
      if (input === fontPreset) {
        fontCustomWrap.hidden = fontPreset.value !== "custom";
      }
      updatePreview();
    });
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void patchSettings({
      holdMs: Math.round(Number(holdSeconds.value) * 1000),
      fadeOutMs: Math.round(Number(fadeMs.value)),
      maxMessages: Math.round(Number(maxMessages.value)),
      hideCommands: hideCommands.checked,
    }, "timers")
      .then(() => {
        setText(settingsFlash, "Settings saved.");
      })
      .catch((error) => {
        settingsFlash.classList.add("is-error");
        setText(settingsFlash, error.message || "Could not save settings.");
      });
  });

  layoutForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void patchSettings({
      fontFamily: currentFontFamily(),
      fontSizePx: Math.round(Number(fontSize.value)),
      posX: Math.round(Number(posX.value)),
      posY: Math.round(Number(posY.value)),
      boxWidth: Math.round(Number(boxWidth.value)),
      boxHeight: Math.round(Number(boxHeight.value)),
    }, "layout")
      .then(() => {
        layoutFlash.classList.remove("is-error");
        setText(layoutFlash, "Layout saved.");
      })
      .catch((error) => {
        layoutFlash.classList.add("is-error");
        setText(layoutFlash, error.message || "Could not save layout.");
      });
  });

  void refreshStatus();
  void refreshSettings();
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
