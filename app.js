// app.js
// Static Live Chatting v2.0 - vanilla JS client using Firebase Realtime Database compat

window.onbeforeunload = () => "Leaving will disconnect you from chat.";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DB_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

const state = {
  user: null,
  profile: null,
  chats: {},
  currentChat: null,
  currentChatType: null,
  replyTo: null,
  typingTimeout: null,
  typingUnsubscribe: null,
  messageUnsubscribe: null,
  hideSeoUntil: 0
};

const selectors = {
  loginPanel: document.getElementById("loginPanel"),
  chatPanel: document.getElementById("chatPanel"),
  googleTab: document.getElementById("googleTab"),
  nicknameTab: document.getElementById("nicknameTab"),
  googlePane: document.querySelector('[data-pane="google"]'),
  nickPane: document.querySelector('[data-pane="nickname"]'),
  nicknameInput: document.getElementById("nicknameInput"),
  passwordInput: document.getElementById("passwordInput"),
  confirmPasswordInput: document.getElementById("confirmPasswordInput"),
  togglePassword: document.getElementById("togglePassword"),
  googleLoginBtn: document.getElementById("googleLoginBtn"),
  nicknameLoginBtn: document.getElementById("nicknameLoginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  chatList: document.getElementById("chatList"),
  messages: document.getElementById("messages"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  typing: document.getElementById("typing"),
  replyBar: document.getElementById("replyBar"),
  replyName: document.getElementById("replyName"),
  replyPreview: document.getElementById("replyPreview"),
  cancelReply: document.getElementById("cancelReply"),
  chatTitle: document.getElementById("chatTitle"),
  chatSubtitle: document.getElementById("chatSubtitle"),
  groupLockBtn: document.getElementById("groupLockBtn"),
  groupMeta: document.getElementById("groupMeta"),
  typingIndicator: document.getElementById("typing"),
  emojiBtn: document.getElementById("emojiBtn"),
  emojiPanel: document.getElementById("emojiPanel"),
  themeToggle: document.getElementById("themeToggle"),
  notifToggle: document.getElementById("notifToggle"),
  lockOnLogout: document.getElementById("lockOnLogout"),
  settingsBtn: document.getElementById("settingsBtn"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
  toast: document.getElementById("toast"),
  incomingRequests: document.getElementById("incomingRequests"),
  sentRequests: document.getElementById("sentRequests"),
  requestTabs: document.querySelectorAll('.request-tabs .tab'),
  newChatBtn: document.getElementById("newChatBtn"),
  addFriendBtn: document.getElementById("addFriendBtn"),
  newGroupBtn: document.getElementById("newGroupBtn"),
  publicBtn: document.getElementById("publicBtn"),
  groupMetaBox: document.getElementById("groupMeta"),
  seoMenu: document.getElementById("seoMenu"),
  seoMenuClose: document.getElementById("seoMenuClose"),
  rotatingWidget: document.getElementById("rotatingWidget"),
  seoWidgetImg: document.getElementById("seoWidgetImg"),
  seoWidgetLink: document.getElementById("seoWidgetLink")
};

/* ============= Helpers ============= */
const hashPassword = (pwd) => {
  return btoa(unescape(encodeURIComponent(pwd)));
};

const toast = (msg, duration = 2200) => {
  selectors.toast.textContent = msg;
  selectors.toast.classList.remove("hidden");
  setTimeout(() => selectors.toast.classList.add("hidden"), duration);
};

const toggleHidden = (el, show) => {
  el.classList[show ? "remove" : "add"]("hidden");
};

const saveSession = (data) => localStorage.setItem("slc2_session", JSON.stringify(data));
const loadSession = () => {
  try { return JSON.parse(localStorage.getItem("slc2_session")); } catch (_) { return null; }
};
const clearSession = () => localStorage.removeItem("slc2_session");

const setTheme = (mode) => {
  if (!mode) return;
  document.documentElement.setAttribute("data-theme", mode);
  localStorage.setItem("slc2_theme", mode);
};

const loadTheme = () => {
  const t = localStorage.getItem("slc2_theme") || "dark";
  setTheme(t);
};

const renderEmojiPanel = () => {
  const emojis = "😀 😃 😄 😁 😆 😅 😂 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤩 🤔 🤨 😐 😑 😶 🙄 😏 😣 😥 😮 🤐 😯 😪 😫 🥱 😴 😌 🤤 😛 😜".split(" ");
  selectors.emojiPanel.innerHTML = "";
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.textContent = e;
    btn.onclick = () => {
      selectors.messageInput.value += e;
      selectors.messageInput.focus();
    };
    selectors.emojiPanel.appendChild(btn);
  });
};

const parseEmbeds = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const images = [];
  const links = [];
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    if (url.match(/\.(png|jpg|jpeg|gif)$/i)) {
      images.push(url);
    } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
      links.push({ type: "youtube", url });
    } else {
      links.push({ type: "link", url });
    }
  }
  return { images, links };
};

const friendlyTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const cacheMessages = (chatId, messages) => {
  localStorage.setItem(`slc2_cache_${chatId}`, JSON.stringify(messages.slice(-100)));
};
const loadCachedMessages = (chatId) => {
  try { return JSON.parse(localStorage.getItem(`slc2_cache_${chatId}`)) || []; } catch (_) { return []; }
};

/* ============= Auth ============= */
const switchLoginMode = (mode) => {
  toggleHidden(selectors.googlePane, mode !== "google");
  toggleHidden(selectors.nickPane, mode !== "nickname");
  selectors.googleTab.classList.toggle("active", mode === "google");
  selectors.nicknameTab.classList.toggle("active", mode === "nickname");
};

const ensureUserProfile = async (uid, data) => {
  const snap = await db.ref(`users/${uid}`).once("value");
  if (!snap.exists()) {
    await db.ref(`users/${uid}`).set({
      displayName: data.displayName,
      passwordHash: data.passwordHash || "",
      createdAt: Date.now(),
      lastSeen: Date.now(),
      clientVersion: "v2",
      google: !!data.google,
      blocked: {},
      settings: { theme: localStorage.getItem("slc2_theme") || "dark" }
    });
  } else {
    await db.ref(`users/${uid}/lastSeen`).set(Date.now());
    if (data.displayName) await db.ref(`users/${uid}/displayName`).set(data.displayName);
    if (data.passwordHash) await db.ref(`users/${uid}/passwordHash`).set(data.passwordHash);
  }
  const profile = (await db.ref(`users/${uid}`).once("value")).val();
  state.profile = profile;
  setTheme(profile?.settings?.theme || localStorage.getItem("slc2_theme") || "dark");
};

const nicknameLogin = async () => {
  const name = selectors.nicknameInput.value.trim();
  const pwd = selectors.passwordInput.value.trim();
  const confirm = selectors.confirmPasswordInput.value.trim();
  if (!name || !pwd) return toast("Nickname and password required");
  const uid = `nick_${name.toLowerCase()}`;
  const hashed = hashPassword(pwd);
  const existing = (await db.ref(`users/${uid}`).once("value")).val();
  if (existing) {
    if (existing.passwordHash && existing.passwordHash !== hashed) return toast("Wrong password");
  } else {
    if (!confirm || confirm !== pwd) return toast("Confirm your password to create account");
  }
  await ensureUserProfile(uid, { displayName: name, passwordHash: hashed, google: false });
  state.user = { uid, displayName: name, authType: "nickname" };
  saveSession({ uid, displayName: name, authType: "nickname" });
  afterLogin();
};

const googleLogin = async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  const res = await auth.signInWithPopup(provider);
  const user = res.user;
  const uid = user.uid;
  await ensureUserProfile(uid, { displayName: user.displayName || user.email, google: true });
  state.user = { uid, displayName: user.displayName || user.email, authType: "google" };
  saveSession({ uid: state.user.uid, displayName: state.user.displayName, authType: "google" });
  afterLogin();
};

const restoreSession = async () => {
  const session = loadSession();
  if (!session) return;
  const profile = (await db.ref(`users/${session.uid}`).once("value")).val();
  if (!profile) return;
  state.user = session;
  state.profile = profile;
  afterLogin();
};

/* ============= UI and listeners ============= */
const bindUI = () => {
  selectors.googleTab.onclick = () => switchLoginMode("google");
  selectors.nicknameTab.onclick = () => switchLoginMode("nickname");
  selectors.togglePassword.onclick = () => {
    const type = selectors.passwordInput.type === "password" ? "text" : "password";
    selectors.passwordInput.type = type;
    selectors.confirmPasswordInput.type = type;
  };
  selectors.googleLoginBtn.onclick = googleLogin;
  selectors.nicknameLoginBtn.onclick = nicknameLogin;
  selectors.logoutBtn.onclick = logout;
  selectors.sendBtn.onclick = sendMessage;
  selectors.messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  selectors.messageInput.addEventListener("input", sendTyping);
  selectors.cancelReply.onclick = () => setReply(null);
  selectors.emojiBtn.onclick = () => selectors.emojiPanel.classList.toggle("hidden");
  selectors.themeToggle.onclick = toggleTheme;
  selectors.notifToggle.onchange = handleNotifToggle;
  selectors.settingsBtn.onclick = openSettings;
  selectors.modalClose.onclick = closeModal;
  selectors.newChatBtn.onclick = () => openAddChat("private");
  selectors.addFriendBtn.onclick = openAddFriend;
  selectors.newGroupBtn.onclick = () => openAddChat("group");
  selectors.publicBtn.onclick = openPublic;
  selectors.groupLockBtn.onclick = toggleGroupPassword;
  selectors.requestTabs.forEach(btn => btn.onclick = () => switchRequestTab(btn.dataset.req));
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
  if (state.user) db.ref(`users/${state.user.uid}/settings/theme`).set(next);
};

const handleNotifToggle = async () => {
  if (selectors.notifToggle.checked) {
    if (Notification.permission === "granted") return;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") selectors.notifToggle.checked = false;
  }
};

const logout = async () => {
  if (selectors.lockOnLogout.checked) clearSession();
  state.user = null;
  state.profile = null;
  switchToLogin();
};

const switchToLogin = () => {
  toggleHidden(selectors.loginPanel, true);
  toggleHidden(selectors.chatPanel, false);
  toggleHidden(selectors.loginPanel, false);
  toggleHidden(selectors.chatPanel, true);
};

const afterLogin = () => {
  toggleHidden(selectors.loginPanel, true);
  toggleHidden(selectors.chatPanel, false);
  loadTheme();
  attachChatStreams();
  loadRequests();
  selectors.notifToggle.checked = Notification.permission === "granted";
  renderEmojiPanel();
  toast("Welcome back, chat is live.");
};

/* ============= Chats & Messages ============= */
const attachChatStreams = () => {
  db.ref("privateChats").on("value", snap => {
    const data = snap.val() || {};
    const mine = {};
    Object.entries(data).forEach(([chatId, chat]) => {
      if (chat.participants && chat.participants[state.user.uid]) {
        mine[chatId] = { ...chat, type: "private" };
      }
    });
    db.ref("groupChats").once("value", gsnap => {
      const gdata = gsnap.val() || {};
      Object.entries(gdata).forEach(([gid, chat]) => {
        if (chat.members && chat.members[state.user.uid]) mine[gid] = { ...chat, type: "group" };
      });
      state.chats = mine;
      renderChatList();
    });
  });
};

const renderChatList = () => {
  selectors.chatList.innerHTML = "";
  const chats = Object.entries(state.chats).sort(([, a], [, b]) => (b.lastMessage || 0) - (a.lastMessage || 0));
  chats.forEach(([id, chat]) => {
    const item = document.createElement("div");
    item.className = "chat-item" + (state.currentChat === id ? " active" : "");
    const name = chat.name || "Unnamed";
    const preview = chat.lastPreview || "Tap to start";
    const row = document.createElement("div");
    row.className = "row";
    const badge = document.createElement("span");
    badge.className = "badge hidden";
    badge.textContent = chat.unread || "";
    row.appendChild(Object.assign(document.createElement("div"), { className: "name", textContent: name }));
    row.appendChild(badge);
    const prev = Object.assign(document.createElement("div"), { className: "preview", textContent: preview });
    const time = document.createElement("div");
    time.className = "preview";
    time.textContent = chat.lastMessage ? friendlyTime(chat.lastMessage) : "";
    const row2 = document.createElement("div");
    row2.className = "row";
    row2.append(prev, time);
    item.append(row, row2);
    item.onclick = () => openChat(id, chat.type);
    selectors.chatList.appendChild(item);
  });
};

const openChat = (chatId, type) => {
  state.currentChat = chatId;
  state.currentChatType = type;
  const chat = state.chats[chatId];
  selectors.chatTitle.textContent = chat.name || "Chat";
  selectors.chatSubtitle.textContent = type === "group" ? "Group chat" : "Private chat";
  selectors.groupLockBtn.disabled = type !== "group";
  if (type === "group" && chat.password) {
    selectors.groupLockBtn.dataset.locked = "true";
    selectors.groupLockBtn.textContent = "🔒";
  }
  selectors.messages.innerHTML = "";
  const cached = loadCachedMessages(chatId);
  cached.forEach(msg => renderMessage(msg.id, msg));
  listenMessages(chatId, type);
  listenTyping(chatId, type);
};

const listenMessages = (chatId, type) => {
  if (state.messageUnsubscribe) state.messageUnsubscribe();
  const path = type === "group" ? `groupChats/${chatId}/messages` : `privateChats/${chatId}/messages`;
  const ref = db.ref(path).limitToLast(80);
  const handler = ref.on("child_added", (snap) => {
    const msg = snap.val();
    renderMessage(snap.key, msg);
    markRead(chatId, type, snap.key);
  });
  state.messageUnsubscribe = () => ref.off("child_added", handler);
};

const listenTyping = (chatId, type) => {
  if (state.typingUnsubscribe) state.typingUnsubscribe();
  const ref = db.ref(`typing/${chatId}`);
  const handler = ref.on("value", snap => {
    const val = snap.val() || {};
    const others = Object.entries(val).filter(([uid]) => uid !== state.user.uid);
    if (!others.length) return selectors.typingIndicator.classList.add("hidden");
    const names = others.map(([, v]) => v.name || "Someone");
    selectors.typingIndicator.textContent = names.length > 2 ? `${names.length} people are typing...` : `${names.join(", ")} is typing...`;
    selectors.typingIndicator.classList.remove("hidden");
  });
  state.typingUnsubscribe = () => ref.off("value", handler);
};

const renderMessage = (id, data) => {
  const bubble = document.createElement("div");
  bubble.className = "message " + (data.sender === state.user.uid ? "self" : "other");
  const meta = document.createElement("div");
  meta.className = "meta";
  const name = document.createElement("span");
  name.textContent = data.displayName || "User";
  const time = document.createElement("span");
  time.textContent = friendlyTime(data.timestamp || Date.now());
  meta.append(name, time);
  bubble.appendChild(meta);

  if (data.reply) {
    const quote = document.createElement("div");
    quote.className = "reply-quote";
    quote.textContent = data.reply.preview || "Reply";
    bubble.appendChild(quote);
  }

  const body = document.createElement("div");
  body.textContent = data.text;
  bubble.appendChild(body);

  const embeds = parseEmbeds(data.text || "");
  embeds.images.forEach(imgUrl => {
    const box = document.createElement("div");
    box.className = "embed";
    const img = document.createElement("img");
    img.src = imgUrl;
    box.appendChild(img);
    bubble.appendChild(box);
  });
  embeds.links.forEach(link => {
    const box = document.createElement("div");
    box.className = "embed";
    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "link";
    if (link.type === "youtube") a.textContent = "YouTube preview";
    else a.textContent = new URL(link.url).hostname;
    box.appendChild(a);
    bubble.appendChild(box);
  });

  if (data.sender !== state.user.uid) {
    const replyBtn = document.createElement("button");
    replyBtn.className = "ghost";
    replyBtn.textContent = "Reply";
    replyBtn.onclick = () => setReply({ id, preview: data.text.slice(0, 80), name: data.displayName });
    bubble.appendChild(replyBtn);
  }

  selectors.messages.appendChild(bubble);
  selectors.messages.scrollTop = selectors.messages.scrollHeight;
  const cached = loadCachedMessages(state.currentChat);
  cached.push({ id, ...data });
  cacheMessages(state.currentChat, cached);
};

const markRead = (chatId, type, msgId) => {
  const path = type === "group" ? `groupChats/${chatId}/messages/${msgId}/readBy/${state.user.uid}` : `privateChats/${chatId}/messages/${msgId}/readBy/${state.user.uid}`;
  db.ref(path).set(Date.now());
};

const setReply = (payload) => {
  state.replyTo = payload;
  toggleHidden(selectors.replyBar, !payload);
  if (payload) {
    selectors.replyName.textContent = payload.name || "User";
    selectors.replyPreview.textContent = payload.preview || "";
  }
};

const sendTyping = () => {
  if (!state.currentChat) return;
  const ref = db.ref(`typing/${state.currentChat}/${state.user.uid}`);
  ref.set({ name: state.profile?.displayName || state.user.displayName, ts: Date.now() });
  if (state.typingTimeout) clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => ref.remove(), 2400);
};

const sendMessage = () => {
  if (!state.currentChat) return toast("Pick a chat first");
  const text = selectors.messageInput.value.trim();
  if (!text) return;
  const chat = state.chats[state.currentChat];
  const path = state.currentChatType === "group" ? `groupChats/${state.currentChat}/messages` : `privateChats/${state.currentChat}/messages`;
  const payload = {
    sender: state.user.uid,
    displayName: state.profile?.displayName || state.user.displayName,
    text,
    timestamp: Date.now(),
    reply: state.replyTo ? { id: state.replyTo.id, preview: state.replyTo.preview } : null
  };
  db.ref(path).push(payload);
  db.ref((state.currentChatType === "group" ? `groupChats/${state.currentChat}` : `privateChats/${state.currentChat}`) + "/lastMessage").set(payload.timestamp);
  db.ref((state.currentChatType === "group" ? `groupChats/${state.currentChat}` : `privateChats/${state.currentChat}`) + "/lastPreview").set(text.slice(0, 60));
  selectors.messageInput.value = "";
  setReply(null);
  sendTyping();
};

/* ============= Friend system & groups ============= */
const loadRequests = () => {
  if (!state.user) return;
  db.ref(`friendRequests/${state.user.uid}`).on("value", snap => {
    renderRequestList(selectors.incomingRequests, snap.val() || {}, true);
  });
  db.ref(`friendRequestsSent/${state.user.uid}`).on("value", snap => {
    renderRequestList(selectors.sentRequests, snap.val() || {}, false);
  });
};

const renderRequestList = (container, data, incoming) => {
  container.innerHTML = "";
  Object.entries(data).forEach(([id, req]) => {
    const row = document.createElement("div");
    row.className = "request";
    const info = document.createElement("div");
    info.textContent = req.fromName || req.toName || "Friend";
    const actions = document.createElement("div");
    actions.className = "actions";
    if (incoming) {
      const accept = document.createElement("button");
      accept.className = "primary";
      accept.textContent = "Accept";
      accept.onclick = () => acceptRequest(id, req);
      const decline = document.createElement("button");
      decline.className = "ghost";
      decline.textContent = "Decline";
      decline.onclick = () => db.ref(`friendRequests/${state.user.uid}/${id}`).remove();
      actions.append(accept, decline);
    } else {
      const cancel = document.createElement("button");
      cancel.className = "ghost";
      cancel.textContent = "Cancel";
      cancel.onclick = () => db.ref(`friendRequestsSent/${state.user.uid}/${id}`).remove();
      actions.append(cancel);
    }
    row.append(info, actions);
    container.appendChild(row);
  });
};

const switchRequestTab = (tab) => {
  selectors.requestTabs.forEach(btn => btn.classList.toggle("active", btn.dataset.req === tab));
  toggleHidden(selectors.incomingRequests, tab !== "incoming");
  toggleHidden(selectors.sentRequests, tab !== "sent");
};

const openAddFriend = () => {
  openModal("Add Friend", (body) => {
    body.innerHTML = `
      <label>Friend nickname</label>
      <input id="friendNameInput" type="text" placeholder="StaticQuasar931" />
      <button id="friendSendBtn" class="primary">Send Request</button>
    `;
    body.querySelector("#friendSendBtn").onclick = async () => {
      const friend = body.querySelector("#friendNameInput").value.trim();
      if (!friend) return toast("Enter a nickname");
      const targetUid = `nick_${friend.toLowerCase()}`;
      const exists = (await db.ref(`users/${targetUid}`).once("value")).exists();
      if (!exists) return toast("User not found");
      const payload = { from: state.user.uid, fromName: state.profile.displayName, createdAt: Date.now() };
      const newRef = db.ref(`friendRequests/${targetUid}`).push(payload);
      db.ref(`friendRequestsSent/${state.user.uid}/${newRef.key}`).set({ to: targetUid, toName: friend, createdAt: Date.now() });
      toast("Request sent");
      closeModal();
    };
  });
};

const acceptRequest = async (id, req) => {
  await db.ref(`friendRequests/${state.user.uid}/${id}`).remove();
  await db.ref(`friendRequestsSent/${req.from}/${id}`).remove();
  const chatId = [state.user.uid, req.from].sort().join("_");
  await db.ref(`privateChats/${chatId}`).update({
    participants: { [state.user.uid]: true, [req.from]: true },
    name: req.fromName || "Friend",
    lastMessage: Date.now()
  });
  toast("Friend added");
};

const openAddChat = (type) => {
  openModal(type === "group" ? "Join / Create Group" : "Start Chat", (body) => {
    body.innerHTML = `
      <label>${type === "group" ? "Group name" : "User nickname"}</label>
      <input id="chatTarget" type="text" />
      ${type === "group" ? '<label>Password (optional)</label><input id="chatPassword" type="text" />' : ''}
      <button id="startChat" class="primary">Continue</button>
    `;
    body.querySelector("#startChat").onclick = async () => {
      const val = body.querySelector("#chatTarget").value.trim();
      const pwd = body.querySelector("#chatPassword")?.value.trim();
      if (!val) return toast("Fill the field");
      if (type === "group") {
        const gid = val.toLowerCase().replace(/\s+/g, "-");
        await db.ref(`groupChats/${gid}`).update({
          name: val,
          members: { ...(state.chats[gid]?.members || {}), [state.user.uid]: true },
          owner: state.user.uid,
          password: pwd || "",
          visibility: pwd ? "private" : "public",
          lastMessage: Date.now()
        });
        toast("Group ready");
      } else {
        const targetUid = `nick_${val.toLowerCase()}`;
        const exists = (await db.ref(`users/${targetUid}`).once("value")).exists();
        if (!exists) return toast("User not found");
        const chatId = [state.user.uid, targetUid].sort().join("_");
        await db.ref(`privateChats/${chatId}`).update({
          participants: { [state.user.uid]: true, [targetUid]: true },
          name: val,
          lastMessage: Date.now()
        });
        toast("Chat ready");
      }
      closeModal();
    };
  });
};

const openPublic = () => {
  openModal("Public spaces", async (body) => {
    const pubSnap = await db.ref("groupChats").once("value");
    const groups = Object.entries(pubSnap.val() || {}).filter(([, g]) => g.visibility === "public");
    body.innerHTML = "";
    groups.forEach(([id, g]) => {
      const card = document.createElement("div");
      card.className = "request";
      card.textContent = g.name || id;
      const join = document.createElement("button");
      join.className = "primary";
      join.textContent = "Join";
      join.onclick = async () => {
        await db.ref(`groupChats/${id}/members/${state.user.uid}`).set(true);
        toast("Joined group");
        closeModal();
      };
      card.appendChild(join);
      body.appendChild(card);
    });
    if (!groups.length) body.textContent = "No public groups yet.";
  });
};

const toggleGroupPassword = () => {
  const chat = state.chats[state.currentChat];
  if (!chat || !chat.password) return;
  const locked = selectors.groupLockBtn.dataset.locked === "true";
  selectors.groupLockBtn.dataset.locked = locked ? "false" : "true";
  selectors.groupLockBtn.textContent = locked ? "🔓" : "🔒";
  selectors.groupMetaBox.textContent = locked ? `Group password: ${chat.password}` : "";
  toggleHidden(selectors.groupMetaBox, locked);
};

/* ============= Settings & blocking ============= */
const openSettings = () => {
  openModal("Settings", (body) => {
    body.innerHTML = `
      <label>Display name</label>
      <input id="settingsName" type="text" value="${state.profile?.displayName || state.user.displayName}" />
      <div class="section-title">Password</div>
      <p class="muted tiny">Mode A: change and break old encrypted links. Mode B: change for new messages only.</p>
      <input id="settingsPass" type="password" placeholder="New password" />
      <div class="actions" style="display:flex; gap:8px;">
        <button id="passModeA" class="secondary">Change (mode A)</button>
        <button id="passModeB" class="ghost">Change (mode B)</button>
      </div>
      <div class="section-title">Blocked users</div>
      <div id="blockedList"></div>
    `;
    body.querySelector("#settingsName").onchange = async (e) => {
      const newName = e.target.value.trim();
      if (!newName) return toast("Name required");
      await db.ref(`users/${state.user.uid}/displayName`).set(newName);
      state.profile.displayName = newName;
      toast("Name updated");
      renderChatList();
    };
    body.querySelector("#passModeA").onclick = () => changePassword(true);
    body.querySelector("#passModeB").onclick = () => changePassword(false);
    const blockedBox = body.querySelector("#blockedList");
    const blocked = state.profile?.blocked || {};
    blockedBox.innerHTML = "";
    Object.keys(blocked).forEach(uid => {
      const row = document.createElement("div");
      row.className = "request";
      row.textContent = uid;
      const btn = document.createElement("button");
      btn.className = "ghost";
      btn.textContent = "Unblock";
      btn.onclick = () => {
        db.ref(`users/${state.user.uid}/blocked/${uid}`).remove();
        row.remove();
      };
      row.appendChild(btn);
      blockedBox.appendChild(row);
    });
    if (!Object.keys(blocked).length) blockedBox.textContent = "No blocked users.";
  });
};

const changePassword = async (breakOld) => {
  const pwd = document.getElementById("settingsPass").value.trim();
  if (!pwd) return toast("Enter a password");
  const hashed = hashPassword(pwd);
  await db.ref(`users/${state.user.uid}/passwordHash`).set(hashed);
  db.ref(`passwordAlerts/${state.user.uid}`).set({ message: "User changed password", breakOld, ts: Date.now() });
  toast("Password updated. Warned chats.");
};

/* ============= Modal helper ============= */
const openModal = (title, builder) => {
  selectors.modalTitle.textContent = title;
  selectors.modalBody.innerHTML = "";
  builder(selectors.modalBody);
  selectors.modalOverlay.classList.remove("hidden");
};
const closeModal = () => selectors.modalOverlay.classList.add("hidden");

/* ============= Visual SEO ============= */
const seoItems = [
  { img: "https://cdn.jsdelivr.net/gh/StaticQuasar931/Images@main/GoogleForm.png", link: "https://sites.google.com/view/staticquasar931/google-form" },
  { img: "https://cdn.jsdelivr.net/gh/StaticQuasar931/Images@main/Join_Our_DC_StaticQuassar931_lcplrf.png", link: "https://discord.gg/DP2hM7RRhR" },
  { img: "https://cdn.jsdelivr.net/gh/StaticQuasar931/Images@main/Follow-us--IG", link: "https://www.instagram.com/freeschoolgamepage/" }
];
let seoIndex = 0;
let seoToggleKeys = [];

const startSeoRotation = () => {
  const showItem = () => {
    const item = seoItems[seoIndex % seoItems.length];
    selectors.seoWidgetImg.src = item.img;
    selectors.seoWidgetLink.href = item.link;
    selectors.rotatingWidget.classList.add("show");
    setTimeout(() => selectors.rotatingWidget.classList.remove("show"), 3200);
    seoIndex += 1;
  };
  showItem();
  setInterval(showItem, 6200);
};

const hideSeoTemporarily = () => {
  state.hideSeoUntil = Date.now() + 180000;
  selectors.seoMenu.classList.add("hidden");
  setTimeout(() => {
    if (Date.now() >= state.hideSeoUntil) selectors.seoMenu.classList.remove("hidden");
  }, 180000);
};

const setupSeo = () => {
  selectors.seoMenuClose.onclick = hideSeoTemporarily;
  startSeoRotation();
  document.addEventListener("keydown", (e) => {
    seoToggleKeys.push(e.key.toLowerCase());
    if (seoToggleKeys.slice(-3).join("") === "yui") {
      selectors.seoMenu.classList.toggle("hidden");
      selectors.rotatingWidget.classList.toggle("hidden");
      seoToggleKeys = [];
    }
    if (seoToggleKeys.length > 3) seoToggleKeys.shift();
  });
};

/* ============= Notifications ============= */
const notify = (title, body) => {
  if (document.hasFocus()) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
};

/* ============= Init ============= */
const init = () => {
  loadTheme();
  bindUI();
  setupSeo();
  restoreSession();
};

init();
