export type Engine = 'mysql' | 'postgresql' | 'sqlite';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  engine: Engine;
  status: string;
  created_at: string;
  storage_bytes: number;
}

export interface Env {
  DEMO_MODE?: string;
  STORAGE_QUOTA_BYTES?: string;

  /*
   * D1 metadata database: users and projects. Created with
   * `wrangler d1 create`, bound here, migrated with the files in
   * /migrations.
   */
  DB: D1Database;

  /*
   * Secret used to sign session tokens. Set with
   * `wrangler secret put AUTH_JWT_SECRET`. Never commit a real value.
   */
  AUTH_JWT_SECRET?: string;

  /*
   * External database service configuration.
   * These will be supplied through Cloudflare secrets/environment
   * variables when the real database gateway is connected.
   */
  DATABASE_API_URL?: string;
  DATABASE_API_KEY?: string;

  /*
   * Hugging Face storage configuration.
   */
  HF_S3_ENDPOINT?: string;
  HF_S3_REGION?: string;
  HF_S3_BUCKET?: string;
  HF_S3_ACCESS_KEY_ID?: string;
  HF_S3_SECRET_ACCESS_KEY?: string;
  HF_S3_ACCOUNT_PREFIX?: string;
}
