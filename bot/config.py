import os
from dotenv import load_dotenv

load_dotenv()

# ── X (Twitter) API credentials ───────────────────────────────
# Set these in .env — never commit values
X_API_KEY             = os.environ.get("X_API_KEY")
X_API_SECRET          = os.environ.get("X_API_SECRET")
X_ACCESS_TOKEN        = os.environ.get("X_ACCESS_TOKEN")
X_ACCESS_TOKEN_SECRET = os.environ.get("X_ACCESS_TOKEN_SECRET")

# ── SportStrata base URL ───────────────────────────────────────
# Used to construct links in tweet templates
SPORTSTRATA_URL = os.getenv("SPORTSTRATA_URL", "https://sportstrata.cc")

# ── Database ───────────────────────────────────────────────────
DB_PATH = os.getenv("DB_PATH", "bot.db")

# ── Behaviour ─────────────────────────────────────────────────
# Maximum tweets per calendar day (stay well under X free tier limit of 50)
MAX_TWEETS_PER_DAY = int(os.getenv("MAX_TWEETS_PER_DAY", "5"))

# Minimum PA threshold — ignore players with fewer plate appearances in a game
MIN_PA_TO_ANALYZE = int(os.getenv("MIN_PA_TO_ANALYZE", "3"))

# Minimum AB threshold for pitchers (don't flag 1-AB cameos)
MIN_AB_PITCHER = int(os.getenv("MIN_AB_PITCHER", "1"))

# Rare event rarity scores (approximate occurrences in MLB history)
RARITY_THRESHOLDS = {
    "four_home_run_game":      {"occurrences": 18,  "label": "4-homer game"},
    "two_grand_slams_game":    {"occurrences": 12,  "label": "2-grand-slam game"},
    "natural_cycle":           {"occurrences": 14,  "label": "natural cycle"},
    "twenty_strikeouts":       {"occurrences": 5,   "label": "20-strikeout game"},
    "six_hit_game":            {"occurrences": 300, "label": "6-hit game"},
}

# Drought alert: tweet if a rare event hasn't occurred in this many days
DROUGHT_ALERT_DAYS = 1825  # 5 years
