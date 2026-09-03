# Render Deployment Checklist

Environment variables that **must** be configured on Render for production.
All secrets must be set via the Render dashboard — never commit real values to Git.

---

## Frontend Service (hotel-agentic-ai-7)

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://hotel-agentic-ai-6.onrender.com` | Backend URL (cross-origin) |
| `VITE_MOCK_API_ENABLED` | `false` | Enables real Backend HTTP calls |
| `VITE_SERVICE_TOKEN` | `<same value as backend SERVICE_TOKEN>` | Bearer token for staff/admin API calls. Must match the backend's `SERVICE_TOKEN` exactly. |

**Why `VITE_SERVICE_TOKEN` is required:**
Without it, `appConfig.serviceToken` resolves to `''` (empty string). The staff/admin
API functions (`listAdminOrders`, `updateOrderStatus`) check `if (appConfig.serviceToken)`
before sending the `Authorization: Bearer <token>` header. An empty string is falsy,
so the header is never sent, the backend returns 401, and the frontend silently returns
`{ orders: [] }` — causing the "No orders found" display.

---

## Backend Service (hotel-agentic-ai-6)

| Variable | Value | Notes |
|---|---|---|
| `SERVICE_TOKEN` | `<your-secret-token>` | Shared secret for Bearer auth. Frontend's `VITE_SERVICE_TOKEN` must match this. |
| `DB_PATH` | `./data/hotel.db` | Persistent SQLite file path. Without this, defaults to `:memory:` (ephemeral — all orders lost on restart/spin-down). |
| `ALLOWED_ORIGINS` | `https://hotel-agentic-ai-7.onrender.com` | Comma-separated list of allowed browser origins. Must include the frontend origin for CORS to work. |
| `RATE_LIMIT_WINDOW` | `60` | Optional. Rate-limit window in seconds. |
| `RATE_LIMIT_MAX` | `30` | Optional. Max requests per window per IP. |
| `QR_TOKEN_SECRET` | `<rotate-from-dev-default>` | Rotate from the dev default. Required for QR token signing in production. |

**Why `DB_PATH` is required:**
The backend uses `better-sqlite3`. If `DB_PATH` is unset, `database.ts` defaults to
`:memory:` — an in-memory database that is destroyed every time the Node.js process
restarts. On Render free tier, services spin down after ~15 minutes of inactivity and
restart on the next request, wiping all order data.

---

## Post-Deploy Verification

After deploying both services, verify:

1. `GET https://hotel-agentic-ai-6.onrender.com/api/health` returns `{ status: "ok" }`
2. Open the frontend, complete a room-service order, confirm it appears in Google Sheets
3. Navigate to `/staff-orders`, confirm the order appears with status NEW
4. Click "Mark as Preparing" — confirm the status updates to PREPARING
5. Advance through READY → DELIVERED and verify each transition

---

## Common Failures

| Symptom | Likely cause |
|---|---|
| "No orders found" on Staff Orders | `VITE_SERVICE_TOKEN` not set on frontend, or not matching backend `SERVICE_TOKEN` |
| Orders disappear after backend restart | `DB_PATH` not set — using `:memory:` |
| CORS error in browser console | `ALLOWED_ORIGINS` missing frontend origin |
| 401 on staff endpoints | `SERVICE_TOKEN` mismatch between frontend and backend |
