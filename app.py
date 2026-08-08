# =========================================================
# app.py — Flask backend for the AI Study Assistant web app
# =========================================================
# This file starts a small web server that:
#   1. Serves the index.html front-end page
#   2. Exposes a /health endpoint to check the server is alive
#   3. Exposes a /chat endpoint that the front-end JavaScript
#      calls to send a question and receive an AI-generated reply
#   4. Exposes a /generate-flashcards endpoint that turns a
#      topic into a structured, AI-generated flashcard deck
# =========================================================

import os
import re
import json
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS          # Allows the front-end (browser) to call this API
from dotenv import load_dotenv       # Loads variables from a .env file
from google import genai             # Google's Gemini SDK

# ---------------------------------------------------------
# 1. Load environment variables (e.g. GEMINI_API_KEY, PORT)
# ---------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------
# 2. Create the Flask app
# ---------------------------------------------------------
# static_folder="." and static_url_path="" mean Flask will
# serve files (like index.html, style.css) directly from the
# current project folder.
app = Flask(__name__, static_folder=".", static_url_path="")

# Enable Cross-Origin Resource Sharing so the browser doesn't
# block requests from the front-end to this backend.
CORS(app)

# ---------------------------------------------------------
# 3. Set up the Gemini AI client
# ---------------------------------------------------------
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")  # Read the API key from the environment
)

# Which Gemini model to use for generating answers
MODEL = "models/gemini-3.5-flash"


# ---------------------------------------------------------
# 4. Route: "/" — serves the main HTML page
# ---------------------------------------------------------
@app.route("/")
def index():
    # When someone visits the root URL, send them index.html
    return send_file("index.html")


# ---------------------------------------------------------
# 5. Route: "/health" — simple check that the server is running
# ---------------------------------------------------------
@app.route("/health")
def health():
    # Useful for uptime monitors or quick manual checks
    return jsonify({"status": "ok"})


# ---------------------------------------------------------
# 6. Route: "/chat" — main AI question/answer endpoint
# ---------------------------------------------------------
@app.route("/chat", methods=["POST"])
def chat():
    # Parse the incoming JSON body; if it's missing/invalid,
    # default to an empty dict instead of crashing.
    data = request.get_json(silent=True) or {}

    # Get the "message" field the front-end sent us
    question = data.get("message", "")

    # If no message was provided, return a 400 Bad Request
    if not question:
        return jsonify({"reply": "Please provide a message."}), 400

    try:
        # Send the user's question to the Gemini model
        response = client.models.generate_content(
            model=MODEL,
            contents=question
        )

        # Send the AI's answer back to the front-end as JSON
        return jsonify({
            "reply": response.text
        })

    except Exception as e:
        # If anything goes wrong (bad API key, network issue, etc.)
        # return a 500 error with the error message
        return jsonify({
            "reply": f"Error: {str(e)}"
        }), 500


# ---------------------------------------------------------
# 7. Helper: ask Gemini for a JSON-structured response
# ---------------------------------------------------------
# Shared by /generate-flashcards now, and reusable by
# /generate-quiz, /study-plan, etc. in later phases so the
# "call Gemini and parse JSON" logic isn't duplicated per route.
def generate_structured_json(prompt):
    """
    Sends `prompt` to Gemini and parses the reply as JSON.
    Raises json.JSONDecodeError if Gemini's response isn't
    valid JSON (e.g. it wrapped the answer in prose or
    markdown fences despite being asked not to).
    """
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt
    )
    text = (response.text or "").strip()

    # Defensive cleanup: strip ```json ... ``` fences if Gemini
    # adds them anyway, so json.loads doesn't choke on them.
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    return json.loads(text)


# ---------------------------------------------------------
# 8. Route: "/generate-flashcards" — AI flashcard generator
# ---------------------------------------------------------
@app.route("/generate-flashcards", methods=["POST"])
def generate_flashcards():
    data = request.get_json(silent=True) or {}

    # ---- Validate the topic ----
    topic = str(data.get("topic", "")).strip()
    if not topic:
        return jsonify({"error": "Please provide a topic."}), 400
    if len(topic) > 200:
        return jsonify({"error": "That topic is too long. Try something shorter."}), 400

    # ---- Validate the requested card count ----
    try:
        count = int(data.get("count", 10))
    except (TypeError, ValueError):
        count = 10
    count = max(3, min(count, 25))  # keep requests reasonable

    # ---- Build the educational prompt ----
    prompt = f"""You are an educational AI assistant.

Generate {count} high-quality flashcards about {topic}.

Each flashcard must contain:
- question
- answer

Questions should test understanding rather than only memorization.

Answers should be concise, accurate, and appropriate for a university student.

Return ONLY valid JSON in this format:

{{
    "flashcards": [
        {{
            "question": "...",
            "answer": "..."
        }}
    ]
}}

Do not return Markdown.
Do not return ```json.
Do not include explanations outside the JSON."""

    # ---- Call Gemini and parse its response ----
    try:
        parsed = generate_structured_json(prompt)
    except json.JSONDecodeError:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502
    except Exception as e:
        # Bad API key, network issue, quota, etc.
        print(f"[/generate-flashcards] Gemini error: {e}")
        return jsonify({"error": "Something went wrong generating flashcards. Please try again."}), 500

    # ---- Validate the structure of what Gemini returned ----
    raw_cards = parsed.get("flashcards") if isinstance(parsed, dict) else None
    if not isinstance(raw_cards, list):
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    flashcards = []
    for card in raw_cards:
        if not isinstance(card, dict):
            continue
        question = str(card.get("question", "")).strip()
        answer = str(card.get("answer", "")).strip()
        if question and answer:
            flashcards.append({"question": question, "answer": answer})

    if not flashcards:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    return jsonify({"flashcards": flashcards[:count]})


# ---------------------------------------------------------
# 9. Run the server
# ---------------------------------------------------------
# host="0.0.0.0" makes the server reachable from other devices
# on the network, not just localhost.
# PORT is read from the environment, defaulting to 5000.
# debug=True auto-reloads the server on code changes (turn off
# in production).
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)