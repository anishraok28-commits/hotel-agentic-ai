# Hotel Agentic AI - Frontend

Single React + Vite + TypeScript frontend for the Hotel Automation Platform.

Source of truth for architecture and behavior:
`../docs/architecture.md`, `../docs/api-contract.md`, `../docs/data-model.md`, `../docs/testing-plan.md`.

## Four frontend modes (one application)

| Mode | Path | Future API route |
| --- | --- | --- |
| AI_CONCIERGE | `/concierge` | `POST /api/concierge` |
| QR_ROOM_SERVICE | `/room-service` | `POST /api/room-service` |
| LATE_CHECKOUT | `/late-checkout` | `POST /api/late-checkout` |
| 3-IN-1_UNIFIED | `/` | none (client-side router only) |

3-IN-1_UNIFIED is a routing/interface layer only. It has no API route and no
automation workflow of its own; it routes to the three existing flows.

## Status

Placeholder/mock functionality only. The Backend, Make.com and Airtable are
NOT connected. Submissions resolve against an in-memory mock transport
(`src/api/mockTransport.ts`). The real Backend routes are declared in
`src/api/apiContract.ts` but not implemented.

## Scripts

```bash
npm run dev          # local dev server
npm run typecheck    # tsc -b
npm run lint         # oxlint
npm run test         # vitest run
npm run build        # typecheck + production build
```

## Environment variables

VITE_* only, never secrets. See `.env.example` and `docs/api-contract.md`
section 6.1.