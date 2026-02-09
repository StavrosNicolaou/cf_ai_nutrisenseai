import { getDb } from '../db/client.js';
import { getJobsByUser, getJobById, updateJob, markStaleJobs, deleteJobById, createJob } from '../db/queries.js';
import { signR2Url } from '../utils/r2.js';

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

export async function listJobsHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  await markStaleJobs(db, { userId: session.userId, cutoffMinutes: 30 });
  const jobs = await getJobsByUser(db, { userId: session.userId });
  const enriched = [];
  for (const job of jobs) {
    const payload = parseJson(job.payload_json);
    let imageUrl = null;
    if (payload?.objectKey) {
      const signed = await signR2Url(c.env, { key: payload.objectKey, method: 'GET' });
      imageUrl = signed.url;
    }
    enriched.push({ ...job, payload, imageUrl });
  }
  return c.json({ jobs: enriched });
}

export async function getJobHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  const jobId = c.req.param('id');
  const job = await getJobById(db, { jobId, userId: session.userId });
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ job });
}

export async function consumeJobHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  const jobId = c.req.param('id');
  const job = await getJobById(db, { jobId, userId: session.userId });
  if (!job) return c.json({ error: 'Job not found' }, 404);
  await updateJob(db, { id: jobId, status: 'consumed' });
  return c.json({ ok: true });
}

export async function deleteJobHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  const jobId = c.req.param('id');
  const job = await getJobById(db, { jobId, userId: session.userId });
  if (!job) return c.json({ error: 'Job not found' }, 404);
  await deleteJobById(db, { jobId, userId: session.userId });
  return c.json({ ok: true });
}

export async function retryJobHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  const jobId = c.req.param('id');
  const job = await getJobById(db, { jobId, userId: session.userId });
  if (!job) return c.json({ error: 'Job not found' }, 404);
  const payload = parseJson(job.payload_json) || {};
  const newJobId = crypto.randomUUID();
  await createJob(db, {
    id: newJobId,
    userId: session.userId,
    type: job.type,
    status: 'pending',
    payload: { ...payload, attempt: 0 }
  });
  if (job.type === 'parse_text') {
    await c.env.FOOD_QUEUE.send({
      jobId: newJobId,
      userId: session.userId,
      type: 'parse_text',
      text: payload.text,
      entryDate: payload.entryDate
    });
  } else if (job.type === 'parse_image') {
    await c.env.FOOD_QUEUE.send({
      jobId: newJobId,
      userId: session.userId,
      type: 'parse_image',
      objectKey: payload.objectKey,
      mimeType: payload.mimeType,
      entryDate: payload.entryDate,
      hint: payload.hint,
      size: payload.size,
      attempt: 0
    });
  } else {
    return c.json({ error: 'Unsupported job type' }, 400);
  }
  await updateJob(db, { id: jobId, status: 'consumed' });
  return c.json({ ok: true, jobId: newJobId });
}
