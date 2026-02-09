import { renderLayout } from '../ui/templates.js';
import { renderOnboarding } from '../ui/pages.js';
import { getDb } from '../db/client.js';
import { updateUserProfile } from '../db/queries.js';
import { isProfileComplete, normalizeSex, ACTIVITY_LEVELS, GOAL_TYPES, PROTEIN_PREFS, CARB_PREFS } from '../utils/profile.js';

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export async function onboardingGetHandler(c) {
  const user = c.get('user');
  if (isProfileComplete(user)) return c.redirect('/dashboard');
  const body = await renderOnboarding(c.env, { user, error: '' });
  return c.html(await renderLayout(c.env, { title: 'Complete profile', body, user }));
}

export async function onboardingPostHandler(c) {
  const form = await c.req.parseBody();
  if (!form.sex) {
    const body = await renderOnboarding(c.env, {
      user: {
        sex: '',
        age: form.age,
        height_cm: form.height_cm,
        weight_kg: form.weight_kg,
        activity_level: form.activity_level,
        body_fat_percent: form.body_fat_percent,
        goal_type: form.goal_type,
        goal_rate_kg: form.goal_rate_kg,
        protein_pref: form.protein_pref,
        carb_pref: form.carb_pref
      },
      error: 'Please select a gender to personalize RDAs.'
    });
    return c.html(await renderLayout(c.env, { title: 'Complete profile', body, user: c.get('user') }));
  }
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

  const invalidBasics = age < 13 || age > 120 || heightCm < 100 || heightCm > 230 || weightKg < 30 || weightKg > 250;
  const invalidEnergy =
    bodyFatPercent < 5 ||
    bodyFatPercent > 60 ||
    !ACTIVITY_LEVELS.includes(activityLevel) ||
    !GOAL_TYPES.includes(goalType) ||
    !PROTEIN_PREFS.includes(proteinPref) ||
    !CARB_PREFS.includes(carbPref) ||
    ((goalType === 'cut' || goalType === 'bulk') && goalRateKg <= 0);

  if (invalidBasics || invalidEnergy) {
    const body = await renderOnboarding(c.env, {
      user: {
        sex,
        age,
        height_cm: heightCm,
        weight_kg: weightKg,
        activity_level: activityLevel,
        body_fat_percent: bodyFatPercent,
        goal_type: goalType,
        goal_rate_kg: goalRateKg,
        protein_pref: proteinPref,
        carb_pref: carbPref
      },
      error: 'Please enter valid values for your profile and goals.'
    });
    return c.html(await renderLayout(c.env, { title: 'Complete profile', body, user: c.get('user') }));
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
    caloriesOverride: null,
    proteinOverride: null,
    carbsOverride: null,
    fatOverride: null
  });
  return c.redirect('/dashboard');
}
