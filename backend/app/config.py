from dotenv import load_dotenv
import os

load_dotenv()

# Ollama config (for Browser Navigator - free, local)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Ollama config (for Agentic Code - free, local, offline-only per ADR 0003)
AGENTIC_CODE_MODEL = os.getenv("AGENTIC_CODE_MODEL", "gemma4:e4b-mlx")

# OpenRouter config (for Research Pipeline - optional)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")

SERPER_API_KEY = os.getenv("SERPER_API_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "insecure-default-change-me")
APP_KILLSWITCH = os.getenv("APP_KILLSWITCH", "false").lower() == "true"
RATE_LIMIT_PER_HOUR = int(os.getenv("RATE_LIMIT_PER_HOUR", "5"))
DAILY_REQUEST_CAP = int(os.getenv("DAILY_REQUEST_CAP", "50"))
