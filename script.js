const input = document.querySelector(".input-box input");
const button = document.querySelector(".ask-btn");
const response = document.querySelector(".response");
const sidebarButtons = document.querySelectorAll(".sidebar button");
const workspaceTitle = document.getElementById("workspace-title");
const workspaceDescription = document.getElementById("workspace-description");

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

// Escape HTML
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Current time
function getCurrentTime() {
    return new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}

// Scroll chat to bottom
function scrollToBottom() {
    response.scrollTop = response.scrollHeight;
}

// User message
function appendUserMessage(message) {
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

// AI message
function appendAiMessage(message) {
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

function updateWorkspaceView(viewName) {
    const config = viewConfigs[viewName] || viewConfigs.dashboard;

    workspaceTitle.textContent = config.title;
    workspaceDescription.textContent = config.description;
    input.placeholder = config.placeholder;
}

// Ask AI
async function askQuestion() {

    console.log("Button clicked");

    const question = input.value.trim();

    if (!question) {
        input.focus();
        return;
    }

    appendUserMessage(question);

    input.value = "";
    input.disabled = true;

    button.disabled = true;
    button.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Thinking...';

    try {

        console.log("Sending request...");

        const res = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: question
            })
        });

        console.log("Status:", res.status);

        const data = await res.json();

        console.log(data);

        if (res.ok) {
            appendAiMessage(data.reply);
        } else {
            appendAiMessage("❌ " + (data.reply || "Server Error"));
        }

    } catch (error) {

        console.error(error);

        appendAiMessage(
            "❌ Unable to connect to the Flask server."
        );
    }

    input.disabled = false;
    button.disabled = false;

    button.innerHTML =
        '<i class="fa-solid fa-wand-magic-sparkles"></i> Ask AI';

    input.focus();
}

// Sidebar button click
sidebarButtons.forEach((buttonItem) => {
    buttonItem.addEventListener("click", () => {
        sidebarButtons.forEach((item) => item.classList.remove("active"));
        buttonItem.classList.add("active");

        const viewName = buttonItem.dataset.view || "dashboard";
        updateWorkspaceView(viewName);

        const viewLabel = buttonItem.textContent.trim();
        appendStatusMessage(`You switched to ${viewLabel}. ${workspaceDescription.textContent}`);
    });
});

// Button click
button.addEventListener("click", askQuestion);

// Enter key
input.addEventListener("keydown", function (event) {

    if (event.key === "Enter") {
        event.preventDefault();
        askQuestion();
    }

});

updateWorkspaceView("dashboard");