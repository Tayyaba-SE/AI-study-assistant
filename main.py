import os
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

# Get API key from .env
api_key = os.getenv("GEMINI_API_KEY")

# Create Gemini client
client = genai.Client(api_key=api_key)

print("🤖 AI Study Assistant")
print("-" * 30)

# Take user input
question = input("Ask me anything: ")

# Generate AI response
try:
    response = client.models.generate_content(
        model="models/gemini-3.5-flash",
        contents=question,
    )

    print("\n🤖 AI:")
    print(response.text)

except Exception as e:
    print("\n❌ An error occurred:")
    print(e)