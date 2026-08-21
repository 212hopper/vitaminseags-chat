(() => {
  const LINKS = [
    { href: "/", label: "Home" },
    { href: "/dashboard/", label: "Dashboard" },
    { href: "/dashboard/settings/", label: "Settings" },
    { href: "/dashboard/remaps/", label: "Remaps" },
    { href: "/dashboard/hidden/", label: "Hidden" },
    { href: "/dashboard/commands/", label: "Commands" },
    { href: "/dashboard/timers/", label: "Timed chat" },
    { href: "/stats/", label: "Stats" },
    { href: "/dashboard/users/", label: "Users", adminOnly: true },
    { href: "/overlays/chat/", label: "Overlay" },
  ];

  function currentPath() {
    const path = location.pathname;
    return path.endsWith("/") || path === "" ? path : `${path}/`;
  }

  function isActive(href) {
    const path = currentPath();
    if (href === "/") {
      return path === "/";
    }
    if (href === "/dashboard/") {
      return path === "/dashboard/";
    }
    if (href === "/stats/") {
      return path === "/stats/" || path.startsWith("/stats/");
    }
    return path === href || path.startsWith(href);
  }

  function render(root, me) {
    root.replaceChildren();
    for (const link of LINKS) {
      if (link.adminOnly && me.role !== "admin") {
        continue;
      }
      const node = document.createElement("a");
      node.href = link.href;
      node.textContent = link.label;
      if (isActive(link.href)) {
        node.setAttribute("aria-current", "page");
      }
      root.append(node);
    }
    if (me.authEnabled) {
      const signOut = document.createElement("a");
      signOut.href = "/login/";
      signOut.textContent = "Sign out";
      signOut.addEventListener("click", (event) => {
        event.preventDefault();
        void fetch("/api/logout", { method: "POST" }).finally(() => {
          location.href = "/login/";
        });
      });
      root.append(signOut);
    }
  }

  async function boot() {
    const root = document.getElementById("app-nav");
    if (!root) {
      return;
    }
    let me = { authEnabled: false, role: "admin" };
    try {
      const response = await fetch("/api/me");
      if (response.status === 401) {
        location.href = `/login/?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      if (response.ok) {
        me = await response.json();
      }
    } catch {
      // still render links if the status endpoint is down
    }
    render(root, me);
  }

  void boot();
})();
