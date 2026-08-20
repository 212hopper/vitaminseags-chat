(() => {
  const rows = document.getElementById("rows");
  const form = document.getElementById("remap-form");
  const loginInput = document.getElementById("login");
  const aliasInput = document.getElementById("alias");
  const blockedInput = document.getElementById("blocked");
  const flash = document.getElementById("flash");

  function setFlash(message, isError) {
    flash.classList.toggle("is-error", Boolean(isError));
    flash.textContent = message;
  }

  function fillForm(remap) {
    loginInput.value = remap.login;
    aliasInput.value = remap.alias;
    blockedInput.checked = Boolean(remap.blocked);
    loginInput.focus();
  }

  function emptyRow(message) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
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

  function render(remaps) {
    rows.replaceChildren();
    if (!remaps.length) {
      rows.append(emptyRow("No remaps yet."));
      return;
    }

    for (const remap of remaps) {
      const tr = document.createElement("tr");
      const login = document.createElement("td");
      const alias = document.createElement("td");
      const blocked = document.createElement("td");
      const actions = document.createElement("td");
      actions.className = "actions";

      login.textContent = remap.login;
      alias.textContent = remap.alias;
      blocked.textContent = remap.blocked ? "Blocked" : "Open";
      if (remap.blocked) {
        blocked.className = "blocked";
      }

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => fillForm(remap));

      const block = document.createElement("button");
      block.type = "button";
      block.className = "secondary";
      block.textContent = remap.blocked ? "Unblock" : "Block";
      block.addEventListener("click", () => {
        void readJson(`/api/remaps/${encodeURIComponent(remap.login)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blocked: !remap.blocked }),
        })
          .then(() => refresh())
          .catch((error) => setFlash(error.message, true));
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void readJson(`/api/remaps/${encodeURIComponent(remap.login)}`, { method: "DELETE" })
          .then(() => refresh())
          .catch((error) => setFlash(error.message, true));
      });

      actions.append(edit, block, remove);
      tr.append(login, alias, blocked, actions);
      rows.append(tr);
    }
  }

  async function refresh() {
    try {
      const body = await readJson("/api/remaps");
      render(body.remaps ?? []);
    } catch {
      rows.replaceChildren();
      rows.append(emptyRow("Could not load remaps."));
    }
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void readJson("/api/remaps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        login: loginInput.value,
        alias: aliasInput.value,
        blocked: blockedInput.checked,
      }),
    })
      .then(() => {
        setFlash("Remap saved.");
        void refresh();
      })
      .catch((error) => setFlash(error.message, true));
  });

  document.getElementById("reset-form")?.addEventListener("click", () => {
    form.reset();
    setFlash("");
  });

  void refresh();
  window.setInterval(() => {
    void refresh();
  }, 4000);
})();
