# Hotel Automation Platform -- Testing Plan

## 1. Purpose

This document defines the testing strategy. It applies to the future implementation of the ONE **Frontend** and ONE **Backend**. Make.com and Airtable are **not connected yet**, so automation-layer and database testing are specified for the future only.

## 2. Testing Principles

- Test the Frontend and Backend independently first.
- Use contract tests as a shared source of truth between Frontend and Backend.
- The four routes and three automation workflows define the test scope; nothing additional is tested.
- No paid testing services are used.

## 3. Test Pyramid

| Level | Owner | Scope |
| --- | --- | --- |
| **Unit** | Frontend + Backend | Individual components and functions in isolation |
| **Integration** | Backend | Route handlers with mocked Make.com webhooks |
| **Contract** | Frontend + Backend | Request/response shapes match `docs/api-contract.md` |
| **E2E** | Frontend | Full user journeys across the four modes |
| **Workflow (future)** | Automation Layer + Database | Make.com workflows and Airtable writes, applied once connected |

## 4. Test Environments

Environment names match `docs/architecture.md` Section 11.

| Environment | Used For |
| --- | --- |
| `local` | Unit, integration, contract, E2E tests |
| `staging` | Workflow tests against Make.com + Airtable (after connection) |
| `production` | Smoke checks only; no destructive testing |

## 5. Frontend Testing

### 5.1 Unit Tests

- Validate each mode's view renders initial state.
- Validate client-side input validation for **AI_CONCIERGE**, **QR_ROOM_SERVICE**, and **LATE_CHECKOUT** fields per `docs/api-contract.md`.
- Validate the **3-IN-1_UNIFIED** router: choosing each option routes to exactly one of the three other modes, and never posts a request itself.

### 5.2 E2E Tests

Scenario set (one per mode):

1. **AI_CONCIERGE** -- submit a concierge request to `POST /api/concierge` and render the `202` response.
2. **QR_ROOM_SERVICE** -- add items, submit to `POST /api/room-service`, render the `202` response.
3. **LATE_CHECKOUT** -- submit a requested time to `POST /api/late-checkout`, render the `202` response.
4. **3-IN-1_UNIFIED** -- entry routes to all three modes; assert no fourth destination is reachable.

Negative cases:

- Each POST route shows an error state for each 4xx error code.
- **3-IN-1_UNIFIED** cannot trigger any API route directly.

## 6. Backend Testing

### 6.1 Unit Tests

- `GET /api/health` returns the documented `200` body.
- Payload validation rejects missing and malformed fields for all three POST routes.

### 6.2 Integration Tests

For each of `POST /api/concierge`, `POST /api/room-service`, `POST /api/late-checkout` with a mocked Make.com webhook:

- Valid payload -> `202` with the documented body.
- Invalid payload -> `400` / `401` / `429` with the documented error shape.
- Mocked workflow failure -> `502`.
- Verify each route forwards to the correct workflow webhook: **BOOKING**, **ROOM_SERVICE**, **LATE_CHECKOUT** respectively.

### 6.3 Rate Limiting

- Assert `RATE_LIMITED` is returned when requests exceed `RATE_LIMIT_MAX` within `RATE_LIMIT_WINDOW`, per `docs/api-contract.md`.

## 7. Contract Tests

- Contract files generated from `docs/api-contract.md` are shared between Frontend and Backend test suites.
- Verify the Four routes: `GET /api/health`, `POST /api/concierge`, `POST /api/room-service`, `POST /api/late-checkout`.
- Verify all four frontend modes and three automation workflows map exactly as defined in `docs/api-contract.md` Section 5.
- Fail the suite if any route-to-mode-to-workflow mapping diverges (guards against a fourth workflow being introduced).

## 8. Workflow Tests (future -- after Make.com and Airtable are connected)

- Each workflow writes exactly one `Workflow Records` row (see `docs/data-model.md`).
- `BOOKING`, `ROOM_SERVICE`, and `LATE_CHECKOUT` each update the correct supporting tables.
- Airtable PAT failures surface as `AUTOMATION_FAILED` to the Frontend.
- **3-IN-1_UNIFIED** produces no additional database writes (guard the "no fourth workflow" rule).

## 9. Test Data

- Use fixture payloads defined in `docs/api-contract.md` Sections 4.2-4.4.
- Do not reuse or import any code or fixtures from any previous project (clean rebuild).
- Staging data is clearly fake and never references real guests.

## 10. Documentation Consistency Checks

Rerun before every release:

1. No contradictions across the four docs (refer to the checks below).
2. Contract, architecture, and data-model field names match.
3. Only ONE Frontend, ONE Backend, ONE Database referenced in the docs.

## 11. Final Documentation Checks (applied in this project)

1. **Contradictions:** Cross-read all four documents; terminology must remain consistent (`Frontend`, `Backend`, `Automation Layer`, `Database`, the four modes, and the three workflows).
2. **No fourth workflow:** **3-IN-1_UNIFIED** is a routing mode only; it must never define or trigger a workflow beyond **BOOKING**, **ROOM_SERVICE**, **LATE_CHECKOUT**.
3. **One Backend:** every document references the single TypeScript Backend, never multiple backends.
4. **One Frontend:** every document references the single React + Vite Frontend, never multiple frontends.