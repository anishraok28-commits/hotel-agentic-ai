# Hotel Automation Platform -- API Contract

## 1. Purpose

This document defines the contract between the single **Frontend** and the single **Backend**. It also defines how the **Backend** forwards to the **Automation Layer** (Make.com + AI).

The four API routes below are **specified but NOT implemented**.

## 2. Conventions

- Base path: `/api`.
- Content type for requests and responses: `application/json` unless stated otherwise.
- Field names use `camelCase`.
- All amounts are integers in the smallest currency unit.
- All timestamps are ISO 8601 UTC strings.
- The API version is not part of the URL; this contract is versioned by this document.

## 3. Common Response Shape

### 3.1 Success

```
HTTP 200 / 201 / 202
{
  "status": "accepted" | "completed",
  "requestId": "<uuid>",
  "message": "<human readable summary>",
  "data": { ... }
}
```

### 3.2 Error

```
HTTP 4xx / 5xx
{
  "status": "error",
  "requestId": "<uuid>",
  "message": "<human readable summary>",
  "code": "<machine readable error code>"
}
```

### 3.3 Error Codes

| Code | Meaning |
| --- | --- |
| `INVALID_REQUEST` | Payload failed server-side validation |
| `MISSING_FIELD` | A required field is absent |
| `AUTH_REQUIRED` | Missing or invalid authentication |
| `RATE_LIMITED` | Request rejected by rate limiting |
| `AUTOMATION_FAILED` | The automation workflow failed |
| `NOT_FOUND` | Referenced entity not found |
| `INTERNAL_ERROR` | Unexpected Backend failure |

## 4. Route Definitions

### 4.1 `GET /api/health`

Owned exclusively by the **Backend**. Performs no automation and no database access.

- **Purpose:** Verify the Backend is running.
- **Method:** `GET`
- **Authentication:** None.
- **Request body:** None.
- **Query parameters:** None.

Responses:

```
HTTP 200
{
  "status": "ok",
  "requestId": "<uuid>",
  "message": "Backend healthy",
  "data": {
    "service": "backend",
    "databaseReachable": true | false
  }
}
```

| Code | Meaning |
| --- | --- |
| `200` | Backend is running |
| `500` | Backend is unhealthy |

Note: `databaseReachable` is reported as `true` only if the health endpoint can confirm connectivity; in `local` it is reported as `false` because Make.com and Airtable are not yet connected.

### 4.2 `POST /api/concierge`

Serves the **AI_CONCIERGE** mode and triggers the **BOOKING** automation workflow.

- **Purpose:** Submit a concierge request to the **AI_CONCIERGE** flow.
- **Authentication:** Guest-session token required.

Request:

```
POST /api/concierge
{
  "guestId": "<uuid>",
  "sessionId": "<uuid>",
  "roomNumber": 214,
  "request": "Restaurant recommendations for two for dinner",
  "mode": "AI_CONCIERGE"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `guestId` | string (UUID) | Yes | Anonymous guest identifier assigned per session |
| `sessionId` | string (UUID) | Yes | Guest session identifier |
| `roomNumber` | integer | Yes | Guest room number |
| `request` | string | Yes | Free-text concierge request; max 2000 chars |
| `mode` | string | Yes | Must be `AI_CONCIERGE` |

- **Behavior:** The **Backend** validates the payload, then forwards it to the **BOOKING** automation workflow webhook.
- **Fails with:** `INVALID_REQUEST`, `MISSING_FIELD`, `AUTH_REQUIRED`, `RATE_LIMITED`, `AUTOMATION_FAILED`, `INTERNAL_ERROR`.

Responses:

```
HTTP 202
{
  "status": "accepted",
  "requestId": "<uuid>",
  "message": "Concierge request received",
  "data": {
    "workflow": "BOOKING",
    "status": "accepted"
  }
}
```

| Code | Meaning |
| --- | --- |
| `202` | Accepted by workflow |
| `400` | Invalid or missing fields |
| `401` | Authentication required |
| `429` | Rate limited |
| `502` | Automation workflow failed |
| `500` | Internal Backend error |

### 4.3 `POST /api/room-service`

Serves the **QR_ROOM_SERVICE** mode and triggers the **ROOM_SERVICE** automation workflow.

- **Purpose:** Submit a room service order from the **QR_ROOM_SERVICE** flow.
- **Authentication:** Guest-session token required.

Request:

```
POST /api/room-service
{
  "guestId": "<uuid>",
  "sessionId": "<uuid>",
  "roomNumber": 214,
  "items": [
    { "itemId": "menu.001", "name": "Club Sandwich", "quantity": 2, "unitPrice": 1200 },
    { "itemId": "menu.014", "name": "Sparkling Water", "quantity": 1, "unitPrice": 450 }
  ],
  "notes": "No onions",
  "mode": "QR_ROOM_SERVICE"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `guestId` | string (UUID) | Yes | Anonymous guest identifier |
| `sessionId` | string (UUID) | Yes | Guest session identifier |
| `roomNumber` | integer | Yes | Delivery room |
| `items` | array of `item` | Yes | 1..50 items per order |
| `notes` | string | No | Order notes; max 500 chars |
| `mode` | string | Yes | Must be `QR_ROOM_SERVICE` |

Item object:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `itemId` | string | Yes | Menu item identifier |
| `name` | string | Yes | Display name |
| `quantity` | integer | Yes | 1..99 |
| `unitPrice` | integer | Yes | Price in smallest currency unit |

- **Behavior:** The **Backend** validates the payload, then forwards it to the **ROOM_SERVICE** automation workflow webhook.
- **Fails with:** the same error set listed in Section 4.2.

Responses:

```
HTTP 202
{
  "status": "accepted",
  "requestId": "<uuid>",
  "message": "Room service order accepted",
  "data": {
    "workflow": "ROOM_SERVICE",
    "status": "accepted"
  }
}
```

| Code | Meaning |
| --- | --- |
| `202` | Accepted by workflow |
| `400` | Invalid or missing fields |
| `401` | Authentication required |
| `429` | Rate limited |
| `502` | Automation workflow failed |
| `500` | Internal Backend error |

### 4.4 `POST /api/late-checkout`

Serves the **LATE_CHECKOUT** mode and triggers the **LATE_CHECKOUT** automation workflow.

- **Purpose:** Submit a late checkout request from the **LATE_CHECKOUT** flow.
- **Authentication:** Guest-session token required.

Request:

```
POST /api/late-checkout
{
  "guestId": "<uuid>",
  "sessionId": "<uuid>",
  "roomNumber": 214,
  "requestedTime": "2026-08-11T14:00:00Z",
  "mode": "LATE_CHECKOUT"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `guestId` | string (UUID) | Yes | Anonymous guest identifier |
| `sessionId` | string (UUID) | Yes | Guest session identifier |
| `roomNumber` | integer | Yes | Guest room number |
| `requestedTime` | string (ISO 8601 UTC) | Yes | Desired checkout time; must be after standard checkout |
| `mode` | string | Yes | Must be `LATE_CHECKOUT` |

- **Behavior:** The **Backend** validates the payload, then forwards it to the **LATE_CHECKOUT** automation workflow webhook.
- **Fails with:** the same error set listed in Section 4.2.

Responses:

```
HTTP 202
{
  "status": "accepted",
  "requestId": "<uuid>",
  "message": "Late checkout request accepted",
  "data": {
    "workflow": "LATE_CHECKOUT",
    "status": "accepted"
  }
}
```

| Code | Meaning |
| --- | --- |
| `202` | Accepted by workflow |
| `400` | Invalid or missing fields |
| `401` | Authentication required |
| `429` | Rate limited |
| `502` | Automation workflow failed |
| `500` | Internal Backend error |

## 5. Route <-> Mode <-> Workflow Mapping

| API Route | Frontend Mode | Automation Workflow |
| --- | --- | --- |
| `POST /api/concierge` | **AI_CONCIERGE** | **BOOKING** |
| `POST /api/room-service` | **QR_ROOM_SERVICE** | **ROOM_SERVICE** |
| `POST /api/late-checkout` | **LATE_CHECKOUT** | **LATE_CHECKOUT** |
| `GET /api/health` | none | none |

- **3-IN-1_UNIFIED** has no route of its own; it routes to the three mode views, which own the API calls. There is no fourth workflow.

## 6. Environment Variables

Ownership and exposure rules:

- Frontend-exposed variables are prefixed with `VITE_` (Vite requirement) and never carry secrets.
- Backend variables are read from the server environment and never exposed to the Frontend.
- Automation Layer variables are stored inside Make.com, never in the Frontend or repository.

### 6.1 Frontend (`.env` with `VITE_` prefix)

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | `https://api.example.com` | Base URL of the Backend |
| `VITE_ENV` | Yes | `local` / `staging` / `production` | Runtime environment |
| `VITE_MOCK_API_ENABLED` | No | `false` | `"false"` enables real Backend HTTP; unset or `"true"` keeps mock-only submissions |
| `VITE_SERVICE_TOKEN` | Yes in staging/production | `<secret>` | Sent as `Authorization: Bearer <token>`; must match Backend `SERVICE_TOKEN` |

#### Production `/api` routing

The Frontend defaults `VITE_API_BASE_URL` to empty, which means same-origin
`/api` requests. In production, the hosting layer **must** route `/api` to
the Backend via a reverse proxy (e.g. a platform routing rule, nginx, or a
serverless rewrite). Otherwise every submission fails with a network error.

- Same-origin proxy (recommended): keep `VITE_API_BASE_URL` empty and proxy
  `/api -> Backend`.
- Cross-origin Backend: set `VITE_API_BASE_URL` to the absolute Backend URL
  **and** add the Frontend origin to the Backend's `ALLOWED_ORIGINS` allowlist
  (comma-separated). CORS is enforced as an allowlist: only listed origins
  receive `Access-Control-Allow-Origin`, never a wildcard. Preflight `OPTIONS`
  requests from allowed origins are answered with `204`. Origins not on the
  allowlist receive no CORS headers.

In dev, the Vite dev server already proxies `/api -> http://localhost:3000`
(see `frontend/vite.config.ts`).

### 6.2 Backend (server-side)

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `PORT` | Yes | `3000` | Backend listen port |
| `ENV` | Yes | `local` / `staging` / `production` | Runtime environment |
| `MAKE_BOOKING_WEBHOOK_URL` | In staging/production | `https://hook.make.com/...` | Make.com webhook for **BOOKING** |
| `MAKE_ROOM_SERVICE_WEBHOOK_URL` | In staging/production | `https://hook.make.com/...` | Make.com webhook for **ROOM_SERVICE** |
| `MAKE_LATE_CHECKOUT_WEBHOOK_URL` | In staging/production | `https://hook.make.com/...` | Make.com webhook for **LATE_CHECKOUT** |
| `SERVICE_TOKEN` | Yes | `<secret>` | Shared secret used to authenticate requests |
| `ALLOWED_ORIGINS` | No (default `http://localhost:5173`) | `http://localhost:5173` | Comma-separated list of browser origins allowed by CORS |
| `RATE_LIMIT_WINDOW` | No (default 60) | `60` | Rate-limit window in seconds |
| `RATE_LIMIT_MAX` | No (default 30) | `30` | Max requests per window per guest session |

### 6.3 Automation Layer (stored in Make.com only, not yet connected)

| Variable | Description |
| --- | --- |
| `AIRTABLE_PAT` | Airtable Personal Access Token used by Make.com |
| `AIRTABLE_BASE_ID` | Identifier of the single Airtable base |
| `AIRTABLE_WORKFLOW_TABLE` | Name of the workflow table (see `docs/data-model.md`) |

## 7. Security

- All POST routes require a guest-session token validated by the **Backend** (`SERVICE_TOKEN`).
- The **Backend** is the only component that holds webhook URLs and authenticates to Make.com.
- No Make.com webhook URL, `SERVICE_TOKEN`, or `AIRTABLE_PAT` ever appears in Frontend code, the Frontend bundle, or the repository.

## 8. Future Implementation Notes

- Routes are declared but not implemented. Implementation must stay within the ONE Backend and must preserve the route/mode/workflow mapping above.
- Forwarding to Make.com is disabled until Make.com is connected per the fixed constraints.