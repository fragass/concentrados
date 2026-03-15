const form = document.getElementById("loginForm");
const errorMsg = document.getElementById("errorMsg");
const loginBtn = document.getElementById("loginBtn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorMsg.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Usuário ou senha inválidos.");
    }

    sessionStorage.setItem("token", result.token);
    sessionStorage.setItem("loggedUser", result.user.username);
    sessionStorage.setItem("displayName", result.user.display_name || result.user.username);
    window.location.href = "app.html";
  } catch (error) {
    errorMsg.textContent = error.message || "Falha ao conectar com o servidor.";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});
