(() => {
  const builtinRows = document.getElementById("builtin-rows");
  const customRows = document.getElementById("custom-rows");
  const form = document.getElementById("custom-form");
  const triggerInput = document.getElementById("custom-trigger");
  const whoInput = document.getElementById("custom-who");
  const helpInput = document.getElementById("custom-help");
  const replyInput = document.getElementById("custom-reply");
  const sendReplyInput = document.getElementById("custom-send-reply");
  const flash = document.getElementById("flash");

  function setFlash(message, isError) {
    flash.classList.toggle("is-error", Boolean(isError));
    flash.textContent = message;
  }

  function syncAddReplyRequired() {
    const sendReply = sendReplyInput.checked;
    replyInput.required = sendReply;
    helpInput.required = !sendReply;
    replyInput.placeholder = sendReply
      ? "Join the Discord: https://discord.gg/example"
      : "Optional — leave blank if this is a !help tip only";
  }

  sendReplyInput.addEventListener("change", syncAddReplyRequired);
  syncAddReplyRequired();

  function whoLabel(who) {
    return who === "mods" ? "Broadcaster / mods" : "Anyone";
  }

  function emptyRow(message, cols) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = cols;
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

  function patchCommand(id, patch) {
    return readJson("/api/commands", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [id]: patch }),
    });
  }

  function whoSelect(value) {
    const select = document.createElement("select");
    const anyone = document.createElement("option");
    anyone.value = "anyone";
    anyone.textContent = "Anyone";
    const mods = document.createElement("option");
    mods.value = "mods";
    mods.textContent = "Broadcaster / mods";
    select.append(anyone, mods);
    select.value = value === "mods" ? "mods" : "anyone";
    return select;
  }

  function bindToggle(input, onChange) {
    input.addEventListener("change", () => {
      void onChange()
        .then((body) => render(body.commands ?? []))
        .catch((error) => {
          input.checked = !input.checked;
          setFlash(error.message, true);
        });
    });
  }

  function bindSelect(select, onChange) {
    select.addEventListener("change", () => {
      const previous = select.value === "mods" ? "anyone" : "mods";
      void onChange()
        .then((body) => {
          render(body.commands ?? []);
        })
        .catch((error) => {
          select.value = previous;
          setFlash(error.message, true);
        });
    });
  }

  function bindText(input, readValue, onSave) {
    const save = () => {
      void onSave(readValue())
        .then((body) => {
          if (body) {
            setFlash("Saved.", false);
          }
        })
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

  function renderBuiltins(commands) {
    builtinRows.replaceChildren();
    for (const command of commands) {
      const tr = document.createElement("tr");
      const names = document.createElement("td");
      const who = document.createElement("td");
      const description = document.createElement("td");
      const help = document.createElement("td");
      const enabled = document.createElement("td");
      const staffHit = document.createElement("td");

      names.textContent = command.names.join(" / ");
      description.textContent = command.description;

      const whoControl = whoSelect(command.who);
      bindSelect(whoControl, () =>
        patchCommand(command.id, { who: whoControl.value }).then((body) => {
          setFlash(`${command.names[0]} is now ${whoLabel(whoControl.value).toLowerCase()}.`, false);
          return body;
        }),
      );
      who.append(whoControl);

      const helpField = document.createElement("input");
      helpField.type = "text";
      helpField.maxLength = 80;
      helpField.value = command.chatHelp ?? "";
      helpField.placeholder = "Shown in !help";
      bindText(helpField, () => helpField.value, (chatHelp) =>
        patchCommand(command.id, { chatHelp }),
      );
      help.append(helpField);

      const enabledToggle = document.createElement("input");
      enabledToggle.type = "checkbox";
      enabledToggle.checked = Boolean(command.enabled);
      bindToggle(enabledToggle, () =>
        patchCommand(command.id, { enabled: enabledToggle.checked }).then((body) => {
          setFlash(
            enabledToggle.checked ? `${command.names[0]} enabled.` : `${command.names[0]} disabled.`,
            false,
          );
          return body;
        }),
      );
      enabled.append(enabledToggle);

      if (command.hasChance) {
        const staffToggle = document.createElement("input");
        staffToggle.type = "checkbox";
        staffToggle.checked = Boolean(command.staffGuarantee);
        staffToggle.title = "When on, the broadcaster and mods skip the random roll";
        bindToggle(staffToggle, () =>
          patchCommand(command.id, { staffGuarantee: staffToggle.checked }).then((body) => {
            setFlash(
              staffToggle.checked
                ? `${command.names[0]} always hits for mods / streamer.`
                : `${command.names[0]} uses the normal roll for everyone.`,
              false,
            );
            return body;
          }),
        );
        staffHit.append(staffToggle);
      } else {
        staffHit.className = "muted";
        staffHit.textContent = "—";
      }

      tr.append(names, who, description, help, enabled, staffHit);
      builtinRows.append(tr);
    }
  }

  function renderCustom(commands) {
    customRows.replaceChildren();
    if (!commands.length) {
      customRows.append(emptyRow("No custom commands yet.", 6));
      return;
    }

    for (const command of commands) {
      const tr = document.createElement("tr");
      const names = document.createElement("td");
      const who = document.createElement("td");
      const reply = document.createElement("td");
      const help = document.createElement("td");
      const enabled = document.createElement("td");
      const actions = document.createElement("td");
      actions.className = "actions";

      names.textContent = command.names.join(" / ");

      const whoControl = whoSelect(command.who);
      bindSelect(whoControl, () =>
        patchCommand(command.id, { who: whoControl.value }).then((body) => {
          setFlash(`${command.names[0]} is now ${whoLabel(whoControl.value).toLowerCase()}.`, false);
          return body;
        }),
      );
      who.append(whoControl);

      const replyStack = document.createElement("div");
      const sendToggleLabel = document.createElement("label");
      sendToggleLabel.className = "check";
      const sendToggle = document.createElement("input");
      sendToggle.type = "checkbox";
      sendToggle.checked = Boolean(command.sendReply);
      sendToggle.title = "When off, !help can list this command but chat gets no bot reply";
      bindToggle(sendToggle, () =>
        patchCommand(command.id, { sendReply: sendToggle.checked }).then((body) => {
          setFlash(
            sendToggle.checked
              ? `${command.names[0]} will reply in chat.`
              : `${command.names[0]} is listed in !help only.`,
            false,
          );
          return body;
        }),
      );
      sendToggleLabel.append(sendToggle, document.createTextNode(" Send reply"));
      const replyField = document.createElement("textarea");
      replyField.maxLength = 500;
      replyField.value = command.reply ?? "";
      bindText(replyField, () => replyField.value, (nextReply) =>
        patchCommand(command.id, { reply: nextReply }),
      );
      replyStack.append(sendToggleLabel, replyField);
      reply.append(replyStack);

      const helpField = document.createElement("input");
      helpField.type = "text";
      helpField.maxLength = 80;
      helpField.value = command.chatHelp ?? "";
      helpField.placeholder = "Shown in !help";
      bindText(helpField, () => helpField.value, (chatHelp) =>
        patchCommand(command.id, { chatHelp }),
      );
      help.append(helpField);

      const enabledToggle = document.createElement("input");
      enabledToggle.type = "checkbox";
      enabledToggle.checked = Boolean(command.enabled);
      bindToggle(enabledToggle, () =>
        patchCommand(command.id, { enabled: enabledToggle.checked }).then((body) => {
          setFlash(
            enabledToggle.checked ? `${command.names[0]} enabled.` : `${command.names[0]} disabled.`,
            false,
          );
          return body;
        }),
      );
      enabled.append(enabledToggle);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void readJson(`/api/commands/${encodeURIComponent(command.id)}`, { method: "DELETE" })
          .then((body) => {
            setFlash(`${command.names[0]} removed.`, false);
            render(body.commands ?? []);
          })
          .catch((error) => setFlash(error.message, true));
      });
      actions.append(remove);

      tr.append(names, who, reply, help, enabled, actions);
      customRows.append(tr);
    }
  }

  function render(commands) {
    renderBuiltins(commands.filter((command) => command.kind !== "custom"));
    renderCustom(commands.filter((command) => command.kind === "custom"));
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = triggerInput.value.trim().replace(/^!+/, "");
    void readJson("/api/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        trigger: triggerInput.value,
        reply: replyInput.value,
        sendReply: sendReplyInput.checked,
        who: whoInput.value,
        chatHelp: helpInput.value,
      }),
    })
      .then((body) => {
        form.reset();
        whoInput.value = "anyone";
        sendReplyInput.checked = true;
        syncAddReplyRequired();
        setFlash(`!${name} added.`, false);
        render(body.commands ?? []);
      })
      .catch((error) => setFlash(error.message, true));
  });

  async function refresh() {
    try {
      const body = await readJson("/api/commands");
      render(body.commands ?? []);
    } catch {
      builtinRows.replaceChildren();
      customRows.replaceChildren();
      builtinRows.append(emptyRow("Could not load commands.", 6));
      customRows.append(emptyRow("Could not load commands.", 6));
    }
  }

  void refresh();
})();
