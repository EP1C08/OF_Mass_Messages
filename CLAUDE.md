# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OnlyFans Mass Messages tool - sends personalized messages to subscribers using the OnlyFans API via `ultima-scraper-api`.

## Commands

```bash
# Install dependencies (use virtual environment)
pip install -r requirements.txt

# Run application
python main.py                 # Interactive mode - prompts for message
python main.py --test          # Test authentication and connection only
python main.py --dry-run       # Simulate sending without actual messages

# Run tests
pytest
pytest -xvs tests/             # Verbose single test run
```

## Architecture

- **main.py** - Entry point, CLI argument handling, orchestrates authentication and messaging flows
- **auth.py** - Authentication wrapper around `ultima_scraper_api.OnlyFansAPI`, session management
- **config.py** - Configuration dataclass, loads credentials from `auth.json`, rate limiting settings
- **mass_message.py** - `MassMessenger` class handles recipient fetching, message personalization, rate-limited sending

## Key Patterns

**Authentication Flow**: Config loads from `auth.json` → validates credentials → creates `OnlyFansAPI` instance → returns `OnlyFansAuthModel`

**Message Flow**: Fetch recipients (subscribers or chats) → personalize template with `{name}/{username}` → send with rate limiting → collect results

**Rate Limiting**: 3s delay between messages normally, 10s for batches over 450 recipients

## Configuration

Credentials stored in `auth.json` (gitignored):
```json
{
  "cookie": "...",
  "x_bc": "...",
  "user_agent": "..."
}
```

## Dependencies

Uses `ultima-scraper-api` for OnlyFans API interaction. All API calls go through `OnlyFansAuthModel` methods (`get_chats`, `get_subscriptions`, `send_message`).
