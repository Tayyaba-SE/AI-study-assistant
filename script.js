/* =========================================================
   script.js — Front-end logic for the AI Study Assistant
   =========================================================
   This file wires up the HTML page: it grabs references to
   key elements, sends the user's question to the Flask
   backend (/chat), and renders the AI's reply in the chat
   window. It also handles switching between sidebar views
   (Dashboard, History, Notes, etc.).
   ========================================================= */

// ---------------------------------------------------------
// 1. Grab references to the DOM elements we need to work with
// ---------------------------------------------------------
const input = document.querySelector(".input-box input");   // The text box where the user types
const button = document.querySelector(".ask-btn");          // The "Ask AI" button
const response = document.querySelector(".response");       // The container that holds all chat messages
const sidebarButtons = document.querySelectorAll(".sidebar button"); // All sidebar nav buttons
const workspaceTitle = document.getElementById("workspace-title");             // The <h2> title in the banner
const workspaceDescription = document.getElementById("workspace-description"); // The <p> description in the banner

// ---------------------------------------------------------
// 2. Configuration for each sidebar "view"
// ---------------------------------------------------------
// When the user clicks a sidebar item, we look up its settings
// here and update the banner title/description and the input
// placeholder text to match.
const viewConfigs = {
    dashboard: {
        title: "Dashboard",
        description: "Ask anything about your studies and get instant guidance.",
        placeholder: "Ask me anything about your studies..."
    },
    history: {
        title: "History",
        description: "Review past questions and see how your study sessions are progressing.",
        placeholder: "Search your study history..."
    },
    notes: {
        title: "Saved Notes",
        description: "Keep your important ideas, summaries, and lesson notes in one place.",
        placeholder: "Ask for help organizing your notes..."
    },
    bookmarks: {
        title: "Bookmarks",
        description: "Save your favorite topics and revisit them whenever you need a refresher.",
        placeholder: "Ask for help finding bookmarked topics..."
    },
    settings: {
        title: "Settings",
        description: "Tune the assistant so it matches your study style and pace.",
        placeholder: "Tell me how you want the assistant to behave..."
    },
    help: {
        title: "Help & Support",
        description: "Get help, tips, and answers to questions about using the app.",
        placeholder: "Ask for help with the app or your studies..."
    }
};

// ---------------------------------------------------------
// 3. Helper: escape HTML special characters
// ---------------------------------------------------------
// IMPORTANT for security: if we inserted the user's raw text
// (or the AI's raw text) directly into the page, someone could
// type HTML/JavaScript (like <img onerror=...>) and have it
// actually execute in the browser (an XSS attack). Escaping
// converts special characters into safe text equivalents so
// they display as plain text instead of running as code.
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------
// 4. Helper: get a formatted current time string (e.g. "3:45 PM")
// ---------------------------------------------------------
// Used to timestamp each chat message.
function getCurrentTime() {
    return new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}

// ---------------------------------------------------------
// 5. Helper: auto-scroll the chat window to the newest message
// ---------------------------------------------------------
function scrollToBottom() {
    response.scrollTop = response.scrollHeight;
}

// ---------------------------------------------------------
// 6. Render a message the USER sent (right-aligned bubble)
// ---------------------------------------------------------
function appendUserMessage(message) {
    // insertAdjacentHTML("beforeend", ...) adds new HTML right before
    // the closing tag of `response`, i.e. appends it as the last child.
    response.insertAdjacentHTML(
        "beforeend",
        `
        <div class="user-row">
            <div>
                <div class="message user-message">
                    ${escapeHtml(message)}
                </div>
                <time>${getCurrentTime()} <i class="fa-solid fa-check-double"></i></time>
            </div>

            <span class="avatar user-avatar">
                <i class="fa-solid fa-user"></i>
            </span>
        </div>
        `
    );

    scrollToBottom();
}

// ---------------------------------------------------------
// 7. Render a message from the AI (left-aligned bubble)
// ---------------------------------------------------------
function appendAiMessage(message) {
    // Escape first (for safety), THEN convert newlines to <br> tags
    // so multi-line AI answers display with proper line breaks.
    // (Order matters: escaping after replacing \n with <br> would
    // turn our own <br> tags into visible text instead of real breaks.)
    const formattedMessage = escapeHtml(message).replace(/\n/g, "<br>");

    response.insertAdjacentHTML(
        "beforeend",
        `
        <div class="ai-row">
            <span class="avatar ai-avatar">
                <i class="fa-solid fa-robot"></i>
            </span>

            <div class="message ai-message">
                ${formattedMessage}
                <time>${getCurrentTime()}</time>
            </div>
        </div>
        `
    );

    scrollToBottom();
}

// ---------------------------------------------------------
// 8. Render a small system/status message (e.g. "You switched to...")
// ---------------------------------------------------------
function appendStatusMessage(message) {
    response.insertAdjacentHTML(
        "beforeend",
        `
        <div class="status-banner">
            ${escapeHtml(message)}
        </div>
        `
    );

    scrollToBottom();
}

// ---------------------------------------------------------
// 9. Update the workspace banner + input placeholder for a given view
// ---------------------------------------------------------
function updateWorkspaceView(viewName) {
    // Fall back to "dashboard" settings if an unknown view name is passed
    const config = viewConfigs[viewName] || viewConfigs.dashboard;

    workspaceTitle.textContent = config.title;
    workspaceDescription.textContent = config.description;
    input.placeholder = config.placeholder;
}

// ---------------------------------------------------------
// 10. Main function: send the user's question to the backend
//     and display the AI's reply
// ---------------------------------------------------------
async function askQuestion() {

    console.log("Button clicked"); // Debug log — safe to remove later

    const question = input.value.trim();

    // Don't do anything if the input is empty — just refocus it
    if (!question) {
        input.focus();
        return;
    }

    // Show the user's question in the chat immediately
    appendUserMessage(question);

    // Clear the input box and temporarily disable it while we wait
    input.value = "";
    input.disabled = true;

    // Disable the button and show a "Thinking..." state so the user
    // knows a request is in progress and can't double-click submit
    button.disabled = true;
    button.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Thinking...';

    try {

        console.log("Sending request..."); // Debug log

        // Send the question to our Flask backend's /chat endpoint.
        // This must match the route defined in app.py.
        const res = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: question
            })
        });

        console.log("Status:", res.status); // Debug log — HTTP status code

        // Parse the JSON body of the response (e.g. { reply: "..." })
        const data = await res.json();

        console.log(data); // Debug log — full response payload

        if (res.ok) {
            // 2xx status: show the AI's reply
            appendAiMessage(data.reply);
        } else {
            // Non-2xx status (e.g. 400/500 from app.py): show the error
            appendAiMessage("❌ " + (data.reply || "Server Error"));
        }

    } catch (error) {
        // This catches network failures — e.g. the Flask server isn't
        // running, or the browser couldn't reach it at all.
        console.error(error);

        appendAiMessage(
            "❌ Unable to connect to the Flask server."
        );
    }

    // Whether it succeeded or failed, re-enable the input/button
    // and restore the button's normal label
    input.disabled = false;
    button.disabled = false;

    button.innerHTML =
        '<i class="fa-solid fa-wand-magic-sparkles"></i> Ask AI';

    input.focus();
}

// ---------------------------------------------------------
// 11. Sidebar navigation: switch views when a menu button is clicked
// ---------------------------------------------------------
sidebarButtons.forEach((buttonItem) => {
    buttonItem.addEventListener("click", () => {
        // Remove "active" highlight from every button...
        sidebarButtons.forEach((item) => item.classList.remove("active"));
        // ...then add it only to the one that was just clicked
        buttonItem.classList.add("active");

        // data-view="dashboard" etc. on each <button> in index.html
        // tells us which view config to load
        const viewName = buttonItem.dataset.view || "dashboard";
        updateWorkspaceView(viewName);

        // Post a small status message confirming the switch
        const viewLabel = buttonItem.textContent.trim();
        appendStatusMessage(`You switched to ${viewLabel}. ${workspaceDescription.textContent}`);
    });
});

// ---------------------------------------------------------
// 12. Wire up the "Ask AI" button and the Enter key
// ---------------------------------------------------------
button.addEventListener("click", askQuestion);

input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault(); // Stops any default form-submit behavior
        askQuestion();
    }
});

// ---------------------------------------------------------
// 13. Initialize the page in the "dashboard" view on first load
// ---------------------------------------------------------
updateWorkspaceView("dashboard");