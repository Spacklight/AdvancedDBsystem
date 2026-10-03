import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { Env } from './types';

function client(env: Env) {
  if (!env.HF_S3_ENDPOINT || !env.HF_S3_ACCESS_KEY_ID || !env.HF_S3_SECRET_ACCESS_KEY) return null;
  return new S3Client({
    region: env.HF_S3_REGION || 'us-east-1',
    endpoint: env.HF_S3_ENDPOINT,
    credentials: { accessKeyId: env.HF_S3_ACCESS_KEY_ID, secretAccessKey: env.HF_S3_SECRET_ACCESS_KEY }
  });
}

export async function uploadToHuggingFace(env: Env, userId: string, file: File) {
  const s3 = client(env);
  if (!s3 || !env.HF_S3_BUCKET) throw new Error('Hugging Face Storage Bucket is not configured.');
  const prefix = env.HF_S3_ACCOUNT_PREFIX || 'accounts';
  const key = `${prefix}/${userId}/files/${crypto.randomUUID()}-${sanitize(file.name)}`;
  const body = new Uint8Array(await file.arrayBuffer());
  await s3.send(new PutObjectCommand({ Bucket: env.HF_S3_BUCKET, Key: key, Body: body, ContentType: file.type || 'application/octet-stream' }));
  return { key, size: file.size, provider: 'hugging-face' };
}

export async function listStorage(env: Env, userId: string) {
  const s3 = client(env);
  if (!s3 || !env.HF_S3_BUCKET) return { configured: false, bytes: 0, objects: 0 };
  const prefix = `${env.HF_S3_ACCOUNT_PREFIX || 'accounts'}/${userId}/`;
  let token: string | undefined;
  let bytes = 0;
  let objects = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: env.HF_S3_BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const item of page.Contents || []) { bytes += item.Size || 0; objects += 1; }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { configured: true, bytes, objects };
}

export async function deleteFromHuggingFace(env: Env, userId: string, key: string) {
  const s3 = client(env);
  if (!s3 || !env.HF_S3_BUCKET) throw new Error('Hugging Face Storage Bucket is not configured.');
  const expectedPrefix = `${env.HF_S3_ACCOUNT_PREFIX || 'accounts'}/${userId}/`;
  if (!key.startsWith(expectedPrefix)) throw new Error('Invalid storage key.');
  await s3.send(new DeleteObjectCommand({ Bucket: env.HF_S3_BUCKET, Key: key }));
  return { deleted: true, key };
}

function sanitize(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180); }
