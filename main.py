# =========================================================
# main.py — Simple command-line AI Study Assistant
# =========================================================
# This script lets a user type a single question in the
# terminal and get back an AI-generated answer using
# Google's Gemini API.
# =========================================================

import os
from dotenv import load_dotenv   # Used to read variables from a .env file
from google import genai         # Google's official Gemini SDK

# ---------------------------------------------------------
# 1. Load environment variables
# ---------------------------------------------------------
# load_dotenv() reads a file named ".env" in the project folder
# and loads any KEY=VALUE pairs into the environment so we can
# access them with os.getenv(). This keeps secrets (like API
# keys) out of the source code.
load_dotenv()

# ---------------------------------------------------------
# 2. Get the Gemini API key from the environment
# ---------------------------------------------------------
# Your .env file should contain a line like:
#   GEMINI_API_KEY=your_actual_key_here
api_key = os.getenv("GEMINI_API_KEY")

# ---------------------------------------------------------
# 3. Create the Gemini client
# ---------------------------------------------------------
# This client object is what we use to send requests to the
# Gemini model.
client = genai.Client(api_key=api_key)

# ---------------------------------------------------------
# 4. Simple welcome banner
# ---------------------------------------------------------
print("🤖 AI Study Assistant")
print("-" * 30)

# ---------------------------------------------------------
# 5. Take a question from the user via the terminal
# ---------------------------------------------------------
question = input("Ask me anything: ")

# ---------------------------------------------------------
# 6. Send the question to Gemini and print the response
# ---------------------------------------------------------
# We wrap this in try/except so that network errors, invalid
# API keys, or other issues don't crash the whole program —
# instead we print a friendly error message.
try:
    response = client.models.generate_content(
        model="models/gemini-3.1-flash-lite",  # Which Gemini model to use
        contents=question,                      # The user's question as input
    )

    print("\n🤖 AI:")
    print(response.text)  # response.text holds the model's generated answer

except Exception as e:
    # Catch-all error handler: prints whatever went wrong
    print("\n❌ An error occurred:")
    print(e)