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

## Coding Standards

This project follows **Fandom Agency coding standards**.

### General Principles
- Code readability is paramount - write code that explains itself
- Follow PEP 8 as the foundation, with specific overrides noted below
- Prefer refactoring complex code over adding comments

### Naming Conventions
- **Packages/Modules**: `snake_case`
- **Classes**: `PascalCase` (e.g., `CustomJpegGenerator`, not `CustomJPEGGenerator`)
- **Functions**: `snake_case`
- **Variables**: `snake_case` with meaningful names (no single characters except `i` for counters)
- **Constants**: `UPPERCASE`
- **Private variables/functions**: `_snake_case_with_leading_underscore`
- **Keywords conflicts**: Add trailing underscore (e.g., `input_`)

### Comments
- **Avoid comments** - prefer self-explanatory code
- Let user write their own comments instead

### Code Style
- **Indentation**: 4 spaces (no tabs)
- **Function length**: ~50 lines max (soft limit)
- **File length**: 0-500 lines approximately
- **Line ending**: Always end Python modules with a blank line

### Function Parameters
Use hanging indents for long parameter lists:
```python
def function_name(
    self,
    longer_variable_one_name,
    longer_variable_two_name,
):
```
