# Non-Docker server deployment

Run the API with Node.js/systemd, serve the built frontend with Nginx, and connect to an existing or separately installed PostgreSQL database. No containers are required.

## Requirements

- Linux server with systemd, Node.js 24, pnpm 10.26.1, PostgreSQL 16 (local or remote), Nginx and OpenSSL.
- A domain pointing to the server and a valid TLS certificate. Production login requires HTTPS because session cookies are secure.
- A PostgreSQL database and login with schema-change privileges. Ask your database administrator to provision these; the app does not create the database itself.

Keep PostgreSQL and API port 5000 private using host/cloud firewall rules. Only Nginx ports 80/443 should be publicly accessible.

## 1. Install the source and dependencies

Clone https://github.com/RickCSM/Sankalpa into `/opt/sankalpa`. Create a dedicated `sankalpa` OS user/group and give it ownership of this folder.

Run the following as that user from `/opt/sankalpa`:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
```

Edit `.env`: use the generated random value for `SESSION_SECRET`, your PostgreSQL connection URL for `DATABASE_URL`, and your actual HTTPS origin for `PUBLIC_API_URL` and `ALLOWED_ORIGINS`. Replace all `CHANGE_ME` and example values. Do not paste secrets into logs or commit `.env`.

Create persistent file storage as an administrator:

```bash
sudo install -d -o sankalpa -g sankalpa -m 750 /var/lib/sankalpa/uploads
```

## 2. Build and initialize the schema

From `/opt/sankalpa`, as the application user:

```bash
pnpm --filter @workspace/api-server run build
NODE_ENV=production BASE_PATH=/ pnpm --filter @workspace/sankalpa-odisha run build
(cd lib/db && node --env-file=../../.env ./node_modules/drizzle-kit/bin.cjs push --config ./drizzle.config.ts)
```

Schema push changes the selected database. Back up existing data first and review all proposed changes. Do not use `--force` on a live database. Build commands do not import existing announcements or uploaded files.

## 3. Run the backend

Verify `command -v node` is `/usr/bin/node`; otherwise update `ExecStart` in `server/sankalpa-api.service` to the installed absolute Node.js path. This must be a system-accessible Node.js 24 installation, not another user's private version-manager path.

```bash
sudo cp server/sankalpa-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sankalpa-api
sudo systemctl status sankalpa-api --no-pager
curl -f http://127.0.0.1:5000/api/healthz
```

The backend must pass this health check before configuring Nginx. Startup verifies database connectivity and performs the application's production bootstrap/master-data initialization. On a new database, change bootstrap account passwords immediately through the application's forced password-change flow before opening access to users.

## 4. Serve the frontend over HTTPS

Obtain a TLS certificate using your server's certificate tooling. Then:

```bash
sudo install -d -m 755 /var/www/sankalpa
sudo cp -R artifacts/sankalpa-odisha/dist/public/. /var/www/sankalpa/
sudo chmod -R a+rX /var/www/sankalpa
sudo cp server/nginx.conf /etc/nginx/sites-available/sankalpa
```

Edit `/etc/nginx/sites-available/sankalpa`: replace the domain and certificate paths. On Debian/Ubuntu, enable the site with a symlink into `/etc/nginx/sites-enabled/`; on other distributions use the appropriate Nginx include directory. Resolve any conflicting site configuration for the same domain.

```bash
sudo ln -s /etc/nginx/sites-available/sankalpa /etc/nginx/sites-enabled/sankalpa
sudo nginx -t
sudo systemctl reload nginx
```

The sample serves static files from `/var/www/sankalpa` and proxies `/api/` to `127.0.0.1:5000`, preserving the `/api/` prefix. Do not use the old Docker hostname `api:5000` on a non-Docker server.

Verify `https://YOUR_DOMAIN/api/healthz`, then login through HTTPS. Do not run the development or Vite preview server as the production web server.

## Updates

Back up the PostgreSQL database, `.env` and `/var/lib/sankalpa/uploads`. Pull `main`, install dependencies, rebuild both services, and review/apply required schema changes using step 2. Copy the new frontend build to `/var/www/sankalpa` and restart `sankalpa-api`. Recheck both local and HTTPS health endpoints.

## Moving from an existing deployment

Changing the repository does not move your existing data. Preserve your current database and uploads before changing services. Use a reviewed PostgreSQL backup/restore process if moving databases, and copy uploaded files to the configured `UPLOAD_DIR` while preserving their relative paths and sidecar metadata. Ensure the `sankalpa` user can read/write them. Never delete the old database or storage until the new deployment is verified.

## Troubleshooting a 502

```bash
sudo systemctl status sankalpa-api --no-pager
sudo journalctl -u sankalpa-api -n 100 --no-pager
curl -v http://127.0.0.1:5000/api/healthz
sudo tail -n 80 /var/log/nginx/error.log
```

A failed local health check points to API startup, database connectivity, configuration or port issues. If it succeeds but HTTPS requests return 502, inspect Nginx's upstream and OS access policies. Redact credentials and personal data before sharing logs.