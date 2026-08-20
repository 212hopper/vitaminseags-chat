(() => {
  const form = document.getElementById("login-form");
  const flash = document.getElementById("flash");
  const next = new URLSearchParams(location.search).get("next") || "/";

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    flash.textContent = "";
    void fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
      }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || "Sign in failed");
        }
        const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
        location.href = target;
      })
      .catch((error) => {
        flash.textContent = error.message || "Sign in failed";
      });
  });
})();
