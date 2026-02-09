export function isProfileComplete(user) {
  if (!user) return false;
  const hasBase =
    Boolean(user.sex) &&
    Number(user.age) > 0 &&
    Number(user.height_cm) > 0 &&
    Number(user.weight_kg) > 0;
  const hasEnergy =
    Boolean(user.activity_level) &&
    Number(user.body_fat_percent) > 0 &&
    Boolean(user.goal_type) &&
    Boolean(user.protein_pref) &&
    Boolean(user.carb_pref);
  return hasBase && hasEnergy;
}

export function normalizeSex(value) {
  const sex = String(value || '').toLowerCase();
  if (sex === 'male' || sex === 'm') return 'male';
  if (sex === 'female' || sex === 'f') return 'female';
  return 'other';
}

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
export const GOAL_TYPES = ['maintain', 'cut', 'bulk'];
export const PROTEIN_PREFS = ['minimum', 'adequate', 'high', 'very_high'];
export const CARB_PREFS = ['keto', 'low', 'balanced', 'high'];
