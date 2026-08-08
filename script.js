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
const responseEl = document.getElementById("response");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const quickPromptButtons = document.querySelectorAll(".quick-btn, .feature-card");

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

const STORAGE_KEYS = {
    conversations: "studyai-conversations",
    activeId: "studyai-active-conversation-id",
    notes: "studyai-notes",
    bookmarks: "studyai-bookmarks",
    flashcardDecks: "studyai-flashcard-decks"
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
    flashcards: flashcardsView
};

function showView(name) {
    Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
    if (name === "chat") requestAnimationFrame(scrollToBottom);
}

// ---------------------------------------------------------
// 6. Placeholder text + intro line for sidebar views not yet
//    fully built (Phase 2+ features)
// ---------------------------------------------------------
const viewConfigs = {
    dashboard: { placeholder: "Ask anything about programming, university courses, assignments, mathematics, or upload your study material..." },
    quiz: { placeholder: "Tell me a topic to quiz you on...", intro: "The dedicated quiz builder is coming soon — for now, ask me to quiz you here in chat." },
    planner: { placeholder: "Tell me what you need to study and by when...", intro: "The study planner is coming soon — for now, tell me your subjects and deadlines here in chat." },
    settings: { placeholder: "Tell me how you want the assistant to behave...", intro: "Settings are coming soon." },
    help: { placeholder: "Ask for help with the app or your studies...", intro: "Use the sidebar to reach chat history, saved notes, and bookmarks. Everything is stored on this device. For anything else, just ask me here." },
    profile: { placeholder: "Ask anything about your studies...", intro: "Your profile settings are coming soon." }
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

    greetingText.textContent = `${greeting}, Alex`;
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
}

function handleNavClick(viewName, target) {
    setActiveNav(target);

    if (viewName === "dashboard") { goToDashboard(); return; }
    if (viewName === "history") { showView("history"); renderHistory(); return; }
    if (viewName === "notes") { showView("notes"); renderNotes(); return; }
    if (viewName === "bookmarks") { showView("bookmarks"); renderBookmarks(); return; }
    if (viewName === "flashcards") { showView("flashcards"); renderSavedDecks(); return; }

    // Phase 2+ features: land in chat with a short explanatory note
    const config = viewConfigs[viewName] || viewConfigs.dashboard;
    messageInput.placeholder = config.placeholder;
    showView("chat");
    responseEl.innerHTML = "";
    if (config.intro) appendStatusMessage(config.intro);
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
// 12. Quick action + feature card buttons: seed the composer
// ---------------------------------------------------------
quickPromptButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        const prompt = btn.dataset.prompt || "";
        messageInput.value = prompt;
        messageInput.focus();
        messageInput.setSelectionRange(prompt.length, prompt.length);
    });
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
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: question }),
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
// 19. Initial state: restore the last active conversation if
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
    }
})();