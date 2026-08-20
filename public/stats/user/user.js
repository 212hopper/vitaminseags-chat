(() => {
  const title = document.getElementById("title");
  const meta = document.getElementById("meta");
  const log = document.getElementById("log");
  const userId = new URLSearchParams(location.search).get("id") ?? "";

  function setText(node, value) {
    node.textContent = value;
  }

  function formatTime(ts) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(ts));
    } catch {
      return String(ts);
    }
  }

  async function load() {
    if (!userId) {
      setText(title, "Missing user");
      setText(meta, "No user id in the URL.");
      return;
    }

    try {
      const response = await fetch(`/api/stats/users/${encodeURIComponent(userId)}`);
      if (!response.ok) {
        setText(title, "User not found");
        setText(meta, "No stored messages for this viewer yet.");
        return;
      }
      const body = await response.json();
      const user = body.user ?? {};
      const messages = body.messages ?? [];

      title.replaceChildren();
      if (user.color) {
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = user.color;
        title.append(swatch);
      }
      title.append(document.createTextNode(user.displayName || user.login || userId));
      document.title = `${user.displayName || user.login || "Viewer"} · messages`;
      setText(
        meta,
        `@${user.login ?? userId} · ${messages.length} stored message${messages.length === 1 ? "" : "s"}`,
      );

      log.replaceChildren();
      if (!messages.length) {
        const empty = document.createElement("li");
        empty.className = "muted";
        empty.textContent = "No stored messages for this viewer yet.";
        log.append(empty);
        return;
      }

      for (const message of messages) {
        const item = document.createElement("li");
        const time = document.createElement("time");
        time.dateTime = new Date(message.ts).toISOString();
        time.textContent = formatTime(message.ts);
        const text = document.createElement("div");
        text.className = "msg";
        text.textContent = message.text;
        item.append(time, text);
        log.append(item);
      }
    } catch {
      setText(title, "Could not load messages");
      setText(meta, "The companion did not respond.");
    }
  }

  void load();
})();
