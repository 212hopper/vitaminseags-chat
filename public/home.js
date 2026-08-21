(() => {
  const card = document.getElementById("status");
  const title = document.getElementById("status-title");
  const detail = document.getElementById("status-detail");
  const authLink = document.getElementById("auth-link");
  const reauthLink = document.getElementById("reauth-link");
  const overlayUrl = document.getElementById("overlay-url");
  const scopesNote = document.getElementById("status-scopes");

  function setText(node, value) {
    if (node) {
      node.textContent = value;
    }
  }

  function render(status) {
    card.classList.remove("status--ready", "status--needs_login", "status--starting");
    card.classList.add(`status--${status.phase}`);
    if (status.overlayPath) {
      setText(overlayUrl, status.overlayPath);
    }

    const missing = status.missingScopes ?? [];
    if (scopesNote) {
      if (missing.length) {
        scopesNote.hidden = false;
        setText(
          scopesNote,
          `Twitch still needs permission for: ${missing.join(", ")}. Click Re-authorize Twitch, accept every tick, then restart the container.`,
        );
      } else if (new URLSearchParams(location.search).get("auth") === "updated") {
        scopesNote.hidden = false;
        setText(scopesNote, "New Twitch permissions saved. Restart the Docker container so follows, bits, and subs can subscribe.");
      } else {
        scopesNote.hidden = true;
        setText(scopesNote, "");
      }
    }

    if (status.phase === "ready" && status.user) {
      setText(title, `Signed in as ${status.user.displayName}`);
      const bits = [`@${status.user.login}`];
      if (status.broadcaster) {
        bits.push(`listening to #${status.broadcaster.login}`);
      }
      bits.push(status.eventSub ? "Twitch EventSub connected" : "connecting to Twitch chat");
      setText(detail, bits.join(" · "));
      authLink.hidden = true;
      reauthLink.hidden = false;
      return;
    }

    if (status.phase === "needs_login") {
      setText(title, "Not signed in");
      setText(detail, "Authorize Twitch to connect chat. You only need to do this when the app has no saved token.");
      authLink.hidden = false;
      reauthLink.hidden = true;
      return;
    }

    setText(title, "Starting…");
    setText(detail, "Checking the saved Twitch token.");
    authLink.hidden = true;
    reauthLink.hidden = true;
  }

  async function refresh() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) {
        throw new Error("status request failed");
      }
      render(await response.json());
    } catch {
      setText(title, "Cannot reach the app");
      setText(detail, "The companion process is not responding.");
    }
  }

  void refresh();
  window.setInterval(() => {
    void refresh();
  }, 2000);
})();
