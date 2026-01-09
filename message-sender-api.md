# OF Message Sender API Documentation

A Cloud Run service for sending messages to OnlyFans fans and accessing vault media.

## Base URL

```
https://of-message-sender-3qumvbkjdq-uc.a.run.app
```

## Authentication

All endpoints (except `/health`) require an API key passed via the `X-API-Key` header:

```bash
curl -H "X-API-Key: YOUR_API_KEY" https://of-message-sender-3qumvbkjdq-uc.a.run.app/models
```

---

## Endpoints

### Health Check

Check if the service is running and which models are authenticated.

```
GET /health
```

**Authentication:** Not required

**Response:**
```json
{
  "status": "healthy",
  "authenticated_models": ["187095475", "248797134"],
  "timestamp": "2025-12-30T12:00:00.000000Z"
}
```

**Status values:**
- `healthy` - All models authenticated
- `degraded` - Some models authenticated
- `unhealthy` - No models authenticated

---

### List Models

Get all configured models with their authentication status.

```
GET /models
```

**Response:**
```json
{
  "models": [
    {
      "model_id": "187095475",
      "label": "ksana",
      "authenticated": true,
      "last_auth_refresh": "2025-12-30T12:00:00.000000Z"
    }
  ],
  "timestamp": "2025-12-30T12:00:00.000000Z"
}
```

---

### Send Message

Send a message (text, PPV, or with media) to a fan.

```
POST /send-message
```

**Request Body:**
```json
{
  "model_id": "187095475",
  "fan_id": "152528486",
  "text": "Hey! Check out this exclusive content 💕",
  "price": 0,
  "media_ids": [],
  "locked_text": false,
  "reply_to_message_id": null
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model_id` | string | Yes | OnlyFans creator/model ID |
| `fan_id` | string | Yes | OnlyFans fan ID |
| `text` | string | Yes | Message content |
| `price` | integer | No | PPV price in dollars (0 = free message) |
| `media_ids` | array | No | List of vault media IDs to attach |
| `locked_text` | boolean | No | If true, text is hidden behind paywall |
| `reply_to_message_id` | integer | No | Message ID to reply to (for PPV bumps) |

**Response:**
```json
{
  "success": true,
  "message_id": "7875499021751",
  "timestamp": "2025-12-30T12:00:00.000000Z"
}
```

**Example - Send PPV with media:**
```bash
curl -X POST "https://of-message-sender-3qumvbkjdq-uc.a.run.app/send-message" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "187095475",
    "fan_id": "152528486",
    "text": "Exclusive content just for you! 🔥",
    "price": 25,
    "media_ids": ["2680619990", "2679463291"],
    "locked_text": false
  }'
```

---

### Get Vault Folders

Get all vault folders for a model.

```
GET /vault/lists?model_id={model_id}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model_id` | string | Yes | OnlyFans creator/model ID |

**Response:**
```json
{
  "folders": [
    {
      "id": 10002044,
      "name": "Hot Photos",
      "type": "custom",
      "has_media": true,
      "videos_count": 5,
      "photos_count": 150,
      "gifs_count": 0,
      "audios_count": 0
    }
  ],
  "total_stats": {
    "videos": 50,
    "photos": 1200,
    "gifs": 10,
    "audios": 5
  },
  "timestamp": "2025-12-30T12:00:00.000000Z"
}
```

**Example:**
```bash
curl "https://of-message-sender-3qumvbkjdq-uc.a.run.app/vault/lists?model_id=187095475" \
  -H "X-API-Key: YOUR_API_KEY"
```

---

### Get Vault Media

Get media from a specific vault folder with pagination.

```
GET /vault/media?model_id={model_id}&list_id={list_id}&limit={limit}&offset={offset}
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model_id` | string | Yes | - | OnlyFans creator/model ID |
| `list_id` | integer | Yes | - | Vault folder ID (from `/vault/lists`) |
| `limit` | integer | No | 100 | Items per page (max 100) |
| `offset` | integer | No | 0 | Pagination offset |

**Response:**
```json
{
  "media": [
    {
      "id": 2680619990,
      "type": "photo",
      "url": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
      "preview": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
      "thumb": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
      "source_url": null,
      "duration": 0,
      "created_at": "2022-11-15T01:05:54+00:00"
    },
    {
      "id": 2679433939,
      "type": "video",
      "url": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
      "preview": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
      "thumb": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
      "source_url": null,
      "duration": 195,
      "created_at": "2022-11-14T03:36:46+00:00"
    }
  ],
  "count": 2,
  "has_more": true,
  "total_count": 50,
  "timestamp": "2025-12-30T12:00:00.000000Z"
}
```

**Media Types:**
- `photo` - Image file
- `video` - Video file (check `duration` for length in seconds)
- `gif` - Animated GIF
- `audio` - Audio file

**Example - Get first 50 media from a folder:**
```bash
curl "https://of-message-sender-3qumvbkjdq-uc.a.run.app/vault/media?model_id=187095475&list_id=10002044&limit=50&offset=0" \
  -H "X-API-Key: YOUR_API_KEY"
```

---

### Search Vault Media by ID

Find a specific media item by its ID.

```
GET /vault/media/{media_id}?model_id={model_id}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `media_id` | integer | Yes | Media ID to search for |
| `model_id` | string | Yes | OnlyFans creator/model ID |

**Response:**
```json
{
  "id": 2680619990,
  "type": "photo",
  "url": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
  "preview": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
  "thumb": "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F...",
  "source_url": null,
  "duration": 0,
  "created_at": "2022-11-15T01:05:54+00:00"
}
```

**Example:**
```bash
curl "https://of-message-sender-3qumvbkjdq-uc.a.run.app/vault/media/2680619990?model_id=187095475" \
  -H "X-API-Key: YOUR_API_KEY"
```

---

### Image Proxy

Proxy images from OnlyFans CDN. **Used internally by the frontend.**

```
GET /proxy/image?url={encoded_url}&api_key={api_key}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL-encoded OnlyFans CDN URL |
| `api_key` | string | Yes | API key (passed as query param for browser `<img>` tags) |

**Note:** This endpoint returns the raw image bytes, not JSON. It's designed to be used directly in `<img src="...">` tags.

**Why is this needed?**
OnlyFans CDN URLs are IP-bound. When the API fetches media, the URLs are signed for Cloud Run's IP address. Browsers have different IPs, so they can't access those URLs directly. The proxy fetches images using Cloud Run's IP and streams them to the browser.

---

### Refresh Authentication

Force refresh authentication credentials from GCS.

```
POST /refresh-auth
```

**Response:**
```json
{
  "success": true,
  "authenticated_models": ["187095475", "248797134"],
  "failed_models": [],
  "timestamp": "2025-12-30T12:00:00.000000Z"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "detail": {
    "success": false,
    "error": "Error message here",
    "error_code": "ERROR_CODE",
    "timestamp": "2025-12-30T12:00:00.000000Z"
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `MODEL_NOT_FOUND` | 404 | Unknown model ID |
| `FAN_NOT_FOUND` | 404 | Fan not found |
| `MEDIA_NOT_FOUND` | 404 | Media not found in vault |
| `LIST_ID_REQUIRED` | 400 | list_id parameter is required |
| `RATE_LIMITED` | 429 | Too many requests |
| `AUTH_UNAVAILABLE` | 503 | Model authentication unavailable |
| `UPSTREAM_ERROR` | 502 | OnlyFans API error |

---

## Rate Limits

The service enforces per-model rate limits to avoid OnlyFans API restrictions:

- **Send Message:** 60 requests per minute per model
- **Vault Endpoints:** No rate limit (cached in-memory)

---

## Complete Workflow Example

### 1. Check service health
```bash
curl "https://of-message-sender-3qumvbkjdq-uc.a.run.app/health"
```

### 2. Get available vault folders
```bash
curl "https://of-message-sender-3qumvbkjdq-uc.a.run.app/vault/lists?model_id=187095475" \
  -H "X-API-Key: YOUR_API_KEY"
```

### 3. Browse media in a folder
```bash
curl "https://of-message-sender-3qumvbkjdq-uc.a.run.app/vault/media?model_id=187095475&list_id=10002044&limit=20" \
  -H "X-API-Key: YOUR_API_KEY"
```

### 4. Send a PPV message with selected media
```bash
curl -X POST "https://of-message-sender-3qumvbkjdq-uc.a.run.app/send-message" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "187095475",
    "fan_id": "152528486",
    "text": "Hey babe! Here is something special for you 💕",
    "price": 15,
    "media_ids": ["2680619990", "2679463291"]
  }'
```

---

## Displaying Vault Media in Browser

When using vault media in a web application, the URLs returned are **proxy URLs** that need to be combined with the base URL and API key:

```javascript
// Response from /vault/media
const media = {
  thumb: "/proxy/image?url=https%3A%2F%2Fcdn2.onlyfans.com%2F..."
};

// Construct full URL for <img> tag
const API_BASE = "https://of-message-sender-3qumvbkjdq-uc.a.run.app";
const API_KEY = "YOUR_API_KEY";
const fullUrl = `${API_BASE}${media.thumb}&api_key=${encodeURIComponent(API_KEY)}`;

// Use in HTML
// <img src={fullUrl} alt="Vault media" />
```

---

## Support

For issues or questions, contact the development team or check the Cloud Run logs:

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=of-message-sender" \
  --project=of-os-480714 \
  --limit=50
```
