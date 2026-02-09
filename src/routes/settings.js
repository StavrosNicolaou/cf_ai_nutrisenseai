import { renderLayout } from '../ui/templates.js';
import { renderSettings } from '../ui/pages.js';
import { getDb } from '../db/client.js';
import { updateUserProfile } from '../db/queries.js';
import { normalizeSex, ACTIVITY_LEVELS, GOAL_TYPES, PROTEIN_PREFS, CARB_PREFS } from '../utils/profile.js';

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

export async function settingsHandler(c, { profileError = '', profileValues = null } = {}) {
  const user = c.get('user');
  const totp = c.get('totp') || { enabled: Boolean(user?.totp_enabled) };
  const mergedUser = profileValues ? { ...user, ...profileValues } : user;
  const body = await renderSettings(c.env, { user: mergedUser, totp, profileError });
  return c.html(await renderLayout(c.env, { title: 'Settings', body, user }));
}

export async function settingsProfilePostHandler(c) {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const sex = normalizeSex(form.sex);
  const age = toNumber(form.age);
  const heightCm = toNumber(form.height_cm);
  const weightKg = toNumber(form.weight_kg);
  const activityLevel = String(form.activity_level || '').toLowerCase();
  const bodyFatPercent = toNumber(form.body_fat_percent);
  const goalType = String(form.goal_type || '').toLowerCase();
  const goalRateKg = toNumber(form.goal_rate_kg);
  const proteinPref = String(form.protein_pref || '').toLowerCase();
  const carbPref = String(form.carb_pref || '').toLowerCase();
  const caloriesOverride = toOptionalNumber(form.calories_override);
  const proteinOverride = toOptionalNumber(form.protein_override);
  const carbsOverride = toOptionalNumber(form.carbs_override);
  const fatOverride = toOptionalNumber(form.fat_override);

  if (!form.sex) {
    return settingsHandler(c, {
      profileError: 'Please select a gender to personalize RDAs.',
      profileValues: {
        sex: '',
        age,
        height_cm: heightCm,
        weight_kg: weightKg,
        calories_override: caloriesOverride,
        protein_override: proteinOverride,
        carbs_override: carbsOverride,
        fat_override: fatOverride
      }
    });
  }

  const invalidBasics = age < 13 || age > 120 || heightCm < 100 || heightCm > 230 || weightKg < 30 || weightKg > 250;
  const invalidEnergy =
    bodyFatPercent < 5 ||
    bodyFatPercent > 60 ||
    !ACTIVITY_LEVELS.includes(activityLevel) ||
    !GOAL_TYPES.includes(goalType) ||
    !PROTEIN_PREFS.includes(proteinPref) ||
    !CARB_PREFS.includes(carbPref) ||
    ((goalType === 'cut' || goalType === 'bulk') && goalRateKg <= 0);

  const invalidOverrides =
    Number.isNaN(caloriesOverride) ||
    Number.isNaN(proteinOverride) ||
    Number.isNaN(carbsOverride) ||
    Number.isNaN(fatOverride) ||
    (caloriesOverride != null && caloriesOverride <= 0) ||
    (proteinOverride != null && proteinOverride <= 0) ||
    (carbsOverride != null && carbsOverride <= 0) ||
    (fatOverride != null && fatOverride <= 0);

  if (invalidBasics || invalidEnergy || invalidOverrides) {
    return settingsHandler(c, {
      profileError: 'Please enter valid values for your profile and goals.',
      profileValues: {
        sex,
        age,
        height_cm: heightCm,
        weight_kg: weightKg,
        activity_level: activityLevel,
        body_fat_percent: bodyFatPercent,
        goal_type: goalType,
        goal_rate_kg: goalRateKg,
        protein_pref: proteinPref,
        carb_pref: carbPref,
        calories_override: caloriesOverride,
        protein_override: proteinOverride,
        carbs_override: carbsOverride,
        fat_override: fatOverride
      }
    });
  }

  const db = getDb(c.env);
  const session = c.get('session');
  await updateUserProfile(db, {
    userId: session.userId,
    sex,
    age,
    heightCm,
    weightKg,
    activityLevel,
    bodyFatPercent,
    goalType,
    goalRateKg: goalType === 'maintain' ? 0 : goalRateKg,
    proteinPref,
    carbPref,
    caloriesOverride,
    proteinOverride,
    carbsOverride,
    fatOverride
  });
  return c.redirect('/settings');
}
