(() => {
  const rows = document.getElementById("rows");
  const form = document.getElementById("hidden-form");
  const loginInput = document.getElementById("login");
  const flash = document.getElementById("flash");

  function setFlash(message, isError) {
    flash.classList.toggle("is-error", Boolean(isError));
    flash.textContent = message;
  }

  function emptyRow(message) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
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

  function render(logins) {
    rows.replaceChildren();
    if (!logins.length) {
      rows.append(emptyRow("No hidden logins yet."));
      return;
    }

    for (const login of logins) {
      const tr = document.createElement("tr");
      const name = document.createElement("td");
      const actions = document.createElement("td");
      actions.className = "actions";
      name.textContent = login;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Show again";
      remove.addEventListener("click", () => {
        void readJson(`/api/hidden/${encodeURIComponent(login)}`, { method: "DELETE" })
          .then((body) => {
            setFlash(`${login} can appear on the overlay again.`, false);
            render(body.logins ?? []);
          })
          .catch((error) => setFlash(error.message, true));
      });
      actions.append(remove);
      tr.append(name, actions);
      rows.append(tr);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const login = loginInput.value.trim().replace(/^@/, "");
    void readJson("/api/hidden", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: loginInput.value }),
    })
      .then((body) => {
        form.reset();
        setFlash(`${login.toLowerCase()} is hidden from the overlay.`, false);
        render(body.logins ?? []);
      })
      .catch((error) => setFlash(error.message, true));
  });

  async function refresh() {
    try {
      const body = await readJson("/api/hidden");
      render(body.logins ?? []);
    } catch {
      rows.replaceChildren();
      rows.append(emptyRow("Could not load hidden logins."));
    }
  }

  void refresh();
})();
