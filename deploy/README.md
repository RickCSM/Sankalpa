# Deploying Sankalpa Odisha (Docker)

The whole stack — Postgres, the API server, the React web app, and an nginx
reverse proxy with TLS — runs as Docker containers defined by `docker-compose.yml`
at the repo root. Secrets and data live **on the server only** and are never
committed to git.

> Requirements on the server: Docker Engine + the Docker Compose plugin, and
> `openssl` (for the one-time setup script). An x86-64 (amd64) Linux host.

---

## First-time setup (once per server)

```bash
git clone https://github.com/Ashok01-1818/Sankalpa_Odisha_Dockerized.git sankalpa && cd sankalpa
./deploy/gen-secrets.sh          # creates .env (random SESSION_SECRET + DB password) and a self-signed TLS cert
nano .env                        # set PUBLIC_API_URL and ALLOWED_ORIGINS to your real domain
docker compose up -d --build
```

That's it — the app is live on `https://<your-host>`. On first boot the API
creates the database schema and seeds the admin login + master data
automatically; there is no manual SQL step.

> **HTTPS is required.** The app issues `secure` session cookies in production,
> so logins only work over HTTPS. `gen-secrets.sh` creates a self-signed cert so
> it works immediately; browsers will warn until you install real certificates
> (see "TLS certificates" below).

---

## Routine redeploy (every update) — 2 commands

```bash
git pull
docker compose up -d --build
```

…or the equivalent one-liner:

```bash
./deploy/deploy.sh
```

Schema changes are applied automatically on boot. Your data is **not** touched —
see "Data persistence" below.

---

## Configuration (`.env`)

| Variable | Purpose | Set by |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Database password | `gen-secrets.sh` (auto) |
| `SESSION_SECRET` | Session signing key (≥16 chars) | `gen-secrets.sh` (auto) |
| `PUBLIC_API_URL` | Your https origin (used for upload URLs) | **you** |
| `ALLOWED_ORIGINS` | CORS allowlist (your https origin) | **you** |
| `POSTGRES_USER` / `POSTGRES_DB` | DB name/user | defaults to `sankalpa` |
| `SESSION_IDLE_HOURS` | Idle logout window (1–168) | optional, default 8 |
| `LOG_LEVEL` | API log verbosity | optional, default `info` |
| `HTTP_PORT` / `HTTPS_PORT` | Host ports nginx binds | optional, default 80 / 443 |

The `DATABASE_URL` the API uses is assembled automatically inside
`docker-compose.yml` from the `POSTGRES_*` values, so there is no risk of the
password drifting out of sync.

### Object storage backend (uploaded photos & attachments)

The API stores profile photos and announcement attachments through a pluggable
storage layer. The backend is **auto-selected** from the environment:

1. `STORAGE_BACKEND=local|s3|replit` forces a backend explicitly (optional).
2. Otherwise, if the `S3_*` credentials below are present → **S3** backend.
3. Otherwise, if `DEFAULT_OBJECT_STORAGE_BUCKET_ID` + `PRIVATE_OBJECT_DIR` are
   present (managed automatically on Replit) → **Replit Object Storage**.
4. Otherwise → **local disk** (the `uploads` Docker volume — the default for a
   self-hosted box that has not configured object storage).

To make uploads durable on your own server, point the API at any
S3-compatible service (MinIO, AWS S3, Backblaze B2, …) by setting these in
`.env` and uncommenting the matching block in `docker-compose.yml`:

| Variable | Purpose | Required |
| --- | --- | --- |
| `S3_BUCKET` | Bucket name | yes (to enable S3) |
| `S3_ACCESS_KEY_ID` | Access key | yes (to enable S3) |
| `S3_SECRET_ACCESS_KEY` | Secret key | yes (to enable S3) |
| `S3_ENDPOINT` | Service URL, e.g. `https://minio.example.com` | yes for MinIO |
| `S3_REGION` | Region | optional, default `us-east-1` |
| `S3_FORCE_PATH_STYLE` | Path-style addressing | optional, default `true` (keep `true` for MinIO) |
| `S3_PREFIX` | Key prefix, e.g. `sankalpa/` | optional |

Read access falls back to local disk, so files previously written to the
`uploads` volume remain readable after you switch to S3.

---

## Data persistence

Two named Docker volumes hold all state and **survive every `git pull` +
`docker compose up --build`**:

- `pgdata` — the Postgres database
- `uploads` — uploaded attachments (`UPLOAD_DIR=/app/uploads` inside the API)

They are only removed by an explicit `docker compose down -v`. Normal deploys
never delete them.

---

## One-time data migration (optional)

If you are moving existing data onto a new server:

**Database** — generate a fresh dump from the live source, then restore it:

```bash
pg_dump "$DATABASE_URL" > sankalpa_db_dump.sql   # run against the OLD database
./deploy/restore-db.sh sankalpa_db_dump.sql      # run on the NEW server
```
(The `sankalpa_db_dump.sql` committed in the repo is a stale snapshot — prefer a
fresh dump.)

**Uploaded files** — import a previous export. The script remaps the old
`./.private/uploads/<uuid>` layout to the local-disk `uploads/<uuid>` layout:

```bash
./deploy/import-uploads.sh object_storage_export.tar.gz
```

---

## TLS certificates

The stack reads `./certs/fullchain.pem` and `./certs/privkey.pem`. To use real
certificates, replace those two files (e.g. from your CA or Let's Encrypt) and
restart the web container:

```bash
cp /path/to/fullchain.pem certs/fullchain.pem
cp /path/to/privkey.pem   certs/privkey.pem
docker compose restart web
```

If an **external load balancer** already terminates TLS, edit
`deploy/nginx.conf` to serve the app on the `:80` server block instead — but
ensure the LB forwards `X-Forwarded-Proto: https`, or secure cookies (logins)
will break.

---

## Branding images

The UI references several branding images by absolute URL on the production
domain (e.g. `https://sankalpa.odisha.gov.in/Images/odisha-logo.png`). When you
deploy at that domain, place the 6 image files listed in
`images_folder.tar.gz`'s README under the web static root so nginx serves them.

---

## Operations cheat-sheet

```bash
docker compose ps                 # service status
docker compose logs -f api        # tail API logs (schema push, seed, requests)
docker compose logs -f web        # tail nginx logs
docker compose restart api        # restart just the API
docker compose down               # stop everything (KEEPS data)
docker compose down -v            # stop everything and DELETE all data (danger)
```
