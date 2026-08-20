(() => {
  const rows = document.getElementById("rows");
  const form = document.getElementById("user-form");
  const flash = document.getElementById("flash");

  function setFlash(message, isError) {
    flash.classList.toggle("is-error", Boolean(isError));
    flash.textContent = message;
  }

  async function readJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }
    return body;
  }

  function render(users) {
    rows.replaceChildren();
    if (!users.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.className = "muted";
      td.textContent = "No users yet.";
      tr.append(td);
      rows.append(tr);
      return;
    }

    for (const user of users) {
      const tr = document.createElement("tr");
      const name = document.createElement("td");
      const role = document.createElement("td");
      const actions = document.createElement("td");
      actions.className = "actions";
      name.textContent = user.username;
      role.textContent = user.role === "admin" ? "Admin" : "User";

      if (user.managed) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => {
          void readJson(`/api/accounts/${encodeURIComponent(user.username)}`, { method: "DELETE" })
            .then(() => refresh())
            .catch((error) => setFlash(error.message, true));
        });
        actions.append(remove);
      } else {
        actions.textContent = "From env";
      }

      tr.append(name, role, actions);
      rows.append(tr);
    }
  }

  async function refresh() {
    try {
      const body = await readJson("/api/accounts");
      render(body.users ?? []);
    } catch (error) {
      rows.replaceChildren();
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.className = "muted";
      td.textContent = error.message || "Could not load users.";
      tr.append(td);
      rows.append(tr);
    }
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void readJson("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
      }),
    })
      .then(() => {
        form.reset();
        setFlash("User created.");
        void refresh();
      })
      .catch((error) => setFlash(error.message, true));
  });

  void refresh();
})();
