# Sankalpa Odisha — Data Migration Guide

This guide explains how to move your **existing data** — all users, their
user-types/roles, login passwords, departments, announcements, uploaded files,
and everything else — onto a new (Docker) deployment.

It is the companion to [`DEPLOYMENT.md`](DEPLOYMENT.md) (how to stand up the
server) and [`deploy/README.md`](deploy/README.md) (full operations reference).
Do the server setup first, then follow this guide.

---

## What gets migrated

Everything in the application lives in **one PostgreSQL database** plus a set of
**uploaded files**. There is no separate login or identity system to migrate.

| Item | Where it lives | Migrated by |
| --- | --- | --- |
| Users (all accounts) | `users` table | database dump |
| User-type / role (admin, chief_minister, cmo_nodal, cmo_reviewer, ocac_viewer, dept_head, dept_nodal, dept_reviewer, dept_user, dept_viewer) | `users.role` | database dump |
| Login passwords | `users.password_hash` (securely hashed) | database dump |
| Departments, districts, blocks, categories, tags, occasions | their tables | database dump |
| Announcements, comments, attachments metadata, remarks, notes | their tables | database dump |
| Audit log, notifications, assignment pointers | their tables | database dump |
| Uploaded files (attachments, images) | object storage | uploads archive |

> **Passwords carry over unchanged.** They are stored as secure hashes, so every
> user logs into the new server with the **same username and password** they use
> today. No password resets are required.

---

## Before you start

- The new server is set up through **step 7 of `DEPLOYMENT.md`** — i.e. the stack
  is already running (`docker compose up -d --build`). The database restore talks
  to the **running** `db` container, so the stack must be up first.
- You can reach the **old/source** database (the one with your real data). On
  Replit this is the `DATABASE_URL` environment variable.
- You have `scp`/`sftp` (or any file copy) to move two files to the new server.

---

## Step 1 — Export from the OLD environment

Run these against the **source** (old) system.

### 1a. Database

```bash
pg_dump "$DATABASE_URL" --clean --if-exists --no-owner --no-privileges > sankalpa_db_dump.sql
```

`--clean --if-exists` makes the file safe to restore on top of the fresh server's
auto-seeded tables: it drops the empty seeded tables first, then recreates them
with your real data.

### 1b. Uploaded files

Export the uploaded files to a single archive (see "One-time data migration" in
[`deploy/README.md`](deploy/README.md) for the exact export command for your
source storage). The result is a file like `object_storage_export.tar.gz`.

> **Keep both files private.** `sankalpa_db_dump.sql` contains real user data
> (including password hashes). Transfer it directly to the server and **never**
> commit it to GitHub — it is already git-ignored for this reason.

---

## Step 2 — Copy the files to the NEW server

```bash
scp sankalpa_db_dump.sql object_storage_export.tar.gz user@your-server:/path/to/sankalpa/
```

Place them in the project folder (the `sankalpa` folder you cloned in
`DEPLOYMENT.md` step 3).

---

## Step 3 — Restore on the NEW server

From inside the `sankalpa` folder, with the stack already running:

```bash
./deploy/restore-db.sh sankalpa_db_dump.sql            # users, roles, logins + all data
./deploy/import-uploads.sh object_storage_export.tar.gz # uploaded files
docker compose restart api                              # re-seed idempotently after restore
```

That's it — all users, their roles, and their passwords are now on the new
server.

---

## Step 4 — Verify

```bash
# How many users were restored (expect your real count, e.g. 7):
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select count(*) from users;"

# List accounts and their roles (no passwords shown):
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select id, username, name, role, status from users order by id;"
```

Then open `https://your-domain` and log in as an existing user with their normal
password to confirm end-to-end.

---

## Safety & rollback

- The restore **replaces** the database contents with the dump. Run it **once**,
  during migration, before the new server is in real use.
- Your data persists across app updates — the database and uploads live in Docker
  volumes that survive `docker compose up -d --build`. They are only erased by an
  explicit `docker compose down -v`.
- If a restore goes wrong, you can start clean: `docker compose down -v` then
  `docker compose up -d --build` recreates empty, auto-seeded tables, and you can
  re-run Step 3 with a good dump.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `restore-db.sh` errors that the db isn't reachable | The stack isn't running. Do `DEPLOYMENT.md` step 7 (`docker compose up -d --build`) first. |
| `relation ... already exists` during restore | Your dump was made without `--clean --if-exists`. Re-export using the exact command in Step 1a. |
| Users restored but can't log in | Confirm you're on `https://` and that `PUBLIC_API_URL` / `ALLOWED_ORIGINS` in `.env` match the exact browser address. |
| Uploaded files/images missing | Re-run `./deploy/import-uploads.sh` with the correct archive; check `deploy/README.md` for the storage export step. |
