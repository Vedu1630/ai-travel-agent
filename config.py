from groq import Groq
from dotenv import load_dotenv
import os

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY")
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")

client = Groq(api_key=GROQ_API_KEY)

MODEL = "llama-3.3-70b-versatile"
