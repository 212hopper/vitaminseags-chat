(() => {
  const rows = document.getElementById("rows");

  function render(users) {
    rows.replaceChildren();
    if (!users.length) {
      const empty = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "muted";
      cell.textContent = "No chat messages stored yet.";
      empty.append(cell);
      rows.append(empty);
      return;
    }

    for (const user of users) {
      const tr = document.createElement("tr");
      const name = document.createElement("td");
      const login = document.createElement("td");
      const count = document.createElement("td");
      count.className = "count";

      const link = document.createElement("a");
      link.className = "user-link";
      link.href = `./user/?id=${encodeURIComponent(user.id)}`;

      if (user.color) {
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = user.color;
        link.append(swatch);
      }
      link.append(document.createTextNode(user.displayName));
      name.append(link);
      login.textContent = user.login;
      count.textContent = String(user.messageCount);

      tr.append(name, login, count);
      rows.append(tr);
    }
  }

  async function refresh() {
    try {
      const response = await fetch("/api/stats");
      if (!response.ok) {
        throw new Error("stats request failed");
      }
      const body = await response.json();
      render(body.users ?? []);
    } catch {
      rows.replaceChildren();
      const tr = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "muted";
      cell.textContent = "Could not load stats.";
      tr.append(cell);
      rows.append(tr);
    }
  }

  void refresh();
  window.setInterval(() => {
    void refresh();
  }, 3000);
})();
