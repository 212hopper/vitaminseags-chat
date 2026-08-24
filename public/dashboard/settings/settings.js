(() => {
  const CANVAS_W = 1920;
  const CANVAS_H = 1080;
  const MAX_HOLES = 6;
  const DEFAULT_HOLES = [
    { x: 418, y: 428, w: 610, h: 610, feather: 70, shape: "circle" },
    { x: 1502, y: 428, w: 610, h: 610, feather: 70, shape: "circle" },
    { x: 960, y: 858, w: 636, h: 636, feather: 70, shape: "circle" },
    { x: 960, y: 400, w: 440, h: 440, feather: 70, shape: "circle" },
    { x: 240, y: 860, w: 360, h: 360, feather: 70, shape: "circle" },
    { x: 1680, y: 860, w: 360, h: 360, feather: 70, shape: "circle" },
  ];

  const holdSeconds = document.getElementById("hold-seconds");
  const fadeMs = document.getElementById("fade-ms");
  const maxMessages = document.getElementById("max-messages");
  const hideCommands = document.getElementById("hide-commands");
  const settingsFlash = document.getElementById("settings-flash");
  const form = document.getElementById("settings-form");
  const lookForm = document.getElementById("look-form");
  const lookFlash = document.getElementById("look-flash");
  const fontPreset = document.getElementById("font-preset");
  const fontCustom = document.getElementById("font-custom");
  const fontCustomWrap = document.getElementById("font-custom-wrap");
  const fontSize = document.getElementById("font-size");
  const posX = document.getElementById("pos-x");
  const posY = document.getElementById("pos-y");
  const boxWidth = document.getElementById("box-width");
  const boxHeight = document.getElementById("box-height");
  const spotlightCount = document.getElementById("spotlight-count");
  const spotlightDarkness = document.getElementById("spotlight-darkness");
  const spotlightRows = document.getElementById("spotlight-rows");
  const canvasPreview = document.getElementById("canvas-preview");
  const canvasSpots = document.getElementById("canvas-spots");
  const canvasChat = document.getElementById("canvas-chat");
  const presetForm = document.getElementById("preset-form");
  const presetName = document.getElementById("preset-name");
  const presetRows = document.getElementById("preset-rows");
  const presetFlash = document.getElementById("preset-flash");

  let formDirty = false;
  let lookDirty = false;
  let holes = DEFAULT_HOLES.map((hole) => ({ ...hole }));
  let selectedHole = 0;
  let presets = [];
  let drag = null;

  function setText(node, value) {
    if (node) {
      node.textContent = value;
    }
  }

  function setFlash(node, message, isError) {
    node.classList.toggle("is-error", Boolean(isError));
    setText(node, message);
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

  function normalizeHole(hole, fallback) {
    const radius = Number(hole?.r);
    const width = Number(hole?.w);
    const height = Number(hole?.h);
    return {
      x: hole?.x ?? fallback.x,
      y: hole?.y ?? fallback.y,
      w: Number.isFinite(width) ? width : Number.isFinite(radius) ? radius * 2 : fallback.w,
      h: Number.isFinite(height) ? height : Number.isFinite(radius) ? radius * 2 : fallback.h,
      feather: hole?.feather ?? fallback.feather,
      shape: hole?.shape === "rect" ? "rect" : "circle",
    };
  }

  function currentCount() {
    const value = Math.round(Number(spotlightCount.value));
    if (!Number.isFinite(value)) {
      return 3;
    }
    return Math.min(MAX_HOLES, Math.max(0, value));
  }

  function readLook() {
    return {
      fontFamily: currentFontFamily(),
      fontSizePx: Math.round(Number(fontSize.value)),
      posX: Math.round(Number(posX.value)),
      posY: Math.round(Number(posY.value)),
      boxWidth: Math.round(Number(boxWidth.value)),
      boxHeight: Math.round(Number(boxHeight.value)),
      spotlightDarknessPct: Math.round(Number(spotlightDarkness.value)),
      spotlightCount: currentCount(),
      spotlightHoles: holes.map((hole, index) => normalizeHole(hole, DEFAULT_HOLES[index])),
    };
  }

  function updatePreview() {
    if (canvasChat) {
      canvasChat.style.left = `${(Number(posX.value) / CANVAS_W) * 100}%`;
      canvasChat.style.top = `${(Number(posY.value) / CANVAS_H) * 100}%`;
      canvasChat.style.width = `${(Number(boxWidth.value) / CANVAS_W) * 100}%`;
      canvasChat.style.height = `${(Number(boxHeight.value) / CANVAS_H) * 100}%`;
    }
    if (!canvasSpots) {
      return;
    }
    const count = currentCount();
    canvasSpots.replaceChildren();
    for (let i = 0; i < count; i += 1) {
      const hole = holes[i];
      if (!hole) {
        continue;
      }
      const spot = document.createElement("div");
      const isRect = hole.shape === "rect";
      spot.className = [
        "canvas-spot",
        isRect ? "is-rect" : "",
        i === selectedHole ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      spot.dataset.index = String(i);
      const rx = hole.w / 2;
      const ry = hole.h / 2;
      spot.style.left = `${((hole.x - rx) / CANVAS_W) * 100}%`;
      spot.style.top = `${((hole.y - ry) / CANVAS_H) * 100}%`;
      spot.style.width = `${(hole.w / CANVAS_W) * 100}%`;
      spot.style.height = `${(hole.h / CANVAS_H) * 100}%`;
      const core = Math.max(0, 100 - (hole.feather ?? 70));
      const edge =
        i === selectedHole
          ? "color-mix(in srgb, var(--accent) 22%, transparent)"
          : "rgb(255 80 80 / 18%)";
      if (isRect) {
        const inset = Math.max(2, Math.min(46, (hole.feather ?? 70) / 2));
        spot.style.background = `${edge}`;
        spot.style.boxShadow = `inset 0 0 ${inset}px ${edge}`;
      } else {
        spot.style.background = `radial-gradient(ellipse, transparent ${core}%, ${edge} 100%)`;
      }
      canvasSpots.append(spot);
    }
  }

  function renderHoleRows() {
    if (!spotlightRows) {
      return;
    }
    const count = currentCount();
    spotlightRows.replaceChildren();
    if (!count) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.className = "muted";
      td.textContent = "No shapes — !sbon will dim the whole 1920×1080 canvas.";
      tr.append(td);
      spotlightRows.append(tr);
      updatePreview();
      return;
    }
    for (let i = 0; i < count; i += 1) {
      const hole = normalizeHole(holes[i] ?? DEFAULT_HOLES[i], DEFAULT_HOLES[i]);
      const tr = document.createElement("tr");
      if (i === selectedHole) {
        tr.className = "is-selected";
      }
      tr.addEventListener("click", () => {
        selectedHole = i;
        renderHoleRows();
      });

      const label = document.createElement("td");
      label.textContent = String(i + 1);

      function numberCell(value, onChange, bounds) {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.value = String(value);
        if (bounds) {
          input.min = String(bounds.min);
          input.max = String(bounds.max);
        }
        input.addEventListener("click", (event) => event.stopPropagation());
        input.addEventListener("input", () => {
          lookDirty = true;
          onChange(Math.round(Number(input.value)));
          updatePreview();
        });
        td.append(input);
        return td;
      }

      function shapeCell(value) {
        const td = document.createElement("td");
        const select = document.createElement("select");
        select.append(new Option("Circle", "circle"), new Option("Rectangle", "rect"));
        select.value = value === "rect" ? "rect" : "circle";
        select.addEventListener("click", (event) => event.stopPropagation());
        select.addEventListener("change", () => {
          lookDirty = true;
          holes[i] = { ...holes[i], shape: select.value === "rect" ? "rect" : "circle" };
          updatePreview();
        });
        td.append(select);
        return td;
      }

      tr.append(
        label,
        shapeCell(hole.shape),
        numberCell(hole.x, (x) => {
          holes[i] = { ...holes[i], x };
        }),
        numberCell(hole.y, (y) => {
          holes[i] = { ...holes[i], y };
        }),
        numberCell(
          hole.w,
          (w) => {
            holes[i] = { ...holes[i], w: Math.min(1920, Math.max(80, w)) };
          },
          { min: 80, max: 1920 },
        ),
        numberCell(
          hole.h,
          (h) => {
            holes[i] = { ...holes[i], h: Math.min(1080, Math.max(80, h)) };
          },
          { min: 80, max: 1080 },
        ),
        numberCell(
          hole.feather ?? 70,
          (feather) => {
            holes[i] = { ...holes[i], feather: Math.min(100, Math.max(0, feather)) };
          },
          { min: 0, max: 100 },
        ),
      );
      spotlightRows.append(tr);
    }
    updatePreview();
  }

  function renderPresets() {
    if (!presetRows) {
      return;
    }
    presetRows.replaceChildren();
    if (!presets.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.className = "muted";
      td.textContent = "No presets yet.";
      tr.append(td);
      presetRows.append(tr);
      return;
    }
    for (const preset of presets) {
      const tr = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = preset.name;
      const spots = document.createElement("td");
      spots.textContent = String(preset.spotlightCount ?? 0);
      const actions = document.createElement("td");
      actions.className = "actions";

      const apply = document.createElement("button");
      apply.type = "button";
      apply.textContent = "Apply";
      apply.addEventListener("click", () => {
        void patchSettings(
          {
            fontFamily: preset.fontFamily,
            fontSizePx: preset.fontSizePx,
            posX: preset.posX,
            posY: preset.posY,
            boxWidth: preset.boxWidth,
            boxHeight: preset.boxHeight,
            spotlightDarknessPct: preset.spotlightDarknessPct,
            spotlightCount: preset.spotlightCount,
            spotlightHoles: preset.spotlightHoles,
          },
          "look",
        )
          .then(() => setFlash(presetFlash, `Applied “${preset.name}”.`, false))
          .catch((error) => setFlash(presetFlash, error.message, true));
      });

      const overwrite = document.createElement("button");
      overwrite.type = "button";
      overwrite.className = "secondary";
      overwrite.textContent = "Overwrite";
      overwrite.addEventListener("click", () => {
        const look = readLook();
        const next = presets.map((item) => (item.id === preset.id ? { ...item, name: item.name, ...look } : item));
        void patchSettings({ ...look, layoutPresets: next }, "look")
          .then(() => setFlash(presetFlash, `Updated “${preset.name}”.`, false))
          .catch((error) => setFlash(presetFlash, error.message, true));
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        const next = presets.filter((item) => item.id !== preset.id);
        void patchSettings({ layoutPresets: next }, "presets")
          .then(() => setFlash(presetFlash, `Removed “${preset.name}”.`, false))
          .catch((error) => setFlash(presetFlash, error.message, true));
      });

      actions.append(apply, overwrite, remove);
      tr.append(name, spots, actions);
      presetRows.append(tr);
    }
  }

  function fillSettings(overlay) {
    presets = Array.isArray(overlay.layoutPresets) ? overlay.layoutPresets : [];
    if (!formDirty) {
      holdSeconds.value = String(Math.round((overlay.holdMs ?? 0) / 1000));
      fadeMs.value = String(overlay.fadeOutMs ?? 0);
      maxMessages.value = String(overlay.maxMessages ?? 14);
      hideCommands.checked = Boolean(overlay.hideCommands);
    }
    if (!lookDirty) {
      setFontPreset(overlay.fontFamily ?? fontPreset.value);
      fontSize.value = String(overlay.fontSizePx ?? 17);
      posX.value = String(overlay.posX ?? 16);
      posY.value = String(overlay.posY ?? 200);
      boxWidth.value = String(overlay.boxWidth ?? 420);
      boxHeight.value = String(overlay.boxHeight ?? 860);
      spotlightDarkness.value = String(overlay.spotlightDarknessPct ?? 40);
      spotlightCount.value = String(overlay.spotlightCount ?? 3);
      holes = DEFAULT_HOLES.map((fallback, index) =>
        normalizeHole(overlay.spotlightHoles?.[index], fallback),
      );
      if (selectedHole >= currentCount()) {
        selectedHole = 0;
      }
      renderHoleRows();
    }
    renderPresets();
  }

  async function readJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }
    return body;
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
    } else if (reset === "look") {
      lookDirty = false;
    }
    fillSettings(overlay);
    return overlay;
  }

  function previewPoint(event) {
    const rect = canvasPreview.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * CANVAS_W),
      y: Math.round(((event.clientY - rect.top) / rect.height) * CANVAS_H),
    };
  }

  function holeAt(point) {
    const count = currentCount();
    for (let i = count - 1; i >= 0; i -= 1) {
      const hole = holes[i];
      if (!hole) {
        continue;
      }
      const dx = point.x - hole.x;
      const dy = point.y - hole.y;
      const rx = Math.max(1, hole.w / 2);
      const ry = Math.max(1, hole.h / 2);
      const hit =
        hole.shape === "rect"
          ? Math.abs(dx) <= rx && Math.abs(dy) <= ry
          : (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
      if (hit) {
        return i;
      }
    }
    return -1;
  }

  canvasPreview?.addEventListener("pointerdown", (event) => {
    const point = previewPoint(event);
    if (!point || !currentCount()) {
      return;
    }
    const hit = holeAt(point);
    selectedHole = hit >= 0 ? hit : selectedHole;
    const hole = holes[selectedHole];
    if (!hole) {
      return;
    }
    lookDirty = true;
    drag = {
      index: selectedHole,
      offsetX: point.x - hole.x,
      offsetY: point.y - hole.y,
    };
    canvasPreview.setPointerCapture?.(event.pointerId);
    renderHoleRows();
    event.preventDefault();
  });

  canvasPreview?.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }
    const point = previewPoint(event);
    if (!point) {
      return;
    }
    holes[drag.index] = {
      ...holes[drag.index],
      x: Math.min(CANVAS_W, Math.max(0, point.x - drag.offsetX)),
      y: Math.min(CANVAS_H, Math.max(0, point.y - drag.offsetY)),
    };
    updatePreview();
  });

  function endDrag() {
    if (drag) {
      drag = null;
      renderHoleRows();
    }
  }

  canvasPreview?.addEventListener("pointerup", endDrag);
  canvasPreview?.addEventListener("pointercancel", endDrag);

  for (const input of [holdSeconds, fadeMs, maxMessages, hideCommands]) {
    input?.addEventListener("input", () => {
      formDirty = true;
    });
    input?.addEventListener("change", () => {
      formDirty = true;
    });
  }

  for (const input of [fontPreset, fontCustom, fontSize, posX, posY, boxWidth, boxHeight, spotlightDarkness]) {
    input?.addEventListener("input", () => {
      lookDirty = true;
      updatePreview();
    });
    input?.addEventListener("change", () => {
      lookDirty = true;
      if (input === fontPreset) {
        fontCustomWrap.hidden = fontPreset.value !== "custom";
      }
      updatePreview();
    });
  }

  spotlightCount?.addEventListener("change", () => {
    lookDirty = true;
    if (selectedHole >= currentCount()) {
      selectedHole = Math.max(0, currentCount() - 1);
    }
    renderHoleRows();
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void patchSettings(
      {
        holdMs: Math.round(Number(holdSeconds.value) * 1000),
        fadeOutMs: Math.round(Number(fadeMs.value)),
        maxMessages: Math.round(Number(maxMessages.value)),
        hideCommands: hideCommands.checked,
      },
      "timers",
    )
      .then(() => {
        setFlash(settingsFlash, "Settings saved.", false);
      })
      .catch((error) => {
        setFlash(settingsFlash, error.message || "Could not save settings.", true);
      });
  });

  lookForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void patchSettings(readLook(), "look")
      .then(() => setFlash(lookFlash, "Look saved.", false))
      .catch((error) => setFlash(lookFlash, error.message || "Could not save look.", true));
  });

  presetForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const look = readLook();
    const name = presetName.value.trim();
    if (!name) {
      setFlash(presetFlash, "Give this preset a short name.", true);
      return;
    }
    if (presets.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setFlash(presetFlash, `"${name}" already exists. Overwrite it from the list, or pick another name.`, true);
      return;
    }
    const created = {
      id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      name,
      ...look,
    };
    void patchSettings({ ...look, layoutPresets: [...presets, created] }, "look")
      .then(() => {
        presetForm.reset();
        setFlash(presetFlash, `Saved “${name}”.`, false);
      })
      .catch((error) => setFlash(presetFlash, error.message, true));
  });

  void readJson("/api/settings")
    .then(fillSettings)
    .catch(() => {
      setFlash(settingsFlash, "Could not load overlay settings.", true);
    });
})();
