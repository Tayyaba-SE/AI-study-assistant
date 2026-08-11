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
from datetime import date
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
    preferences = data.get("preferences", {})

    # If no message was provided, return a 400 Bad Request
    if not question:
        return jsonify({"reply": "Please provide a message."}), 400

    try:
        # Send the user's question to the Gemini model
        response_style = str(preferences.get("responseStyle", "balanced")).lower() if isinstance(preferences, dict) else "balanced"
        explanation_level = str(preferences.get("explanationLevel", "intermediate")).lower() if isinstance(preferences, dict) else "intermediate"
        if response_style not in ("concise", "balanced", "detailed"):
            response_style = "balanced"
        if explanation_level not in ("beginner", "intermediate", "advanced"):
            explanation_level = "intermediate"
        prompt = f"""You are a helpful AI study assistant. Answer the student's question using a {response_style} response style and an {explanation_level} explanation level.\n\nQuestion: {question}"""
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt
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
# 9. Route: "/generate-quiz" — AI multiple-choice quiz generator
# ---------------------------------------------------------
@app.route("/generate-quiz", methods=["POST"])
def generate_quiz():
    data = request.get_json(silent=True) or {}

    # ---- Validate inputs ----
    subject = str(data.get("subject", "")).strip()
    topic = str(data.get("topic", "")).strip()
    material = str(data.get("material", "")).strip()

    if not topic:
        return jsonify({"error": "Please provide a topic for the quiz."}), 400
    if len(topic) > 200:
        return jsonify({"error": "That topic is too long. Try something shorter."}), 400
    if len(material) > 4000:
        material = material[:4000]  # keep the prompt a reasonable size

    try:
        count = int(data.get("count", 5))
    except (TypeError, ValueError):
        count = 5
    count = max(3, min(count, 20))

    difficulty = str(data.get("difficulty", "medium")).strip().lower()
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"

    # ---- Build the educational prompt ----
    subject_clause = f" in {subject}" if subject else ""
    material_clause = f"\nBase the questions on this study material where relevant:\n{material}\n" if material else ""

    prompt = f"""You are an educational AI assistant.

Generate {count} multiple-choice questions about {topic}{subject_clause} at {difficulty} difficulty, appropriate for a university student.
{material_clause}
Each question must contain:
- question
- options (exactly 4 answer choices)
- correctAnswer (must exactly match the text of one of the options)
- explanation (a short explanation of why that answer is correct)

Return ONLY valid JSON in this format:

{{
    "questions": [
        {{
            "question": "...",
            "options": ["...", "...", "...", "..."],
            "correctAnswer": "...",
            "explanation": "..."
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
        print(f"[/generate-quiz] Gemini error: {e}")
        return jsonify({"error": "Something went wrong generating the quiz. Please try again."}), 500

    # ---- Validate the structure of what Gemini returned ----
    raw_questions = parsed.get("questions") if isinstance(parsed, dict) else None
    if not isinstance(raw_questions, list):
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    questions = []
    for q in raw_questions:
        if not isinstance(q, dict):
            continue
        question_text = str(q.get("question", "")).strip()
        options = q.get("options")
        correct_answer = str(q.get("correctAnswer", "")).strip()
        explanation = str(q.get("explanation", "")).strip()

        if not question_text or not isinstance(options, list) or len(options) != 4:
            continue
        options = [str(o).strip() for o in options]
        if not all(options) or correct_answer not in options:
            continue

        questions.append({
            "question": question_text,
            "options": options,
            "correctAnswer": correct_answer,
            "explanation": explanation
        })

    if not questions:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    return jsonify({"questions": questions[:count]})


# ---------------------------------------------------------
# 10. Route: "/generate-study-plan" — AI study planner
# ---------------------------------------------------------
@app.route("/generate-study-plan", methods=["POST"])
def generate_study_plan():
    data = request.get_json(silent=True) or {}

    # ---- Validate inputs ----
    subject = str(data.get("subject", "")).strip()
    topic = str(data.get("topic", "")).strip()
    available_time = str(data.get("availableTime", "")).strip()
    deadline = str(data.get("deadline", "")).strip()
    difficulty = str(data.get("difficulty", "medium")).strip().lower()
    priority = str(data.get("priority", "medium")).strip().lower()

    if not topic:
        return jsonify({"error": "Please describe what you need to study."}), 400
    if len(topic) > 300:
        return jsonify({"error": "That's too long. Try a shorter description."}), 400

    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"
    if priority not in ("low", "medium", "high"):
        priority = "medium"

    date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    if deadline and not date_pattern.match(deadline):
        deadline = ""  # ignore anything that isn't a plain YYYY-MM-DD date

    today_str = date.today().isoformat()
    deadline_clause = deadline if deadline else "no specific deadline — spread the plan across the next 1-2 weeks"
    time_clause = available_time if available_time else "not specified — assume short, focused daily sessions"
    subject_clause = f" in {subject}" if subject else ""

    # ---- Build the planning prompt ----
    prompt = f"""You are an educational planning assistant.

Create a structured study plan for a university student.

Topic: {topic}{subject_clause}
Today's date: {today_str}
Deadline: {deadline_clause}
Available study time: {time_clause}
Difficulty: {difficulty}
Overall priority: {priority}

Break the topic into a sequence of concrete, specific study tasks (not vague labels) spaced out across the available time between today and the deadline.

Each task must contain:
- name (a specific, actionable study task)
- date (an ISO date in YYYY-MM-DD format, on or after today)
- duration (a short estimate like "45 minutes" or "1.5 hours")
- priority (one of: low, medium, high)

Return ONLY valid JSON in this format:

{{
    "tasks": [
        {{
            "name": "...",
            "date": "YYYY-MM-DD",
            "duration": "...",
            "priority": "..."
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
        print(f"[/generate-study-plan] Gemini error: {e}")
        return jsonify({"error": "Something went wrong generating the study plan. Please try again."}), 500

    # ---- Validate the structure of what Gemini returned ----
    raw_tasks = parsed.get("tasks") if isinstance(parsed, dict) else None
    if not isinstance(raw_tasks, list):
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    tasks = []
    for t in raw_tasks:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name", "")).strip()
        task_date = str(t.get("date", "")).strip()
        duration = str(t.get("duration", "")).strip()
        task_priority = str(t.get("priority", "medium")).strip().lower()

        if not name:
            continue
        if not date_pattern.match(task_date):
            task_date = ""
        if task_priority not in ("low", "medium", "high"):
            task_priority = "medium"

        tasks.append({"name": name, "date": task_date, "duration": duration, "priority": task_priority})

    if not tasks:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    return jsonify({"tasks": tasks[:20]})


# ---------------------------------------------------------
# 11. Route: "/explain-concept" — Concept Explainer
# ---------------------------------------------------------
@app.route("/explain-concept", methods=["POST"])
def explain_concept():
    data = request.get_json(silent=True) or {}
    concept = str(data.get("concept", "")).strip()

    if not concept:
        return jsonify({"error": "Please enter a concept to explain."}), 400
    if len(concept) > 300:
        return jsonify({"error": "That's too long. Try a shorter concept or term."}), 400

    prompt = f"""You are an educational AI assistant helping a university student understand a concept.

Concept: {concept}

Provide:
- simpleExplanation: a short, simple explanation in plain language
- detailedExplanation: a more thorough explanation appropriate for a university student
- example: one concrete example illustrating the concept
- analogy: one real-world analogy that makes the concept easier to grasp
- keyPoints: a list of 3-5 short key points worth remembering

Return ONLY valid JSON in this format:

{{
    "simpleExplanation": "...",
    "detailedExplanation": "...",
    "example": "...",
    "analogy": "...",
    "keyPoints": ["...", "..."]
}}

Do not return Markdown.
Do not return ```json.
Do not include explanations outside the JSON."""

    try:
        parsed = generate_structured_json(prompt)
    except json.JSONDecodeError:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502
    except Exception as e:
        print(f"[/explain-concept] Gemini error: {e}")
        return jsonify({"error": "Something went wrong generating that explanation. Please try again."}), 500

    if not isinstance(parsed, dict):
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    simple_explanation = str(parsed.get("simpleExplanation", "")).strip()
    if not simple_explanation:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    key_points = parsed.get("keyPoints")
    key_points = [str(k).strip() for k in key_points if str(k).strip()] if isinstance(key_points, list) else []

    return jsonify({
        "simpleExplanation": simple_explanation,
        "detailedExplanation": str(parsed.get("detailedExplanation", "")).strip(),
        "example": str(parsed.get("example", "")).strip(),
        "analogy": str(parsed.get("analogy", "")).strip(),
        "keyPoints": key_points
    })


# ---------------------------------------------------------
# 12. Route: "/debug-code" — Code Debugger
# ---------------------------------------------------------
@app.route("/debug-code", methods=["POST"])
def debug_code():
    data = request.get_json(silent=True) or {}
    language = str(data.get("language", "")).strip()
    code = str(data.get("code", "")).strip()
    error_message = str(data.get("error", "")).strip()

    if not code:
        return jsonify({"error": "Please paste in some code to debug."}), 400
    if len(code) > 8000:
        code = code[:8000]
    if len(error_message) > 1500:
        error_message = error_message[:1500]

    language_clause = language if language else "not specified — infer it from the code"
    error_clause = error_message if error_message else "not provided — analyze the code for likely bugs"

    prompt = f"""You are an educational AI assistant helping a university student debug their code.

Programming language: {language_clause}

Code:
{code}

Reported error message: {error_clause}

Provide:
- problem: a clear identification of what is wrong
- causeExplanation: why this happens
- correctedCode: the complete, corrected, runnable version of the code
- correctionExplanation: what was changed and why
- suggestions: a list of 2-4 short suggestions to further improve the code

Return ONLY valid JSON in this format:

{{
    "problem": "...",
    "causeExplanation": "...",
    "correctedCode": "...",
    "correctionExplanation": "...",
    "suggestions": ["...", "..."]
}}

Do not return Markdown.
Do not return ```json.
Do not include explanations outside the JSON."""

    try:
        parsed = generate_structured_json(prompt)
    except json.JSONDecodeError:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502
    except Exception as e:
        print(f"[/debug-code] Gemini error: {e}")
        return jsonify({"error": "Something went wrong debugging that code. Please try again."}), 500

    if not isinstance(parsed, dict):
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    problem = str(parsed.get("problem", "")).strip()
    corrected_code = str(parsed.get("correctedCode", "")).strip()
    if not problem or not corrected_code:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    suggestions = parsed.get("suggestions")
    suggestions = [str(s).strip() for s in suggestions if str(s).strip()] if isinstance(suggestions, list) else []

    return jsonify({
        "problem": problem,
        "causeExplanation": str(parsed.get("causeExplanation", "")).strip(),
        "correctedCode": corrected_code,
        "correctionExplanation": str(parsed.get("correctionExplanation", "")).strip(),
        "suggestions": suggestions
    })


# ---------------------------------------------------------
# 13. Route: "/solve-math" — Mathematics Solver
# ---------------------------------------------------------
@app.route("/solve-math", methods=["POST"])
def solve_math():
    data = request.get_json(silent=True) or {}
    problem = str(data.get("problem", "")).strip()

    if not problem:
        return jsonify({"error": "Please enter a problem to solve."}), 400
    if len(problem) > 2000:
        return jsonify({"error": "That's too long. Try a shorter problem."}), 400

    prompt = f"""You are an educational AI assistant helping a university student solve a mathematics problem.

Problem: {problem}

Solve it step by step. Do not skip straight to the final answer — show the reasoning a student should follow.

Provide:
- steps: a list of clear, ordered solution steps (each item is one short step)
- finalAnswer: the final answer, stated concisely
- explanation: a brief explanation of the overall approach used

Return ONLY valid JSON in this format:

{{
    "steps": ["...", "..."],
    "finalAnswer": "...",
    "explanation": "..."
}}

Do not return Markdown.
Do not return ```json.
Do not include explanations outside the JSON."""

    try:
        parsed = generate_structured_json(prompt)
    except json.JSONDecodeError:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502
    except Exception as e:
        print(f"[/solve-math] Gemini error: {e}")
        return jsonify({"error": "Something went wrong solving that problem. Please try again."}), 500

    if not isinstance(parsed, dict):
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    steps = parsed.get("steps")
    steps = [str(s).strip() for s in steps if str(s).strip()] if isinstance(steps, list) else []
    final_answer = str(parsed.get("finalAnswer", "")).strip()

    if not steps or not final_answer:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    return jsonify({
        "steps": steps,
        "finalAnswer": final_answer,
        "explanation": str(parsed.get("explanation", "")).strip()
    })


# ---------------------------------------------------------
# 14. Route: "/assignment-help" — Assignment Helper
# ---------------------------------------------------------
@app.route("/assignment-help", methods=["POST"])
def assignment_help():
    data = request.get_json(silent=True) or {}
    subject = str(data.get("subject", "")).strip()
    assignment = str(data.get("assignment", "")).strip()

    if not assignment:
        return jsonify({"error": "Please describe the assignment."}), 400
    if len(assignment) > 3000:
        assignment = assignment[:3000]

    subject_clause = subject if subject else "not specified"

    prompt = f"""You are an educational AI assistant helping a university student understand and approach an assignment. Help them learn and do their own work — do not write the assignment for them.

Subject: {subject_clause}
Assignment description: {assignment}

Provide:
- breakdown: a clear breakdown of what the assignment actually requires
- approach: a suggested approach to tackling it
- keyConcepts: a list of important concepts the student should understand first
- steps: a list of ordered, step-by-step guidance (guidance, not a finished submission)
- resources: a list of suggested resources or study directions (topics to look up — do not invent specific URLs)

Return ONLY valid JSON in this format:

{{
    "breakdown": "...",
    "approach": "...",
    "keyConcepts": ["...", "..."],
    "steps": ["...", "..."],
    "resources": ["...", "..."]
}}

Do not return Markdown.
Do not return ```json.
Do not include explanations outside the JSON."""

    try:
        parsed = generate_structured_json(prompt)
    except json.JSONDecodeError:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502
    except Exception as e:
        print(f"[/assignment-help] Gemini error: {e}")
        return jsonify({"error": "Something went wrong generating guidance. Please try again."}), 500

    if not isinstance(parsed, dict):
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    breakdown = str(parsed.get("breakdown", "")).strip()
    if not breakdown:
        return jsonify({"error": "The AI returned an unexpected response. Please try again."}), 502

    key_concepts = parsed.get("keyConcepts")
    key_concepts = [str(k).strip() for k in key_concepts if str(k).strip()] if isinstance(key_concepts, list) else []
    steps = parsed.get("steps")
    steps = [str(s).strip() for s in steps if str(s).strip()] if isinstance(steps, list) else []
    resources = parsed.get("resources")
    resources = [str(r).strip() for r in resources if str(r).strip()] if isinstance(resources, list) else []

    return jsonify({
        "breakdown": breakdown,
        "approach": str(parsed.get("approach", "")).strip(),
        "keyConcepts": key_concepts,
        "steps": steps,
        "resources": resources
    })


# ---------------------------------------------------------
# 11. Run the server
# ---------------------------------------------------------
# host="0.0.0.0" makes the server reachable from other devices
# on the network, not just localhost.
# PORT is read from the environment, defaulting to 5000.
# debug=True auto-reloads the server on code changes (turn off
# in production).
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
