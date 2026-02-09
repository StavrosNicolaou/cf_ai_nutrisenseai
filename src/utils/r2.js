import { AwsClient } from 'aws4fetch';

const DEFAULT_EXPIRES = 900;

export function getR2Client(env) {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto'
  });
}

export function buildR2Url(env, key, { usePublic = true } = {}) {
  const bucket = String(env.R2_BUCKET || '').trim();
  const base = String(
    usePublic && env.R2_PUBLIC_BASE ? env.R2_PUBLIC_BASE : env.R2_ENDPOINT || ''
  ).replace(/\/+$/, '');
  if (usePublic && env.R2_PUBLIC_BASE) {
    return `${base}/${key}`;
  }
  return `${base}/${bucket}/${key}`;
}

export async function signR2Url(env, { key, method = 'GET', expires = DEFAULT_EXPIRES, contentType, meta }) {
  const client = getR2Client(env);
  const usePublic = String(method).toUpperCase() === 'GET';
  const url = buildR2Url(env, key, { usePublic });
  const headers = {};
  if (contentType) headers['content-type'] = contentType;
  if (meta && typeof meta === 'object') {
    for (const [keyName, value] of Object.entries(meta)) {
      if (value === undefined || value === null) continue;
      headers[`x-amz-meta-${keyName}`] = String(value);
    }
  }
  const signed = await client.sign(url, {
    method,
    headers,
    aws: { signQuery: true, expires }
  });
  return { url: signed.url, headers };
}

export async function headR2Object(env, { key, expires = DEFAULT_EXPIRES }) {
  const signed = await signR2Url(env, { key, method: 'HEAD', expires });
  return fetch(signed.url, { method: 'HEAD' });
}
