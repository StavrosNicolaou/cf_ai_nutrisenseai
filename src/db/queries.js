export async function getUserById(db, id) {
  const res = await db.execute({ sql: 'SELECT * FROM users WHERE id = ? LIMIT 1', args: [id] });
  return res.rows[0] || null;
}

export async function getUserByEmail(db, email) {
  const res = await db.execute({ sql: 'SELECT * FROM users WHERE email = ? LIMIT 1', args: [email] });
  return res.rows[0] || null;
}

export async function upsertUser(db, { email, name, pictureUrl }) {
  const existing = await getUserByEmail(db, email);
  if (existing) {
    await db.execute({
      sql: 'UPDATE users SET name = ?, picture_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [name || existing.name, pictureUrl || existing.picture_url, existing.id]
    });
    return existing;
  }
  const id = crypto.randomUUID();
  await db.execute({
    sql: 'INSERT INTO users (id, email, name, picture_url) VALUES (?, ?, ?, ?)',
    args: [id, email, name, pictureUrl]
  });
  return { id, email, name, picture_url: pictureUrl, totp_enabled: 0 };
}

export async function upsertOAuthAccount(db, { userId, provider, providerUserId, accessToken }) {
  const res = await db.execute({
    sql: 'SELECT id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ? LIMIT 1',
    args: [provider, providerUserId]
  });
  if (res.rows[0]) {
    await db.execute({
      sql: 'UPDATE oauth_accounts SET user_id = ?, access_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [userId, accessToken, res.rows[0].id]
    });
    return res.rows[0].id;
  }
  const id = crypto.randomUUID();
  await db.execute({
    sql: 'INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, access_token) VALUES (?, ?, ?, ?, ?)',
    args: [id, userId, provider, providerUserId, accessToken]
  });
  return id;
}

export async function setTotpSecret(db, userId, encryptedSecret) {
  await db.execute({
    sql: 'UPDATE users SET totp_enabled = 1, totp_secret_enc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [encryptedSecret, userId]
  });
}

export async function disableTotp(db, userId) {
  await db.execute({
    sql: 'UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [userId]
  });
}

export async function updateUserProfile(
  db,
  {
    userId,
    sex,
    age,
    heightCm,
    weightKg,
    activityLevel,
    bodyFatPercent,
    goalType,
    goalRateKg,
    proteinPref,
    carbPref,
    caloriesOverride,
    proteinOverride,
    carbsOverride,
    fatOverride
  }
) {
  await db.execute({
    sql: `UPDATE users
          SET sex = ?, age = ?, height_cm = ?, weight_kg = ?,
              activity_level = ?, body_fat_percent = ?, goal_type = ?, goal_rate_kg = ?,
              protein_pref = ?, carb_pref = ?,
              calories_override = ?, protein_override = ?, carbs_override = ?, fat_override = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [
      sex,
      age,
      heightCm,
      weightKg,
      activityLevel,
      bodyFatPercent,
      goalType,
      goalRateKg,
      proteinPref,
      carbPref,
      caloriesOverride,
      proteinOverride,
      carbsOverride,
      fatOverride,
      userId
    ]
  });
}
export async function searchFoodsByName(db, query, limit = 5) {
  const like = `%${query.toLowerCase()}%`;
  const res = await db.execute({
    sql: 'SELECT * FROM foods WHERE lower(name) LIKE ? ORDER BY length(name) LIMIT ?;',
    args: [like, limit]
  });
  return res.rows;
}

export async function getFoodById(db, foodId) {
  const res = await db.execute({
    sql: 'SELECT * FROM foods WHERE id = ? LIMIT 1',
    args: [foodId]
  });
  return res.rows[0] || null;
}

export async function addFood(db, { name, source = 'ai', sourceDetail, isEstimated = 1 }) {
  const id = crypto.randomUUID();
  const normalizedName = String(name || '').trim().toLowerCase();
  const detail = sourceDetail || source;
  await db.execute({
    sql: 'INSERT INTO foods (id, name, normalized_name, source, source_detail, is_estimated) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, name, normalizedName, source, detail, isEstimated ? 1 : 0]
  });
  return id;
}

export async function addFoodNutrients(db, foodId, nutrientAmounts) {
  const statements = [];
  for (const nutrient of nutrientAmounts) {
    statements.push({
      sql: 'INSERT INTO food_nutrients (food_id, nutrient_id, amount_per_100g) VALUES (?, ?, ?)',
      args: [foodId, nutrient.nutrient_id, nutrient.amount_per_100g]
    });
  }
  if (statements.length) {
    await db.batch(statements);
  }
}

export async function logFoodEntry(db, { userId, foodId, entryDate, entryTime, grams, mealType = 'uncategorized', source = 'manual' }) {
  const id = crypto.randomUUID();
  await db.execute({
    sql: 'INSERT INTO food_entries (id, user_id, food_id, entry_date, entry_time, grams, meal_type, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [id, userId, foodId, entryDate, entryTime || null, grams, mealType, source]
  });
  return id;
}

export async function updateFoodEntry(db, { entryId, userId, grams, mealType, entryTime }) {
  const updates = [];
  const args = [];
  if (grams != null) {
    updates.push('grams = ?');
    args.push(grams);
  }
  if (mealType) {
    updates.push('meal_type = ?');
    args.push(mealType);
  }
  if (entryTime != null) {
    updates.push('entry_time = ?');
    args.push(entryTime);
  }
  if (!updates.length) return;
  args.push(entryId, userId);
  await db.execute({
    sql: `UPDATE food_entries SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
    args
  });
}

export async function deleteFoodEntry(db, { entryId, userId }) {
  await db.execute({
    sql: 'DELETE FROM food_entries WHERE id = ? AND user_id = ?',
    args: [entryId, userId]
  });
}

export async function getFoodEntryById(db, { entryId, userId }) {
  const res = await db.execute({
    sql: `SELECT fe.*, f.name as food_name
          FROM food_entries fe
          JOIN foods f ON f.id = fe.food_id
          WHERE fe.id = ? AND fe.user_id = ?
          LIMIT 1`,
    args: [entryId, userId]
  });
  return res.rows[0] || null;
}
export async function getFoodEntriesByDate(db, userId, entryDate) {
  const res = await db.execute({
    sql: `SELECT fe.*, f.name as food_name, fn.amount_per_100g as calories_per_100g
          FROM food_entries fe
          JOIN foods f ON f.id = fe.food_id
          LEFT JOIN food_nutrients fn ON fn.food_id = fe.food_id AND fn.nutrient_id = 'calories'
          WHERE fe.user_id = ? AND fe.entry_date = ?
          ORDER BY COALESCE(fe.entry_time, substr(fe.created_at, 12, 5)) ASC, fe.created_at ASC`,
    args: [userId, entryDate]
  });
  return res.rows;
}

export async function getEntryDatesInRange(db, { userId, startDate, endDate }) {
  const res = await db.execute({
    sql: `SELECT DISTINCT entry_date
          FROM food_entries
          WHERE user_id = ? AND entry_date BETWEEN ? AND ?`,
    args: [userId, startDate, endDate]
  });
  return res.rows.map((row) => row.entry_date);
}

export async function getDayNutrients(db, userId, entryDate) {
  const res = await db.execute({
    sql: `SELECT n.id as nutrient_id, n.name, n.unit, SUM(fn.amount_per_100g * fe.grams / 100.0) as total_amount
          FROM food_entries fe
          JOIN food_nutrients fn ON fn.food_id = fe.food_id
          JOIN nutrients n ON n.id = fn.nutrient_id
          WHERE fe.user_id = ? AND fe.entry_date = ?
          GROUP BY n.id, n.name, n.unit
          ORDER BY n.name ASC`,
    args: [userId, entryDate]
  });
  return res.rows;
}

export async function getNutrients(db) {
  const res = await db.execute({
    sql: 'SELECT * FROM nutrients ORDER BY name ASC'
  });
  return res.rows;
}

export async function getNutrientReferences(db) {
  const res = await db.execute({
    sql: 'SELECT * FROM nutrient_reference'
  });
  return res.rows;
}

export async function getFoodNutrients(db, foodId) {
  const res = await db.execute({
    sql: `SELECT fn.nutrient_id, n.name, n.unit, fn.amount_per_100g
          FROM food_nutrients fn
          JOIN nutrients n ON n.id = fn.nutrient_id
          WHERE fn.food_id = ?`,
    args: [foodId]
  });
  return res.rows;
}

export async function getNutrientIdByName(db, name) {
  const res = await db.execute({
    sql: 'SELECT id FROM nutrients WHERE lower(name) = ? LIMIT 1',
    args: [name.toLowerCase()]
  });
  return res.rows[0]?.id || null;
}

export async function getFoodsForCatalog(db, limit = 100) {
  const res = await db.execute({
    sql: 'SELECT * FROM foods ORDER BY name ASC LIMIT ?;',
    args: [limit]
  });
  return res.rows;
}



export async function createJob(db, { id, userId, type, status, payload }) {
  await db.execute({
    sql: 'INSERT INTO jobs (id, user_id, type, status, payload_json) VALUES (?, ?, ?, ?, ?)',
    args: [id, userId, type, status, payload ? JSON.stringify(payload) : null]
  });
}

export async function updateJob(db, { id, status, result, error, startedAt, completedAt, clearError = false }) {
  await db.execute({
    sql: `UPDATE jobs
          SET status = ?,
              result_json = COALESCE(?, result_json),
              error = CASE
                WHEN ? = 1 THEN NULL
                WHEN ? IS NOT NULL THEN ?
                ELSE error
              END,
              started_at = COALESCE(?, started_at),
              completed_at = COALESCE(?, completed_at),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [
      status,
      result ? JSON.stringify(result) : null,
      clearError ? 1 : 0,
      error ?? null,
      error ?? null,
      startedAt || null,
      completedAt || null,
      id
    ]
  });
}

export async function getJobsByUser(db, { userId, limit = null }) {
  const hasLimit = Number.isFinite(limit) && Number(limit) > 0;
  const res = await db.execute({
    sql: hasLimit
      ? 'SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC',
    args: hasLimit ? [userId, limit] : [userId]
  });
  return res.rows;
}

export async function countProcessingJobs(db, { userId }) {
  const res = await db.execute({
    sql: `SELECT COUNT(*) as count
          FROM jobs
          WHERE user_id = ?
          AND status = 'processing'`,
    args: [userId]
  });
  return Number(res.rows[0]?.count || 0);
}

export async function deleteJobById(db, { jobId, userId }) {
  await db.execute({
    sql: 'DELETE FROM jobs WHERE id = ? AND user_id = ?',
    args: [jobId, userId]
  });
}

export async function getJobById(db, { jobId, userId }) {
  const res = await db.execute({
    sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ? LIMIT 1',
    args: [jobId, userId]
  });
  return res.rows[0] || null;
}

export async function pruneJobs(db, { userId, keep = 5 }) {
  await db.execute({
    sql: `DELETE FROM jobs
          WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
          )`,
    args: [userId, userId, keep]
  });
}

export async function markStaleJobs(db, { userId, cutoffMinutes = 30 }) {
  const interval = `-${cutoffMinutes} minutes`;
  await db.execute({
    sql: `UPDATE jobs
          SET status = 'consumed',
              error = COALESCE(error, 'Timed out after 30 minutes'),
              completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
          AND status IN ('pending', 'processing')
          AND datetime(created_at) < datetime('now', ?)`,
    args: [userId, interval]
  });
}
