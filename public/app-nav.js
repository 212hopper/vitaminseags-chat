(() => {
  const signOut = document.getElementById("sign-out");
  const adminOnly = document.querySelectorAll("[data-admin-only]");

  async function refresh() {
    try {
      const response = await fetch("/api/me");
      if (response.status === 401) {
        location.href = `/login/?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      const me = await response.json();
      if (signOut) {
        signOut.hidden = !me.authEnabled;
      }
      for (const node of adminOnly) {
        node.hidden = me.role !== "admin";
      }
    } catch {
      // leave the page as-is if the app is unreachable
    }
  }

  signOut?.addEventListener("click", (event) => {
    event.preventDefault();
    void fetch("/api/logout", { method: "POST" }).finally(() => {
      location.href = "/login/";
    });
  });

  void refresh();
})();
