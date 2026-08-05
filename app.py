# =========================================================
# app.py — Flask backend for the AI Study Assistant web app
# =========================================================
# This file starts a small web server that:
#   1. Serves the index.html front-end page
#   2. Exposes a /health endpoint to check the server is alive
#   3. Exposes a /chat endpoint that the front-end JavaScript
#      calls to send a question and receive an AI-generated reply
# =========================================================

import os
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
# 7. Run the server
# ---------------------------------------------------------
# host="0.0.0.0" makes the server reachable from other devices
# on the network, not just localhost.
# PORT is read from the environment, defaulting to 5000.
# debug=True auto-reloads the server on code changes (turn off
# in production).
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)