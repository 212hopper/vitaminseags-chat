(() => {
  const rows = document.getElementById("rows");
  const form = document.getElementById("timer-form");
  const labelInput = document.getElementById("timer-label");
  const intervalInput = document.getElementById("timer-interval");
  const liveInput = document.getElementById("timer-live");
  const sourceInput = document.getElementById("timer-source");
  const messageInput = document.getElementById("timer-message");
  const flash = document.getElementById("flash");
  let customSources = [];

  function setFlash(message, isError) {
    flash.classList.toggle("is-error", Boolean(isError));
    flash.textContent = message;
  }

  function emptyRow(message) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "muted";
    td.textContent = message;
    tr.append(td);
    return tr;
  }

  async function readJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }
    return body;
  }

  function patchTimer(id, patch) {
    return readJson("/api/timers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [id]: patch }),
    });
  }

  function bindToggle(input, onChange) {
    input.addEventListener("change", () => {
      void onChange()
        .then((body) => render(body.timers ?? []))
        .catch((error) => {
          input.checked = !input.checked;
          setFlash(error.message, true);
        });
    });
  }

  function bindBlur(input, readValue, onSave) {
    const save = () => {
      void onSave(readValue())
        .then(() => setFlash("Saved.", false))
        .catch((error) => setFlash(error.message, true));
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
        event.preventDefault();
        input.blur();
      }
    });
  }

  function sourceValue(timer) {
    if (timer.source === "help") {
      return "help";
    }
    if (timer.source === "custom" && timer.customId) {
      return timer.customId;
    }
    return "text";
  }

  function sourceLabel(value) {
    if (value === "text") {
      return "Write a message";
    }
    if (value === "help") {
      return "!help — live command list";
    }
    const custom = customSources.find((item) => item.id === value);
    return custom ? custom.names.join(" / ") : "Custom command";
  }

  function fillSourceSelect(select, selected) {
    select.replaceChildren();
    const text = document.createElement("option");
    text.value = "text";
    text.textContent = "Write a message";
    const help = document.createElement("option");
    help.value = "help";
    help.textContent = "!help — live command list";
    select.append(text, help);
    for (const command of customSources) {
      const option = document.createElement("option");
      option.value = command.id;
      option.textContent = `${command.names.join(" / ")} — current reply`;
      select.append(option);
    }
    if (selected && [...select.options].some((option) => option.value === selected)) {
      select.value = selected;
    } else {
      select.value = "text";
    }
  }

  function parseSource(value) {
    if (value === "help") {
      return { source: "help", customId: "" };
    }
    if (value === "text") {
      return { source: "text", customId: "" };
    }
    return { source: "custom", customId: value };
  }

  function syncAddForm() {
    const isText = sourceInput.value === "text";
    messageInput.required = isText;
    messageInput.disabled = !isText;
    messageInput.placeholder = isText
      ? "Grab merch at example.com/merch"
      : "Not needed — the live command text is used instead";
  }

  function render(timers) {
    rows.replaceChildren();
    if (!timers.length) {
      rows.append(emptyRow("No timed messages yet."));
      return;
    }

    for (const timer of timers) {
      const tr = document.createElement("tr");
      const label = document.createElement("td");
      const message = document.createElement("td");
      const minutes = document.createElement("td");
      const liveOnly = document.createElement("td");
      const enabled = document.createElement("td");
      const actions = document.createElement("td");
      actions.className = "actions";

      const labelField = document.createElement("input");
      labelField.type = "text";
      labelField.maxLength = 40;
      labelField.value = timer.label ?? "";
      bindBlur(labelField, () => labelField.value, (next) => patchTimer(timer.id, { label: next }));
      label.append(labelField);

      const sourceField = document.createElement("select");
      fillSourceSelect(sourceField, sourceValue(timer));
      sourceField.addEventListener("change", () => {
        const next = parseSource(sourceField.value);
        void patchTimer(timer.id, next)
          .then((body) => {
            setFlash(`${timer.label || "Timer"} now posts ${sourceLabel(sourceField.value)}.`, false);
            render(body.timers ?? []);
          })
          .catch((error) => {
            sourceField.value = sourceValue(timer);
            setFlash(error.message, true);
          });
      });
      message.append(sourceField);
      if (sourceValue(timer) === "text") {
        const messageField = document.createElement("textarea");
        messageField.maxLength = 500;
        messageField.value = timer.message ?? "";
        bindBlur(messageField, () => messageField.value, (next) => patchTimer(timer.id, { message: next }));
        message.append(messageField);
      } else {
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.style.margin = "0.4rem 0 0";
        hint.textContent =
          sourceValue(timer) === "help"
            ? "Posts the current !help list. Edit commands on the Commands page."
            : "Posts that command’s current reply. Edit it on the Commands page.";
        message.append(hint);
      }

      const minutesField = document.createElement("input");
      minutesField.type = "number";
      minutesField.min = "1";
      minutesField.max = "180";
      minutesField.value = String(timer.intervalMinutes ?? 15);
      bindBlur(minutesField, () => Number(minutesField.value), (intervalMinutes) =>
        patchTimer(timer.id, { intervalMinutes }),
      );
      minutes.append(minutesField);

      const liveToggle = document.createElement("input");
      liveToggle.type = "checkbox";
      liveToggle.checked = timer.liveOnly !== false;
      liveToggle.title = "Only post while the channel is live";
      bindToggle(liveToggle, () =>
        patchTimer(timer.id, { liveOnly: liveToggle.checked }).then((body) => {
          setFlash(
            liveToggle.checked ? `${timer.label || "Timer"} only posts while live.` : `${timer.label || "Timer"} posts even when offline.`,
            false,
          );
          return body;
        }),
      );
      liveOnly.append(liveToggle);

      const enabledToggle = document.createElement("input");
      enabledToggle.type = "checkbox";
      enabledToggle.checked = Boolean(timer.enabled);
      bindToggle(enabledToggle, () =>
        patchTimer(timer.id, { enabled: enabledToggle.checked }).then((body) => {
          setFlash(enabledToggle.checked ? `${timer.label || "Timer"} enabled.` : `${timer.label || "Timer"} disabled.`, false);
          return body;
        }),
      );
      enabled.append(enabledToggle);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void readJson(`/api/timers/${encodeURIComponent(timer.id)}`, { method: "DELETE" })
          .then((body) => {
            setFlash(`${timer.label || "Timer"} removed.`, false);
            render(body.timers ?? []);
          })
          .catch((error) => setFlash(error.message, true));
      });
      actions.append(remove);

      tr.append(label, message, minutes, liveOnly, enabled, actions);
      rows.append(tr);
    }
  }

  sourceInput.addEventListener("change", syncAddForm);
  syncAddForm();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const label = labelInput.value.trim();
    const parsed = parseSource(sourceInput.value);
    const selected = sourceInput.options[sourceInput.selectedIndex];
    void readJson("/api/timers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: label || (parsed.source === "text" ? "" : sourceLabel(sourceInput.value)),
        message: parsed.source === "text" ? messageInput.value : "",
        source: parsed.source,
        customId: parsed.customId,
        intervalMinutes: Number(intervalInput.value),
        liveOnly: liveInput.checked,
      }),
    })
      .then((body) => {
        form.reset();
        intervalInput.value = "15";
        liveInput.checked = true;
        sourceInput.value = "text";
        fillSourceSelect(sourceInput, "text");
        syncAddForm();
        setFlash(`${label || selected?.textContent || "Timed message"} added.`, false);
        render(body.timers ?? []);
      })
      .catch((error) => setFlash(error.message, true));
  });

  async function refresh() {
    try {
      const [timerBody, commandBody] = await Promise.all([readJson("/api/timers"), readJson("/api/commands")]);
      customSources = (commandBody.commands ?? []).filter(
        (command) => command.kind === "custom" && command.sendReply && command.reply,
      );
      fillSourceSelect(sourceInput, sourceInput.value || "text");
      syncAddForm();
      render(timerBody.timers ?? []);
    } catch {
      rows.replaceChildren();
      rows.append(emptyRow("Could not load timed messages."));
    }
  }

  void refresh();
})();
