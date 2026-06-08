from dotenv import load_dotenv
import os

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-flash-1.5")
SERPER_API_KEY = os.getenv("SERPER_API_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "insecure-default-change-me")
APP_KILLSWITCH = os.getenv("APP_KILLSWITCH", "false").lower() == "true"
RATE_LIMIT_PER_HOUR = int(os.getenv("RATE_LIMIT_PER_HOUR", "5"))
DAILY_REQUEST_CAP = int(os.getenv("DAILY_REQUEST_CAP", "50"))
