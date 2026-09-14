# Disaster Recovery

## Overview

The backend uses SQLite with file-based persistence at `DB_PATH=./data/hotel.db`. On Render free tier, the filesystem is ephemeral: data survives service spin-down (~15 min inactivity) but is lost on redeploys.

## Backup Procedure

### Manual backup via API

```bash
# Authenticate as OWNER, then:
curl -H "Authorization: Bearer <token>" \
  https://hotel-agentic-ai-6.onrender.com/api/admin/backup \
  > backup-$(date +%Y%m%d-%H%M%S).json
```

The backup endpoint returns all database tables as JSON. Save the response to a file.

### Manual backup via Render Shell

If you have Shell access on Render:

```bash
# Copy the database file out of the running service
cat data/hotel.db > hotel-backup-$(date +%Y%m%d).db
```

## Restore Procedure

### From API backup (JSON)

1. Deploy a fresh backend instance.
2. Use the seed script to create default staff accounts: `npm run seed`
3. The JSON backup contains all table rows. Restore requires re-inserting data into each table via SQLite.

### From SQLite file copy

If you have a `.db` file backup:

1. Stop the backend service on Render.
2. Replace `data/hotel.db` with the backup file.
3. Restart the service.

## Render-Specific Considerations

| Scenario | Data impact |
|----------|-------------|
| Service spin-down (inactivity) | Data persists (filesystem survives) |
| Manual redeploy | Data lost (filesystem wiped) |
| Environment variable change | Data persists |
| Service deletion + recreation | Data lost |
| Render maintenance | Data persists (unless redeploy triggered) |

## Backup Frequency Recommendation

- Before any manual redeploy
- Daily during active pilot
- After significant data accumulation (orders, feedback)

## Verification

After restoring a backup, verify:

1. Health check: `GET /api/health` returns `databaseReachable: true`
2. Staff login works
3. Dashboard shows correct metrics (`GET /api/admin/dashboard`)
4. Order list is intact (`GET /api/admin/orders`)
