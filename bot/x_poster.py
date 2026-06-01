import tweepy
from config import (
    X_API_KEY, X_API_SECRET,
    X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET,
)


def _client() -> tweepy.Client:
    return tweepy.Client(
        consumer_key=X_API_KEY,
        consumer_secret=X_API_SECRET,
        access_token=X_ACCESS_TOKEN,
        access_token_secret=X_ACCESS_TOKEN_SECRET,
    )


def post(text: str) -> str:
    """
    Posts a tweet and returns the tweet ID string.
    Raises tweepy.TweepyException on failure.
    280-character limit is NOT enforced here — caller must check.
    """
    if len(text) > 280:
        raise ValueError(f"Tweet exceeds 280 chars ({len(text)}): {text[:60]}…")

    client = _client()
    response = client.create_tweet(text=text)
    return str(response.data["id"])


def dry_run(text: str) -> str:
    """Prints the tweet text without posting. Returns a fake ID for testing."""
    print("── DRY RUN TWEET ──────────────────────────────────────")
    print(text)
    print(f"── {len(text)} chars ────────────────────────────────────────")
    return "DRY_RUN_ID"
