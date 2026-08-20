(() => {
  const rows = document.getElementById("rows");
  const flash = document.getElementById("flash");

  function whoLabel(who) {
    return who === "mods" ? "Broadcaster / mods" : "Anyone";
  }

  async function readJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }
    return body;
  }

  function render(commands) {
    rows.replaceChildren();
    for (const command of commands) {
      const tr = document.createElement("tr");
      const names = document.createElement("td");
      const who = document.createElement("td");
      const description = document.createElement("td");
      const enabled = document.createElement("td");

      names.textContent = command.names.join(" / ");
      who.textContent = whoLabel(command.who);
      description.textContent = command.description;

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = Boolean(command.enabled);
      toggle.addEventListener("change", () => {
        flash.classList.remove("is-error");
        void readJson("/api/commands", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [command.id]: toggle.checked }),
        })
          .then((body) => {
            flash.textContent = toggle.checked ? `${command.names[0]} enabled.` : `${command.names[0]} disabled.`;
            render(body.commands ?? []);
          })
          .catch((error) => {
            toggle.checked = !toggle.checked;
            flash.classList.add("is-error");
            flash.textContent = error.message;
          });
      });
      enabled.append(toggle);

      tr.append(names, who, description, enabled);
      rows.append(tr);
    }
  }

  async function refresh() {
    try {
      const body = await readJson("/api/commands");
      render(body.commands ?? []);
    } catch {
      rows.replaceChildren();
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.className = "muted";
      td.textContent = "Could not load commands.";
      tr.append(td);
      rows.append(tr);
    }
  }

  void refresh();
})();
