import { loadTemplate, applyTemplate } from './templates.js';
import { computeMacroTargets } from '../utils/rda.js';

function formatNumber(value, digits = 1) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toFixed(digits);
}

function getNutrientValue(nutrients, name) {
  const found = nutrients.find((n) => n.name.toLowerCase() === name.toLowerCase());
  return found ? found.total_amount : 0;
}

function addDerivedNutrients(nutrients) {
  const list = Array.isArray(nutrients) ? [...nutrients] : [];
  const carbs = list.find((n) => n.name.toLowerCase() === 'carbohydrates');
  const fiber = list.find((n) => n.name.toLowerCase() === 'fiber');
  if (carbs && fiber) {
    const net = Math.max((carbs.total_amount || 0) - (fiber.total_amount || 0), 0);
    list.push({
      nutrient_id: 'net_carbs',
      name: 'Net Carbs',
      unit: carbs.unit || 'g',
      total_amount: net
    });
  }
  return list;
}

function buildEntryRows(entries) {
  const mealOptions = [
    { value: 'uncategorized', label: 'Uncategorized' },
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'dinner', label: 'Dinner' },
    { value: 'snack', label: 'Snack' }
  ];
  const mealLabelFor = (value) => {
    const match = mealOptions.find((opt) => opt.value === value);
    return match ? match.label : 'Uncategorized';
  };
  const mealOrder = mealOptions.map((opt) => opt.value);
  const grouped = mealOrder.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});
  for (const entry of entries) {
    const key = mealOrder.includes(String(entry.meal_type || '').toLowerCase())
      ? String(entry.meal_type || '').toLowerCase()
      : 'uncategorized';
    grouped[key].push(entry);
  }
  const rows = mealOrder
    .map((mealKey) => {
      const list = grouped[mealKey] || [];
      if (!list.length) return '';
      const mealLabel = mealOptions.find((opt) => opt.value === mealKey)?.label || 'Uncategorized';
      const headerRow = `
    <tr class="meal-row">
      <td colspan="3">${mealLabel}</td>
    </tr>`;
      const entryRows = list
        .map(
          (entry) => `
    <tr class="entry-row" data-entry-id="${entry.id}" data-entry-name="${entry.food_name}" data-entry-grams="${formatNumber(entry.grams, 0)}" data-entry-meal="${String(entry.meal_type || 'uncategorized')}" data-entry-date="${entry.entry_date}">
      <td data-label="Food"><span class="entry-name">${entry.food_name}</span></td>
      <td data-label="Calories">${formatNumber((Number(entry.calories_per_100g || 0) * Number(entry.grams || 0)) / 100, 0)} kcal</td>
      <td data-label="Actions">
        <div class="entry-actions">
          <button class="button is-danger is-light icon-button entry-delete" data-entry-id="${entry.id}" title="Remove" aria-label="Remove">
            <span class="icon"><i class="fa-solid fa-trash"></i></span>
          </button>
        </div>
      </td>
    </tr>`
        )
        .join('');
      return headerRow + entryRows;
    })
    .join('');
  return rows;
}

function buildNutrientSections(nutrients, references) {
  const baseNutrients = addDerivedNutrients(nutrients);
  const sortedNutrients = sortNutrients(baseNutrients);
  const referenceMap = new Map(references.map((ref) => [ref.nutrient_id, ref]));
  const grouped = groupNutrients(sortedNutrients);
  return (
    renderNutrientSection('Vitamins', grouped.vitamins, referenceMap) +
    renderNutrientSection('Minerals', grouped.minerals, referenceMap) +
    renderNutrientSection('Carbohydrates', grouped.carbs, referenceMap) +
    renderNutrientSection('Lipids', grouped.lipids, referenceMap) +
    renderNutrientSection('Protein', grouped.protein, referenceMap) +
    renderNutrientSection('Amino Acids', grouped.amino, referenceMap) +
    renderNutrientSection('Vitamin-like', grouped.vitamin_like, referenceMap) +
    renderNutrientSection('Other', grouped.other, referenceMap)
  );
}

function getNutrientSortKey(nutrient) {
  const name = String(nutrient.name || '').toLowerCase();
  const groupOrder = {
    vitamins: 0,
    minerals: 1,
    carbs: 2,
    lipids: 3,
    protein: 4,
    amino: 5,
    vitamin_like: 6,
    other: 7
  };
  const vitamins = [
    'vitamin a',
    'vitamin b1',
    'thiamin',
    'vitamin b2',
    'riboflavin',
    'vitamin b3',
    'niacin',
    'vitamin b5',
    'pantothenic acid',
    'vitamin b6',
    'folate',
    'vitamin b12',
    'biotin',
    'vitamin c',
    'vitamin d',
    'vitamin e',
    'vitamin k'
  ];
  const minerals = [
    'calcium',
    'iron',
    'magnesium',
    'phosphorus',
    'potassium',
    'sodium',
    'zinc',
    'copper',
    'manganese',
    'selenium',
    'iodine',
    'chromium',
    'molybdenum',
    'chloride'
  ];
  const carbs = ['carbohydrates', 'fiber', 'net carbs', 'starch', 'sugar'];
  const lipids = [
    'cholesterol',
    'total fat',
    'saturated fat',
    'monounsaturated fat',
    'polyunsaturated fat',
    'trans fat',
    'omega-3',
    'omega-6',
    'alpha-linolenic acid',
    'linoleic acid'
  ];
  const amino = [
    'histidine',
    'isoleucine',
    'leucine',
    'lysine',
    'methionine',
    'phenylalanine',
    'threonine',
    'tryptophan',
    'valine',
    'alanine',
    'arginine',
    'asparagine',
    'aspartic acid',
    'cysteine',
    'glutamic acid',
    'glutamine',
    'glycine',
    'proline',
    'serine',
    'tyrosine'
  ];
  const vitaminLike = [
    'choline',
    'inositol',
    'carnitine',
    'coenzyme q10',
    'alpha-lipoic acid',
    'taurine',
    'creatine',
    'betaine',
    'paba',
    'orotic acid',
    'pangamic acid',
    'laetrile',
    'bioflavonoids',
    's-methylmethionine'
  ];

  const includesAny = (list) => list.findIndex((item) => name.includes(item)) >= 0;
  const indexOfAny = (list) => {
    const idx = list.findIndex((item) => name.includes(item));
    return idx >= 0 ? idx : 999;
  };

  let group = 'other';
  let order = 999;
  if (includesAny(vitamins)) {
    group = 'vitamins';
    order = indexOfAny(vitamins);
  } else if (includesAny(minerals)) {
    group = 'minerals';
    order = indexOfAny(minerals);
  } else if (includesAny(carbs)) {
    group = 'carbs';
    order = indexOfAny(carbs);
  } else if (includesAny(lipids)) {
    group = 'lipids';
    order = indexOfAny(lipids);
  } else if (name.includes('protein')) {
    group = 'protein';
    order = 0;
  } else if (includesAny(amino)) {
    group = 'amino';
    order = indexOfAny(amino);
  } else if (includesAny(vitaminLike)) {
    group = 'vitamin_like';
    order = indexOfAny(vitaminLike);
  }

  return [groupOrder[group], order, name];
}

function sortNutrients(list) {
  const items = Array.isArray(list) ? [...list] : [];
  return items.sort((a, b) => {
    const [ga, oa, na] = getNutrientSortKey(a);
    const [gb, ob, nb] = getNutrientSortKey(b);
    if (ga !== gb) return ga - gb;
    if (oa !== ob) return oa - ob;
    return na.localeCompare(nb);
  });
}

function groupNutrients(list) {
  const groups = {
    vitamins: [],
    minerals: [],
    carbs: [],
    lipids: [],
    protein: [],
    amino: [],
    vitamin_like: [],
    other: []
  };
  for (const nutrient of list) {
    const [group] = getNutrientSortKey(nutrient);
    let resolved = 'other';
    switch (group) {
      case 0:
        resolved = 'vitamins';
        break;
      case 1:
        resolved = 'minerals';
        break;
      case 2:
        resolved = 'carbs';
        break;
      case 3:
        resolved = 'lipids';
        break;
      case 4:
        resolved = 'protein';
        break;
      case 5:
        resolved = 'amino';
        break;
      case 6:
        resolved = 'vitamin_like';
        break;
      default:
        resolved = 'other';
    }
    groups[resolved].push(nutrient);
  }
  return groups;
}

function renderNutrientSection(title, rows, referenceMap) {
  if (!rows.length) return '';
  const body = rows
    .map((nutrient) => {
      const ref = referenceMap.get(nutrient.nutrient_id);
      const target = ref?.rda ?? ref?.ai;
      const percent = target ? (nutrient.total_amount / target) * 100 : null;
      const clamped = percent != null ? Math.max(0, Math.min(percent, 999)) : null;
      return `
      <tr>
        <td>${nutrient.name}</td>
        <td>${formatNumber(nutrient.total_amount, 2)} ${nutrient.unit}</td>
        <td>${target ? `${formatNumber(target, 1)} ${ref.unit}` : '-'}</td>
        <td>${clamped != null ? `<progress class="progress is-small is-primary" value="${formatNumber(clamped, 0)}" max="100">${formatNumber(clamped, 0)}%</progress>` : '-'}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="nutrient-section">
      <p class="title is-6">${title}</p>
      <table class="table is-fullwidth is-striped nutrient-table">
        <thead><tr><th>Nutrient</th><th>Total</th><th>RDA/AI</th><th>%</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

export async function renderLanding(env) {
  const template = await loadTemplate(env, 'landing');
  return applyTemplate(template, {});
}

export async function renderOnboarding(env, { user, error = '' }) {
  const template = await loadTemplate(env, 'onboarding');
  const errorBlock = error ? `<div class="notification is-danger is-light">${error}</div>` : '';
  const sex = String(user?.sex || '').toLowerCase();
  const activity = String(user?.activity_level || '').toLowerCase();
  const goal = String(user?.goal_type || '').toLowerCase();
  const proteinPref = String(user?.protein_pref || '').toLowerCase();
  const carbPref = String(user?.carb_pref || '').toLowerCase();
  const goalRate = String(user?.goal_rate_kg ?? '');
  return applyTemplate(template, {
    error_block: errorBlock,
    sex_male: sex === 'male' ? 'selected' : '',
    sex_female: sex === 'female' ? 'selected' : '',
    sex_other: sex && sex !== 'male' && sex !== 'female' ? 'selected' : '',
    activity_sedentary: activity === 'sedentary' ? 'selected' : '',
    activity_light: activity === 'light' ? 'selected' : '',
    activity_moderate: activity === 'moderate' ? 'selected' : '',
    activity_active: activity === 'active' ? 'selected' : '',
    activity_very_active: activity === 'very_active' ? 'selected' : '',
    goal_maintain: goal === 'maintain' ? 'selected' : '',
    goal_cut: goal === 'cut' ? 'selected' : '',
    goal_bulk: goal === 'bulk' ? 'selected' : '',
    protein_minimum: proteinPref === 'minimum' ? 'selected' : '',
    protein_adequate: proteinPref === 'adequate' ? 'selected' : '',
    protein_high: proteinPref === 'high' ? 'selected' : '',
    protein_very_high: proteinPref === 'very_high' ? 'selected' : '',
    carb_keto: carbPref === 'keto' ? 'selected' : '',
    carb_low: carbPref === 'low' ? 'selected' : '',
    carb_balanced: carbPref === 'balanced' ? 'selected' : '',
    carb_high: carbPref === 'high' ? 'selected' : '',
    goal_rate_0: goalRate === '0' ? 'selected' : '',
    goal_rate_025: goalRate === '0.25' ? 'selected' : '',
    goal_rate_05: goalRate === '0.5' ? 'selected' : '',
    goal_rate_075: goalRate === '0.75' ? 'selected' : '',
    goal_rate_1: goalRate === '1' ? 'selected' : '',
    age: user?.age || '',
    height_cm: user?.height_cm || '',
    weight_kg: user?.weight_kg || '',
    body_fat_percent: user?.body_fat_percent || '',
    goal_rate_kg: user?.goal_rate_kg || ''
  });
}
export async function renderDashboard(env, { date, entries, nutrients, references = [], warnings = [], weekDays = [], streak = 0, macroTargets = {} }) {
  const baseNutrients = addDerivedNutrients(nutrients);
  const calories = getNutrientValue(baseNutrients, 'Calories');
  const protein = getNutrientValue(baseNutrients, 'Protein');
  const carbs = getNutrientValue(baseNutrients, 'Carbohydrates');
  const fat = getNutrientValue(baseNutrients, 'Total Fat');
  const fiber = getNutrientValue(baseNutrients, 'Fiber');
  const sugar = getNutrientValue(baseNutrients, 'Sugar');
  const caloriesRda = Number(macroTargets.calories || 0);
  const proteinRda = Number(macroTargets.protein || 0);
  const carbsRda = Number(macroTargets.carbs || 0);
  const fatRda = Number(macroTargets.fat || 0);
  const now = new Date();
  const lastUpdated = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const entryRows = buildEntryRows(entries);
  const nutrientSections = buildNutrientSections(nutrients, references);

  const warningBlocks = warnings.length ? warnings.map((w) => `<div class="warning">${w}</div>`).join('') : '';
  const weekStrip = weekDays
    .map((day) => {
      const classes = [
        'week-day',
        day.hasEntries ? 'has-entries' : 'missed',
        day.isToday ? 'is-today' : ''
      ]
        .filter(Boolean)
        .join(' ');
      return `<a class="${classes}" href="/day/${day.iso}">
        <span class="week-label">${day.label}</span>
        <span class="week-number">${day.day}</span>
      </a>`;
    })
    .join('');

  const template = await loadTemplate(env, 'dashboard');
  return applyTemplate(template, {
    date,
    warning_blocks: warningBlocks,
    week_strip: weekStrip || '<div class="help">No week data yet.</div>',
    streak_count: streak,
    entry_rows: entryRows || '<tr><td colspan="3">No entries yet.</td></tr>',
    nutrient_sections: nutrientSections || '<p>No nutrients yet.</p>',
    calories: formatNumber(calories, 0),
    protein: formatNumber(protein, 1),
    carbs: formatNumber(carbs, 1),
    fat: formatNumber(fat, 1),
    fiber: formatNumber(fiber, 1),
    sugar: formatNumber(sugar, 1),
    calories_rda: caloriesRda ? formatNumber(caloriesRda, 0) : '-',
    protein_rda: proteinRda ? formatNumber(proteinRda, 0) : '-',
    carbs_rda: carbsRda ? formatNumber(carbsRda, 0) : '-',
    fat_rda: fatRda ? formatNumber(fatRda, 0) : '-',
    last_updated: lastUpdated
  });
}

export async function renderDay(env, { date, entries, nutrients, references = [] }) {
  const dayValue = new Date(`${date}T00:00:00Z`);
  const prev = new Date(dayValue);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(dayValue);
  next.setUTCDate(next.getUTCDate() + 1);
  const prevDate = prev.toISOString().slice(0, 10);
  const nextDate = next.toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const disableNext = nextDate > todayIso;
  const entryRows = buildEntryRows(entries);
  const nutrientSections = buildNutrientSections(nutrients, references);

  const template = await loadTemplate(env, 'day');
  return applyTemplate(template, {
    date,
    prev_date: prevDate,
    next_date: nextDate,
    next_disabled: disableNext ? 'disabled' : '',
    entry_rows: entryRows || '<tr><td colspan="3">No entries.</td></tr>',
    nutrient_sections: nutrientSections || '<p>No nutrients.</p>'
  });
}

export async function renderFoods(env, { foods }) {
  const rows = foods
    .map(
      (food) => `
    <tr>
      <td>${food.name}</td>
      <td>${food.source}</td>
      <td>${food.is_estimated ? 'Estimated' : 'Verified'}</td>
      <td><button class="button is-small is-light food-detail" data-food-id="${food.id}"><span class="icon"><i class="fa-solid fa-circle-info"></i></span></button></td>
    </tr>`
    )
    .join('');

  const template = await loadTemplate(env, 'foods');
  return applyTemplate(template, {
    food_rows: rows || '<tr><td colspan="4">No foods available.</td></tr>'
  });
}

export async function renderSettings(env, { user, totp, profileError }) {
  const template = await loadTemplate(env, 'settings');
  const macroTargets = computeMacroTargets(user || {});
  const macroCalories = macroTargets.calories != null ? formatNumber(macroTargets.calories, 0) : '';
  const macroProtein = macroTargets.protein != null ? formatNumber(macroTargets.protein, 1) : '';
  const macroCarbs = macroTargets.carbs != null ? formatNumber(macroTargets.carbs, 1) : '';
  const macroFat = macroTargets.fat != null ? formatNumber(macroTargets.fat, 1) : '';
  const otpUri = totp.provisioningUri || '';
  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const otpEscaped = escapeHtml(otpUri);
  const totpBlock = totp.enabled
    ? '<p class="mb-3">2FA is enabled.</p>\n' +
      '<form method="post" action="/settings/2fa/disable">' +
      '<button class="button is-danger is-light" type="submit">Disable 2FA</button>' +
      '</form>'
    : '<p class="mb-3">2FA is disabled.</p>\n' +
      '<form method="post" action="/settings/2fa/enable">' +
      '<button class="button is-link" type="submit">Enable 2FA</button>' +
      '</form>';

  const provisioningBlock = totp.provisioningUri
    ? '\n      <div class="mt-4">' +
      '<p class="title is-6">Scan QR Code</p>' +
      '<p>Scan with your authenticator app and confirm the code below.</p>' +
      `<img src="${totp.qrCodeUrl}" alt="TOTP QR code">` +
      '<div class="field mt-3">' +
      '<label class="label">Provisioning URI</label>' +
      `<p class="mb-2"><code>${otpEscaped}</code></p>` +
      `<button class="button is-light copy-otp-uri" type="button" data-uri="${otpEscaped}">` +
      '<span class="icon"><i class="fa-regular fa-copy"></i></span>' +
      '<span>Copy</span>' +
      '</button>' +
      '</div>' +
      '<form method="post" action="/settings/2fa/verify" class="mt-3">' +
      '<div class="field">' +
      '<label class="label">Verification code</label>' +
      '<input class="input" name="token" placeholder="123456">' +
      '</div>' +
      '<button class="button is-primary" type="submit">Verify and Enable</button>' +
      '</form>' +
      '</div>'
    : '';

  const sex = String(user.sex || '').toLowerCase();
  const activity = String(user.activity_level || '').toLowerCase();
  const goal = String(user.goal_type || '').toLowerCase();
  const proteinPref = String(user.protein_pref || '').toLowerCase();
  const carbPref = String(user.carb_pref || '').toLowerCase();
  const errorBlock = profileError ? `<p class="help is-danger">${profileError}</p>` : '';
  return applyTemplate(template, {
    user_email: user.email,
    user_name: user.name || '-',
    user_sex: user.sex || '-',
    user_age: user.age || '',
    user_height: user.height_cm || '',
    user_weight: user.weight_kg || '',
    user_body_fat: user.body_fat_percent || '',
    user_goal_rate: user.goal_rate_kg || '',
    user_calories_override: user.calories_override ?? '',
    user_protein_override: user.protein_override ?? '',
    user_carbs_override: user.carbs_override ?? '',
    user_fat_override: user.fat_override ?? '',
    macro_calories: macroCalories,
    macro_protein: macroProtein,
    macro_carbs: macroCarbs,
    macro_fat: macroFat,
    sex_male: sex === 'male' ? 'selected' : '',
    sex_female: sex === 'female' ? 'selected' : '',
    sex_other: sex && sex !== 'male' && sex !== 'female' ? 'selected' : '',
    activity_sedentary: activity === 'sedentary' ? 'selected' : '',
    activity_light: activity === 'light' ? 'selected' : '',
    activity_moderate: activity === 'moderate' ? 'selected' : '',
    activity_active: activity === 'active' ? 'selected' : '',
    activity_very_active: activity === 'very_active' ? 'selected' : '',
    goal_maintain: goal === 'maintain' ? 'selected' : '',
    goal_cut: goal === 'cut' ? 'selected' : '',
    goal_bulk: goal === 'bulk' ? 'selected' : '',
    protein_minimum: proteinPref === 'minimum' ? 'selected' : '',
    protein_adequate: proteinPref === 'adequate' ? 'selected' : '',
    protein_high: proteinPref === 'high' ? 'selected' : '',
    protein_very_high: proteinPref === 'very_high' ? 'selected' : '',
    carb_keto: carbPref === 'keto' ? 'selected' : '',
    carb_low: carbPref === 'low' ? 'selected' : '',
    carb_balanced: carbPref === 'balanced' ? 'selected' : '',
    carb_high: carbPref === 'high' ? 'selected' : '',
    goal_rate_0: String(user.goal_rate_kg ?? '') === '0' ? 'selected' : '',
    goal_rate_025: String(user.goal_rate_kg ?? '') === '0.25' ? 'selected' : '',
    goal_rate_05: String(user.goal_rate_kg ?? '') === '0.5' ? 'selected' : '',
    goal_rate_075: String(user.goal_rate_kg ?? '') === '0.75' ? 'selected' : '',
    goal_rate_1: String(user.goal_rate_kg ?? '') === '1' ? 'selected' : '',
    profile_error: errorBlock,
    totp_block: totpBlock + provisioningBlock,
    provisioning_block: ''
  });
}

export async function renderOtp(env) {
  const template = await loadTemplate(env, 'otp');
  return applyTemplate(template, {});
}

export function dashboardScripts() {
  return `
  <script>
    function setButtonLoading(button, active) {
      if (!button) return;
      if (active) {
        button.classList.add('is-loading');
        button.setAttribute('disabled', 'disabled');
      } else {
        button.classList.remove('is-loading');
        button.removeAttribute('disabled');
      }
    }

    function setQuickAddLoading(active, message) {
      const status = document.getElementById('quick-add-status');
      if (!status) return;
      status.classList.toggle('is-hidden', !active);
      if (message) {
        const label = status.querySelector('.quick-add-message');
        if (label) label.textContent = message;
      }
      document.querySelectorAll('#nl-submit, #photo-input').forEach((input) => {
        if (!input) return;
        if (active) {
          input.setAttribute('disabled', 'disabled');
        } else {
          input.removeAttribute('disabled');
        }
      });
    }

    let latestJobs = [];
    let quickAddTab = 'text';
    let widgetExpanded = false;
    let lastVisibleJobCount = 0;
    let widgetTimer = null;
    let expandedJobId = null;
    const jobImageCache = new Map();

    function safeParseJson(value) {
      if (!value || typeof value !== 'string') return value || null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }

    function addLocalJob(job) {
      latestJobs = [job, ...latestJobs];
      renderJobs(latestJobs);
      showJobWidget(true);
      pulseWidget();
    }

    function openJobModal() {
      const modal = document.getElementById('job-modal');
      if (modal) modal.classList.add('is-active');
      document.body.classList.add('modal-open');
    }

    function closeJobModal() {
      const modal = document.getElementById('job-modal');
      if (modal) modal.classList.remove('is-active');
      document.body.classList.remove('modal-open');
    }

    function showJobWidget(show) {
      const widget = document.getElementById('job-widget');
      if (!widget) return;
      widget.classList.toggle('is-hidden', !show);
    }

    function setJobWidgetExpanded(expand) {
      widgetExpanded = expand;
      const button = document.getElementById('job-widget-open');
      if (!button) return;
      button.querySelector('i')?.classList.toggle('fa-chevron-up', !expand);
      button.querySelector('i')?.classList.toggle('fa-chevron-down', expand);
    }

    function pulseWidget() {
      setJobWidgetExpanded(true);
      if (widgetTimer) clearTimeout(widgetTimer);
      widgetTimer = setTimeout(() => {
        const modal = document.getElementById('job-modal');
        if (modal && modal.classList.contains('is-active')) return;
        setJobWidgetExpanded(false);
      }, 2500);
    }

    function setQuickAddTab(nextTab) {
      quickAddTab = nextTab;
      document.querySelectorAll('[data-tab]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.tab === nextTab);
      });
      document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
        panel.classList.toggle('is-active', panel.dataset.tabPanel === nextTab);
      });
    }

    function initQuickAddTabs() {
      document.querySelectorAll('[data-tab]').forEach((button) => {
        button.addEventListener('click', () => setQuickAddTab(button.dataset.tab));
      });
      setQuickAddTab(quickAddTab);
    }

    function initPhotoHintToggle() {
      const toggle = document.getElementById('photo-hint-toggle');
      const field = document.getElementById('photo-hint-field');
      if (!toggle || !field) return;
      const update = () => field.classList.toggle('is-hidden', !toggle.checked);
      toggle.addEventListener('change', update);
      update();
    }

    function readPhotoHint() {
      const toggle = document.getElementById('photo-hint-toggle');
      const field = document.getElementById('photo-hint');
      if (!toggle || !field || !toggle.checked) return '';
      return String(field.value || '').trim();
    }

    async function parseText() {
      const text = document.getElementById('nl-input').value.trim();
      if (!text) return;
      setQuickAddLoading(true, 'Queued text analysis...');
      const entryDate = document.getElementById('quick-add-date')?.value;
      const entryMeal = document.getElementById('quick-add-meal')?.value || '';
      const res = await fetch('/api/food/parse-text', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, entryDate, entryMeal }) });
      const data = await res.json();
      setQuickAddLoading(false, data.jobId ? 'Job queued.' : 'Failed to queue.');
      if (data.jobId) {
        document.getElementById('nl-input').value = '';
        addLocalJob({
          id: data.jobId,
          type: 'parse_text',
          status: 'pending',
          created_at: new Date().toISOString(),
          payload: { text, entryDate, entryMeal }
        });
        await fetchJobs();
      }
    }

    async function parseImage(file) {
      const maxBytes = 20 * 1024 * 1024;
      if (file.size > maxBytes) {
        setQuickAddLoading(false, 'Image is too large (max 20 MB).');
        return;
      }
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const checksum = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      setQuickAddLoading(true, 'Queued photo analysis...');
      const hint = readPhotoHint();
      const meta = await fetch('/api/food/image-upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type || 'image/jpeg', size: file.size, checksum })
      });
      if (!meta.ok) {
        setQuickAddLoading(false, 'Failed to prepare upload.');
        return;
      }
      const { uploadUrl, uploadHeaders, objectKey } = await meta.json();
      const upload = await fetch(uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders || { 'content-type': file.type || 'image/jpeg' },
        body: file
      });
      if (!upload.ok) {
        setQuickAddLoading(false, 'Upload failed.');
        return;
      }
      const res = await fetch('/api/food/parse-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          objectKey,
          mimeType: file.type || 'image/jpeg',
          entryDate: document.getElementById('quick-add-date')?.value,
          entryMeal: document.getElementById('quick-add-meal')?.value || '',
          hint,
          size: file.size,
          checksum
        })
      });
      const data = await res.json();
      setQuickAddLoading(false, data.jobId ? 'Job queued.' : 'Failed to queue.');
      if (data.jobId) {
        addLocalJob({
          id: data.jobId,
          type: 'parse_image',
          status: 'pending',
          created_at: new Date().toISOString(),
          payload: { objectKey, mimeType: file.type || 'image/jpeg', entryMeal: document.getElementById('quick-add-meal')?.value || '', hint, size: file.size, checksum }
        });
        const hintField = document.getElementById('photo-hint');
        if (hintField) hintField.value = '';
        const hintToggle = document.getElementById('photo-hint-toggle');
        if (hintToggle) hintToggle.checked = false;
        const hintWrap = document.getElementById('photo-hint-field');
        if (hintWrap) hintWrap.classList.add('is-hidden');
        await fetchJobs();
      }
    }

    function renderReviewItems(items, entryDate, jobId, hint, entryMeal) {
      if (!items || !items.length) return '';
      const rows = items.map((item, index) => {
        const warnings = (item.warnings || []).map((w) => '<div class="warning">' + w + '</div>').join('');
        const needsReview = item.confidence < 0.5 ? '<span class="chip">Needs review</span>' : '';
        const gramsValue = Number(item.grams_estimate || 0);
        return '<div class="box">' +
          '<div class="preview-line">' +
          '<label class="checkbox preview-check"><input type="checkbox" data-item-select="' + jobId + ':' + index + '" checked> Add</label>' +
          '<strong>' + item.name + '</strong>' +
          '<div class="preview-grams">' +
          '<input class="input is-small" type="number" min="0" step="1" data-item-index="' + jobId + ':' + index + '" value="' + gramsValue + '">' +
          '<span class="unit">g</span>' +
          '</div>' +
          needsReview +
          '</div>' +
          '<div>Confidence: ' + (item.confidence || 0).toFixed(2) + '</div>' +
          warnings +
        '</div>';
      }).join('');
      const baseLabel = entryDate ? 'Add to ' + entryDate : 'Add to today';
      const label = entryMeal && entryMeal !== 'uncategorized' ? baseLabel + ' · ' + entryMeal : baseLabel;
      const hintLine = hint ? '<p class="job-desc mb-2">Hint: ' + hint + '</p>' : '';
      return '<div class="job-review-panel">' +
        '<p class="mb-2">Review detected items, adjust grams, uncheck anything you do not want, then add to your selected day.</p>' +
        hintLine +
        rows +
        '<button class="button is-success job-add" data-job-id="' + jobId + '" data-entry-date="' + (entryDate || '') + '" data-entry-meal="' + (entryMeal || '') + '">' + label + '</button>' +
        '</div>';
    }

    async function addItems(items, button, jobId, entryDate, entryMeal) {
      const selects = document.querySelectorAll('[data-item-select]');
      const selected = new Set();
      selects.forEach((checkbox) => {
        const parts = String(checkbox.dataset.itemSelect || '').split(':');
        const itemJobId = parts[0];
        const idx = Number(parts[1]);
        if (itemJobId !== jobId) return;
        if (checkbox.checked && Number.isFinite(idx)) selected.add(idx);
      });
      const inputs = document.querySelectorAll('[data-item-index]');
      inputs.forEach((input) => {
        const parts = String(input.dataset.itemIndex || '').split(':');
        const itemJobId = parts[0];
        const idx = Number(parts[1]);
        if (itemJobId !== jobId) return;
        if (!Number.isFinite(idx) || !items[idx]) return;
        if (!selected.has(idx)) return;
        const grams = Number(input.value || 0);
        if (Number.isFinite(grams) && grams > 0) {
          items[idx].grams_estimate = grams;
          items[idx].quantity = grams;
          items[idx].unit = 'g';
        }
      });
      const filtered = items.filter((_, idx) => selected.has(idx));
      if (!filtered.length) {
        return;
      }
      setButtonLoading(button, true);
      const res = await fetch('/api/food/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: filtered, date: entryDate, meal: entryMeal }) });
      if (res.ok) {
        if (jobId) {
          await fetch('/api/jobs/' + jobId + '/consume', { method: 'POST' });
          expandedJobId = null;
        }
        window.location.reload();
      } else {
        setButtonLoading(button, false);
      }
    }

    document.getElementById('nl-submit')?.addEventListener('click', parseText);
    const nlInput = document.getElementById('nl-input');
    const nlSubmit = document.getElementById('nl-submit');
    if (nlInput && nlSubmit) {
      const update = () => {
        nlSubmit.disabled = !nlInput.value.trim();
      };
      nlInput.addEventListener('input', update);
      update();
    }
    let selectedPhotoFile = null;
    const photoSubmit = document.getElementById('photo-submit');
    document.getElementById('photo-input')?.addEventListener('change', (event) => {
      const file = event.target.files[0] || null;
      const nameLabel = document.getElementById('photo-input-name');
      if (nameLabel) nameLabel.textContent = file ? file.name : 'No file selected';
      selectedPhotoFile = file;
      if (photoSubmit) photoSubmit.disabled = !selectedPhotoFile;
    });
    photoSubmit?.addEventListener('click', async () => {
      if (!selectedPhotoFile) return;
      await parseImage(selectedPhotoFile);
      selectedPhotoFile = null;
      if (photoSubmit) photoSubmit.disabled = true;
      const input = document.getElementById('photo-input');
      if (input) input.value = '';
      const nameLabel = document.getElementById('photo-input-name');
      if (nameLabel) nameLabel.textContent = 'No file selected';
    });
    initQuickAddTabs();
    initPhotoHintToggle();

    async function deleteEntry(entryId, button) {
      setButtonLoading(button, true);
      const res = await fetch('/api/food/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entryId }) });
      if (res.ok) {
        window.location.reload();
      } else {
        setButtonLoading(button, false);
      }
    }

    async function toggleEntryDetails(entryId, row, button) {
      const existing = row.nextElementSibling;
      if (existing && existing.classList.contains('entry-detail-row')) {
        existing.remove();
        return;
      }
      setButtonLoading(button, true);
      const res = await fetch('/api/food/entry/' + entryId);
      setButtonLoading(button, false);
      if (!res.ok) return;
      const data = await res.json();
      const essentials = [
        'calories',
        'carbohydrates',
        'protein',
        'total fat',
        'fiber',
        'sugar'
      ];
      const vitaminLike = [
        'choline',
        'inositol',
        'carnitine',
        'coenzyme q10',
        'alpha-lipoic acid',
        'taurine',
        'creatine',
        'betaine',
        'paba',
        'orotic acid',
        'pangamic acid',
        'laetrile',
        'bioflavonoids',
        's-methylmethionine',
        'linoleic acid',
        'alpha-linolenic acid'
      ];
      const normalized = (data.nutrients || []).map((n) => ({
        ...n,
        key: String(n.name || '').toLowerCase()
      }));
      const essentialRows = essentials
        .map((key) => normalized.find((n) => n.key.includes(key)))
        .filter(Boolean);
      const remaining = normalized.filter((n) => !essentialRows.includes(n));
      const filteredRemaining = remaining.filter((n) => {
        const value = Number(n.amount || 0);
        if (value > 0) return true;
        if (essentials.includes(n.key)) return true;
        return !vitaminLike.some((v) => n.key.includes(v));
      });
      const rows = [...essentialRows, ...filteredRemaining].map((n) => {
        const amount = Number(n.amount || 0);
        return '<tr><td>' + n.name + '</td><td>' + amount.toFixed(2) + ' ' + n.unit + '</td></tr>';
      }).join('');
      const detailBody = rows
        ? '<table class="table is-fullwidth is-striped mt-2"><thead><tr><th>Nutrient</th><th>Amount</th></tr></thead><tbody>' +
          rows +
          '</tbody></table>'
        : '<p class="help mt-2">No nutrient details available for this entry yet.</p>';
      const detailRow = document.createElement('tr');
      detailRow.className = 'entry-detail-row';
      detailRow.innerHTML = '<td colspan="5"><div class="box">' +
        '<strong>' + data.entry.food_name + '</strong> · ' + data.entry.grams + ' g' +
        detailBody +
        '</div></td>';
      row.parentNode.insertBefore(detailRow, row.nextSibling);
    }

    function renderEntryNutrients(data, references) {
      const essentials = [
        'calories',
        'carbohydrates',
        'protein',
        'total fat',
        'fiber',
        'sugar'
      ];
      const vitaminLike = [
        'choline',
        'inositol',
        'carnitine',
        'coenzyme q10',
        'alpha-lipoic acid',
        'taurine',
        'creatine',
        'betaine',
        'paba',
        'orotic acid',
        'pangamic acid',
        'laetrile',
        'bioflavonoids',
        's-methylmethionine',
        'linoleic acid',
        'alpha-linolenic acid'
      ];
      const normalized = (data.nutrients || []).map((n) => ({
        ...n,
        key: String(n.name || '').toLowerCase()
      }));
      const essentialRows = essentials
        .map((key) => normalized.find((n) => n.key.includes(key)))
        .filter(Boolean);
      const remaining = normalized.filter((n) => !essentialRows.includes(n));
      const filteredRemaining = remaining.filter((n) => {
        const value = Number(n.amount || 0);
        if (value > 0) return true;
        if (essentials.includes(n.key)) return true;
        return !vitaminLike.some((v) => n.key.includes(v));
      });
      const referenceMap = new Map((references || []).map((ref) => [ref.nutrient_id, ref]));
      const rows = [...essentialRows, ...filteredRemaining].map((n) => {
        const amount = Number(n.amount || 0);
        const ref = referenceMap.get(n.nutrient_id);
        const target = ref?.rda ?? ref?.ai;
        const percent = target ? (amount / target) * 100 : null;
        const clamped = percent != null ? Math.max(0, Math.min(percent, 999)) : null;
        const progress = clamped != null
          ? '<progress class="progress is-small is-primary" value="' + clamped.toFixed(0) + '" max="100">' + clamped.toFixed(0) + '%</progress>'
          : '-';
        return '<tr><td>' + n.name + '</td><td>' + amount.toFixed(2) + ' ' + n.unit + '</td><td>' +
          (target ? amount.toFixed(2) + '/' + target.toFixed(2) + ' ' + ref.unit : '-') +
          '</td><td>' + progress + '</td></tr>';
      }).join('');
      const detailBody = rows
        ? '<table class="table is-fullwidth is-striped mt-2"><thead><tr><th>Nutrient</th><th>Amount</th><th>RDA</th><th>%</th></tr></thead><tbody>' +
          rows +
          '</tbody></table>'
        : '<p class="help mt-2">No nutrient details available for this entry yet.</p>';
      return { detailBody };
    }

    async function openEntryModal(entryId, row) {
      const modal = document.getElementById('entry-modal');
      if (!modal) return;
      const name = row.dataset.entryName || '';
      const grams = row.dataset.entryGrams || '';
      const meal = row.dataset.entryMeal || 'uncategorized';
      const date = row.dataset.entryDate || '';
      const title = modal.querySelector('.entry-modal-title');
      const gramsInput = modal.querySelector('#entry-modal-grams');
      const mealSelect = modal.querySelector('#entry-modal-meal');
      const timeInput = modal.querySelector('#entry-modal-time');
      const saveButton = modal.querySelector('#entry-modal-save');
      const deleteButton = modal.querySelector('#entry-modal-delete');
      const macroWrap = modal.querySelector('#entry-modal-macros');
      const nutrientWrap = modal.querySelector('#entry-modal-nutrients');
      if (title) title.textContent = name;
      if (gramsInput) gramsInput.value = grams;
      if (mealSelect) mealSelect.value = meal;
      if (timeInput) timeInput.value = '';
      if (saveButton) saveButton.dataset.entryId = entryId;
      if (deleteButton) deleteButton.dataset.entryId = entryId;
      if (macroWrap) macroWrap.innerHTML = '<span class="chip">Loading...</span>';
      if (nutrientWrap) nutrientWrap.innerHTML = '';
      modal.classList.add('is-active');
      document.body.classList.add('modal-open');
      const res = await fetch('/api/food/entry/' + entryId);
      if (!res.ok) return;
      const data = await res.json();
      if (timeInput) timeInput.value = data.entry?.entry_time || '';
      const nutrients = Array.isArray(data.nutrients) ? data.nutrients : [];
      const macroMap = new Map(
        nutrients.map((n) => [String(n.name || '').toLowerCase(), Number(n.amount || 0)])
      );
      const protein = Number(macroMap.get('protein') || 0);
      const carbs = Number(macroMap.get('carbohydrates') || 0);
      const fat = Number(macroMap.get('total fat') || 0);
      const calories = Number(macroMap.get('calories') || 0);
      const macroCalories = protein * 4 + carbs * 4 + fat * 9;
      const totalEnergy = macroCalories > 0 ? macroCalories : calories;
      const proteinPct = totalEnergy > 0 ? (protein * 4 / totalEnergy) * 100 : 0;
      const carbsPct = totalEnergy > 0 ? (carbs * 4 / totalEnergy) * 100 : 0;
      const fatPct = totalEnergy > 0 ? (fat * 9 / totalEnergy) * 100 : 0;
      const macroHtml = [
        '<div class="macro-summary">',
        '<div class="macro-donut" style="--p:' + proteinPct.toFixed(1) + '%; --c:' + carbsPct.toFixed(1) + '%; --protein-color:#38bdf8; --carb-color:#4ade80; --fat-color:#f87171;">',
        '<div class="macro-donut-center"><div class="kcal">' + totalEnergy.toFixed(0) + '</div><div class="kcal-label">kcal</div></div>',
        '</div>',
        '<div class="macro-lines">',
        '<div class="macro-line protein">Protein (' + proteinPct.toFixed(0) + '%) <span>' + protein.toFixed(1) + ' g</span></div>',
        '<div class="macro-line carbs">Carbs (' + carbsPct.toFixed(0) + '%) <span>' + carbs.toFixed(1) + ' g</span></div>',
        '<div class="macro-line fat">Fat (' + fatPct.toFixed(0) + '%) <span>' + fat.toFixed(1) + ' g</span></div>',
        '</div>',
        '</div>'
      ].join('');
      if (macroWrap) macroWrap.innerHTML = macroHtml;
      const { detailBody } = renderEntryNutrients({ nutrients }, data.references || []);
      if (nutrientWrap) nutrientWrap.innerHTML = detailBody;
    }

    function closeEntryModal() {
      const modal = document.getElementById('entry-modal');
      if (modal) modal.classList.remove('is-active');
      document.body.classList.remove('modal-open');
    }

    document.addEventListener('click', (event) => {
      const delBtn = event.target.closest('.entry-delete');
      if (delBtn) deleteEntry(delBtn.dataset.entryId, delBtn);
      const entryRow = event.target.closest('.entry-row');
      if (entryRow && !delBtn) {
        openEntryModal(entryRow.dataset.entryId, entryRow);
      }
      const entryClose = event.target.closest('[data-entry-modal-close]');
      if (entryClose) closeEntryModal();
      const entrySave = event.target.closest('#entry-modal-save');
      if (entrySave) {
        const entryId = entrySave.dataset.entryId;
        const grams = Number(document.getElementById('entry-modal-grams')?.value || 0);
        const meal = document.getElementById('entry-modal-meal')?.value || '';
        const time = document.getElementById('entry-modal-time')?.value || '';
        if (!entryId || !Number.isFinite(grams) || grams <= 0) return;
        setButtonLoading(entrySave, true);
        fetch('/api/food/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entryId, grams, meal, time })
        }).then((res) => {
          if (res.ok) window.location.reload();
          setButtonLoading(entrySave, false);
        });
      }
      const entryDelete = event.target.closest('#entry-modal-delete');
      if (entryDelete) {
        const entryId = entryDelete.dataset.entryId;
        if (!entryId) return;
        setButtonLoading(entryDelete, true);
        fetch('/api/food/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entryId })
        }).then((res) => {
          if (res.ok) window.location.reload();
          setButtonLoading(entryDelete, false);
        });
      }
      const addBtn = event.target.closest('.job-add');
      const expandBtn = event.target.closest('.job-expand');
      const deleteBtn = event.target.closest('.job-delete');
      const retryBtn = event.target.closest('.job-retry');
      if (addBtn) {
        const job = latestJobs.find((j) => j.id === addBtn.dataset.jobId);
        const result = typeof job?.result_json === 'string' ? JSON.parse(job.result_json) : job?.result_json;
        if (job && result?.items?.length) {
          const entryDate = addBtn.dataset.entryDate || result.entryDate || document.getElementById('quick-add-date')?.value || null;
          const payload = job?.payload || safeParseJson(job?.payload_json) || {};
          const entryMeal = addBtn.dataset.entryMeal || payload.entryMeal || document.getElementById('quick-add-meal')?.value || '';
          addItems(result.items, addBtn, job.id, entryDate, entryMeal);
        }
      }
      if (expandBtn) {
        const jobId = expandBtn.dataset.jobId;
        expandedJobId = expandedJobId === jobId ? null : jobId;
        renderJobs(latestJobs);
      }
      if (deleteBtn) {
        const jobId = deleteBtn.dataset.jobId;
        deleteBtn.setAttribute('disabled', 'disabled');
        fetch('/api/jobs/' + jobId, { method: 'DELETE' }).then(fetchJobs);
      }
      if (retryBtn) {
        const jobId = retryBtn.dataset.jobId;
        retryBtn.setAttribute('disabled', 'disabled');
        fetch('/api/jobs/' + jobId + '/retry', { method: 'POST' }).then(fetchJobs);
      }
    });

    function formatElapsed(startIso, endIso) {
      if (!startIso) return '';
      const start = new Date(startIso).getTime();
      const end = endIso ? new Date(endIso).getTime() : Date.now();
      const diff = Math.max(end - start, 0);
      const seconds = Math.floor(diff / 1000);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return mins > 0 ? mins + 'm ' + secs + 's' : secs + 's';
    }

    function renderJobs(jobs) {
      const container = document.getElementById('job-list');
      if (!container) return;
      const visible = jobs.filter((job) => job.status !== 'consumed' && job.type !== 'add_items');
      if (!visible.length) {
        container.innerHTML = '';
        return;
      }
      const firstReviewable = visible.find((job) => job.status === 'done' && job.result_json);
      if (!expandedJobId && firstReviewable) {
        expandedJobId = firstReviewable.id;
      }
      const rows = visible.map((job) => {
        const status = job.status;
        const elapsed = formatElapsed(job.created_at, job.status === 'done' ? job.completed_at : null);
        const typeLabel = job.type.replace('_', ' ');
        const isReviewable = (job.type === 'parse_text' || job.type === 'parse_image') && job.status === 'done';
        const canDelete = job.status === 'done' || job.status === 'failed';
        const noFoodError = job.status === 'failed' && String(job.error || '').toLowerCase().includes('no food detected');
        const action = [
          isReviewable
            ? '<button class="button is-small is-link is-light job-expand" data-job-id="' + job.id + '">Expand</button>'
            : '',
          noFoodError
            ? '<button class="button is-small is-light job-retry" data-job-id="' + job.id + '">Retry</button>'
            : '',
          canDelete
            ? '<button class="button is-small is-light job-delete" data-job-id="' + job.id + '"><span class="icon"><i class="fa-solid fa-trash"></i></span></button>'
            : ''
        ].join('');
        const error = job.error ? '<div class="help">Last error: ' + job.error + '</div>' : '';
        const emptyState = noFoodError
          ? '<div class="help">No food detected. Try rephrasing or adding a hint, then retry.</div>'
          : '';
        const payload = job.payload || safeParseJson(job.payload_json) || {};
        const retryCount = Number(payload?.attempt || 0);
        const retryInfo = job.status === 'failed' && retryCount > 0
          ? '<div class="help">Retry count: ' + retryCount + '</div>'
          : '';
        const result = safeParseJson(job.result_json) || job.result_json || {};
        const summary = result?.summary || {};
        const displayName = result?.items?.[0]?.name || payload?.text || typeLabel;
        const imageUrl = jobImageCache.get(job.id) || job.imageUrl;
        if (job.imageUrl && !jobImageCache.has(job.id)) {
          jobImageCache.set(job.id, job.imageUrl);
        }
        const thumb = imageUrl
          ? '<img src="' + imageUrl + '" alt="Uploaded food">'
          : '<div class="job-thumb-fallback"><i class="fa-solid fa-image"></i></div>';
        const macros = isReviewable
          ? [
            '<span class="chip"><i class="fa-solid fa-fire"></i> ' + Number(summary.calories || 0).toFixed(0) + ' kcal</span>',
            '<span class="chip">C ' + Number(summary.carbs || 0).toFixed(0) + 'g</span>',
            '<span class="chip">P ' + Number(summary.protein || 0).toFixed(0) + 'g</span>',
            '<span class="chip">F ' + Number(summary.fat || 0).toFixed(0) + 'g</span>'
          ].join('')
          : job.status === 'failed'
            ? '<span class="chip">Failed</span>'
            : '<span class="chip">Processing...</span>';
        const description = payload?.text
          ? '<p class="job-desc">' + payload.text + '</p>'
          : payload?.hint
            ? '<p class="job-desc">Hint: ' + payload.hint + '</p>'
            : '';
        const reviewPanel = isReviewable ? renderReviewItems(result?.items || [], result?.entryDate, job.id, payload?.hint, payload?.entryMeal) : '';
        const expandedClass = expandedJobId === job.id ? ' is-expanded' : '';
        return '<div class="box job-box' + expandedClass + '">' +
          '<div class="job-card">' +
          '<div class="job-thumb">' + thumb + '</div>' +
          '<div class="job-info">' +
          '<div class="job-row">' +
          '<strong class="job-name">' + displayName + '</strong>' +
          '<span class="chip">' + status + '</span>' +
          '<span class="unit">' + elapsed + '</span>' +
          action +
          '</div>' +
          description +
          '<div class="job-macros">' + macros + '</div>' +
          '</div>' +
          '</div>' +
          reviewPanel +
          emptyState +
          retryInfo +
          error +
          '</div>';
      }).join('');
      container.innerHTML = rows;
    }

    async function fetchJobs() {
      const res = await fetch('/api/jobs');
      if (!res.ok) return;
      const data = await res.json();
      latestJobs = Array.isArray(data.jobs) ? data.jobs : [];
      renderJobs(latestJobs);
      const visible = latestJobs.filter((job) => job.status !== 'consumed' && job.type !== 'add_items');
      const active = visible.filter((job) => job.status !== 'done');
      const needsReview = visible.filter((job) => job.status === 'done');
      const widgetStatus = document.getElementById('job-widget-status');
      if (widgetStatus) {
        if (active.length) {
          widgetStatus.textContent = active.length + ' processing';
        } else if (needsReview.length) {
          widgetStatus.textContent = needsReview.length + ' ready to review';
        } else {
          widgetStatus.textContent = 'Queued jobs';
        }
      }
      if (visible.length > 0) {
        showJobWidget(true);
        if (visible.length > lastVisibleJobCount) {
          pulseWidget();
        }
      } else {
        showJobWidget(false);
      }
      lastVisibleJobCount = visible.length;
      if (!expandedJobId) {
        const ready = latestJobs.find((job) => (job.type === 'parse_text' || job.type === 'parse_image') && job.status === 'done' && job.result_json);
        if (ready) {
          expandedJobId = ready.id;
          openJobModal();
        }
      }
    }

    fetchJobs();
    setInterval(fetchJobs, 10000);

    document.getElementById('job-widget-open')?.addEventListener('click', () => {
      openJobModal();
      setJobWidgetExpanded(false);
    });
    document.querySelectorAll('[data-modal-close]').forEach((el) => {
      el.addEventListener('click', closeJobModal);
    });

    document.querySelectorAll('[data-filter-target]').forEach((input) => {
      input.addEventListener('input', () => {
        const targetId = input.dataset.filterTarget;
        const table = document.getElementById(targetId);
        const tables = table ? [table] : Array.from(document.querySelectorAll('.' + targetId));
        if (!tables.length) return;
        const term = input.value.trim().toLowerCase();
        tables.forEach((tbl) => {
          tbl.querySelectorAll('tbody tr').forEach((row) => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
          });
        });
      });
    });
  </script>`;
}

export function foodsScripts() {
  return `
  <script>
    const input = document.getElementById('food-search');
    const table = document.getElementById('food-table');
    const emptyState = document.getElementById('food-empty-state');

    function renderFoodRows(foods) {
      return foods.map((food) =>
        '<tr>' +
          '<td>' + food.name + '</td>' +
          '<td>' + food.source + '</td>' +
          '<td>' + (food.is_estimated ? 'Estimated' : 'Verified') + '</td>' +
          '<td><button class="button is-small is-light food-detail" data-food-id="' + food.id + '">' +
            '<span class="icon"><i class="fa-solid fa-circle-info"></i></span>' +
          '</button></td>' +
        '</tr>'
      ).join('');
    }

    function updateEmptyState(count) {
      if (!emptyState) return;
      emptyState.classList.toggle('is-hidden', count > 0);
    }

    updateEmptyState(table ? table.querySelectorAll('tr').length : 0);

    input?.addEventListener('input', async () => {
      const query = input.value.trim();
      if (query.length < 2) return;
      const res = await fetch('/api/foods/search?q=' + encodeURIComponent(query));
      const data = await res.json();
      const foods = Array.isArray(data.foods) ? data.foods : [];
      table.innerHTML = renderFoodRows(foods);
      updateEmptyState(foods.length);
    });

    table?.addEventListener('click', async (event) => {
      const button = event.target.closest('.food-detail');
      if (!button) return;
      const row = button.closest('tr');
      if (!row) return;
      const existing = row.nextElementSibling;
      if (existing && existing.classList.contains('food-detail-row')) {
        existing.remove();
        return;
      }
      button.setAttribute('disabled', 'disabled');
      const foodId = button.dataset.foodId;
      const res = await fetch('/api/foods/' + foodId);
      button.removeAttribute('disabled');
      if (!res.ok) return;
      const data = await res.json();
      const nutrients = Array.isArray(data.nutrients) ? data.nutrients : [];
      const rows = nutrients.map((n) => {
        const amount = Number(n.amount_per_100g || 0);
        return '<tr><td>' + n.name + '</td><td>' + amount.toFixed(2) + ' ' + n.unit + '</td></tr>';
      }).join('');
      const detailBody = rows
        ? '<table class="table is-fullwidth is-striped">' +
          '<thead><tr><th>Nutrient</th><th>Amount</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '</table>'
        : '<p class="help">No nutrient data available for this food yet.</p>';
      const detailRow = document.createElement('tr');
      detailRow.className = 'food-detail-row';
      detailRow.innerHTML =
        '<td colspan="4">' +
          '<div class="box">' +
            '<strong>' + (data.food?.name || 'Food') + '</strong>' +
            '<p class="help mb-2">Nutrients per 100 g</p>' +
            detailBody +
          '</div>' +
        '</td>';
      row.parentNode.insertBefore(detailRow, row.nextSibling);
    });
  </script>`;
}


