import { getAgentByName } from 'agents';
import { getDb } from '../db/client.js';
import { updateJob, pruneJobs, markStaleJobs, countProcessingJobs } from '../db/queries.js';
import { signR2Url } from '../utils/r2.js';

const DEFAULT_CONCURRENT_USER_LIMIT = 3;
const JOBS_RETAIN = 500;

function getConcurrentUserLimit(env) {
  const raw = Number(env.CONCURRENT_USER_LIMIT);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return DEFAULT_CONCURRENT_USER_LIMIT;
}

async function computeMacroSummary(db, items) {
  const ids = Array.from(new Set(items.map((item) => item.foodId).filter(Boolean)));
  if (!ids.length) {
    return { calories: 0, carbs: 0, protein: 0, fat: 0 };
  }
  const placeholders = ids.map(() => '?').join(',');
  const res = await db.execute({
    sql: `SELECT food_id, nutrient_id, amount_per_100g
          FROM food_nutrients
          WHERE food_id IN (${placeholders})
          AND nutrient_id IN ('calories', 'carbs', 'protein', 'fat')`,
    args: ids
  });
  const nutrientMap = new Map();
  for (const row of res.rows) {
    if (!nutrientMap.has(row.food_id)) nutrientMap.set(row.food_id, {});
    nutrientMap.get(row.food_id)[row.nutrient_id] = Number(row.amount_per_100g || 0);
  }
  const totals = { calories: 0, carbs: 0, protein: 0, fat: 0 };
  for (const item of items) {
    const grams = Number(item.grams_estimate || 0);
    if (!grams || !item.foodId) continue;
    const nutrients = nutrientMap.get(item.foodId) || {};
    totals.calories += (nutrients.calories || 0) * grams / 100;
    totals.carbs += (nutrients.carbs || 0) * grams / 100;
    totals.protein += (nutrients.protein || 0) * grams / 100;
    totals.fat += (nutrients.fat || 0) * grams / 100;
  }
  return totals;
}

function isLikelyFood(items, minAverageConfidence = 0.35) {
  if (!items || !items.length) return false;
  const confidences = items.map((item) => Number(item.confidence || 0));
  const avg = confidences.reduce((sum, val) => sum + val, 0) / confidences.length;
  return avg >= minAverageConfidence;
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'AI output missing items.' };
  }
  for (const item of items) {
    const name = String(item?.name || '').trim();
    const grams = Number(item?.grams_estimate || 0);
    const confidence = Number(item?.confidence);
    if (!name) return { ok: false, error: 'AI output missing item name.' };
    if (!Number.isFinite(grams) || grams <= 0) {
      return { ok: false, error: 'AI output missing grams_estimate.' };
    }
    if (!Number.isFinite(confidence)) {
      return { ok: false, error: 'AI output missing confidence.' };
    }
  }
  return { ok: true };
}

async function processJob(message, env) {
  const db = getDb(env);
  const jobId = message.jobId;
  const userId = message.userId;
  const concurrentLimit = getConcurrentUserLimit(env);
  const processingCount = await countProcessingJobs(db, { userId });
  if (processingCount >= concurrentLimit) {
    await updateJob(db, {
      id: jobId,
      status: 'pending',
      error: `Concurrent limit reached, retrying (${concurrentLimit} max).`
    });
    await env.FOOD_QUEUE.send(message, { delaySeconds: 15 });
    return;
  }
  await updateJob(db, {
    id: jobId,
    status: 'processing',
    startedAt: new Date().toISOString(),
    clearError: true
  });
  try {
    const agent = await getAgentByName(env.FOOD_AGENT, 'food-agent');
    if (message.type === 'parse_text') {
      const parsed = await agent.run({ type: 'text', text: message.text, userId });
      const items = parsed?.items || [];
      if (parsed?.nonFoodReason || !isLikelyFood(items)) {
        await updateJob(db, {
          id: jobId,
          status: 'failed',
          error: parsed?.nonFoodReason || 'No food detected in text.',
          completedAt: new Date().toISOString()
        });
        return;
      }
      const valid = validateItems(items);
      if (!valid.ok) {
        await updateJob(db, {
          id: jobId,
          status: 'failed',
          error: valid.error,
          completedAt: new Date().toISOString()
        });
        return;
      }
      const summary = await computeMacroSummary(db, items);
      await updateJob(db, {
        id: jobId,
        status: 'done',
        result: { items, entryDate: message.entryDate || null, summary },
        completedAt: new Date().toISOString(),
        clearError: true
      });
    } else if (message.type === 'parse_image') {
      const attempt = Number(message.attempt || 0);
      const signed = await signR2Url(env, { key: message.objectKey, method: 'GET' });
      const parsed = await agent.run({
        type: 'image',
        imageUrl: signed.url,
        mimeType: message.mimeType,
        userId,
        hint: message.hint
      });
      const items = parsed?.items || [];
      if (!items.length) {
        if (attempt < 2) {
          await updateJob(db, {
            id: jobId,
            status: 'pending',
            error: `Image parse empty, retrying (${attempt + 1}/2)`
          });
          await env.FOOD_QUEUE.send({
            ...message,
            attempt: attempt + 1
          });
          return;
        }
        await updateJob(db, {
          id: jobId,
          status: 'failed',
          error: 'Image parse returned no items after retries.',
          completedAt: new Date().toISOString()
        });
        return;
      }
      if (parsed?.nonFoodReason || !isLikelyFood(items)) {
        await updateJob(db, {
          id: jobId,
          status: 'failed',
          error: parsed?.nonFoodReason || 'No food detected in image.',
          completedAt: new Date().toISOString()
        });
        return;
      }
      const valid = validateItems(items);
      if (!valid.ok) {
        await updateJob(db, {
          id: jobId,
          status: 'failed',
          error: valid.error,
          completedAt: new Date().toISOString()
        });
        return;
      }
      const summary = await computeMacroSummary(db, items);
      await updateJob(db, {
        id: jobId,
        status: 'done',
        result: { items, entryDate: message.entryDate || null, summary },
        completedAt: new Date().toISOString(),
        clearError: true
      });
    } else {
      await updateJob(db, { id: jobId, status: 'failed', error: 'Unknown job type', completedAt: new Date().toISOString() });
    }
  } catch (err) {
    await updateJob(db, { id: jobId, status: 'failed', error: err?.message || String(err), completedAt: new Date().toISOString() });
  }
  await markStaleJobs(db, { userId, cutoffMinutes: 30 });
  await pruneJobs(db, { userId, keep: JOBS_RETAIN });
}

export async function handleFoodQueue(batch, env) {
  for (const msg of batch.messages) {
    await processJob(msg.body, env);
  }
}
