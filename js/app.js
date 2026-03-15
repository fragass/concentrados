const loggedUser = sessionStorage.getItem("loggedUser");
const savedDisplayName = sessionStorage.getItem("displayName") || loggedUser;

const state = {
  profile: {
    username: loggedUser,
    display_name: savedDisplayName
  },
  incomingRequests: [],
  outgoingRequests: [],
  conversations: [],
  currentConversationId: null,
  currentConversation: null,
  messages: [],
  searchResults: [],
  contactsForGroup: [],
  pendingImageFile: null,
  pollTimer: null,
  searchTimer: null,
  toastTimer: null,
  lastOutgoingUsernames: []
};

const els = {
  currentUserAvatar: document.getElementById("currentUserAvatar"),
  currentDisplayName: document.getElementById("currentDisplayName"),
  currentUsername: document.getElementById("currentUsername"),
  logoutBtn: document.getElementById("logoutBtn"),
  userSearchInput: document.getElementById("userSearchInput"),
  searchResults: document.getElementById("searchResults"),
  searchUserBtn: document.getElementById("searchUserBtn"),
  searchFeedback: document.getElementById("searchFeedback"),
  incomingRequests: document.getElementById("incomingRequests"),
  outgoingRequests: document.getElementById("outgoingRequests"),
  conversationList: document.getElementById("conversationList"),
  chatArea: document.getElementById("chatArea"),
  chatTitle: document.getElementById("chatTitle"),
  chatSubtitle: document.getElementById("chatSubtitle"),
  messages: document.getElementById("messages"),
  emptyState: document.getElementById("emptyState"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  imageInput: document.getElementById("imageInput"),
  imageChip: document.getElementById("imageChip"),
  imageName: document.getElementById("imageName"),
  removeImageBtn: document.getElementById("removeImageBtn"),
  composer: document.getElementById("composer"),
  newGroupBtn: document.getElementById("newGroupBtn"),
  groupModal: document.getElementById("groupModal"),
  groupTitleInput: document.getElementById("groupTitleInput"),
  groupContactsList: document.getElementById("groupContactsList"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  groupError: document.getElementById("groupError"),
  messageTemplate: document.getElementById("messageTemplate"),
  appToast: document.getElementById("appToast")
};

function initials(value) {
  return String(value || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value || "";
  }
}

function setCurrentUserUI() {
  els.currentDisplayName.textContent = state.profile.display_name || state.profile.username;
  els.currentUsername.textContent = `@${state.profile.username}`;
  els.currentUserAvatar.textContent = initials(state.profile.display_name || state.profile.username);
}

async function readApiResponse(response) {
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (data?.message || data?.error) {
      throw new Error(data.message || data.error);
    }

    if (response.status === 404) {
      throw new Error("A rota da API não foi encontrada na Vercel.");
    }

    throw new Error(text || "Erro na requisição");
  }

  if (!data) {
    throw new Error("A API respondeu num formato inválido.");
  }

  return data;
}

async function apiGet(path, query = {}) {
  const params = new URLSearchParams(query);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/${path}${suffix}`);
  return readApiResponse(response);
}

async function apiPost(path, body) {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return readApiResponse(response);
}

async function uploadImage(file) {
  const form = new FormData();
  form.append("file", file);
  form.append("username", loggedUser);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: form
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || "Falha ao enviar imagem");
  return data.url;
}

function setSearchFeedback(message = "", type = "") {
  const visible = !!String(message || "").trim();
  els.searchFeedback.textContent = message;
  els.searchFeedback.classList.toggle("hidden", !visible);
  els.searchFeedback.classList.toggle("error", type === "error");
  els.searchFeedback.classList.toggle("success", type === "success");
}

function showToast(message = "", type = "success") {
  if (!message) return;
  window.clearTimeout(state.toastTimer);
  els.appToast.textContent = message;
  els.appToast.className = `app-toast ${type}`;
  els.appToast.classList.remove("hidden");
  state.toastTimer = window.setTimeout(() => {
    els.appToast.classList.add("hidden");
  }, 3000);
}

function renderSearchResults() {
  els.searchResults.innerHTML = "";

  if (!state.searchResults.length) {
    return;
  }

  state.searchResults.forEach((user) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="result-top">
        <div class="avatar small">${escapeHtml(initials(user.display_name || user.username))}</div>
        <div>
          <strong>${escapeHtml(user.display_name || user.username)}</strong>
          <div class="request-meta">@${escapeHtml(user.username)}</div>
        </div>
      </div>
      <div class="action-row"></div>
    `;

    const actionRow = card.querySelector(".action-row");

    if (user.relation === "contact") {
      const span = document.createElement("span");
      span.className = "badge";
      span.textContent = "Já é contato";
      actionRow.appendChild(span);
    } else if (user.relation === "incoming_pending") {
      const span = document.createElement("span");
      span.className = "badge";
      span.textContent = "Essa pessoa já te enviou convite";
      actionRow.appendChild(span);
    } else if (user.relation === "outgoing_pending") {
      const span = document.createElement("span");
      span.className = "badge";
      span.textContent = "Convite pendente";
      actionRow.appendChild(span);
    } else {
      const button = document.createElement("button");
      button.className = "primary-btn small";
      button.textContent = "Enviar convite";
      button.addEventListener("click", async () => {
        try {
          await apiPost("requests/send", {
            username: loggedUser,
            target_username: user.username
          });
          els.userSearchInput.value = "";
          state.searchResults = [];
          renderSearchResults();
          setSearchFeedback("");
          showToast(`Convite enviado para @${user.username}.`, "success");
          await refreshSidebar();
        } catch (error) {
          alert(error.message);
        }
      });
      actionRow.appendChild(button);
    }

    els.searchResults.appendChild(card);
  });
}


function toggleCompactSections() {
  const incomingSection = document.querySelector('[data-section="incoming"]');
  const outgoingSection = document.querySelector('[data-section="outgoing"]');

  if (incomingSection) incomingSection.classList.toggle('hidden', !state.incomingRequests.length);
  if (outgoingSection) outgoingSection.classList.toggle('hidden', !state.outgoingRequests.length);
}

function renderRequestLists() {
  els.incomingRequests.innerHTML = "";
  els.outgoingRequests.innerHTML = "";

  if (!state.incomingRequests.length) {
    els.incomingRequests.innerHTML = "";
  } else {
    state.incomingRequests.forEach((request) => {
      const card = document.createElement("div");
      card.className = "request-card";
      card.innerHTML = `
        <div class="request-top">
          <div class="avatar small">${escapeHtml(initials(request.sender_display_name || request.sender_username))}</div>
          <div>
            <strong>${escapeHtml(request.sender_display_name || request.sender_username)}</strong>
            <div class="request-meta">@${escapeHtml(request.sender_username)}</div>
          </div>
        </div>
        <div class="action-row">
          <button class="primary-btn small" data-action="accept">Aceitar</button>
          <button class="ghost-btn small" data-action="reject">Recusar</button>
        </div>
      `;
      card.querySelector('[data-action="accept"]').addEventListener("click", () => respondRequest(request.id, "accept"));
      card.querySelector('[data-action="reject"]').addEventListener("click", () => respondRequest(request.id, "reject"));
      els.incomingRequests.appendChild(card);
    });
  }

  if (!state.outgoingRequests.length) {
    els.outgoingRequests.innerHTML = "";
  } else {
    state.outgoingRequests.forEach((request) => {
      const card = document.createElement("div");
      card.className = "request-card";
      card.innerHTML = `
        <div class="request-top">
          <div class="avatar small">${escapeHtml(initials(request.receiver_display_name || request.receiver_username))}</div>
          <div>
            <strong>${escapeHtml(request.receiver_display_name || request.receiver_username)}</strong>
            <div class="request-meta">@${escapeHtml(request.receiver_username)}</div>
          </div>
        </div>
        <div class="request-meta">Aguardando resposta</div>
      `;
      els.outgoingRequests.appendChild(card);
    });
  }

  toggleCompactSections();
}

function renderConversationList() {
  els.conversationList.innerHTML = "";

  if (!state.conversations.length) {
    els.conversationList.innerHTML = `<div class="conversation-card empty-row">Nenhuma conversa ainda.</div>`;
    return;
  }

  state.conversations.forEach((conversation) => {
    const card = document.createElement("div");
    card.className = `conversation-card${conversation.id === state.currentConversationId ? " active" : ""}`;
    card.innerHTML = `
      <div class="conversation-top">
        <div class="avatar small">${escapeHtml(initials(conversation.title))}</div>
        <div>
          <strong>${escapeHtml(conversation.title)}</strong>
          <div class="chat-subtitle">${escapeHtml(conversation.subtitle || "")}</div>
        </div>
      </div>
      <div class="badge">${conversation.is_online ? '<span class="dot-online"></span> online' : 'offline ou sem sinal recente'}</div>
    `;
    card.addEventListener("click", async () => {
      state.currentConversationId = conversation.id;
      state.currentConversation = conversation;
      renderConversationList();
      updateChatHeader();
      await loadMessages();
    });
    els.conversationList.appendChild(card);
  });
}

function updateChatAreaState() {
  const hasConversation = !!state.currentConversationId;
  els.chatArea.classList.toggle("idle", !hasConversation);
  els.composer.classList.toggle("hidden", !hasConversation);
}

function updateChatHeader() {
  updateChatAreaState();

  if (!state.currentConversation) {
    els.chatTitle.textContent = "Nenhuma conversa selecionada";
    els.chatSubtitle.textContent = "Escolha um contato ou grupo na lateral.";
    return;
  }

  els.chatTitle.textContent = state.currentConversation.title;
  els.chatSubtitle.textContent = state.currentConversation.kind === "group"
    ? state.currentConversation.subtitle || "Grupo"
    : state.currentConversation.is_online
      ? "Contato online"
      : state.currentConversation.subtitle || "Conversa privada";
}

function renderMessages() {
  els.messages.innerHTML = "";

  if (!state.currentConversationId) {
    els.messages.classList.add("empty-state-wrap");
    updateChatHeader();
    els.messages.appendChild(els.emptyState);
    return;
  }

  els.messages.classList.remove("empty-state-wrap");

  if (!state.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<div class="empty-state-icon">🗨️</div><h3>Sem mensagens ainda</h3><p>Comece a conversa enviando a primeira mensagem.</p>`;
    els.messages.appendChild(empty);
    return;
  }

  state.messages.forEach((message) => {
    const node = els.messageTemplate.content.firstElementChild.cloneNode(true);
    const avatar = node.querySelector(".avatar");
    const author = node.querySelector(".message-author");
    const time = node.querySelector(".message-time");
    const bubble = node.querySelector(".message-bubble");

    avatar.textContent = initials(message.sender_display_name || message.sender_username);
    author.textContent = message.sender_display_name || message.sender_username;
    time.textContent = formatDateTime(message.created_at);

    const text = document.createElement("div");
    text.innerHTML = escapeHtml(message.content || "").replace(/\n/g, "<br>");
    bubble.appendChild(text);

    if (message.image_url) {
      const img = document.createElement("img");
      img.className = "message-image";
      img.src = message.image_url;
      img.alt = "Imagem enviada";
      img.loading = "lazy";
      bubble.appendChild(img);
    }

    if (message.sender_username === loggedUser) {
      node.classList.add("mine");
    }

    els.messages.appendChild(node);
  });

  els.messages.scrollTop = els.messages.scrollHeight;
}

async function loadMessages() {
  if (!state.currentConversationId) {
    state.messages = [];
    renderMessages();
    return;
  }

  const data = await apiGet("messages", {
    username: loggedUser,
    conversation_id: state.currentConversationId
  });

  state.messages = data.messages || [];
  renderMessages();
}

async function refreshSidebar() {
  const previousOutgoing = [...state.lastOutgoingUsernames];
  const data = await apiGet("sidebar", { username: loggedUser });
  state.profile = data.profile || state.profile;
  state.incomingRequests = data.incoming_requests || [];
  state.outgoingRequests = data.outgoing_requests || [];
  state.conversations = data.conversations || [];
  state.contactsForGroup = data.contacts_for_group || [];

  const nextOutgoing = state.outgoingRequests.map((request) => request.receiver_username);
  const acceptedUsers = previousOutgoing.filter((username) => !nextOutgoing.includes(username));
  const acceptedMatch = acceptedUsers.find((username) => state.conversations.some((conversation) => conversation.kind === "direct" && String(conversation.subtitle || "").includes(`@${username}`)));
  if (acceptedMatch) {
    setSearchFeedback("");
    showToast(`@${acceptedMatch} aceitou seu convite.`, "success");
  }
  state.lastOutgoingUsernames = nextOutgoing;

  setCurrentUserUI();
  renderRequestLists();
  renderConversationList();

  if (state.currentConversationId) {
    const found = state.conversations.find((item) => item.id === state.currentConversationId);
    if (found) {
      state.currentConversation = found;
      updateChatHeader();
    } else {
      state.currentConversationId = null;
      state.currentConversation = null;
      updateChatHeader();
      renderMessages();
    }
  }
}

async function respondRequest(requestId, action) {
  try {
    await apiPost("requests/respond", {
      username: loggedUser,
      request_id: requestId,
      action
    });
    await refreshSidebar();
  } catch (error) {
    alert(error.message);
  }
}

function renderGroupContacts() {
  els.groupContactsList.innerHTML = "";

  if (!state.contactsForGroup.length) {
    els.groupContactsList.innerHTML = `<div class="request-card"><div class="request-meta">Você precisa ter pelo menos um contato aceito.</div></div>`;
    return;
  }

  state.contactsForGroup.forEach((contact) => {
    const label = document.createElement("label");
    label.className = "contact-choice";
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(contact.username)}">
      <div>
        <strong>${escapeHtml(contact.display_name || contact.username)}</strong>
        <div class="request-meta">@${escapeHtml(contact.username)}</div>
      </div>
    `;
    els.groupContactsList.appendChild(label);
  });
}

function openGroupModal() {
  renderGroupContacts();
  els.groupError.textContent = "";
  els.groupTitleInput.value = "";
  els.groupModal.classList.remove("hidden");
}

function closeGroupModal() {
  els.groupModal.classList.add("hidden");
}

async function createGroup() {
  els.groupError.textContent = "";
  const title = els.groupTitleInput.value.trim();
  const checked = Array.from(els.groupContactsList.querySelectorAll('input[type="checkbox"]:checked'));
  const members = checked.map((input) => input.value);

  try {
    const data = await apiPost("groups/create", {
      username: loggedUser,
      title,
      members
    });
    closeGroupModal();
    await refreshSidebar();
    state.currentConversationId = data.conversation.id;
    state.currentConversation = data.conversation;
    renderConversationList();
    updateChatHeader();
    await loadMessages();
  } catch (error) {
    els.groupError.textContent = error.message;
  }
}

function updatePendingImageUI() {
  if (!state.pendingImageFile) {
    els.imageChip.classList.add("hidden");
    return;
  }
  els.imageChip.classList.remove("hidden");
  els.imageName.textContent = state.pendingImageFile.name;
}

async function sendMessage() {
  if (!state.currentConversationId) {
    alert("Escolha uma conversa primeiro.");
    return;
  }

  const content = els.messageInput.value.trim();
  if (!content && !state.pendingImageFile) {
    return;
  }

  els.sendBtn.disabled = true;
  els.sendBtn.textContent = "Enviando...";

  try {
    let imageUrl = null;
    if (state.pendingImageFile) {
      imageUrl = await uploadImage(state.pendingImageFile);
    }

    await apiPost("messages", {
      username: loggedUser,
      conversation_id: state.currentConversationId,
      content,
      image_url: imageUrl
    });

    els.messageInput.value = "";
    state.pendingImageFile = null;
    updatePendingImageUI();
    await refreshSidebar();
    await loadMessages();
  } catch (error) {
    alert(error.message);
  } finally {
    els.sendBtn.disabled = false;
    els.sendBtn.textContent = "Enviar";
  }
}

async function searchUsers() {
  const query = els.userSearchInput.value.trim();
  if (!query) {
    state.searchResults = [];
    renderSearchResults();
    setSearchFeedback("");
    return;
  }

  setSearchFeedback("Buscando...");

  try {
    const data = await apiGet("users/search", {
      username: loggedUser,
      q: query
    });
    state.searchResults = data.users || [];
    renderSearchResults();

    if (state.searchResults.length) {
      setSearchFeedback("");
    } else {
      setSearchFeedback("Nenhum usuário encontrado.", "error");
    }
  } catch (error) {
    state.searchResults = [];
    renderSearchResults();
    setSearchFeedback(error.message || "Não foi possível buscar agora.", "error");
  }
}

async function heartbeat() {
  try {
    await apiPost("presence/ping", { username: loggedUser });
  } catch {}
}

async function initialLoad() {
  setCurrentUserUI();
  updateChatHeader();
  setSearchFeedback("");
  await heartbeat();
  await refreshSidebar();
  renderMessages();

  state.pollTimer = window.setInterval(async () => {
    await heartbeat();
    await refreshSidebar();
    if (state.currentConversationId) {
      await loadMessages();
    }
  }, 3500);
}

els.logoutBtn.addEventListener("click", () => {
  sessionStorage.clear();
  window.location.href = "index.html";
});

els.userSearchInput.addEventListener("input", () => {
  window.clearTimeout(state.searchTimer);
  if (!els.userSearchInput.value.trim()) {
    state.searchResults = [];
    renderSearchResults();
    setSearchFeedback("");
  }
});

els.userSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    window.clearTimeout(state.searchTimer);
    searchUsers();
  }
});

els.searchUserBtn.addEventListener("click", () => {
  window.clearTimeout(state.searchTimer);
  searchUsers();
});

els.imageInput.addEventListener("change", () => {
  const file = els.imageInput.files?.[0] || null;
  state.pendingImageFile = file;
  updatePendingImageUI();
});

els.removeImageBtn.addEventListener("click", () => {
  state.pendingImageFile = null;
  els.imageInput.value = "";
  updatePendingImageUI();
});

els.sendBtn.addEventListener("click", sendMessage);
els.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

els.newGroupBtn.addEventListener("click", openGroupModal);
els.createGroupBtn.addEventListener("click", createGroup);

document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", closeGroupModal);
});

initialLoad().catch((error) => {
  alert(error.message || "Falha ao carregar o projeto.");
});
