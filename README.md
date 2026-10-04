# ForgeDB Platform Starter

A full-stack starter for the developer database platform we designed: React + Vite frontend, Cloudflare Worker API, D1 metadata, MySQL/PostgreSQL Hyperdrive adapters, SQLite/D1 adapter, and a Hugging Face Storage Bucket adapter.

## What is included

- Interactive developer dashboard
- Database project creation for **MySQL, PostgreSQL, SQLite**
- SQL editor with query results table
- 10 GB/account quota model
- Storage API with **Hugging Face Storage Bucket** adapter only
- Cloudflare Worker backend
- D1 metadata schema
- Hyperdrive bindings for MySQL and PostgreSQL
- SQLite adapter using a D1 binding for the starter environment
- Demo mode so the UI can be tested before external database credentials are configured
- Cloudflare Vite plugin setup

## Important architecture note

This repository is a production-oriented **starter**, not a finished multi-tenant database provisioning service. Cloudflare Hyperdrive connects Workers to existing MySQL/PostgreSQL databases; it does not by itself provision an unlimited number of tenant databases. The next backend phase should add a database provisioning control plane (for example, your chosen MySQL/PostgreSQL provider API) and per-tenant isolation.

For SQLite, the starter uses a D1 binding as the live adapter. A later phase can provision separate SQLite database resources or move SQLite files into a dedicated runtime/storage architecture.

The file provider is intentionally only Hugging Face. The adapter targets Hugging Face Storage Buckets through their S3-compatible endpoint. Configure credentials as Worker secrets; never commit them to GitHub.

## Run in Termux

Install Node.js/npm in Termux, then:

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd forgedb-platform
npm install
npm run dev
```

Open the local URL shown by Vite.

## First Cloudflare setup

1. Login:

```bash
npx wrangler login
```

2. Create the metadata D1 database:

```bash
npx wrangler d1 create forgedb-platform-meta
```

Copy the returned database ID into `wrangler.jsonc`.

3. Apply the migrations (this now includes both `projects` and `users`):

```bash
npx wrangler d1 migrations apply forgedb-platform-meta --remote
```

4. Set the session-signing secret used for login (any long random string - generate one with `head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'`):

```bash
npx wrangler secret put AUTH_JWT_SECRET
```

Without this secret, registration and login will fail with "Authentication is not configured on the server yet."

5. Create Hyperdrive configurations for your existing MySQL and PostgreSQL databases. Examples:

```bash
npx wrangler hyperdrive create forgedb-mysql --connection-string="mysql://USER:PASSWORD@HOST:3306/DATABASE"
npx wrangler hyperdrive create forgedb-postgres --connection-string="postgres://USER:PASSWORD@HOST:5432/DATABASE"
```

Put the returned IDs into the matching Hyperdrive bindings in `wrangler.jsonc`.

6. Configure Hugging Face Storage Bucket secrets. The endpoint is normally:

```text
https://s3.hf.co
```

Set the secrets with:

```bash
npx wrangler secret put HF_S3_ENDPOINT
npx wrangler secret put HF_S3_REGION
npx wrangler secret put HF_S3_BUCKET
npx wrangler secret put HF_S3_ACCESS_KEY_ID
npx wrangler secret put HF_S3_SECRET_ACCESS_KEY
npx wrangler secret put HF_S3_ACCOUNT_PREFIX
```

7. When real database bindings and storage are ready, set `DEMO_MODE` to `false` in your Cloudflare environment.

8. Deploy:

```bash
npm run deploy
```

## GitHub from Termux

```bash
git init
git add .
git commit -m "Initial ForgeDB platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## Security before production

- Email+password accounts are implemented (D1-backed, PBKDF2-hashed passwords, signed HttpOnly session cookies). Every `/api/projects*` and `/api/storage/*` route requires a valid session and is scoped to that user's own data.
- Still worth adding: password reset, email verification, and rate-limiting login attempts.
- Add authorization checks for every database and object.
- Never expose MySQL/PostgreSQL credentials to the browser.
- Add rate limits and query timeouts.
- Restrict dangerous administrative SQL for the control-plane connection.
- Encrypt sensitive connection metadata.
- Add audit logs, backups, deletion/retention policies, and abuse controls.
- Publish accurate privacy/terms disclosures for the underlying Hugging Face storage provider.

## Suggested next phases

### Phase 1 — connect and test
Cloudflare deployment, D1, Hyperdrive, Hugging Face bucket, SQL editor, storage uploads.

### Phase 2 — real accounts
Email+password login is done (see above). Still open: organizations, per-project permissions, API keys.

### Phase 3 — database provisioning
Provider APIs, tenant isolation, per-database credentials, migrations, backups.

### Phase 4 — developer platform
REST APIs, SDKs, webhooks, connection strings, logs, metrics, usage billing.
