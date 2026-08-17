# Hotel Automation Platform -- Data Model

## 1. Purpose

This document defines the data model. The **Automation Layer** (Make.com + AI) is the sole reader and writer of the **Database** (ONE Airtable base). The **Frontend** and **Backend** never access Airtable directly.

Airtable is **not connected yet**; this document specifies the future schema only.

## 2. Database Principles

- Exactly ONE Airtable base.
- Exactly one workflow table that stores the output of the three automation workflows.
- Exactly two supporting tables: `Guest Sessions` and `Menu Items`.
- Every record has a stable `Record ID` (Airtable-generated) and `Created At` timestamp.
- No business logic lives in Airtable.

## 3. Tables

### 3.1 Table: `Workflow Records`

One row per workflow execution. Created and updated only by **Make.com**.

| Field | Airtable Type | Required | Description |
| --- | --- | --- | --- |
| `Record ID` | Formula (auto) | Yes | Unique Airtable record identifier |
| `Created At` | Created time (auto) | Yes | When the record was created |
| `Updated At` | Last modified time (auto) | No | When the record was last modified |
| `Workflow ID` | Single line text | Yes | `BOOKING` \| `ROOM_SERVICE` \| `LATE_CHECKOUT` |
| `Request ID` | Single line text | Yes | The `requestId` returned by the Backend API |
| `Guest ID` | Single line text | Yes | Guest identifier from the API payload |
| `Session ID` | Single line text | Yes | Guest session identifier |
| `Room Number` | Number | Yes | Guest room number |
| `Request Payload` | Long text | Yes | JSON snapshot of the original request |
| `Status` | Single select | Yes | `accepted` \| `processing` \| `completed` \| `failed` |
| `AI Outcome` | Long text | No | Free-text result produced by the AI step of the workflow |
| `Notes` | Long text | No | Operational notes set by the workflow |

### 3.2 Table: `Guest Sessions`

Anonymous guest identity records, created by **Make.com**.

| Field | Airtable Type | Required | Description |
| --- | --- | --- | --- |
| `Record ID` | Formula (auto) | Yes | Unique identifier |
| `Created At` | Created time (auto) | Yes | When the session was created |
| `Guest ID` | Single line text | Yes | Unique per session |
| `Session ID` | Single line text | Yes | Unique per session |
| `Room Number` | Number | Yes | Room the session is tied to |
| `Last Activity At` | Last modified time (auto) | Yes | Most recent workflow activity |

### 3.3 Table: `Menu Items`

Menu reference data read by the **ROOM_SERVICE** workflow. Managed by staff; read by **Make.com**.

| Field | Airtable Type | Required | Description |
| --- | --- | --- | --- |
| `Record ID` | Formula (auto) | Yes | Unique identifier |
| `Item ID` | Single line text | Yes | Stable identifier referenced by `items[].itemId` in `POST /api/room-service` |
| `Name` | Single line text | Yes | Display name |
| `Category` | Single select | Yes | e.g. `food` \| `drink` \| `amenity` |
| `Unit Price` | Currency / Number | Yes | Price in the hotel's currency |
| `Available` | Checkbox | Yes | Whether the item can be ordered |

## 4. Workflow <-> Record Mapping

Each of the three automation workflows creates one `Workflow Records` row:

| Automation Workflow | API Route | Main Table | Supporting Table |
| --- | --- | --- | --- |
| **BOOKING** | `POST /api/concierge` | `Workflow Records` | `Guest Sessions` |
| **ROOM_SERVICE** | `POST /api/room-service` | `Workflow Records` | `Guest Sessions`, `Menu Items` |
| **LATE_CHECKOUT** | `POST /api/late-checkout` | `Workflow Records` | `Guest Sessions` |

- **3-IN-1_UNIFIED** is a frontend routing mode only and never writes to the database; it has no data row and no workflow.
- There is no fourth workflow, so no fourth workflow-specific table is defined.

## 5. Access Rules

| Component | Read | Write |
| --- | --- | --- |
| **Frontend** | never | never |
| **Backend** | never | never |
| **Make.com + AI** | `Menu Items`, `Guest Sessions`, `Workflow Records` | `Workflow Records`, `Guest Sessions` |
| **Airtable** | n/a | n/a (is the store) |

## 6. Data Relationships

```
Guest Sessions 1 ---- * Workflow Records
Menu Items    1 ---- * Workflow Records   (via items[] in ROOM_SERVICE, recorded in Request Payload)
```

## 7. Sensitive Data

- No payment card data is stored anywhere in this model.
- No guest Personally Identifiable Information (PII) beyond the identifiers and room number defined above.
- `AIRTABLE_PAT` token is held by **Make.com** only (see `docs/api-contract.md`).

## 8. Consistency With Other Documents

- Field names in this document match the request payloads defined in `docs/api-contract.md`.
- Workflow identifiers (`BOOKING`, `ROOM_SERVICE`, `LATE_CHECKOUT`) match the automation workflows defined in `docs/architecture.md`.
- `none` in the route mapping means `GET /api/health` touches no table.