/* =========================================================
   script.js — Front-end logic for the AI Study Assistant
   =========================================================
   Phase 1: core AI chat, new chat, conversation history,
   saved notes, and bookmarks — all backed by localStorage.
   Also handles: theme toggle, collapsible sidebar, sidebar
   nav, and the welcome dashboard <-> chat transition.
   ========================================================= */

// ---------------------------------------------------------
// 1. DOM references
// ---------------------------------------------------------
const app = document.getElementById("app");
const collapseBtn = document.getElementById("collapseBtn");
const expandBtn = document.getElementById("expandBtn");
const navItems = document.querySelectorAll(".nav-item");
const userCardBtn = document.getElementById("userCardBtn");

const themeToggle = document.getElementById("themeToggle");
const greetingText = document.getElementById("greetingText");
const dateLine = document.getElementById("dateLine");

const newChatBtn = document.getElementById("newChatBtn");
const welcomeView = document.getElementById("welcomeView");
const chatView = document.getElementById("chatView");
const historyView = document.getElementById("historyView");
const notesView = document.getElementById("notesView");
const bookmarksView = document.getElementById("bookmarksView");
const flashcardsView = document.getElementById("flashcardsView");
const quizView = document.getElementById("quizView");
const plannerView = document.getElementById("plannerView");
const toolsView = document.getElementById("toolsView");
const profileView = document.getElementById("profileView");
const settingsView = document.getElementById("settingsView");
const helpView = document.getElementById("helpView");
const responseEl = document.getElementById("response");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const dashboardGreeting = document.getElementById("dashboardGreeting");
const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserSub = document.getElementById("sidebarUserSub");

const profileMenuTrigger = document.getElementById("profileMenuTrigger");
const profileDropdown = document.getElementById("profileDropdown");

const notifMenuTrigger = document.getElementById("notifMenuTrigger");
const notifDropdown = document.getElementById("notifDropdown");
const notifDot = document.getElementById("notifDot");
const notifList = document.getElementById("notifList");
const notifEmpty = document.getElementById("notifEmpty");

const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");

const noteForm = document.getElementById("noteForm");
const noteTitleInput = document.getElementById("noteTitleInput");
const noteContentInput = document.getElementById("noteContentInput");
const noteSubmitBtn = document.getElementById("noteSubmitBtn");
const cancelNoteEditBtn = document.getElementById("cancelNoteEditBtn");
const notesSearchInput = document.getElementById("notesSearchInput");
const notesList = document.getElementById("notesList");
const notesEmpty = document.getElementById("notesEmpty");

const bookmarksList = document.getElementById("bookmarksList");
const bookmarksEmpty = document.getElementById("bookmarksEmpty");

// ---------------------------------------------------------
// 2. State
// ---------------------------------------------------------
let currentConversation = null;   // { id, title, messages: [{role, text, time}], createdAt, updatedAt }
let editingNoteId = null;
let activeAbortController = null;
let profileFirstName = "";   // set from saved profile, if any; empty = no name saved yet

const STORAGE_KEYS = {
    conversations: "studyai-conversations",
    activeId: "studyai-active-conversation-id",
    notes: "studyai-notes",
    bookmarks: "studyai-bookmarks",
    flashcardDecks: "studyai-flashcard-decks",
    quizHistory: "studyai-quiz-history",
    plannerTasks: "studyai-planner-tasks",
    profile: "studyai-profile",
    aiPreferences: "studyai-ai-preferences"
};

// ---------------------------------------------------------
// 3. localStorage helpers (each area is its own JSON array)
// ---------------------------------------------------------
function loadList(key) {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error(`Could not read ${key} from localStorage`, e);
        return [];
    }
}

function saveList(key, list) {
    try {
        localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
        console.error(`Could not write ${key} to localStorage`, e);
    }
}

function loadConversations() { return loadList(STORAGE_KEYS.conversations); }
function saveConversations(list) { saveList(STORAGE_KEYS.conversations, list); }

// For single-object storage (not a list) — Profile, AI preferences
function loadObject(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
    } catch (e) {
        console.error(`Could not read ${key} from localStorage`, e);
        return { ...fallback };
    }
}
function saveObject(key, obj) {
    try {
        localStorage.setItem(key, JSON.stringify(obj));
        return true;
    } catch (e) {
        console.error(`Could not write ${key} to localStorage`, e);
        return false;
    }
}

function upsertConversation(conv) {
    const list = loadConversations();
    const idx = list.findIndex((c) => c.id === conv.id);
    if (idx >= 0) list[idx] = conv; else list.unshift(conv);
    saveConversations(list);
}

function loadNotes() { return loadList(STORAGE_KEYS.notes); }
function saveNotes(list) { saveList(STORAGE_KEYS.notes, list); }

function loadBookmarks() { return loadList(STORAGE_KEYS.bookmarks); }
function saveBookmarks(list) { saveList(STORAGE_KEYS.bookmarks, list); }

// ---------------------------------------------------------
// 4. Generic helpers
// ---------------------------------------------------------
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getCurrentTime(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatShortDate(ts) {
    return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncate(text, len) {
    const clean = text.trim();
    return clean.length > len ? clean.slice(0, len).trim() + "…" : clean;
}

function scrollToBottom() {
    responseEl.scrollTop = responseEl.scrollHeight;
}

// ---------------------------------------------------------
// 5. View switching (welcome / chat / history / notes / bookmarks)
// ---------------------------------------------------------
const views = {
    welcome: welcomeView,
    chat: chatView,
    history: historyView,
    notes: notesView,
    bookmarks: bookmarksView,
    flashcards: flashcardsView,
    quiz: quizView,
    planner: plannerView,
    tools: toolsView,
    profile: profileView,
    settings: settingsView,
    help: helpView
};

function showView(name) {
    Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
    if (name === "chat") requestAnimationFrame(scrollToBottom);
}

// ---------------------------------------------------------
// 6. Default composer placeholder text
// ---------------------------------------------------------
const viewConfigs = {
    dashboard: { placeholder: "Ask anything about programming, university courses, assignments, mathematics, or upload your study material..." }
};

// ---------------------------------------------------------
// 7. Greeting + date line
// ---------------------------------------------------------
function updateGreeting() {
    const now = new Date();
    const hour = now.getHours();
    let greeting = "Good evening";
    if (hour < 12) greeting = "Good morning";
    else if (hour < 18) greeting = "Good afternoon";

    const greetingLine = profileFirstName ? `${greeting}, ${profileFirstName}` : greeting;
    greetingText.textContent = greetingLine;
    dashboardGreeting.textContent = greetingLine;
    dateLine.textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}
updateGreeting();

// ---------------------------------------------------------
// 8. Theme toggle (persisted)
// ---------------------------------------------------------
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.innerHTML = theme === "dark"
        ? '<i class="fa-regular fa-sun"></i>'
        : '<i class="fa-regular fa-moon"></i>';
}

const savedTheme = localStorage.getItem("studyai-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("studyai-theme", next);
    syncThemeSwitchUI();
});

// ---------------------------------------------------------
// 9. Collapsible sidebar
// ---------------------------------------------------------
function toggleSidebar() { app.classList.toggle("collapsed"); }
collapseBtn.addEventListener("click", toggleSidebar);
expandBtn.addEventListener("click", toggleSidebar);

// ---------------------------------------------------------
// 10. Sidebar navigation
// ---------------------------------------------------------
function setActiveNav(target) {
    navItems.forEach((item) => item.classList.remove("active"));
    userCardBtn.classList.remove("active");
    if (target && target.classList.contains("nav-item")) target.classList.add("active");
}

function goToDashboard() {
    currentConversation = null;
    localStorage.removeItem(STORAGE_KEYS.activeId);
    messageInput.placeholder = viewConfigs.dashboard.placeholder;
    showView("welcome");
    renderDashboardOverview();
}

function handleNavClick(viewName, target) {
    setActiveNav(target);

    if (viewName === "dashboard") { goToDashboard(); return; }
    if (viewName === "history") { showView("history"); renderHistory(); return; }
    if (viewName === "notes") { showView("notes"); renderNotes(); return; }
    if (viewName === "bookmarks") { showView("bookmarks"); renderBookmarks(); return; }
    if (viewName === "flashcards") { showView("flashcards"); renderSavedDecks(); return; }
    if (viewName === "quiz") { showView("quiz"); return; }
    if (viewName === "planner") { showView("planner"); renderTasks(); return; }
    if (viewName === "tools") { showView("tools"); return; }
    if (viewName === "profile") { showView("profile"); renderProfileDisplay(); return; }
    if (viewName === "settings") { showView("settings"); syncThemeSwitchUI(); syncAiPreferencesUI(); return; }
    if (viewName === "help") { showView("help"); return; }

    // Fallback: unrecognized view name, land safely on the dashboard
    goToDashboard();
}

navItems.forEach((item) => item.addEventListener("click", () => handleNavClick(item.dataset.view, item)));
userCardBtn.addEventListener("click", () => handleNavClick(userCardBtn.dataset.view, userCardBtn));

// ---------------------------------------------------------
// 11. New chat
// ---------------------------------------------------------
newChatBtn.addEventListener("click", () => {
    if (currentConversation && currentConversation.messages.length > 0) {
        const ok = confirm("Start a new chat? Your current conversation is already saved in History.");
        if (!ok) return;
    }
    setActiveNav(document.querySelector('.nav-item[data-view="dashboard"]'));
    goToDashboard();
    messageInput.value = "";
    messageInput.focus();
});

// ---------------------------------------------------------
// 12. Dashboard quick actions + profile dropdown menu
// ---------------------------------------------------------
document.querySelectorAll(".action-card[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const targetView = btn.dataset.view;
        handleNavClick(targetView, document.querySelector(`.nav-item[data-view="${targetView}"]`));
    });
});

const askAiActionBtn = document.getElementById("askAiActionBtn");
askAiActionBtn.addEventListener("click", () => {
    messageInput.focus();
    messageInput.scrollIntoView({ behavior: "smooth", block: "center" });
});

function closeProfileDropdown() {
    profileDropdown.hidden = true;
    profileMenuTrigger.setAttribute("aria-expanded", "false");
}
function openProfileDropdown() {
    closeNotifDropdown();
    profileDropdown.hidden = false;
    profileMenuTrigger.setAttribute("aria-expanded", "true");
}
profileMenuTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (profileDropdown.hidden) openProfileDropdown(); else closeProfileDropdown();
});
profileDropdown.querySelectorAll(".profile-dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
        const view = item.dataset.view;
        closeProfileDropdown();
        handleNavClick(view, document.querySelector(`.nav-item[data-view="${view}"]`));
    });
});

// ----- Notifications: real reminders derived from Study Planner tasks -----
const NOTIF_STATUS_META = {
    overdue: { label: "Overdue", icon: "fa-triangle-exclamation" },
    today: { label: "Due today", icon: "fa-calendar-day" },
    tomorrow: { label: "Due tomorrow", icon: "fa-calendar" }
};

function getTaskNotifications() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const notifications = [];
    loadTasks().filter((t) => !t.completed && t.date).forEach((t) => {
        const taskDate = new Date(`${t.date}T00:00:00`);
        if (Number.isNaN(taskDate.getTime())) return;

        let status = null;
        if (taskDate.getTime() === today.getTime()) status = "today";
        else if (taskDate.getTime() === tomorrow.getTime()) status = "tomorrow";
        else if (taskDate.getTime() < today.getTime()) status = "overdue";

        if (status) notifications.push({ task: t, status });
    });

    const rank = { overdue: 0, today: 1, tomorrow: 2 };
    notifications.sort((a, b) => rank[a.status] - rank[b.status] || a.task.date.localeCompare(b.task.date));
    return notifications;
}

function renderNotifications() {
    const notifications = getTaskNotifications();
    notifDot.hidden = notifications.length === 0;
    notifEmpty.hidden = notifications.length !== 0;

    notifList.innerHTML = notifications.map((n) => {
        const meta = NOTIF_STATUS_META[n.status];
        const metaLine = n.task.subject ? `${meta.label} \u00B7 ${escapeHtml(n.task.subject)}` : meta.label;
        return `
            <button type="button" class="notif-item notif-${n.status}">
                <span class="notif-icon"><i class="fa-solid ${meta.icon}"></i></span>
                <span class="notif-main">
                    <span class="notif-label">${escapeHtml(n.task.name)}</span>
                    <span class="notif-meta">${metaLine}</span>
                </span>
            </button>
        `;
    }).join("");

    notifList.querySelectorAll(".notif-item").forEach((btn) => {
        btn.addEventListener("click", () => {
            closeNotifDropdown();
            handleNavClick("planner", document.querySelector('.nav-item[data-view="planner"]'));
        });
    });
}

function closeNotifDropdown() {
    notifDropdown.hidden = true;
    notifMenuTrigger.setAttribute("aria-expanded", "false");
}
function openNotifDropdown() {
    closeProfileDropdown();
    renderNotifications();
    notifDropdown.hidden = false;
    notifMenuTrigger.setAttribute("aria-expanded", "true");
}
notifMenuTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (notifDropdown.hidden) openNotifDropdown(); else closeNotifDropdown();
});

document.addEventListener("click", (e) => {
    if (!profileDropdown.hidden && !profileMenuTrigger.contains(e.target) && !profileDropdown.contains(e.target)) {
        closeProfileDropdown();
    }
    if (!notifDropdown.hidden && !notifMenuTrigger.contains(e.target) && !notifDropdown.contains(e.target)) {
        closeNotifDropdown();
    }
});
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!profileDropdown.hidden) closeProfileDropdown();
    if (!notifDropdown.hidden) closeNotifDropdown();
});

// ---------------------------------------------------------
// 13. Render chat messages
// ---------------------------------------------------------
function appendUserMessage(message, time) {
    responseEl.insertAdjacentHTML(
        "beforeend",
        `
        <div class="user-row">
            <div>
                <div class="message user-message">${escapeHtml(message)}</div>
                <time>${getCurrentTime(time)} <i class="fa-solid fa-check-double"></i></time>
            </div>
            <span class="avatar avatar-sm"><i class="fa-solid fa-user"></i></span>
        </div>
        `
    );
    scrollToBottom();
}

function appendAiMessage(message, forQuestion, time) {
    const formattedMessage = escapeHtml(message).replace(/\n/g, "<br>");
    const id = `ai-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isBookmarked = loadBookmarks().some((b) => b.question === forQuestion && b.answer === message);

    responseEl.insertAdjacentHTML(
        "beforeend",
        `
        <div class="ai-row">
            <span class="avatar ai-avatar"></span>
            <div class="message ai-message" id="${id}">
                <div class="ai-message-body">${formattedMessage}</div>
                <div class="msg-actions">
                    <button class="msg-action-btn" data-action="copy" title="Copy"><i class="fa-regular fa-copy"></i></button>
                    <button class="msg-action-btn" data-action="regenerate" title="Regenerate"><i class="fa-solid fa-rotate"></i></button>
                    <button class="msg-action-btn ${isBookmarked ? "active" : ""}" data-action="bookmark" title="Bookmark">
                        <i class="fa-${isBookmarked ? "solid" : "regular"} fa-bookmark"></i>
                    </button>
                    <button class="msg-action-btn" data-action="save-note" title="Save to notes"><i class="fa-solid fa-note-sticky"></i></button>
                    <button class="msg-action-btn" data-action="like" title="Like"><i class="fa-regular fa-thumbs-up"></i></button>
                    <button class="msg-action-btn" data-action="dislike" title="Dislike"><i class="fa-regular fa-thumbs-down"></i></button>
                </div>
                <time>${getCurrentTime(time)}</time>
            </div>
        </div>
        `
    );

    const bubble = document.getElementById(id);

    bubble.querySelector('[data-action="copy"]').addEventListener("click", () => {
        navigator.clipboard.writeText(message).catch(() => {});
    });

    bubble.querySelector('[data-action="regenerate"]').addEventListener("click", () => {
        if (forQuestion) askQuestion(forQuestion);
    });

    const bookmarkBtn = bubble.querySelector('[data-action="bookmark"]');
    bookmarkBtn.addEventListener("click", () => toggleBookmark(forQuestion, message, bookmarkBtn));

    bubble.querySelector('[data-action="save-note"]').addEventListener("click", () => {
        const defaultTitle = forQuestion ? truncate(forQuestion, 50) : "AI response";
        const title = prompt("Note title:", defaultTitle);
        if (title === null) return;
        const notes = loadNotes();
        const now = Date.now();
        notes.unshift({ id: String(now), title: title.trim() || "Untitled note", content: message, createdAt: now, updatedAt: now });
        saveNotes(notes);
        if (!notesView.hidden) renderNotes();
    });

    bubble.querySelectorAll('[data-action="like"], [data-action="dislike"]').forEach((b) => {
        b.addEventListener("click", () => {
            const group = bubble.querySelectorAll('[data-action="like"], [data-action="dislike"]');
            if (!b.classList.contains("active")) group.forEach((g) => g.classList.remove("active"));
            b.classList.toggle("active");
        });
    });

    scrollToBottom();
}

function appendStatusMessage(message) {
    responseEl.insertAdjacentHTML("beforeend", `<div class="status-banner">${escapeHtml(message)}</div>`);
    scrollToBottom();
}

function showTypingIndicator() {
    responseEl.insertAdjacentHTML(
        "beforeend",
        `
        <div class="ai-row typing-row" id="typingRow">
            <span class="avatar ai-avatar"></span>
            <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
        `
    );
    scrollToBottom();
}

function removeTypingIndicator() {
    const row = document.getElementById("typingRow");
    if (row) row.remove();
}

function renderConversation(conv) {
    responseEl.innerHTML = "";
    let lastQuestion = "";
    conv.messages.forEach((m) => {
        if (m.role === "user") {
            appendUserMessage(m.text, m.time);
            lastQuestion = m.text;
        } else {
            appendAiMessage(m.text, lastQuestion, m.time);
        }
    });
    scrollToBottom();
}

// ---------------------------------------------------------
// 14. Send a question to the Flask backend, persisting the
//     exchange into the active conversation
// ---------------------------------------------------------
async function askQuestion(overrideMessage) {
    const question = (overrideMessage !== undefined ? overrideMessage : messageInput.value).trim();
    if (!question) {
        messageInput.focus();
        return;
    }

    setActiveNav(document.querySelector('.nav-item[data-view="dashboard"]'));
    showView("chat");
    appendUserMessage(question);

    if (!currentConversation) {
        const now = Date.now();
        currentConversation = { id: String(now), title: truncate(question, 60), messages: [], createdAt: now, updatedAt: now };
        localStorage.setItem(STORAGE_KEYS.activeId, currentConversation.id);
    }
    currentConversation.messages.push({ role: "user", text: question, time: Date.now() });
    currentConversation.updatedAt = Date.now();
    upsertConversation(currentConversation);

    messageInput.value = "";
    messageInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    showTypingIndicator();
    activeAbortController = new AbortController();

    const recordAiReply = (text) => {
        currentConversation.messages.push({ role: "ai", text, time: Date.now() });
        currentConversation.updatedAt = Date.now();
        upsertConversation(currentConversation);
    };

    try {
        const aiPrefs = loadAiPreferences();
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: question,
                responseStyle: aiPrefs.responseStyle,
                explanationLevel: aiPrefs.explanationLevel
            }),
            signal: activeAbortController.signal
        });

        const data = await res.json();
        removeTypingIndicator();

        if (res.ok) {
            appendAiMessage(data.reply, question);
            recordAiReply(data.reply);
        } else {
            const errText = "\u274C " + (data.reply || "Server error.");
            appendAiMessage(errText, question);
            recordAiReply(errText);
        }
    } catch (error) {
        removeTypingIndicator();
        if (error.name === "AbortError") {
            appendStatusMessage("Generation stopped.");
        } else {
            console.error(error);
            const errText = "\u274C Unable to connect to the Flask server.";
            appendAiMessage(errText, question);
            recordAiReply(errText);
        }
    }

    activeAbortController = null;
    messageInput.disabled = false;
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    messageInput.focus();
}

sendBtn.addEventListener("click", () => askQuestion());
messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        askQuestion();
    }
});

// ---------------------------------------------------------
// 15. Chat history panel
// ---------------------------------------------------------
function openConversation(id) {
    const conv = loadConversations().find((c) => c.id === id);
    if (!conv) return;
    currentConversation = conv;
    localStorage.setItem(STORAGE_KEYS.activeId, conv.id);
    showView("chat");
    renderConversation(conv);
}

function deleteConversation(id, evt) {
    evt.stopPropagation();
    if (!confirm("Delete this conversation? This can't be undone.")) return;
    saveConversations(loadConversations().filter((c) => c.id !== id));
    if (currentConversation && currentConversation.id === id) {
        currentConversation = null;
        localStorage.removeItem(STORAGE_KEYS.activeId);
    }
    renderHistory();
}

function renderHistory() {
    const list = loadConversations().sort((a, b) => b.updatedAt - a.updatedAt);
    historyEmpty.hidden = list.length !== 0;

    historyList.innerHTML = list.map((c) => {
        const last = c.messages.length ? c.messages[c.messages.length - 1].text : "";
        return `
            <button class="list-card" data-id="${c.id}">
                <div class="list-card-main">
                    <p class="list-card-title">${escapeHtml(c.title || "Untitled conversation")}</p>
                    <p class="list-card-meta">${formatShortDate(c.updatedAt)} \u00B7 ${c.messages.length} message${c.messages.length === 1 ? "" : "s"}</p>
                    <p class="list-card-preview">${escapeHtml(truncate(last, 110))}</p>
                </div>
                <span class="icon-btn-sm delete-conv" data-id="${c.id}" title="Delete" role="button" tabindex="0">
                    <i class="fa-solid fa-trash"></i>
                </span>
            </button>
        `;
    }).join("");

    historyList.querySelectorAll(".list-card").forEach((card) => {
        card.addEventListener("click", (e) => {
            if (e.target.closest(".delete-conv")) return;
            openConversation(card.dataset.id);
        });
    });
    historyList.querySelectorAll(".delete-conv").forEach((btn) => {
        btn.addEventListener("click", (e) => deleteConversation(btn.dataset.id, e));
    });
}

// ---------------------------------------------------------
// 16. Saved notes panel
// ---------------------------------------------------------
function editNote(id) {
    const note = loadNotes().find((n) => n.id === id);
    if (!note) return;
    editingNoteId = id;
    noteTitleInput.value = note.title;
    noteContentInput.value = note.content;
    noteSubmitBtn.textContent = "Update note";
    cancelNoteEditBtn.hidden = false;
    noteTitleInput.focus();
}

function resetNoteForm() {
    editingNoteId = null;
    noteForm.reset();
    noteSubmitBtn.textContent = "Save note";
    cancelNoteEditBtn.hidden = true;
}

function deleteNote(id) {
    if (!confirm("Delete this note?")) return;
    saveNotes(loadNotes().filter((n) => n.id !== id));
    if (editingNoteId === id) resetNoteForm();
    renderNotes();
}

function renderNotes() {
    const query = notesSearchInput.value.trim().toLowerCase();
    const notes = loadNotes()
        .filter((n) => !query || n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query))
        .sort((a, b) => b.updatedAt - a.updatedAt);

    notesEmpty.hidden = notes.length !== 0;

    notesList.innerHTML = notes.map((n) => `
        <div class="list-card note-card">
            <div class="list-card-main">
                <p class="list-card-title">${escapeHtml(n.title)}</p>
                <p class="list-card-meta">${formatShortDate(n.updatedAt)}</p>
                <p class="list-card-preview">${escapeHtml(truncate(n.content, 140))}</p>
            </div>
            <div class="list-card-actions">
                <button class="icon-btn-sm edit-note" data-id="${n.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn-sm delete-note" data-id="${n.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join("");

    notesList.querySelectorAll(".edit-note").forEach((btn) => btn.addEventListener("click", () => editNote(btn.dataset.id)));
    notesList.querySelectorAll(".delete-note").forEach((btn) => btn.addEventListener("click", () => deleteNote(btn.dataset.id)));
}

noteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = noteTitleInput.value.trim();
    const content = noteContentInput.value.trim();
    if (!content) { noteContentInput.focus(); return; }

    const notes = loadNotes();
    if (editingNoteId) {
        const idx = notes.findIndex((n) => n.id === editingNoteId);
        if (idx >= 0) {
            notes[idx].title = title || "Untitled note";
            notes[idx].content = content;
            notes[idx].updatedAt = Date.now();
        }
    } else {
        const now = Date.now();
        notes.unshift({ id: String(now), title: title || "Untitled note", content, createdAt: now, updatedAt: now });
    }
    saveNotes(notes);
    resetNoteForm();
    renderNotes();
});

cancelNoteEditBtn.addEventListener("click", resetNoteForm);
notesSearchInput.addEventListener("input", renderNotes);

// ---------------------------------------------------------
// 17. Bookmarks panel
// ---------------------------------------------------------
function toggleBookmark(question, answer, btn) {
    const list = loadBookmarks();
    const idx = list.findIndex((b) => b.question === question && b.answer === answer);
    let nowActive;
    if (idx >= 0) {
        list.splice(idx, 1);
        nowActive = false;
    } else {
        list.unshift({ id: String(Date.now()), question: question || "", answer, createdAt: Date.now() });
        nowActive = true;
    }
    saveBookmarks(list);

    btn.classList.toggle("active", nowActive);
    const icon = btn.querySelector("i");
    icon.className = nowActive ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";

    if (!bookmarksView.hidden) renderBookmarks();
}

function renderBookmarks() {
    const list = loadBookmarks().sort((a, b) => b.createdAt - a.createdAt);
    bookmarksEmpty.hidden = list.length !== 0;

    bookmarksList.innerHTML = list.map((b) => `
        <div class="list-card bookmark-card">
            <div class="list-card-main">
                <p class="list-card-title">${escapeHtml(b.question || "Saved response")}</p>
                <p class="list-card-meta">${formatShortDate(b.createdAt)}</p>
                <p class="list-card-preview">${escapeHtml(truncate(b.answer, 160))}</p>
            </div>
            <button class="icon-btn-sm delete-bookmark" data-id="${b.id}" title="Remove bookmark"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join("");

    bookmarksList.querySelectorAll(".delete-bookmark").forEach((btn) => {
        btn.addEventListener("click", () => {
            saveBookmarks(loadBookmarks().filter((b) => b.id !== btn.dataset.id));
            renderBookmarks();
        });
    });
}

// ---------------------------------------------------------
// 18. Flashcards
// ---------------------------------------------------------
const flashcardForm = document.getElementById("flashcardForm");
const flashcardTopicInput = document.getElementById("flashcardTopicInput");
const flashcardCountInput = document.getElementById("flashcardCountInput");
const flashcardGenerateBtn = document.getElementById("flashcardGenerateBtn");
const flashcardError = document.getElementById("flashcardError");

const flashcardStage = document.getElementById("flashcardStage");
const flashcardDeckTitle = document.getElementById("flashcardDeckTitle");
const saveDeckBtn = document.getElementById("saveDeckBtn");
const flipCard = document.getElementById("flipCard");
const flashcardQuestionText = document.getElementById("flashcardQuestionText");
const flashcardAnswerText = document.getElementById("flashcardAnswerText");
const flashcardProgress = document.getElementById("flashcardProgress");
const prevCardBtn = document.getElementById("prevCardBtn");
const nextCardBtn = document.getElementById("nextCardBtn");
const restartDeckBtn = document.getElementById("restartDeckBtn");

const savedDecksList = document.getElementById("savedDecksList");
const savedDecksEmpty = document.getElementById("savedDecksEmpty");

// currentDeck: { topic, flashcards: [{question, answer}], createdAt, savedId }
// savedId is null until the deck has been saved (or was opened from Saved decks)
let currentDeck = null;
let currentCardIndex = 0;

function loadDecks() { return loadList(STORAGE_KEYS.flashcardDecks); }
function saveDecks(list) { saveList(STORAGE_KEYS.flashcardDecks, list); }

function showFlashcardError(message) {
    flashcardError.textContent = message;
    flashcardError.hidden = false;
}
function hideFlashcardError() { flashcardError.hidden = true; }

function renderFlashcard() {
    if (!currentDeck || !currentDeck.flashcards.length) return;
    const card = currentDeck.flashcards[currentCardIndex];
    flashcardQuestionText.textContent = card.question;
    flashcardAnswerText.textContent = card.answer;
    flashcardProgress.textContent = `${currentCardIndex + 1} / ${currentDeck.flashcards.length}`;
    flipCard.classList.remove("flipped");
    prevCardBtn.disabled = currentCardIndex === 0;
    nextCardBtn.disabled = currentCardIndex === currentDeck.flashcards.length - 1;
}

function openDeckInStage(deck, savedId) {
    currentDeck = {
        topic: deck.topic,
        flashcards: deck.flashcards,
        createdAt: deck.createdAt || Date.now(),
        savedId: savedId || null
    };
    currentCardIndex = 0;
    flashcardDeckTitle.textContent = deck.topic;
    flashcardStage.hidden = false;
    renderFlashcard();
    flashcardStage.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

flipCard.addEventListener("click", () => flipCard.classList.toggle("flipped"));

prevCardBtn.addEventListener("click", () => {
    if (currentCardIndex > 0) { currentCardIndex -= 1; renderFlashcard(); }
});
nextCardBtn.addEventListener("click", () => {
    if (currentDeck && currentCardIndex < currentDeck.flashcards.length - 1) { currentCardIndex += 1; renderFlashcard(); }
});
restartDeckBtn.addEventListener("click", () => { currentCardIndex = 0; renderFlashcard(); });

saveDeckBtn.addEventListener("click", () => {
    if (!currentDeck) return;
    const decks = loadDecks();

    if (currentDeck.savedId) {
        const idx = decks.findIndex((d) => d.id === currentDeck.savedId);
        if (idx >= 0) decks[idx].flashcards = currentDeck.flashcards;
    } else {
        const id = String(Date.now());
        decks.unshift({ id, topic: currentDeck.topic, flashcards: currentDeck.flashcards, createdAt: Date.now() });
        currentDeck.savedId = id;
    }

    saveDecks(decks);
    renderSavedDecks();

    const original = saveDeckBtn.innerHTML;
    saveDeckBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
    setTimeout(() => { saveDeckBtn.innerHTML = original; }, 1400);
});

function deleteDeck(id) {
    if (!confirm("Delete this saved deck?")) return;
    saveDecks(loadDecks().filter((d) => d.id !== id));
    if (currentDeck && currentDeck.savedId === id) currentDeck.savedId = null;
    renderSavedDecks();
}

function renderSavedDecks() {
    const decks = loadDecks().sort((a, b) => b.createdAt - a.createdAt);
    savedDecksEmpty.hidden = decks.length !== 0;

    savedDecksList.innerHTML = decks.map((d) => `
        <button class="list-card" data-id="${d.id}">
            <div class="list-card-main">
                <p class="list-card-title">${escapeHtml(d.topic)}</p>
                <p class="list-card-meta">${formatShortDate(d.createdAt)} \u00B7 ${d.flashcards.length} cards</p>
            </div>
            <span class="icon-btn-sm delete-deck" data-id="${d.id}" title="Delete" role="button" tabindex="0">
                <i class="fa-solid fa-trash"></i>
            </span>
        </button>
    `).join("");

    savedDecksList.querySelectorAll(".list-card").forEach((card) => {
        card.addEventListener("click", (e) => {
            if (e.target.closest(".delete-deck")) return;
            const deck = decks.find((d) => d.id === card.dataset.id);
            if (deck) openDeckInStage(deck, deck.id);
        });
    });
    savedDecksList.querySelectorAll(".delete-deck").forEach((btn) => {
        btn.addEventListener("click", (e) => { e.stopPropagation(); deleteDeck(btn.dataset.id); });
    });
}

flashcardForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideFlashcardError();

    const topic = flashcardTopicInput.value.trim();
    const count = parseInt(flashcardCountInput.value, 10) || 10;

    if (!topic) {
        showFlashcardError("Please enter a topic to generate flashcards.");
        flashcardTopicInput.focus();
        return;
    }

    flashcardGenerateBtn.disabled = true;
    const originalBtnHtml = flashcardGenerateBtn.innerHTML;
    flashcardGenerateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating flashcards...';
    flashcardStage.hidden = true;

    try {
        const res = await fetch("/generate-flashcards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, count })
        });
        const data = await res.json();

        if (!res.ok || !Array.isArray(data.flashcards) || data.flashcards.length === 0) {
            showFlashcardError(data.error || "Couldn't generate flashcards for that topic. Please try again.");
        } else {
            openDeckInStage({ topic, flashcards: data.flashcards, createdAt: Date.now() });
        }
    } catch (error) {
        console.error(error);
        showFlashcardError("Unable to connect to the Flask server.");
    }

    flashcardGenerateBtn.disabled = false;
    flashcardGenerateBtn.innerHTML = originalBtnHtml;
});

renderSavedDecks();

// ---------------------------------------------------------
// 19. Quiz Generator
// ---------------------------------------------------------
const quizForm = document.getElementById("quizForm");
const quizSubjectInput = document.getElementById("quizSubjectInput");
const quizTopicInput = document.getElementById("quizTopicInput");
const quizCountInput = document.getElementById("quizCountInput");
const quizDifficultyInput = document.getElementById("quizDifficultyInput");
const quizMaterialInput = document.getElementById("quizMaterialInput");
const quizGenerateBtn = document.getElementById("quizGenerateBtn");
const quizError = document.getElementById("quizError");

const quizStage = document.getElementById("quizStage");
const quizStageTitle = document.getElementById("quizStageTitle");
const quizProgress = document.getElementById("quizProgress");
const quizQuestionText = document.getElementById("quizQuestionText");
const quizOptions = document.getElementById("quizOptions");
const quizPrevBtn = document.getElementById("quizPrevBtn");
const quizNextBtn = document.getElementById("quizNextBtn");
const quizSubmitBtn = document.getElementById("quizSubmitBtn");

const quizResults = document.getElementById("quizResults");
const quizScoreValue = document.getElementById("quizScoreValue");
const quizScoreLabel = document.getElementById("quizScoreLabel");
const quizReviewList = document.getElementById("quizReviewList");
const quizRetakeBtn = document.getElementById("quizRetakeBtn");
const quizNewBtn = document.getElementById("quizNewBtn");

const QUIZ_OPTION_LETTERS = ["A", "B", "C", "D"];

// currentQuiz: { subject, topic, difficulty, questions: [{question, options, correctAnswer, explanation}] }
let currentQuiz = null;
let quizAnswers = [];       // parallel array: selected option index per question, or null
let quizCurrentIndex = 0;

function showQuizError(message) {
    quizError.textContent = message;
    quizError.hidden = false;
}
function hideQuizError() { quizError.hidden = true; }

function startQuiz(quiz) {
    currentQuiz = quiz;
    quizAnswers = new Array(quiz.questions.length).fill(null);
    quizCurrentIndex = 0;

    quizStageTitle.textContent = quiz.subject ? `${quiz.subject} \u2014 ${quiz.topic}` : quiz.topic;
    quizResults.hidden = true;
    quizStage.hidden = false;
    renderQuizQuestion();
    quizStage.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderQuizQuestion() {
    if (!currentQuiz) return;
    const q = currentQuiz.questions[quizCurrentIndex];
    const total = currentQuiz.questions.length;

    quizProgress.textContent = `Question ${quizCurrentIndex + 1} of ${total}`;
    quizQuestionText.textContent = q.question;

    quizOptions.innerHTML = q.options.map((opt, i) => `
        <button type="button" class="quiz-option ${quizAnswers[quizCurrentIndex] === i ? "selected" : ""}" data-index="${i}">
            <span class="quiz-option-letter">${QUIZ_OPTION_LETTERS[i] || i + 1}</span>
            <span>${escapeHtml(opt)}</span>
        </button>
    `).join("");

    quizOptions.querySelectorAll(".quiz-option").forEach((btn) => {
        btn.addEventListener("click", () => {
            quizAnswers[quizCurrentIndex] = parseInt(btn.dataset.index, 10);
            renderQuizQuestion();
        });
    });

    quizPrevBtn.disabled = quizCurrentIndex === 0;
    const isLast = quizCurrentIndex === total - 1;
    quizNextBtn.hidden = isLast;
    quizSubmitBtn.hidden = !isLast;
}

quizPrevBtn.addEventListener("click", () => {
    if (quizCurrentIndex > 0) { quizCurrentIndex -= 1; renderQuizQuestion(); }
});
quizNextBtn.addEventListener("click", () => {
    if (currentQuiz && quizCurrentIndex < currentQuiz.questions.length - 1) { quizCurrentIndex += 1; renderQuizQuestion(); }
});

function submitQuiz() {
    if (!currentQuiz) return;

    let correctCount = 0;
    const total = currentQuiz.questions.length;

    const reviewHtml = currentQuiz.questions.map((q, i) => {
        const selectedIdx = quizAnswers[i];
        const selectedText = selectedIdx !== null ? q.options[selectedIdx] : null;
        const isCorrect = selectedText === q.correctAnswer;
        if (isCorrect) correctCount += 1;

        return `
            <div class="list-card quiz-review-item ${isCorrect ? "correct" : "incorrect"}">
                <div class="list-card-main">
                    <p class="quiz-review-q">${i + 1}. ${escapeHtml(q.question)}</p>
                    <p class="quiz-review-answer">Your answer: ${escapeHtml(selectedText || "No answer")}</p>
                    ${isCorrect ? "" : `<p class="quiz-review-answer">Correct answer: ${escapeHtml(q.correctAnswer)}</p>`}
                    ${q.explanation ? `<p class="quiz-review-explanation">${escapeHtml(q.explanation)}</p>` : ""}
                </div>
            </div>
        `;
    }).join("");

    const percent = Math.round((correctCount / total) * 100);
    quizScoreValue.textContent = `${percent}%`;
    quizScoreLabel.textContent = `${correctCount} / ${total} correct`;
    quizReviewList.innerHTML = reviewHtml;

    quizStage.hidden = true;
    quizResults.hidden = false;
    quizResults.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Record the completion so future dashboard stats can use real data
    const history = loadList(STORAGE_KEYS.quizHistory);
    history.unshift({
        id: String(Date.now()),
        subject: currentQuiz.subject,
        topic: currentQuiz.topic,
        score: correctCount,
        total,
        percent,
        completedAt: Date.now()
    });
    saveList(STORAGE_KEYS.quizHistory, history);
}
quizSubmitBtn.addEventListener("click", submitQuiz);

quizRetakeBtn.addEventListener("click", () => {
    if (!currentQuiz) return;
    quizAnswers = new Array(currentQuiz.questions.length).fill(null);
    quizCurrentIndex = 0;
    quizResults.hidden = true;
    quizStage.hidden = false;
    renderQuizQuestion();
});

quizNewBtn.addEventListener("click", () => {
    currentQuiz = null;
    quizResults.hidden = true;
    quizStage.hidden = true;
    quizForm.reset();
    quizTopicInput.focus();
});

quizForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideQuizError();

    const subject = quizSubjectInput.value.trim();
    const topic = quizTopicInput.value.trim();
    const count = parseInt(quizCountInput.value, 10) || 5;
    const difficulty = quizDifficultyInput.value;
    const material = quizMaterialInput.value.trim();

    if (!topic) {
        showQuizError("Please enter a topic for the quiz.");
        quizTopicInput.focus();
        return;
    }

    quizGenerateBtn.disabled = true;
    const originalBtnHtml = quizGenerateBtn.innerHTML;
    quizGenerateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating quiz...';
    quizStage.hidden = true;
    quizResults.hidden = true;

    try {
        const res = await fetch("/generate-quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, topic, count, difficulty, material })
        });
        const data = await res.json();

        if (!res.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
            showQuizError(data.error || "Couldn't generate a quiz for that topic. Please try again.");
        } else {
            startQuiz({ subject, topic, difficulty, questions: data.questions });
        }
    } catch (error) {
        console.error(error);
        showQuizError("Unable to connect to the Flask server.");
    }

    quizGenerateBtn.disabled = false;
    quizGenerateBtn.innerHTML = originalBtnHtml;
});

// ---------------------------------------------------------
// 20. Study Planner
// ---------------------------------------------------------
const plannerGenerateForm = document.getElementById("plannerGenerateForm");
const plannerSubjectInput = document.getElementById("plannerSubjectInput");
const plannerTopicInput = document.getElementById("plannerTopicInput");
const plannerDeadlineInput = document.getElementById("plannerDeadlineInput");
const plannerTimeInput = document.getElementById("plannerTimeInput");
const plannerDifficultyInput = document.getElementById("plannerDifficultyInput");
const plannerPriorityInput = document.getElementById("plannerPriorityInput");
const plannerGenerateBtn = document.getElementById("plannerGenerateBtn");
const plannerError = document.getElementById("plannerError");

const taskForm = document.getElementById("taskForm");
const taskNameInput = document.getElementById("taskNameInput");
const taskSubjectInput = document.getElementById("taskSubjectInput");
const taskDateInput = document.getElementById("taskDateInput");
const taskDurationInput = document.getElementById("taskDurationInput");
const taskPriorityInput = document.getElementById("taskPriorityInput");
const taskSubmitBtn = document.getElementById("taskSubmitBtn");
const cancelTaskEditBtn = document.getElementById("cancelTaskEditBtn");

const upcomingTabBtn = document.getElementById("upcomingTabBtn");
const completedTabBtn = document.getElementById("completedTabBtn");
const upcomingCount = document.getElementById("upcomingCount");
const completedCount = document.getElementById("completedCount");
const taskList = document.getElementById("taskList");
const taskEmpty = document.getElementById("taskEmpty");

let editingTaskId = null;
let plannerActiveTab = "upcoming";

function loadTasks() { return loadList(STORAGE_KEYS.plannerTasks); }
function saveTasksList(list) { saveList(STORAGE_KEYS.plannerTasks, list); }

function showPlannerError(message) {
    plannerError.textContent = message;
    plannerError.hidden = false;
}
function hidePlannerError() { plannerError.hidden = true; }

function formatTaskDate(iso) {
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function switchPlannerTab(tab) {
    plannerActiveTab = tab;
    upcomingTabBtn.classList.toggle("active", tab === "upcoming");
    completedTabBtn.classList.toggle("active", tab === "completed");
    renderTasks();
}
upcomingTabBtn.addEventListener("click", () => switchPlannerTab("upcoming"));
completedTabBtn.addEventListener("click", () => switchPlannerTab("completed"));

function renderTaskCard(t) {
    const dateLabel = formatTaskDate(t.date);
    const tags = [
        t.subject ? `<span class="task-tag">${escapeHtml(t.subject)}</span>` : "",
        dateLabel ? `<span class="task-tag">${dateLabel}</span>` : "",
        t.duration ? `<span class="task-tag">${escapeHtml(t.duration)}</span>` : "",
        `<span class="task-tag priority-${t.priority}">${t.priority}</span>`
    ].join("");

    return `
        <div class="list-card task-card ${t.completed ? "completed" : ""}">
            <input type="checkbox" class="task-checkbox" data-id="${t.id}" ${t.completed ? "checked" : ""} aria-label="Mark task complete">
            <div class="list-card-main">
                <p class="list-card-title">${escapeHtml(t.name)}</p>
                <div class="task-meta-row">${tags}</div>
            </div>
            <div class="list-card-actions">
                <button class="icon-btn-sm edit-task" data-id="${t.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn-sm delete-task" data-id="${t.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `;
}

function renderTasks() {
    const tasks = loadTasks();
    const upcoming = tasks.filter((t) => !t.completed).sort((a, b) => {
        if (!a.date && !b.date) return b.createdAt - a.createdAt;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
    });
    const completed = tasks.filter((t) => t.completed).sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt));

    upcomingCount.textContent = upcoming.length;
    completedCount.textContent = completed.length;

    const activeList = plannerActiveTab === "upcoming" ? upcoming : completed;
    taskEmpty.hidden = activeList.length !== 0;
    taskEmpty.textContent = plannerActiveTab === "upcoming"
        ? "No upcoming tasks — generate a plan above or add one manually."
        : "No completed tasks yet.";

    taskList.innerHTML = activeList.map(renderTaskCard).join("");

    taskList.querySelectorAll(".task-checkbox").forEach((cb) => {
        cb.addEventListener("change", () => toggleTaskComplete(cb.dataset.id, cb.checked));
    });
    taskList.querySelectorAll(".edit-task").forEach((btn) => {
        btn.addEventListener("click", () => editTask(btn.dataset.id));
    });
    taskList.querySelectorAll(".delete-task").forEach((btn) => {
        btn.addEventListener("click", () => deleteTask(btn.dataset.id));
    });

    // Task dates/completion just changed — keep the notification bell in sync
    notifDot.hidden = getTaskNotifications().length === 0;
    if (!notifDropdown.hidden) renderNotifications();
}

function toggleTaskComplete(id, completed) {
    const tasks = loadTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx >= 0) {
        tasks[idx].completed = completed;
        tasks[idx].completedAt = completed ? Date.now() : null;
        saveTasksList(tasks);
    }
    renderTasks();
}

function editTask(id) {
    const task = loadTasks().find((t) => t.id === id);
    if (!task) return;
    editingTaskId = id;
    taskNameInput.value = task.name;
    taskSubjectInput.value = task.subject || "";
    taskDateInput.value = task.date || "";
    taskDurationInput.value = task.duration || "";
    taskPriorityInput.value = task.priority || "medium";
    taskSubmitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Update task';
    cancelTaskEditBtn.hidden = false;
    taskNameInput.focus();
    taskForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetTaskForm() {
    editingTaskId = null;
    taskForm.reset();
    taskPriorityInput.value = "medium";
    taskSubmitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add task';
    cancelTaskEditBtn.hidden = true;
}

function deleteTask(id) {
    if (!confirm("Delete this task?")) return;
    saveTasksList(loadTasks().filter((t) => t.id !== id));
    if (editingTaskId === id) resetTaskForm();
    renderTasks();
}

taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = taskNameInput.value.trim();
    if (!name) { taskNameInput.focus(); return; }

    const subject = taskSubjectInput.value.trim();
    const date = taskDateInput.value;
    const duration = taskDurationInput.value.trim();
    const priority = taskPriorityInput.value || "medium";

    const tasks = loadTasks();
    if (editingTaskId) {
        const idx = tasks.findIndex((t) => t.id === editingTaskId);
        if (idx >= 0) tasks[idx] = { ...tasks[idx], name, subject, date, duration, priority };
    } else {
        const now = Date.now();
        tasks.unshift({ id: String(now), name, subject, date, duration, priority, completed: false, createdAt: now, completedAt: null });
    }
    saveTasksList(tasks);
    resetTaskForm();
    renderTasks();
});
cancelTaskEditBtn.addEventListener("click", resetTaskForm);

function addTasksFromPlan(generatedTasks, fallbackSubject) {
    const existing = loadTasks();
    const now = Date.now();
    const newTasks = generatedTasks.map((t, i) => ({
        id: String(now + i),
        name: t.name,
        subject: t.subject || fallbackSubject || "",
        date: t.date || "",
        duration: t.duration || "",
        priority: t.priority || "medium",
        completed: false,
        createdAt: now,
        completedAt: null
    }));
    saveTasksList([...newTasks, ...existing]);
}

plannerGenerateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hidePlannerError();

    const subject = plannerSubjectInput.value.trim();
    const topic = plannerTopicInput.value.trim();
    const deadline = plannerDeadlineInput.value;
    const availableTime = plannerTimeInput.value.trim();
    const difficulty = plannerDifficultyInput.value;
    const priority = plannerPriorityInput.value;

    if (!topic) {
        showPlannerError("Please describe what you need to study.");
        plannerTopicInput.focus();
        return;
    }

    plannerGenerateBtn.disabled = true;
    const originalBtnHtml = plannerGenerateBtn.innerHTML;
    plannerGenerateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating plan...';

    try {
        const res = await fetch("/generate-study-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, topic, deadline, availableTime, difficulty, priority })
        });
        const data = await res.json();

        if (!res.ok || !Array.isArray(data.tasks) || data.tasks.length === 0) {
            showPlannerError(data.error || "Couldn't generate a study plan for that. Please try again.");
        } else {
            addTasksFromPlan(data.tasks, subject);
            switchPlannerTab("upcoming");
        }
    } catch (error) {
        console.error(error);
        showPlannerError("Unable to connect to the Flask server.");
    }

    plannerGenerateBtn.disabled = false;
    plannerGenerateBtn.innerHTML = originalBtnHtml;
});

renderTasks();

// ---------------------------------------------------------
// 21. AI Study Tools (Concept Explainer, Code Debugger,
//     Math Solver, Assignment Helper)
// ---------------------------------------------------------
const toolsTabs = document.querySelectorAll("#toolsTabs .planner-tab");
const toolPanes = {
    explain: document.getElementById("tool-explain"),
    debug: document.getElementById("tool-debug"),
    math: document.getElementById("tool-math"),
    assignment: document.getElementById("tool-assignment")
};

function switchTool(tool) {
    if (!toolPanes[tool]) return;
    toolsTabs.forEach((t) => t.classList.toggle("active", t.dataset.tool === tool));
    Object.entries(toolPanes).forEach(([key, el]) => { el.hidden = key !== tool; });
}
toolsTabs.forEach((t) => t.addEventListener("click", () => switchTool(t.dataset.tool)));

function showToolError(el, message) {
    el.textContent = message;
    el.hidden = false;
}
function hideToolError(el) { el.hidden = true; }

// Generic renderer for tools whose output is just a set of
// labeled text/list sections (Concept Explainer, Assignment Helper)
function renderToolSections(container, sections) {
    const visible = sections.filter((s) => (Array.isArray(s.content) ? s.content.length > 0 : !!(s.content && s.content.trim())));
    container.innerHTML = visible.map((s) => `
        <div class="tool-result-section">
            <h4>${escapeHtml(s.label)}</h4>
            ${Array.isArray(s.content)
                ? `<ul>${s.content.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                : `<p>${escapeHtml(s.content).replace(/\n/g, "<br>")}</p>`}
        </div>
    `).join("");
    container.hidden = false;
    container.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ----- A. Concept Explainer -----
const explainForm = document.getElementById("explainForm");
const explainConceptInput = document.getElementById("explainConceptInput");
const explainBtn = document.getElementById("explainBtn");
const explainError = document.getElementById("explainError");
const explainResult = document.getElementById("explainResult");

explainForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideToolError(explainError);
    const concept = explainConceptInput.value.trim();
    if (!concept) { showToolError(explainError, "Please enter a concept to explain."); explainConceptInput.focus(); return; }

    explainBtn.disabled = true;
    const original = explainBtn.innerHTML;
    explainBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Explaining...';
    explainResult.hidden = true;

    try {
        const res = await fetch("/explain-concept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ concept })
        });
        const data = await res.json();

        if (!res.ok || !data.simpleExplanation) {
            showToolError(explainError, data.error || "Couldn't generate an explanation. Please try again.");
        } else {
            renderToolSections(explainResult, [
                { label: "Simple explanation", content: data.simpleExplanation },
                { label: "Detailed explanation", content: data.detailedExplanation },
                { label: "Example", content: data.example },
                { label: "Real-world analogy", content: data.analogy },
                { label: "Key points", content: data.keyPoints || [] }
            ]);
        }
    } catch (error) {
        console.error(error);
        showToolError(explainError, "Unable to connect to the Flask server.");
    }

    explainBtn.disabled = false;
    explainBtn.innerHTML = original;
});

// ----- B. Code Debugger -----
const debugForm = document.getElementById("debugForm");
const debugLanguageInput = document.getElementById("debugLanguageInput");
const debugCodeInput = document.getElementById("debugCodeInput");
const debugErrorInput = document.getElementById("debugErrorInput");
const debugBtn = document.getElementById("debugBtn");
const debugError = document.getElementById("debugError");
const debugResult = document.getElementById("debugResult");

function renderDebugResult(data) {
    const suggestionsHtml = (data.suggestions && data.suggestions.length)
        ? `<div class="tool-result-section"><h4>Suggestions</h4><ul>${data.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
        : "";

    debugResult.innerHTML = `
        <div class="tool-result-section"><h4>Problem</h4><p>${escapeHtml(data.problem)}</p></div>
        ${data.causeExplanation ? `<div class="tool-result-section"><h4>Why this happens</h4><p>${escapeHtml(data.causeExplanation)}</p></div>` : ""}
        <div class="tool-result-section">
            <div class="tool-code-header">
                <h4>Corrected code</h4>
                <button type="button" class="icon-btn-sm" id="copyDebugCodeBtn" title="Copy code"><i class="fa-regular fa-copy"></i></button>
            </div>
            <pre class="tool-code-block"><code>${escapeHtml(data.correctedCode)}</code></pre>
        </div>
        ${data.correctionExplanation ? `<div class="tool-result-section"><h4>What changed</h4><p>${escapeHtml(data.correctionExplanation)}</p></div>` : ""}
        ${suggestionsHtml}
    `;
    debugResult.hidden = false;

    const copyBtn = document.getElementById("copyDebugCodeBtn");
    if (copyBtn) copyBtn.addEventListener("click", () => navigator.clipboard.writeText(data.correctedCode).catch(() => {}));

    debugResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

debugForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideToolError(debugError);
    const language = debugLanguageInput.value;
    const code = debugCodeInput.value.trim();
    const errorMessage = debugErrorInput.value.trim();
    if (!code) { showToolError(debugError, "Please paste in some code to debug."); debugCodeInput.focus(); return; }

    debugBtn.disabled = true;
    const original = debugBtn.innerHTML;
    debugBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Debugging...';
    debugResult.hidden = true;

    try {
        const res = await fetch("/debug-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language, code, error: errorMessage })
        });
        const data = await res.json();

        if (!res.ok || !data.problem || !data.correctedCode) {
            showToolError(debugError, data.error || "Couldn't debug that code. Please try again.");
        } else {
            renderDebugResult(data);
        }
    } catch (error) {
        console.error(error);
        showToolError(debugError, "Unable to connect to the Flask server.");
    }

    debugBtn.disabled = false;
    debugBtn.innerHTML = original;
});

// ----- C. Mathematics Solver -----
const mathForm = document.getElementById("mathForm");
const mathProblemInput = document.getElementById("mathProblemInput");
const mathBtn = document.getElementById("mathBtn");
const mathError = document.getElementById("mathError");
const mathResult = document.getElementById("mathResult");

function renderMathResult(data) {
    mathResult.innerHTML = `
        <div class="tool-result-section">
            <h4>Step-by-step solution</h4>
            <ol class="tool-steps">${data.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
        </div>
        <div class="tool-answer-card">
            <span class="tool-answer-label">Final answer</span>
            <p>${escapeHtml(data.finalAnswer)}</p>
        </div>
        ${data.explanation ? `<div class="tool-result-section"><h4>Explanation</h4><p>${escapeHtml(data.explanation)}</p></div>` : ""}
    `;
    mathResult.hidden = false;
    mathResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

mathForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideToolError(mathError);
    const problem = mathProblemInput.value.trim();
    if (!problem) { showToolError(mathError, "Please enter a problem to solve."); mathProblemInput.focus(); return; }

    mathBtn.disabled = true;
    const original = mathBtn.innerHTML;
    mathBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Solving...';
    mathResult.hidden = true;

    try {
        const res = await fetch("/solve-math", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ problem })
        });
        const data = await res.json();

        if (!res.ok || !Array.isArray(data.steps) || data.steps.length === 0 || !data.finalAnswer) {
            showToolError(mathError, data.error || "Couldn't solve that problem. Please try again.");
        } else {
            renderMathResult(data);
        }
    } catch (error) {
        console.error(error);
        showToolError(mathError, "Unable to connect to the Flask server.");
    }

    mathBtn.disabled = false;
    mathBtn.innerHTML = original;
});

// ----- D. Assignment Helper -----
const assignmentForm = document.getElementById("assignmentForm");
const assignmentSubjectInput = document.getElementById("assignmentSubjectInput");
const assignmentTextInput = document.getElementById("assignmentTextInput");
const assignmentBtn = document.getElementById("assignmentBtn");
const assignmentError = document.getElementById("assignmentError");
const assignmentResult = document.getElementById("assignmentResult");

assignmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideToolError(assignmentError);
    const subject = assignmentSubjectInput.value.trim();
    const assignment = assignmentTextInput.value.trim();
    if (!assignment) { showToolError(assignmentError, "Please describe the assignment."); assignmentTextInput.focus(); return; }

    assignmentBtn.disabled = true;
    const original = assignmentBtn.innerHTML;
    assignmentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Thinking...';
    assignmentResult.hidden = true;

    try {
        const res = await fetch("/assignment-help", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, assignment })
        });
        const data = await res.json();

        if (!res.ok || !data.breakdown) {
            showToolError(assignmentError, data.error || "Couldn't generate guidance for that. Please try again.");
        } else {
            renderToolSections(assignmentResult, [
                { label: "Breakdown", content: data.breakdown },
                { label: "Suggested approach", content: data.approach },
                { label: "Key concepts", content: data.keyConcepts || [] },
                { label: "Step-by-step guidance", content: data.steps || [] },
                { label: "Resources & study directions", content: data.resources || [] }
            ]);
        }
    } catch (error) {
        console.error(error);
        showToolError(assignmentError, "Unable to connect to the Flask server.");
    }

    assignmentBtn.disabled = false;
    assignmentBtn.innerHTML = original;
});

// ---------------------------------------------------------
// 22. Dashboard overview (Study overview, Recent activity,
//     Continue studying) — all computed from real stored data
// ---------------------------------------------------------
const overviewProgressValue = document.getElementById("overviewProgressValue");
const overviewStreakValue = document.getElementById("overviewStreakValue");
const overviewCompletedValue = document.getElementById("overviewCompletedValue");
const continueStudyingCard = document.getElementById("continueStudyingCard");
const continueStudyingEmpty = document.getElementById("continueStudyingEmpty");
const continueTitle = document.getElementById("continueTitle");
const continueMeta = document.getElementById("continueMeta");
const continueBtn = document.getElementById("continueBtn");
const recentActivityList = document.getElementById("recentActivityList");
const recentActivityEmpty = document.getElementById("recentActivityEmpty");

const ACTIVITY_ICONS = { chat: "fa-comment", note: "fa-note-sticky", bookmark: "fa-bookmark", task: "fa-circle-check" };

function getAllActivityDates() {
    const dates = new Set();
    loadConversations().forEach((c) => c.messages.forEach((m) => dates.add(new Date(m.time).toDateString())));
    loadTasks().filter((t) => t.completed && t.completedAt).forEach((t) => dates.add(new Date(t.completedAt).toDateString()));
    loadNotes().forEach((n) => dates.add(new Date(n.createdAt).toDateString()));
    loadBookmarks().forEach((b) => dates.add(new Date(b.createdAt).toDateString()));
    return dates;
}

function computeStreak() {
    const dates = getAllActivityDates();
    let cursor = new Date();
    if (!dates.has(cursor.toDateString())) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dates.has(cursor.toDateString())) return 0;
    }
    let streak = 0;
    while (dates.has(cursor.toDateString())) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function renderStudyOverview() {
    const tasks = loadTasks();
    const completedTasks = tasks.filter((t) => t.completed).length;
    const totalTasks = tasks.length;
    const progressPercent = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const streak = computeStreak();

    overviewProgressValue.textContent = totalTasks ? `${progressPercent}%` : "No tasks yet";
    overviewStreakValue.textContent = `${streak} day${streak === 1 ? "" : "s"}`;
    overviewCompletedValue.textContent = `${completedTasks}`;
}

function relativeTime(ts) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatShortDate(ts);
}

function getRecentActivityItems() {
    const items = [];
    loadConversations().forEach((c) => {
        if (c.messages.length) items.push({ type: "chat", label: c.title || "Untitled conversation", time: c.updatedAt, id: c.id });
    });
    loadNotes().forEach((n) => items.push({ type: "note", label: n.title, time: n.updatedAt || n.createdAt }));
    loadBookmarks().forEach((b) => items.push({ type: "bookmark", label: b.question || "Saved response", time: b.createdAt }));
    loadTasks().filter((t) => t.completed).forEach((t) => items.push({ type: "task", label: t.name, time: t.completedAt || t.createdAt }));
    return items.sort((a, b) => b.time - a.time).slice(0, 5);
}

function renderRecentActivity() {
    const items = getRecentActivityItems();
    if (!items.length) {
        recentActivityList.innerHTML = "";
        recentActivityEmpty.hidden = false;
        return;
    }
    recentActivityEmpty.hidden = true;
    recentActivityList.innerHTML = items.map((item, idx) => `
        <button class="activity-item" data-index="${idx}">
            <span class="activity-icon"><i class="fa-solid ${ACTIVITY_ICONS[item.type]}"></i></span>
            <span class="activity-main">
                <span class="activity-label">${escapeHtml(item.label)}</span>
                <span class="activity-time">${relativeTime(item.time)}</span>
            </span>
        </button>
    `).join("");

    recentActivityList.querySelectorAll(".activity-item").forEach((btn) => {
        btn.addEventListener("click", () => {
            const item = items[parseInt(btn.dataset.index, 10)];
            if (item.type === "chat") { openConversation(item.id); }
            else if (item.type === "note") { handleNavClick("notes", document.querySelector('.nav-item[data-view="notes"]')); }
            else if (item.type === "bookmark") { handleNavClick("bookmarks", document.querySelector('.nav-item[data-view="bookmarks"]')); }
            else if (item.type === "task") {
                handleNavClick("planner", document.querySelector('.nav-item[data-view="planner"]'));
                switchPlannerTab("completed");
            }
        });
    });
}

function renderContinueStudying() {
    const conversations = loadConversations().filter((c) => c.messages.length);
    if (conversations.length) {
        const latest = conversations.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        continueStudyingCard.hidden = false;
        continueStudyingEmpty.hidden = true;
        continueTitle.textContent = latest.title || "Untitled conversation";
        continueMeta.textContent = `${latest.messages.length} message${latest.messages.length === 1 ? "" : "s"} \u00B7 ${formatShortDate(latest.updatedAt)}`;
        continueBtn.onclick = () => openConversation(latest.id);
        return;
    }

    const upcoming = loadTasks().filter((t) => !t.completed && t.date).sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length) {
        const next = upcoming[0];
        continueStudyingCard.hidden = false;
        continueStudyingEmpty.hidden = true;
        continueTitle.textContent = next.name;
        continueMeta.textContent = `${next.subject ? next.subject + " \u00B7 " : ""}${formatTaskDate(next.date)}`;
        continueBtn.onclick = () => handleNavClick("planner", document.querySelector('.nav-item[data-view="planner"]'));
        return;
    }

    continueStudyingCard.hidden = true;
    continueStudyingEmpty.hidden = false;
}

function renderDashboardOverview() {
    renderStudyOverview();
    renderRecentActivity();
    renderContinueStudying();
}

// ---------------------------------------------------------
// 23. Profile — single source of truth for the user's info,
//     read by the Profile page, the sidebar, and the greeting
// ---------------------------------------------------------
const DEFAULT_PROFILE = { name: "", studentId: "", university: "", program: "", year: "", subjects: "", preferences: "" };

function loadProfile() { return loadObject(STORAGE_KEYS.profile, DEFAULT_PROFILE); }
function saveProfileData(profile) { return saveObject(STORAGE_KEYS.profile, profile); }

// Pushes the saved profile out to every place it's displayed:
// the topbar/dashboard greeting and the sidebar user card.
function applyProfileToUI(profile) {
    const trimmedName = (profile.name || "").trim();
    profileFirstName = trimmedName ? trimmedName.split(" ")[0] : "";
    updateGreeting();

    if (trimmedName) {
        sidebarUserName.textContent = trimmedName;
        sidebarUserSub.textContent = profile.program || profile.university || "Student";
    } else {
        sidebarUserName.textContent = "Set up your profile";
        sidebarUserSub.textContent = "Tap to add your info";
    }
}

const profileDisplay = document.getElementById("profileDisplay");
const profileForm = document.getElementById("profileForm");
const profileDisplayName = document.getElementById("profileDisplayName");
const profileDisplaySub = document.getElementById("profileDisplaySub");
const profileDisplayStudentId = document.getElementById("profileDisplayStudentId");
const profileDisplayProgram = document.getElementById("profileDisplayProgram");
const profileDisplayUniversity = document.getElementById("profileDisplayUniversity");
const profileDisplayYear = document.getElementById("profileDisplayYear");
const profileDisplaySubjects = document.getElementById("profileDisplaySubjects");
const profileDisplayPreferences = document.getElementById("profileDisplayPreferences");

const editProfileBtn = document.getElementById("editProfileBtn");
const cancelProfileBtn = document.getElementById("cancelProfileBtn");
const profileNameInput = document.getElementById("profileNameInput");
const profileStudentIdInput = document.getElementById("profileStudentIdInput");
const profileProgramInput = document.getElementById("profileProgramInput");
const profileUniversityInput = document.getElementById("profileUniversityInput");
const profileYearInput = document.getElementById("profileYearInput");
const profileSubjectsInput = document.getElementById("profileSubjectsInput");
const profilePreferencesInput = document.getElementById("profilePreferencesInput");
const profileError = document.getElementById("profileError");

// Always reads fresh from storage, so returning to Profile (or
// opening it for the first time) never shows stale/default data.
function renderProfileDisplay() {
    const profile = loadProfile();
    const trimmedName = (profile.name || "").trim();

    profileDisplayName.textContent = trimmedName || "Your name";
    profileDisplaySub.textContent = profile.program || profile.university || "Add your program and university";

    profileDisplayStudentId.textContent = profile.studentId || "\u2014";
    profileDisplayProgram.textContent = profile.program || "\u2014";
    profileDisplayUniversity.textContent = profile.university || "\u2014";
    profileDisplayYear.textContent = profile.year || "\u2014";
    profileDisplaySubjects.textContent = profile.subjects || "\u2014";
    profileDisplayPreferences.textContent = profile.preferences || "\u2014";
}

editProfileBtn.addEventListener("click", () => {
    const profile = loadProfile();
    profileNameInput.value = profile.name || "";
    profileStudentIdInput.value = profile.studentId || "";
    profileProgramInput.value = profile.program || "";
    profileUniversityInput.value = profile.university || "";
    profileYearInput.value = profile.year || "";
    profileSubjectsInput.value = profile.subjects || "";
    profilePreferencesInput.value = profile.preferences || "";

    profileError.hidden = true;
    profileDisplay.hidden = true;
    profileForm.hidden = false;
    profileNameInput.focus();
});

cancelProfileBtn.addEventListener("click", () => {
    profileError.hidden = true;
    profileForm.hidden = true;
    profileDisplay.hidden = false;
});

profileForm.addEventListener("submit", (e) => {
    e.preventDefault();
    profileError.hidden = true;

    const name = profileNameInput.value.trim();
    if (!name) {
        profileError.textContent = "Please enter your name.";
        profileError.hidden = false;
        profileNameInput.focus();
        return;
    }

    const profile = {
        name,
        studentId: profileStudentIdInput.value.trim(),
        program: profileProgramInput.value.trim(),
        university: profileUniversityInput.value.trim(),
        year: profileYearInput.value.trim(),
        subjects: profileSubjectsInput.value.trim(),
        preferences: profilePreferencesInput.value.trim()
    };

    // Single source of truth: save once, then push the same
    // object out to every place that displays it.
    const saved = saveProfileData(profile);
    if (!saved) {
        profileError.textContent = "Couldn't save your profile. Please try again.";
        profileError.hidden = false;
        return; // form stays open with the entered data intact
    }

    applyProfileToUI(profile);
    renderProfileDisplay();
    profileForm.hidden = true;
    profileDisplay.hidden = false;
});

// Apply whatever profile is already saved (or the empty default)
// immediately on load, so the greeting/sidebar are correct even
// before the user ever opens the Profile page.
applyProfileToUI(loadProfile());
renderProfileDisplay();

// ---------------------------------------------------------
// 24. Settings — appearance, AI preferences, data & privacy
// ---------------------------------------------------------
const settingsThemeSwitch = document.getElementById("settingsThemeSwitch");
const themeSwitchBtns = settingsThemeSwitch.querySelectorAll(".planner-tab");
const responseStyleInput = document.getElementById("responseStyleInput");
const explanationLevelInput = document.getElementById("explanationLevelInput");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const clearNotesBtn = document.getElementById("clearNotesBtn");
const clearBookmarksBtn = document.getElementById("clearBookmarksBtn");
const resetAppBtn = document.getElementById("resetAppBtn");

function syncThemeSwitchUI() {
    const current = document.documentElement.getAttribute("data-theme");
    themeSwitchBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.themeChoice === current));
}
themeSwitchBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        applyTheme(btn.dataset.themeChoice);
        localStorage.setItem("studyai-theme", btn.dataset.themeChoice);
        syncThemeSwitchUI();
    });
});

const DEFAULT_AI_PREFS = { responseStyle: "balanced", explanationLevel: "intermediate" };
function loadAiPreferences() { return loadObject(STORAGE_KEYS.aiPreferences, DEFAULT_AI_PREFS); }
function saveAiPreferences(prefs) { return saveObject(STORAGE_KEYS.aiPreferences, prefs); }

function syncAiPreferencesUI() {
    const prefs = loadAiPreferences();
    responseStyleInput.value = prefs.responseStyle;
    explanationLevelInput.value = prefs.explanationLevel;
}
responseStyleInput.addEventListener("change", () => {
    const prefs = loadAiPreferences();
    prefs.responseStyle = responseStyleInput.value;
    saveAiPreferences(prefs);
});
explanationLevelInput.addEventListener("change", () => {
    const prefs = loadAiPreferences();
    prefs.explanationLevel = explanationLevelInput.value;
    saveAiPreferences(prefs);
});

clearHistoryBtn.addEventListener("click", () => {
    if (!confirm("Are you sure you want to delete your chat history? This action cannot be undone.")) return;
    saveConversations([]);
    localStorage.removeItem(STORAGE_KEYS.activeId);
    currentConversation = null;
    if (!historyView.hidden) renderHistory();
    renderDashboardOverview();
});

clearNotesBtn.addEventListener("click", () => {
    if (!confirm("Are you sure you want to delete your saved notes? This action cannot be undone.")) return;
    saveNotes([]);
    if (!notesView.hidden) renderNotes();
    renderDashboardOverview();
});

clearBookmarksBtn.addEventListener("click", () => {
    if (!confirm("Are you sure you want to delete your bookmarks? This action cannot be undone.")) return;
    saveBookmarks([]);
    if (!bookmarksView.hidden) renderBookmarks();
    renderDashboardOverview();
});

resetAppBtn.addEventListener("click", () => {
    const confirmed = confirm(
        "Are you sure you want to reset all application data? This will permanently delete your chat history, " +
        "notes, bookmarks, flashcard decks, quiz history, study tasks, profile, and preferences. This action cannot be undone."
    );
    if (!confirmed) return;

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("studyai-")) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    currentConversation = null;
    currentDeck = null;
    currentQuiz = null;
    editingNoteId = null;
    editingTaskId = null;

    applyTheme("light");
    syncThemeSwitchUI();
    syncAiPreferencesUI();
    applyProfileToUI(loadProfile());
    renderProfileDisplay();
    renderHistory();
    renderNotes();
    renderBookmarks();
    renderSavedDecks();
    renderTasks();
    goToDashboard();
});

syncThemeSwitchUI();
syncAiPreferencesUI();

// ---------------------------------------------------------
// 25. Help & Support — FAQ accordion
// ---------------------------------------------------------
document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
        const item = btn.closest(".faq-item");
        item.classList.toggle("open");
    });
});

// ---------------------------------------------------------
// 26. Initial state: restore the last active conversation if
//     one exists, otherwise show the welcome dashboard
// ---------------------------------------------------------
(function init() {
    const activeId = localStorage.getItem(STORAGE_KEYS.activeId);
    const conv = activeId ? loadConversations().find((c) => c.id === activeId) : null;

    if (conv && conv.messages.length > 0) {
        currentConversation = conv;
        setActiveNav(null);
        showView("chat");
        renderConversation(conv);
    } else {
        showView("welcome");
        renderDashboardOverview();
    }
})();