const crypto = require("crypto");
const fs = require("fs");
const formidable = require("formidable");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CHAT_IMAGES_BUCKET = "chat-images";
const PROFILE_AVATARS_BUCKET = "profile-avatars";

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function getRoute(req) {
  const value = req.query?.route;
  if (Array.isArray(value)) return value.join("/");
  if (typeof value === "string" && value.trim()) return value.trim();
  const raw = (req.url || "").split("?")[0];
  return raw.replace(/^\/api\/?/, "");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: false });
    form.parse(req, (error, fields, files) => {
      if (error) return reject(error);
      resolve({ fields, files });
    });
  });
}

function normalizeSingle(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safeUsername(value) {
  return String(value || "").trim();
}

function buildPairKey(a, b) {
  return [safeUsername(a), safeUsername(b)].sort().join("::");
}

function publicPathFromUrl(publicUrl, bucket) {
  if (!publicUrl) return null;
  const cleanUrl = String(publicUrl).split("?")[0];
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = cleanUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(cleanUrl.slice(index + marker.length));
}

async function getUser(username) {
  const { data, error } = await supabaseService
    .from("users")
    .select("username, password, is_admin")
    .eq("username", username)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function getProfileMap(usernames) {
  const clean = Array.from(new Set((usernames || []).filter(Boolean)));
  if (!clean.length) return {};

  const { data, error } = await supabaseService
    .from("user_profiles")
    .select("username, display_name, avatar_url")
    .in("username", clean);

  if (error) throw new Error(error.message);

  const map = {};
  (data || []).forEach((profile) => {
    map[profile.username] = {
      display_name: profile.display_name || profile.username,
      avatar_url: profile.avatar_url || null
    };
  });
  return map;
}

async function ensureUserExists(username) {
  const user = await getUser(username);
  if (!user) throw new Error("Usuário não encontrado");
  return user;
}

async function getOnlineSet() {
  const cutoff = new Date(Date.now() - 45000).toISOString();
  const { data, error } = await supabaseService
    .from("online_users")
    .select("username")
    .gte("last_seen", cutoff);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((item) => item.username));
}

async function getContactsForUser(username) {
  const { data, error } = await supabaseService
    .from("contacts")
    .select("user_low, user_high, created_at")
    .or(`user_low.eq.${username},user_high.eq.${username}`)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((item) => ({
    username: item.user_low === username ? item.user_high : item.user_low,
    created_at: item.created_at
  }));
}

async function getPendingRequests(username) {
  const { data, error } = await supabaseService
    .from("contact_requests")
    .select("id, sender_username, receiver_username, status, created_at")
    .eq("status", "pending")
    .or(`sender_username.eq.${username},receiver_username.eq.${username}`)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

async function ensureDirectConversation(userA, userB) {
  const directKey = buildPairKey(userA, userB);

  const { data: existing, error: existingError } = await supabaseService
    .from("conversations")
    .select("id, kind, title")
    .eq("direct_key", directKey)
    .eq("kind", "direct")
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return existing;

  const { data: inserted, error: insertError } = await supabaseService
    .from("conversations")
    .insert([{ kind: "direct", direct_key: directKey, created_by: userA }])
    .select("id, kind, title")
    .single();

  if (insertError) throw new Error(insertError.message);

  const memberRows = [userA, userB].map((username) => ({
    conversation_id: inserted.id,
    username,
    role: "member"
  }));

  const { error: memberError } = await supabaseService
    .from("conversation_members")
    .upsert(memberRows, { onConflict: "conversation_id,username" });

  if (memberError) throw new Error(memberError.message);
  return inserted;
}

async function getConversationList(username) {
  const onlineSet = await getOnlineSet();
  const { data: rows, error } = await supabaseService
    .from("conversation_members")
    .select(`
      conversation_id,
      role,
      conversations (
        id,
        kind,
        title,
        direct_key,
        updated_at,
        created_by
      )
    `)
    .eq("username", username);

  if (error) throw new Error(error.message);

  const conversations = (rows || [])
    .map((row) => row.conversations)
    .filter(Boolean);

  const directOthers = [];
  conversations.forEach((conversation) => {
    if (conversation.kind === "direct" && conversation.direct_key) {
      const parts = conversation.direct_key.split("::");
      const other = parts.find((part) => part !== username);
      if (other) directOthers.push(other);
    }
  });

  const profileMap = await getProfileMap(directOthers);

  const result = conversations.map((conversation) => {
    if (conversation.kind === "direct") {
      const parts = String(conversation.direct_key || "").split("::");
      const otherUsername = parts.find((part) => part !== username) || "Contato";
      const otherProfile = profileMap[otherUsername] || { display_name: otherUsername };
      return {
        id: conversation.id,
        kind: "direct",
        title: otherProfile.display_name || otherUsername,
        subtitle: `@${otherUsername}`,
        other_username: otherUsername,
        is_online: onlineSet.has(otherUsername),
        updated_at: conversation.updated_at
      };
    }

    return {
      id: conversation.id,
      kind: "group",
      title: conversation.title || "Grupo sem nome",
      subtitle: "Grupo",
      is_online: false,
      updated_at: conversation.updated_at
    };
  });

  result.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  return result;
}

async function assertConversationMember(conversationId, username) {
  const { data, error } = await supabaseService
    .from("conversation_members")
    .select("conversation_id, username")
    .eq("conversation_id", conversationId)
    .eq("username", username)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    const err = new Error("Você não participa dessa conversa");
    err.statusCode = 403;
    throw err;
  }
}

async function handleLogin(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const body = await readJsonBody(req);
    const username = safeUsername(body.username);
    const password = String(body.password || "").trim();

    if (!username || !password) {
      return sendJson(res, 400, { success: false, message: "Usuário e senha são obrigatórios" });
    }

    const user = await getUser(username);
    if (!user || user.password !== password) {
      return sendJson(res, 401, { success: false, message: "Usuário ou senha inválidos" });
    }

    const profileMap = await getProfileMap([username]);
    return sendJson(res, 200, {
      success: true,
      token: crypto.randomBytes(24).toString("hex"),
      user: {
        username,
        display_name: profileMap[username]?.display_name || username,
        is_admin: !!user.is_admin
      }
    });
  } catch (error) {
    return sendJson(res, 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handleUserSearch(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const username = safeUsername(req.query.username);
    const q = String(req.query.q || "").trim().toLowerCase();
    await ensureUserExists(username);

    if (!q) return sendJson(res, 200, { success: true, users: [] });

    const { data: users, error } = await supabaseService
      .from("users")
      .select("username")
      .neq("username", username)
      .order("username", { ascending: true })
      .limit(50);

    if (error) throw new Error(error.message);

    const profileMap = await getProfileMap((users || []).map((item) => item.username));
    const contacts = await getContactsForUser(username);
    const contactSet = new Set(contacts.map((item) => item.username));
    const pending = await getPendingRequests(username);
    const outgoingSet = new Set(pending.filter((item) => item.sender_username === username).map((item) => item.receiver_username));
    const incomingSet = new Set(pending.filter((item) => item.receiver_username === username).map((item) => item.sender_username));

    const filtered = (users || []).filter((item) => {
      const displayName = profileMap[item.username]?.display_name || item.username;
      const haystack = `${item.username} ${displayName}`.toLowerCase();
      return haystack.includes(q);
    }).slice(0, 12);

    const result = filtered.map((item) => ({
      username: item.username,
      display_name: profileMap[item.username]?.display_name || item.username,
      relation: contactSet.has(item.username)
        ? "contact"
        : outgoingSet.has(item.username)
          ? "outgoing_pending"
          : incomingSet.has(item.username)
            ? "incoming_pending"
            : "none"
    }));

    return sendJson(res, 200, { success: true, users: result });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handleSidebar(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const username = safeUsername(req.query.username);
    await ensureUserExists(username);

    const contacts = await getContactsForUser(username);
    const requests = await getPendingRequests(username);
    const profileMap = await getProfileMap([
      username,
      ...contacts.map((item) => item.username),
      ...requests.map((item) => item.sender_username),
      ...requests.map((item) => item.receiver_username)
    ]);
    const conversations = await getConversationList(username);

    const incoming = requests
      .filter((item) => item.receiver_username === username)
      .map((item) => ({
        ...item,
        sender_display_name: profileMap[item.sender_username]?.display_name || item.sender_username
      }));

    const outgoing = requests
      .filter((item) => item.sender_username === username)
      .map((item) => ({
        ...item,
        receiver_display_name: profileMap[item.receiver_username]?.display_name || item.receiver_username
      }));

    return sendJson(res, 200, {
      success: true,
      profile: {
        username,
        display_name: profileMap[username]?.display_name || username,
        avatar_url: profileMap[username]?.avatar_url || null
      },
      incoming_requests: incoming,
      outgoing_requests: outgoing,
      contacts_for_group: contacts.map((item) => ({
        username: item.username,
        display_name: profileMap[item.username]?.display_name || item.username,
        avatar_url: profileMap[item.username]?.avatar_url || null
      })),
      conversations
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handleRequestSend(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const body = await readJsonBody(req);
    const username = safeUsername(body.username);
    const target = safeUsername(body.target_username);

    if (!username || !target || username === target) {
      return sendJson(res, 400, { success: false, message: "Convite inválido" });
    }

    await ensureUserExists(username);
    await ensureUserExists(target);

    const { data: contactExists, error: contactError } = await supabaseService
      .from("contacts")
      .select("id")
      .eq("pair_key", buildPairKey(username, target))
      .maybeSingle();

    if (contactError) throw new Error(contactError.message);
    if (contactExists) {
      return sendJson(res, 400, { success: false, message: "Esse usuário já é seu contato" });
    }

    const { data: requestExists, error: requestError } = await supabaseService
      .from("contact_requests")
      .select("id, status")
      .eq("pair_key", buildPairKey(username, target))
      .eq("status", "pending")
      .maybeSingle();

    if (requestError) throw new Error(requestError.message);
    if (requestExists) {
      return sendJson(res, 400, { success: false, message: "Já existe um convite pendente entre vocês" });
    }

    const { error: insertError } = await supabaseService
      .from("contact_requests")
      .insert([{
        sender_username: username,
        receiver_username: target,
        pair_key: buildPairKey(username, target),
        status: "pending"
      }]);

    if (insertError) throw new Error(insertError.message);
    return sendJson(res, 200, { success: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handleRequestRespond(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const body = await readJsonBody(req);
    const username = safeUsername(body.username);
    const requestId = Number(body.request_id);
    const action = String(body.action || "").trim();

    if (!username || !requestId || !["accept", "reject"].includes(action)) {
      return sendJson(res, 400, { success: false, message: "Dados inválidos" });
    }

    const { data: requestRow, error: requestError } = await supabaseService
      .from("contact_requests")
      .select("id, sender_username, receiver_username, status, pair_key")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) throw new Error(requestError.message);
    if (!requestRow || requestRow.receiver_username !== username) {
      return sendJson(res, 404, { success: false, message: "Convite não encontrado" });
    }
    if (requestRow.status !== "pending") {
      return sendJson(res, 400, { success: false, message: "Esse convite já foi respondido" });
    }

    const newStatus = action === "accept" ? "accepted" : "rejected";

    const { error: updateError } = await supabaseService
      .from("contact_requests")
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq("id", requestId);

    if (updateError) throw new Error(updateError.message);

    if (action === "accept") {
      const low = [requestRow.sender_username, requestRow.receiver_username].sort()[0];
      const high = [requestRow.sender_username, requestRow.receiver_username].sort()[1];

      const { error: contactInsertError } = await supabaseService
        .from("contacts")
        .upsert([{
          user_low: low,
          user_high: high,
          pair_key: buildPairKey(low, high)
        }], { onConflict: "pair_key" });

      if (contactInsertError) throw new Error(contactInsertError.message);
      await ensureDirectConversation(requestRow.sender_username, requestRow.receiver_username);
    }

    return sendJson(res, 200, { success: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handleGroupCreate(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const body = await readJsonBody(req);
    const username = safeUsername(body.username);
    const title = String(body.title || "").trim();
    const members = Array.isArray(body.members) ? body.members.map(safeUsername).filter(Boolean) : [];

    if (!username) return sendJson(res, 400, { success: false, message: "Usuário obrigatório" });
    if (title.length < 3) return sendJson(res, 400, { success: false, message: "Dê um nome melhor para o grupo" });
    if (!members.length) return sendJson(res, 400, { success: false, message: "Escolha pelo menos um contato" });

    await ensureUserExists(username);
    const contacts = await getContactsForUser(username);
    const contactSet = new Set(contacts.map((item) => item.username));

    for (const member of members) {
      if (!contactSet.has(member)) {
        return sendJson(res, 400, { success: false, message: `Você só pode adicionar contatos aceitos. Problema com: ${member}` });
      }
    }

    const uniqueMembers = Array.from(new Set([username, ...members]));

    const { data: conversation, error: conversationError } = await supabaseService
      .from("conversations")
      .insert([{
        kind: "group",
        title,
        created_by: username
      }])
      .select("id, kind, title, updated_at")
      .single();

    if (conversationError) throw new Error(conversationError.message);

    const memberRows = uniqueMembers.map((member) => ({
      conversation_id: conversation.id,
      username: member,
      role: member === username ? "owner" : "member"
    }));

    const { error: memberError } = await supabaseService
      .from("conversation_members")
      .insert(memberRows);

    if (memberError) throw new Error(memberError.message);

    return sendJson(res, 200, {
      success: true,
      conversation: {
        id: conversation.id,
        kind: "group",
        title: conversation.title,
        subtitle: "Grupo",
        is_online: false,
        updated_at: conversation.updated_at
      }
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handleMessagesGet(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const username = safeUsername(req.query.username);
    const conversationId = Number(req.query.conversation_id);

    if (!username || !conversationId) {
      return sendJson(res, 400, { success: false, message: "Parâmetros inválidos" });
    }

    await assertConversationMember(conversationId, username);

    const { data, error } = await supabaseService
      .from("messages")
      .select("id, conversation_id, sender_username, content, image_url, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(250);

    if (error) throw new Error(error.message);

    const senders = Array.from(new Set((data || []).map((item) => item.sender_username).filter(Boolean)));
    const profileMap = await getProfileMap(senders);

    const messages = (data || []).map((item) => ({
      ...item,
      sender_display_name: profileMap[item.sender_username]?.display_name || item.sender_username
    }));

    return sendJson(res, 200, { success: true, messages });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handleMessagesPost(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const body = await readJsonBody(req);
    const username = safeUsername(body.username);
    const conversationId = Number(body.conversation_id);
    const content = String(body.content || "").trim();
    const imageUrl = body.image_url ? String(body.image_url) : null;

    if (!username || !conversationId || (!content && !imageUrl)) {
      return sendJson(res, 400, { success: false, message: "Mensagem inválida" });
    }

    await assertConversationMember(conversationId, username);

    const { error } = await supabaseService
      .from("messages")
      .insert([{
        conversation_id: conversationId,
        sender_username: username,
        content,
        image_url: imageUrl
      }]);

    if (error) throw new Error(error.message);

    const { error: touchError } = await supabaseService
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (touchError) throw new Error(touchError.message);

    return sendJson(res, 200, { success: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handlePresencePing(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  try {
    const body = await readJsonBody(req);
    const username = safeUsername(body.username);
    if (!username) return sendJson(res, 400, { success: false, message: "Usuário obrigatório" });

    await ensureUserExists(username);

    const { error } = await supabaseService
      .from("online_users")
      .upsert([{
        username,
        last_seen: new Date().toISOString()
      }], { onConflict: "username" });

    if (error) throw new Error(error.message);
    return sendJson(res, 200, { success: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

async function handleUpload(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  let tempFilePath = null;
  try {
    const { fields, files } = await parseForm(req);
    const username = safeUsername(normalizeSingle(fields.username));
    let file = normalizeSingle(files.file);

    if (!file || !username) {
      return sendJson(res, 400, { success: false, message: "Upload inválido" });
    }

    await ensureUserExists(username);
    tempFilePath = file.filepath;

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowed.includes(file.mimetype)) {
      return sendJson(res, 400, { success: false, message: "Formato não permitido" });
    }

    if (file.size > 5 * 1024 * 1024) {
      return sendJson(res, 400, { success: false, message: "Imagem muito grande (máx. 5MB)" });
    }

    const ext = (file.originalFilename || "imagem").split(".").pop().toLowerCase();
    const path = `${username}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext || "png"}`;
    const fileData = fs.readFileSync(file.filepath);

    const { error: uploadError } = await supabaseService.storage
      .from(CHAT_IMAGES_BUCKET)
      .upload(path, fileData, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabaseService.storage.from(CHAT_IMAGES_BUCKET).getPublicUrl(path);
    return sendJson(res, 200, { success: true, url: data.publicUrl });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  } finally {
    if (tempFilePath) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
}

async function handleProfileUpload(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido" });

  let tempFilePath = null;
  try {
    const { fields, files } = await parseForm(req);
    const username = safeUsername(normalizeSingle(fields.username));
    let file = normalizeSingle(files.file);

    if (!file || !username) {
      return sendJson(res, 400, { success: false, message: "Upload inválido" });
    }

    await ensureUserExists(username);
    tempFilePath = file.filepath;

    const ext = (file.originalFilename || "avatar.png").split(".").pop().toLowerCase() || "png";
    const path = `${username}/avatar-${Date.now()}.${ext}`;
    const fileData = fs.readFileSync(file.filepath);

    const { error: uploadError } = await supabaseService.storage
      .from(PROFILE_AVATARS_BUCKET)
      .upload(path, fileData, { contentType: file.mimetype, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabaseService.storage.from(PROFILE_AVATARS_BUCKET).getPublicUrl(path);

    const { data: profile } = await supabaseService
      .from("user_profiles")
      .select("display_name, avatar_url")
      .eq("username", username)
      .maybeSingle();

    const oldPath = publicPathFromUrl(profile?.avatar_url, PROFILE_AVATARS_BUCKET);

    const { error: upsertError } = await supabaseService
      .from("user_profiles")
      .upsert([{
        username,
        display_name: profile?.display_name || username,
        avatar_url: data.publicUrl
      }], { onConflict: "username" });

    if (upsertError) throw new Error(upsertError.message);

    if (oldPath) {
      try { await supabaseService.storage.from(PROFILE_AVATARS_BUCKET).remove([oldPath]); } catch {}
    }

    return sendJson(res, 200, { success: true, avatar_url: data.publicUrl });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  } finally {
    if (tempFilePath) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
}

async function handler(req, res, routeOverride) {
  const route = routeOverride || getRoute(req);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return sendJson(res, 500, { success: false, message: "Variáveis do Supabase não configuradas" });
  }

  try {
    if (route === "login") return handleLogin(req, res);
    if (route === "sidebar") return handleSidebar(req, res);
    if (route === "users/search") return handleUserSearch(req, res);
    if (route === "requests/send") return handleRequestSend(req, res);
    if (route === "requests/respond") return handleRequestRespond(req, res);
    if (route === "groups/create") return handleGroupCreate(req, res);
    if (route === "messages" && req.method === "GET") return handleMessagesGet(req, res);
    if (route === "messages" && req.method === "POST") return handleMessagesPost(req, res);
    if (route === "presence/ping") return handlePresencePing(req, res);
    if (route === "upload") return handleUpload(req, res);
    if (route === "profile-upload") return handleProfileUpload(req, res);

    return sendJson(res, 404, { success: false, message: `Rota não encontrada: ${route}` });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { success: false, message: error.message || "Erro interno" });
  }
}

module.exports = handler;
module.exports.handler = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
