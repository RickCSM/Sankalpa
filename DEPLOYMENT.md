# Sankalpa Odisha — Deployment Guide (human steps)

This is the **step-by-step checklist a person follows** to put Sankalpa Odisha
live on a server, from a blank machine to a running site. Follow the steps in
order; each one is a single action.

> The whole application (database, API, website, and HTTPS) runs as Docker
> containers, so you do **not** install Node, Postgres, or nginx by hand — Docker
> does all of that for you.
>
> For deeper reference (every `.env` setting, data migration details, the
> operations cheat-sheet), see [`deploy/README.md`](deploy/README.md). This file
> is the high-level "what a human does"; that file is the detailed reference.

---

## 0. What you need before you start

- [ ] A Linux server (Ubuntu 22.04+ recommended), **64-bit (amd64)**, with at
      least 2 GB RAM and a public IP address.
- [ ] Ability to log into that server over SSH as a user with `sudo`.
- [ ] A domain name (e.g. `sankalpa.odisha.gov.in`) you can point at the server.
- [ ] Inbound ports **80** and **443** open in any firewall / security group.
- [ ] (For real HTTPS) your TLS certificate files, or the ability to run a CA /
      Let's Encrypt to obtain them.

---

## 1. Point your domain at the server

In your DNS provider, create an **A record** for your domain (e.g.
`sankalpa.odisha.gov.in`) pointing to the server's public IP address. DNS can
take a little while to propagate — you can continue with the next steps while it
does.

---

## 2. Install Docker on the server

SSH into the server, then install Docker Engine + the Compose plugin:

```bash
# Ubuntu/Debian — one-time install
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"        # let your user run docker without sudo
# log out and back in (or run: newgrp docker) so the group change applies
docker --version && docker compose version   # confirm both work
```

`git` and `openssl` are also needed and are normally already present. If not:
`sudo apt-get update && sudo apt-get install -y git openssl`.

---

## 3. Get the code

```bash
git clone https://github.com/Ashok01-1818/Sankalpa_Odisha_Dockerized.git sankalpa
cd sankalpa
```

Every later command in this guide is run from inside this `sankalpa` folder.

---

## 4. Generate secrets and a starter certificate

```bash
./deploy/gen-secrets.sh
```

This creates a server-only `.env` file with a strong random database password
and session key, plus a temporary self-signed HTTPS certificate so the site
works immediately. **This `.env` file is never uploaded to GitHub** — it stays on
the server only.

---

## 5. Set your domain

Open the `.env` file and set these two values to your real HTTPS address:

```bash
nano .env
```

```ini
PUBLIC_API_URL=https://sankalpa.odisha.gov.in
ALLOWED_ORIGINS=https://sankalpa.odisha.gov.in
```

> These must be the exact `https://` address people type in their browser.
> Logins rely on HTTPS, so the address must start with `https://`.

Save and close the file.

---

## 6. Install real HTTPS certificates (recommended)

The starter certificate from step 4 works, but browsers show a security warning
until you install real ones. When you have your certificate files, copy them into
the `certs` folder using these exact names, then restart the website container:

```bash
cp /path/to/your_fullchain.pem certs/fullchain.pem
cp /path/to/your_privatekey.pem certs/privkey.pem
docker compose restart web
```

You can do this now, or later — the site runs either way. (If a separate load
balancer already handles HTTPS for you, see the "TLS certificates" section in
[`deploy/README.md`](deploy/README.md).)

---

## 7. Start the application

```bash
docker compose up -d --build
```

The first run takes a few minutes while it builds everything. On first start the
app automatically creates its database tables and seeds the initial login and
master data — there is **no manual database step**.

---

## 8. (Optional) Bring over existing data

Skip this on a brand-new deployment. If you are **moving an existing Sankalpa
Odisha** onto this server, import the old database and uploaded files **after the
stack from step 7 is up** — both scripts talk to the running containers (the
database restore runs against the live `db` service), so they fail if nothing is
running yet:

```bash
./deploy/restore-db.sh sankalpa_db_dump.sql          # a fresh dump from the old database
./deploy/import-uploads.sh object_storage_export.tar.gz   # the old uploaded files
docker compose restart api                           # re-seed idempotently after the restore
```

For the full step-by-step (export from the old system, copy across, restore,
verify, and what exactly is migrated — all users, roles, and logins included),
see [`MIGRATION.md`](MIGRATION.md). The "One-time data migration" section in
[`deploy/README.md`](deploy/README.md) covers how to produce those two files.

---

## 9. Check that it's live

```bash
docker compose ps          # all services should show "running"/"healthy"
docker compose logs -f api # watch startup; press Ctrl-C to stop watching
```

Then open `https://your-domain` in a browser. You should see the Sankalpa Odisha
login page. Log in with the administrator account provided in your project
handover, then create the remaining users from inside the app.

---

## 10. Updating later (routine redeploy)

Whenever there is a new version, run **two commands** from the `sankalpa` folder:

```bash
git pull
docker compose up -d --build
```

…or the equivalent shortcut: `./deploy/deploy.sh`.

Your data is safe across updates — the database and uploaded files live in Docker
volumes that survive every rebuild. They are only deleted if someone explicitly
runs `docker compose down -v`.

---

## Quick troubleshooting

| Symptom | Where to look |
| --- | --- |
| A service isn't healthy | `docker compose ps` and `docker compose logs -f api` (or `web`) |
| Browser shows a certificate warning | You're on the starter cert — do step 6 |
| Can't log in | Make sure you're on `https://` and `PUBLIC_API_URL`/`ALLOWED_ORIGINS` match the exact address (step 5) |
| Need every config option | Full reference in [`deploy/README.md`](deploy/README.md) |

---

**Security note:** the real `.env` file, the `certs/` folder, and uploaded files
are intentionally kept off GitHub. Only `.env.example` (a placeholder template)
is in the repository. Never commit real secrets.
