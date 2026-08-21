(() => {
  const rows = document.getElementById("rows");
  const form = document.getElementById("timer-form");
  const labelInput = document.getElementById("timer-label");
  const intervalInput = document.getElementById("timer-interval");
  const liveInput = document.getElementById("timer-live");
  const messageInput = document.getElementById("timer-message");
  const flash = document.getElementById("flash");

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

      const messageField = document.createElement("textarea");
      messageField.maxLength = 500;
      messageField.value = timer.message ?? "";
      bindBlur(messageField, () => messageField.value, (next) => patchTimer(timer.id, { message: next }));
      message.append(messageField);

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const label = labelInput.value.trim();
    void readJson("/api/timers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label,
        message: messageInput.value,
        intervalMinutes: Number(intervalInput.value),
        liveOnly: liveInput.checked,
      }),
    })
      .then((body) => {
        form.reset();
        intervalInput.value = "15";
        liveInput.checked = true;
        setFlash(`${label || "Timed message"} added.`, false);
        render(body.timers ?? []);
      })
      .catch((error) => setFlash(error.message, true));
  });

  async function refresh() {
    try {
      const body = await readJson("/api/timers");
      render(body.timers ?? []);
    } catch {
      rows.replaceChildren();
      rows.append(emptyRow("Could not load timed messages."));
    }
  }

  void refresh();
})();
