import { AwsClient } from 'aws4fetch';
import type { Env } from './types';

function client(env: Env) {
  if (!env.HF_S3_ACCESS_KEY_ID || !env.HF_S3_SECRET_ACCESS_KEY) {
    return null;
  }

  return new AwsClient({
    accessKeyId: env.HF_S3_ACCESS_KEY_ID,
    secretAccessKey: env.HF_S3_SECRET_ACCESS_KEY,
    region: env.HF_S3_REGION || 'us-east-1',
    service: 's3'
  });
}

function endpoint(env: Env) {
  return (env.HF_S3_ENDPOINT || 'https://s3.hf.co').replace(/\/$/, '');
}

function bucketUrl(env: Env, key = '') {
  const base = `${endpoint(env)}/${env.HF_S3_BUCKET}`;
  return key ? `${base}/${key.split('/').map(encodeURIComponent).join('/')}` : base;
}

export async function uploadToHuggingFace(
  env: Env,
  userId: string,
  file: File
) {
  const s3 = client(env);

  if (!s3 || !env.HF_S3_BUCKET) {
    throw new Error('Hugging Face Storage Bucket is not configured.');
  }

  const prefix = env.HF_S3_ACCOUNT_PREFIX || 'accounts';
  const key = `${prefix}/${userId}/files/${crypto.randomUUID()}-${sanitize(file.name)}`;

  const body = await file.arrayBuffer();

  const response = await s3.fetch(bucketUrl(env, key), {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream'
    },
    body
  });

  if (!response.ok) {
    throw new Error(
      `Hugging Face upload failed: ${response.status} ${await response.text()}`
    );
  }

  return {
    key,
    size: file.size,
    provider: 'hugging-face'
  };
}

export async function listStorage(env: Env, userId: string) {
  const s3 = client(env);

  if (!s3 || !env.HF_S3_BUCKET) {
    return {
      configured: false,
      bytes: 0,
      objects: 0
    };
  }

  const prefix = `${env.HF_S3_ACCOUNT_PREFIX || 'accounts'}/${userId}/`;

  const url =
    `${bucketUrl(env)}` +
    `?list-type=2&prefix=${encodeURIComponent(prefix)}`;

  let token: string | undefined;
  let bytes = 0;
  let objects = 0;

  do {
    const requestUrl = token
      ? `${url}&continuation-token=${encodeURIComponent(token)}`
      : url;

    const response = await s3.fetch(requestUrl);

    if (!response.ok) {
      throw new Error(
        `Hugging Face storage listing failed: ${response.status} ${await response.text()}`
      );
    }

    const text = await response.text();

    const sizeMatches = [...text.matchAll(/<Size>(\d+)<\/Size>/g)];

    for (const match of sizeMatches) {
      bytes += Number(match[1]);
      objects += 1;
    }

    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(text);

    if (truncated) {
      const match = text.match(
        /<NextContinuationToken>(.*?)<\/NextContinuationToken>/
      );

      token = match?.[1];

      if (!token) {
        break;
      }
    } else {
      token = undefined;
    }
  } while (token);

  return {
    configured: true,
    bytes,
    objects
  };
}

export async function deleteFromHuggingFace(
  env: Env,
  userId: string,
  key: string
) {
  const s3 = client(env);

  if (!s3 || !env.HF_S3_BUCKET) {
    throw new Error('Hugging Face Storage Bucket is not configured.');
  }

  const expectedPrefix =
    `${env.HF_S3_ACCOUNT_PREFIX || 'accounts'}/${userId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new Error('Invalid storage key.');
  }

  const response = await s3.fetch(bucketUrl(env, key), {
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error(
      `Hugging Face delete failed: ${response.status} ${await response.text()}`
    );
  }

  return {
    deleted: true,
    key
  };
}

// Generic byte-level object access, used by the SQLite engine to persist a
// project's whole database file under the same per-user prefix as uploaded
// files, so it's covered by the existing quota/listing logic for free.
export async function getObjectBytes(
  env: Env,
  key: string
): Promise<Uint8Array | null> {
  const s3 = client(env);

  if (!s3 || !env.HF_S3_BUCKET) {
    throw new Error('Hugging Face Storage Bucket is not configured.');
  }

  const response = await s3.fetch(bucketUrl(env, key));

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Hugging Face read failed: ${response.status} ${await response.text()}`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function putObjectBytes(
  env: Env,
  key: string,
  bytes: Uint8Array,
  contentType = 'application/octet-stream'
) {
  const s3 = client(env);

  if (!s3 || !env.HF_S3_BUCKET) {
    throw new Error('Hugging Face Storage Bucket is not configured.');
  }

  const response = await s3.fetch(bucketUrl(env, key), {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes
  });

  if (!response.ok) {
    throw new Error(
      `Hugging Face write failed: ${response.status} ${await response.text()}`
    );
  }
}

function sanitize(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180);
}
