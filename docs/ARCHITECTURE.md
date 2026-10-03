# Architecture

```text
Developer browser
      |
      v
React + Vite UI
      |
      | HTTPS
      v
Cloudflare Worker API
      |
      +--> Auth / authorization (next phase)
      |
      +--> Database Service
      |       +--> MySQL via Hyperdrive
      |       +--> PostgreSQL via Hyperdrive
      |       +--> SQLite adapter
      |
      +--> Storage Service
      |       +--> Hugging Face Storage Bucket
      |
      +--> D1 platform metadata
```

## Storage quota

The default quota is 10 GiB per account. The API checks usage before uploads. The quota is represented by `STORAGE_QUOTA_BYTES` and defaults to 10 GiB.

The platform should expose the provider through your Storage API, while legal/privacy documentation accurately states that Hugging Face is the underlying provider.

## Database service

The database service deliberately separates project metadata from live database data. D1 stores platform metadata such as project name, engine and ownership. Live MySQL/PostgreSQL data belongs in the external database engine accessed through Hyperdrive.
