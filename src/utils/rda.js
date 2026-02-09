const DEFAULTS = {
  vitamin_a: { unit: 'mcg RAE', male: 900, female: 700, type: 'rda' },
  vitamin_c: { unit: 'mg', male: 90, female: 75, type: 'rda' },
  vitamin_d: { unit: 'mcg', male: 15, female: 15, type: 'rda' },
  vitamin_e: { unit: 'mg', male: 15, female: 15, type: 'rda' },
  vitamin_k: { unit: 'mcg', male: 120, female: 90, type: 'ai' },
  thiamin: { unit: 'mg', male: 1.2, female: 1.1, type: 'rda' },
  riboflavin: { unit: 'mg', male: 1.3, female: 1.1, type: 'rda' },
  niacin: { unit: 'mg', male: 16, female: 14, type: 'rda' },
  vitamin_b6: { unit: 'mg', male: 1.3, female: 1.3, type: 'rda' },
  folate: { unit: 'mcg DFE', male: 400, female: 400, type: 'rda' },
  vitamin_b12: { unit: 'mcg', male: 2.4, female: 2.4, type: 'rda' },
  pantothenic: { unit: 'mg', male: 5, female: 5, type: 'ai' },
  biotin: { unit: 'mcg', male: 30, female: 30, type: 'ai' },
  choline: { unit: 'mg', male: 550, female: 425, type: 'ai' },
  calcium: { unit: 'mg', male: 1000, female: 1000, type: 'rda' },
  iron: { unit: 'mg', male: 8, female: 18, type: 'rda' },
  magnesium: { unit: 'mg', male: 420, female: 320, type: 'rda' },
  phosphorus: { unit: 'mg', male: 700, female: 700, type: 'rda' },
  potassium: { unit: 'mg', male: 3400, female: 2600, type: 'ai' },
  sodium: { unit: 'mg', male: 1500, female: 1500, type: 'ai' },
  zinc: { unit: 'mg', male: 11, female: 8, type: 'rda' },
  copper: { unit: 'mg', male: 0.9, female: 0.9, type: 'rda' },
  manganese: { unit: 'mg', male: 2.3, female: 1.8, type: 'ai' },
  selenium: { unit: 'mcg', male: 55, female: 55, type: 'rda' },
  iodine: { unit: 'mcg', male: 150, female: 150, type: 'rda' },
  chromium: { unit: 'mcg', male: 35, female: 25, type: 'ai' },
  molybdenum: { unit: 'mcg', male: 45, female: 45, type: 'rda' },
  chloride: { unit: 'mg', male: 2300, female: 2300, type: 'ai' },
  fiber: { unit: 'g', male: 38, female: 25, type: 'ai' }
};

function pickBySex(rule, sex) {
  if (sex === 'male') return rule.male;
  if (sex === 'female') return rule.female;
  return (rule.male + rule.female) / 2;
}

function activityMultiplier(level) {
  switch (level) {
    case 'sedentary':
      return 1.2;
    case 'light':
      return 1.375;
    case 'moderate':
      return 1.55;
    case 'active':
      return 1.725;
    case 'very_active':
      return 1.9;
    default:
      return 1.3;
  }
}

function proteinFactor(pref) {
  switch (pref) {
    case 'minimum':
      return 1.55;
    case 'adequate':
      return 1.8;
    case 'high':
      return 2;
    case 'very_high':
      return 2.2;
    default:
      return 1.55;
  }
}

function carbRatio(pref) {
  switch (pref) {
    case 'keto':
      return 0.1;
    case 'low':
      return 0.25;
    case 'balanced':
      return 0.55;
    case 'high':
      return 0.65;
    default:
      return 0.55;
  }
}

function readOverride(user, key) {
  const raw = user?.[key];
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function computeCalorieTarget(user) {
  const override = readOverride(user, 'calories_override');
  if (override) return override;
  const weight = Number(user?.weight_kg || 0);
  const bodyFat = Number(user?.body_fat_percent || 0);
  if (!weight || !bodyFat) return null;
  const leanMass = weight * (1 - bodyFat / 100);
  if (!leanMass) return null;
  const bmr = 500 + 22 * leanMass;
  const tdee = bmr * activityMultiplier(String(user?.activity_level || '').toLowerCase());
  const goal = String(user?.goal_type || '').toLowerCase();
  const rate = Number(user?.goal_rate_kg || 0);
  const weeklyChange = rate > 0 ? rate : 0;
  const dailyDelta = (weeklyChange * 7700) / 7;
  if (goal === 'cut') return Math.max(tdee - dailyDelta, 1200);
  if (goal === 'bulk') return tdee + dailyDelta;
  return tdee;
}

function computeProteinTarget(user) {
  const override = readOverride(user, 'protein_override');
  if (override) return override;
  const weight = Number(user?.weight_kg || 0);
  if (!weight) return null;
  return weight * proteinFactor(String(user?.protein_pref || '').toLowerCase());
}

function computeCarbTarget(user) {
  const override = readOverride(user, 'carbs_override');
  if (override) return override;
  const calories = computeCalorieTarget(user);
  if (!calories) return null;
  const ratio = carbRatio(String(user?.carb_pref || '').toLowerCase());
  return (calories * ratio) / 4;
}

function computeFatTarget(user) {
  const override = readOverride(user, 'fat_override');
  if (override) return override;
  const calories = computeCalorieTarget(user);
  const protein = computeProteinTarget(user);
  const carbs = computeCarbTarget(user);
  if (!calories || protein == null || carbs == null) return null;
  const remaining = calories - protein * 4 - carbs * 4;
  if (remaining <= 0) return 0;
  return remaining / 9;
}

export function computeMacroTargets(user) {
  const calories = computeCalorieTarget(user);
  const protein = computeProteinTarget(user);
  let carbs = computeCarbTarget(user);
  let fat = computeFatTarget(user);

  if (fat != null && fat < 50) {
    const missingFat = 50 - fat;
    fat = 50;
    if (carbs != null) {
      const carbReduction = (missingFat * 9) / 4;
      carbs = Math.max(0, carbs - carbReduction);
    }
  }

  return { calories, protein, carbs, fat };
}

export function getRdaForNutrient(nutrientId, user) {
  const macroTargets = computeMacroTargets(user);
  if (nutrientId === 'calories') {
    const target = macroTargets.calories;
    if (!target) return null;
    return { nutrient_id: nutrientId, rda: Math.round(target), ai: null, unit: 'kcal' };
  }
  if (nutrientId === 'protein') {
    const target = macroTargets.protein;
    if (!target) return null;
    return { nutrient_id: nutrientId, rda: Math.round(target), ai: null, unit: 'g' };
  }
  if (nutrientId === 'carbs') {
    const target = macroTargets.carbs;
    if (!target) return null;
    return { nutrient_id: nutrientId, rda: Math.round(target), ai: null, unit: 'g' };
  }
  if (nutrientId === 'fat') {
    const target = macroTargets.fat;
    if (target == null) return null;
    return { nutrient_id: nutrientId, rda: Math.round(target), ai: null, unit: 'g' };
  }
  const rule = DEFAULTS[nutrientId];
  if (!rule) return null;
  const sex = String(user?.sex || '').toLowerCase();
  const value = pickBySex(rule, sex);
  if (rule.type === 'ai') {
    return { nutrient_id: nutrientId, ai: value, rda: null, unit: rule.unit };
  }
  return { nutrient_id: nutrientId, rda: value, ai: null, unit: rule.unit };
}

export function buildPersonalizedReferences(nutrients, user) {
  const list = Array.isArray(nutrients) ? nutrients : [];
  const refs = [];
  for (const nutrient of list) {
    const ref = getRdaForNutrient(nutrient.nutrient_id || nutrient.id, user);
    if (ref) refs.push(ref);
  }
  return refs;
}
