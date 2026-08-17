# Hotel Automation Platform - Project Architecture

## 1. Purpose

This document defines the architecture for a new hotel automation platform. It is a **clean rebuild**; no code from any previous project is imported or copied.

The platform consists of exactly one of each of the following components:

| Component | Technology | Responsibility |
| --- | --- | --- |
| **Frontend** | React + Vite | Delivers the four frontend modes to guests and staff |
| **Backend** | TypeScript | API gateway, validation, security, routing of requests to the automation layer |
| **Automation Layer** | Make.com + AI | Executes the three automation workflows |
| **Database** | Airtable | Sole persistent data store |

## 2. Fixed Constraints

- ONE GitHub repository hosts all application code (Frontend + Backend).
- ONE Frontend (React + Vite).
- ONE Backend (TypeScript).
- ONE Database (Airtable).
- ONE Automation Layer (Make.com + AI).
- Make.com and Airtable are **not connected yet**; this document specifies how they will integrate in the future.
- No paid APIs are used.
- No new products and no new automation workflows are invented beyond those defined below.

## 3. High-Level Architecture

```
                 +-----------------------------------------------------------+
                 |   ONE GitHub Repository                                   |
                 |                                                           |
                 |   +------------------+              +------------------+  |
                 |   |  FRONTEND        |   HTTP/JSON  |  BACKEND         |  |
                 |   |  React + Vite    | <----------> |  TypeScript      |  |
                 |   |  4 modes         |              |  API gateway     |  |
                 |   +------------------+              +------------------+  |
                 |                                          |                |
                 |                                          | forward        |
                 |                                          v                |
                 |                          +------------------+            |
                 |                          |  AUTOMATION      |            |
                 |                          |  Make.com + AI   |            |
                 |                          |  3 workflows     |            |
                 |                          +------------------+            |
                 |                                          |                |
                 |                                          | reads/writes   |
                 |                                          v                |
                 |                          +------------------+            |
                 |                          |  DATABASE        |            |
                 |                          |  ONE Airtable    |            |
                 |                          +------------------+            |
                 +-----------------------------------------------------------+
```

- The **Frontend** never talks to the **Database** directly.
- The **Backend** never accesses Airtable directly; all database access happens through the **Automation Layer**.
- The **Automation Layer** is only reachable through the **Backend**.

## 4. Frontend Structure

### 4.1 Overview

The single React + Vite **Frontend** is responsible for user interaction only. It contains no business logic and no direct data persistence.

### 4.2 Frontend Modes

The Frontend exposes exactly four modes. Each mode is a view within the same application, not a separate system.

| Mode | Audience | Purpose |
| --- | --- | --- |
| **AI_CONCIERGE** | Guests | AI-powered concierge interactions (e.g. questions, recommendations) |
| **QR_ROOM_SERVICE** | Guests | Room service ordering via QR code |
| **LATE_CHECKOUT** | Guests | Request a later checkout time |
| **3-IN-1_UNIFIED** | Guests | Entry point that routes users to one of the other three modes, never computes business outcomes itself |

### 4.3 3-IN-1_UNIFIED Routing

**3-IN-1_UNIFIED** is a routing mode. It is NOT a separate system and it does NOT introduce a fourth automation workflow. It presents the three other modes as options and routes a user to the appropriate existing flow:

- Rooms/specials -> **AI_CONCIERGE**
- Food/drink ordering -> **QR_ROOM_SERVICE**
- Checkout extension -> **LATE_CHECKOUT**

The **3-IN-1_UNIFIED** mode issues client-side navigation to the target mode's view. It posts no API request of its own; the target mode owns the API call.

### 4.4 Event Flow

1. User selects a mode (directly or via **3-IN-1_UNIFIED**).
2. The mode's view collects input and validates it client-side.
3. The mode's view calls the corresponding Backend API route.
4. The Backend response is rendered back to the user.

### 4.5 Frontend Responsibilities

- Present the four modes.
- Own client-side routing, including **3-IN-1_UNIFIED** routing.
- Validate input before submission.
- Render API responses and error states.
- Store no durable guest data.

## 5. Backend Structure

### 5.1 Overview

The single TypeScript **Backend** is the application's API gateway. It exposes exactly four API routes (defined in `docs/api-contract.md`, not yet implemented).

### 5.2 Backend Responsibilities

- Receive HTTPS requests from the Frontend.
- Validate and sanitize all input.
- Enforce security boundaries (see Section 8).
- Forward valid requests to the **Automation Layer**.
- Return structured responses to the Frontend.
- Report service health via `GET /api/health`.

### 5.3 Backend Non-Responsibilities

- The Backend does not run business logic.
- The Backend does not access **Airtable** directly.
- The Backend does not implement automation workflows.

## 6. Automation Workflows

The **Automation Layer** (Make.com + AI) executes exactly three automation workflows.

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| **BOOKING** | `POST /api/concierge` response | Booking requests captured through **AI_CONCIERGE** |
| **ROOM_SERVICE** | `POST /api/room-service` response | Room service orders captured through **QR_ROOM_SERVICE** |
| **LATE_CHECKOUT** | `POST /api/late-checkout` response | Late checkout requests captured through **LATE_CHECKOUT** |

Notes:

- Each automation workflow maps to exactly one API route and one frontend mode.
- **3-IN-1_UNIFIED** has no workflow of its own.
- No additional workflows exist.

### 6.1 Backend and Make.com Responsibility

- **Backend** forwards validated request payloads to the appropriate Make.com webhook.
- **Backend** does not execute or orchestrate workflow steps.
- **Make.com** receives the request, runs the workflow, and reports a result back to the Backend.

### 6.2 Make.com and Airtable Responsibility

- **Make.com** is the only component that reads from or writes to **Airtable** tables.
- **Make.com** stores workflow records in Airtable and retrieves data (e.g. availability, pricing) needed to complete a workflow.
- **Airtable** is purely a data store; it has no application logic.

## 7. Component Responsibility Summary

| Activity | Frontend | Backend | Make.com + AI | Airtable |
| --- | --- | --- | --- | --- |
| Capture user input | Yes | | | |
| Client-side validation | Yes | | | |
| Route within **3-IN-1_UNIFIED** | Yes | | | |
| Server-side validation | | Yes | | |
| Security enforcement | | Yes | | |
| Health reporting | | Yes | | |
| Forward to automation | | Yes | | |
| Execute workflows with AI | | | Yes | |
| Read/write records | | | Yes | |
| Store data | | | | Yes |

## 8. Security Boundaries

| Boundary | Rule |
| --- | --- |
| Frontend <-> Backend | Authenticated HTTPS traffic only; all payloads validated server-side; no secrets shipped in the Frontend build |
| Backend <-> Make.com | Backend authenticates to Make.com webhooks with a private webhook key held only server-side |
| Make.com <-> Airtable | Make.com authenticates to Airtable with a PAT (Personal Access Token) held only in Make.com |
| Frontend <-> Airtable | Blocked by design; never permitted |
| Backend <-> Airtable | Blocked by design; never permitted |

- The Frontend is treated as **untrusted**.
- The Backend enforces input limits, rejects malformed payloads, and applies rate limiting.
- No API keys, tokens, or secrets appear in the Frontend bundle or in the repository.

## 9. Get /api/health Responsibility

`GET /api/health` is a Backend-owned read-only route used to verify the Backend is running. It performs no automation and no database access.

## 10. Environment Variables

See `docs/api-contract.md` Section 6 for the full environment variables contract. Summary of ownership:

- Frontend-owned variables are prefixed with `VITE_` for Vite exposure.
- Backend-owned secrets are held server-side only and never exposed to the Frontend.

## 11. Environment Strategy

Documented environment names used consistently:

| Environment | Purpose |
| --- | --- |
| `local` | Developer machine |
| `staging` | Pre-production validation |
| `production` | Live guest-facing traffic |

Make.com and Airtable integration is introduced in `staging` after `local` validation, and remains gated by the fixed constraints until then.

## 12. GitHub Repository Layout (reference only)

```
hotel-agentic-ai/
  docs/
    architecture.md
    api-contract.md
    data-model.md
    testing-plan.md
  frontend/      (future - NOT implemented yet)
  backend/       (future - NOT implemented yet)
```

Only `docs/` currently exists. `frontend/` and `backend/` are planned but not created, preserving the ONE Frontend / ONE Backend rule.