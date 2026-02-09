import { getAgentByName } from 'agents';
import { getDb } from '../db/client.js';
import {
  searchFoodsByName,
  logFoodEntry,
  updateFoodEntry,
  deleteFoodEntry,
  getFoodEntryById,
  getFoodNutrients,
  getFoodById,
  getDayNutrients,
  getFoodEntriesByDate,
  createJob
} from '../db/queries.js';
import { todayISO } from '../utils/date.js';
import { buildPersonalizedReferences } from '../utils/rda.js';
import { signR2Url, headR2Object } from '../utils/r2.js';
import { rateLimit } from '../auth/rateLimit.js';

const MEAL_TYPES = ['uncategorized', 'breakfast', 'lunch', 'dinner', 'snack'];

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function extensionForMime(mimeType) {
  const lower = String(mimeType || '').toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  return 'jpg';
}

export async function parseTextHandler(c) {
  const body = await c.req.json();
  const text = String(body.text || '').trim();
  if (!text) return c.json({ error: 'Text is required' }, 400);
  const entryDate = String(body.entryDate || '').trim();
  const entryMeal = String(body.entryMeal || '').trim().toLowerCase();
  const mealType = MEAL_TYPES.includes(entryMeal) ? entryMeal : 'uncategorized';
  const session = c.get('session');
  const rate = await rateLimit(c.env, `parse-text:${session.userId}`, 20, 300);
  if (!rate.allowed) return c.json({ error: 'Too many parse requests. Try again later.' }, 429);
  const db = getDb(c.env);
  const jobId = crypto.randomUUID();
  await createJob(db, { id: jobId, userId: session.userId, type: 'parse_text', status: 'pending', payload: { text, entryDate, entryMeal: mealType } });
  await c.env.FOOD_QUEUE.send({ jobId, userId: session.userId, type: 'parse_text', text, entryDate, entryMeal: mealType });
  return c.json({ jobId, status: 'pending' });
}

export async function parseImageHandler(c) {
  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('application/json')) {
    return c.json({ error: 'Use signed upload flow for images.' }, 400);
  }
  const body = await c.req.json();
  const objectKey = String(body.objectKey || '').trim();
  const mimeType = String(body.mimeType || '').trim();
  const entryDate = String(body.entryDate || '').trim();
  const entryMeal = String(body.entryMeal || '').trim().toLowerCase();
  const mealType = MEAL_TYPES.includes(entryMeal) ? entryMeal : 'uncategorized';
  const hint = String(body.hint || '').trim();
  const size = Number(body.size || 0);
  const checksum = String(body.checksum || '').trim().toLowerCase();
  const maxBytes = 20 * 1024 * 1024;
  if (!objectKey) {
    return c.json({ error: 'Image object key missing' }, 400);
  }
  const session = c.get('session');
  const rate = await rateLimit(c.env, `parse-image:${session.userId}`, 10, 600);
  if (!rate.allowed) return c.json({ error: 'Too many parse requests. Try again later.' }, 429);
  if (!size || !Number.isFinite(size)) {
    return c.json({ error: 'Image size is required' }, 400);
  }
  if (!checksum || !/^[a-f0-9]{64}$/.test(checksum)) {
    return c.json({ error: 'Image checksum is required' }, 400);
  }
  if (size > maxBytes) {
    return c.json({ error: 'Image is too large (max 20 MB).' }, 400);
  }
  const head = await headR2Object(c.env, { key: objectKey, expires: 300 });
  if (!head.ok) {
    return c.json({ error: 'Uploaded image not found.' }, 400);
  }
  const metaSize = head.headers.get('x-amz-meta-size');
  const metaHash = head.headers.get('x-amz-meta-sha256');
  if (!metaSize || !metaHash) {
    return c.json({ error: 'Upload metadata missing. Please retry upload.' }, 400);
  }
  if (Number(metaSize) !== size || String(metaHash).toLowerCase() !== checksum) {
    return c.json({ error: 'Upload metadata mismatch. Please retry upload.' }, 400);
  }
  const db = getDb(c.env);
  const jobId = crypto.randomUUID();
  await createJob(db, {
    id: jobId,
    userId: session.userId,
    type: 'parse_image',
    status: 'pending',
    payload: { mimeType, objectKey, entryDate, entryMeal: mealType, hint, size, checksum, attempt: 0 }
  });
  await c.env.FOOD_QUEUE.send({
    jobId,
    userId: session.userId,
    type: 'parse_image',
    objectKey,
    mimeType,
    entryDate,
    entryMeal: mealType,
    hint,
    size,
    checksum,
    attempt: 0
  });
  return c.json({ jobId, status: 'pending' });
}

export async function imageUploadUrlHandler(c) {
  const body = await c.req.json();
  const mimeType = String(body.mimeType || '').trim();
  const size = Number(body.size || 0);
  const checksum = String(body.checksum || '').trim().toLowerCase();
  if (!mimeType) return c.json({ error: 'mimeType is required' }, 400);
  if (!size || !Number.isFinite(size)) return c.json({ error: 'size is required' }, 400);
  if (!checksum || !/^[a-f0-9]{64}$/.test(checksum)) {
    return c.json({ error: 'checksum is required' }, 400);
  }
  const session = c.get('session');
  const ext = extensionForMime(mimeType);
  const objectKey = `uploads/${session.userId}/${crypto.randomUUID()}.${ext}`;
  const signed = await signR2Url(c.env, {
    key: objectKey,
    method: 'PUT',
    contentType: mimeType,
    expires: 300,
    meta: { size, sha256: checksum }
  });
  return c.json({ objectKey, uploadUrl: signed.url, uploadHeaders: signed.headers, expiresIn: 300 });
}

export async function addFoodHandler(c) {
  const db = getDb(c.env);
  const body = await c.req.json();
  const items = Array.isArray(body.items) ? body.items : [];
  const session = c.get('session');
  const entryDate = body.date || todayISO();
  const entryTime = new Date().toISOString().slice(11, 16);
  const entryMeal = String(body.meal || '').trim().toLowerCase();
  const mealType = MEAL_TYPES.includes(entryMeal) ? entryMeal : 'uncategorized';
  const agent = await getAgentByName(c.env.FOOD_AGENT, 'food-agent');
  const added = [];

  for (const item of items) {
    const name = String(item.name || '').trim();
    const grams = toNumber(item.grams_estimate || item.grams || 0);
    if (!grams) continue;
    let foodId = item.foodId;
    if (!foodId && name) {
      const matches = await searchFoodsByName(db, name, 1);
      foodId = matches[0]?.id;
      if (!foodId) {
        const created = await agent.addFoodToCatalog({ name, nutrients: await agent.estimateNutrientsForFood(name) });
        foodId = created.foodId;
      }
    }
    if (!foodId) continue;
    await logFoodEntry(db, {
      userId: session.userId,
      foodId,
      entryDate,
      entryTime,
      grams,
      mealType,
      source: item.manual ? 'manual' : 'ai'
    });
    added.push({ foodId, grams });
  }

  const entries = await getFoodEntriesByDate(db, session.userId, entryDate);
  const nutrients = await getDayNutrients(db, session.userId, entryDate);
  return c.json({ entries, nutrients, added });
}

export async function daySummaryHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  const date = c.req.query('date') || todayISO();
  const entries = await getFoodEntriesByDate(db, session.userId, date);
  const nutrients = await getDayNutrients(db, session.userId, date);
  return c.json({ date, entries, nutrients });
}

export async function nutrientListHandler(c) {
  const db = getDb(c.env);
  const nutrients = await db.execute({ sql: 'SELECT * FROM nutrients ORDER BY name ASC' });
  const user = c.get('user');
  const references = buildPersonalizedReferences(nutrients.rows, user);
  return c.json({ nutrients: nutrients.rows, references });
}

export async function foodsSearchHandler(c) {
  const db = getDb(c.env);
  const query = c.req.query('q') || '';
  const foods = query.length ? await searchFoodsByName(db, query, 20) : [];
  return c.json({ foods });
}

export async function foodDetailHandler(c) {
  const db = getDb(c.env);
  const foodId = c.req.param('id');
  const food = await getFoodById(db, foodId);
  if (!food) return c.json({ error: 'Food not found' }, 404);
  const nutrients = await getFoodNutrients(db, foodId);
  return c.json({ food, nutrients });
}

export async function updateEntryHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  const body = await c.req.json();
  const entryId = String(body.entryId || '').trim();
  const grams = toNumber(body.grams || 0);
  const entryMeal = String(body.meal || '').trim().toLowerCase();
  const entryTime = String(body.time || '').trim();
  const mealType = MEAL_TYPES.includes(entryMeal) ? entryMeal : '';
  const hasTime = Boolean(entryTime);
  if (!entryId || (!mealType && grams <= 0 && !hasTime)) {
    return c.json({ error: 'Invalid entry update' }, 400);
  }
  await updateFoodEntry(db, {
    entryId,
    userId: session.userId,
    grams: grams > 0 ? grams : null,
    mealType: mealType || null,
    entryTime: hasTime ? entryTime : null
  });
  const entries = await getFoodEntriesByDate(db, session.userId, todayISO());
  const nutrients = await getDayNutrients(db, session.userId, todayISO());
  return c.json({ entries, nutrients });
}

export async function deleteEntryHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  const body = await c.req.json();
  const entryId = String(body.entryId || '').trim();
  if (!entryId) return c.json({ error: 'Invalid entry delete' }, 400);
  await deleteFoodEntry(db, { entryId, userId: session.userId });
  const entries = await getFoodEntriesByDate(db, session.userId, todayISO());
  const nutrients = await getDayNutrients(db, session.userId, todayISO());
  return c.json({ entries, nutrients });
}

export async function entryDetailHandler(c) {
  const db = getDb(c.env);
  const session = c.get('session');
  const entryId = c.req.param('id');
  const entry = await getFoodEntryById(db, { entryId, userId: session.userId });
  if (!entry) return c.json({ error: 'Entry not found' }, 404);
  const nutrients = await getFoodNutrients(db, entry.food_id);
  const allNutrients = await db.execute({ sql: 'SELECT * FROM nutrients ORDER BY name ASC' });
  const references = buildPersonalizedReferences(allNutrients.rows, c.get('user'));
  const grams = toNumber(entry.grams || 0);
  const entryTime = entry.entry_time || (entry.created_at ? String(entry.created_at).slice(11, 16) : '');
  const scaled = nutrients.map((n) => ({
    nutrient_id: n.nutrient_id,
    name: n.name,
    unit: n.unit,
    amount: (toNumber(n.amount_per_100g) * grams) / 100
  }));
  return c.json({
    entry: {
      id: entry.id,
      food_name: entry.food_name,
      grams,
      meal_type: entry.meal_type,
      entry_date: entry.entry_date,
      entry_time: entryTime
    },
    nutrients: scaled,
    references
  });
}
