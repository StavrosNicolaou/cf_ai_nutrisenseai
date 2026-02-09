import { Agent } from 'agents';
import { getDb } from '../db/client.js';
import {
  searchFoodsByName,
  addFood,
  addFoodNutrients,
  logFoodEntry as logFoodEntryDb,
  getFoodEntriesByDate,
  getDayNutrients,
  getNutrients,
  getFoodNutrients
} from '../db/queries.js';

const SPECIAL_WARNINGS = [
  { match: /laetrile|amygdalin/i, warning: 'Laetrile/Amygdalin can release cyanide; avoid unless medically supervised.' },
  { match: /\bliver\b/i, warning: 'Frequent large servings of liver can cause vitamin A toxicity (hypervitaminosis A).' },
  { match: /\b(sodium|salami|ham|bacon|sausage|prosciutto|soy sauce|instant noodles|ramen)\b/i, warning: 'High sodium food; watch total daily intake.' },
  { match: /\b(shark|swordfish|king mackerel|bigeye tuna|marlin|orange roughy)\b/i, warning: 'High mercury fish; limit frequency, especially during pregnancy.' },
  { match: /\b(raw egg|raw eggs|sushi|sashimi|raw milk|unpasteurized|ceviche|steak tartare)\b/i, warning: 'Raw or undercooked foods can increase foodborne illness risk.' },
  { match: /\b(energy drink|energy drinks|preworkout|pre-workout|espresso shots|caffeine)\b/i, warning: 'High caffeine item; monitor total caffeine intake.' },
  { match: /\b(candy|soda|soft drink|dessert|pastry|sweetened|ice cream|chocolate bar)\b/i, warning: 'High added sugar item; watch total daily added sugar.' }
];

function normalizeName(name) {
  return String(name || '').trim();
}

function normalizeLogText(text) {
  const raw = String(text || '').trim();
  if (!raw) return raw;
  const normalized = raw.replace(/\r\n/g, '\n');
  const matches = normalized.match(/(\d+(?:\.\d+)?)\s*(g|grams?)\s+/gi) || [];
  if (matches.length <= 1) return normalized;
  const withBreaks = normalized.replace(/(\d+(?:\.\d+)?)\s*(g|grams?)\s+/gi, '\n$1$2 ');
  return withBreaks.replace(/^\n+/, '').trim();
}
function clampNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(num, 0);
}

function normalizeConfidence(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered.includes('high')) return 0.8;
    if (lowered.includes('medium')) return 0.5;
    if (lowered.includes('low')) return 0.2;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num > 1) return Math.min(num / 100, 1);
  return Math.max(num, 0);
}

function normalizeUnit(unit) {
  const value = String(unit || '').toLowerCase();
  if (value.includes('mcg') || /[\u00b5\u03bc]g/.test(value) || value.includes('ug')) {
    return 'mcg';
  }
  if (value.includes('mg')) return 'mg';
  if (value.includes('kcal') || value === 'cal') return 'kcal';
  if (value.includes('g') || value === 'grams') return 'g';
  return value;
}

function normalizeNutrientName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NUTRIENT_ALIASES = new Map([
  ['vitamin b12', 'vitamin b12'],
  ['vitamin b 12', 'vitamin b12'],
  ['vitamin b6', 'vitamin b6'],
  ['vitamin b 6', 'vitamin b6'],
  ['vitamin a', 'vitamin a'],
  ['vitamin c', 'vitamin c'],
  ['vitamin d', 'vitamin d'],
  ['vitamin e', 'vitamin e'],
  ['vitamin k', 'vitamin k'],
  ['niacin', 'niacin'],
  ['riboflavin', 'riboflavin'],
  ['thiamin', 'thiamin'],
  ['folate', 'folate'],
  ['total fat', 'total fat'],
  ['carbohydrate', 'carbohydrates'],
  ['carbohydrates', 'carbohydrates'],
  ['sugar', 'sugar'],
  ['fiber', 'fiber'],
  ['calories', 'calories'],
  ['alpha linolenic acid', 'alpha linolenic acid'],
  ['linoleic acid', 'linoleic acid'],
  ['coenzyme q10', 'coenzyme q10'],
  ['alpha lipoic acid', 'alpha lipoic acid'],
  ['betaine', 'betaine tmg'],
  ['s methylmethionine', 's methylmethionine'],
  ['vitamin u', 's methylmethionine']
]);

function resolveNutrientKey(name) {
  const normalized = normalizeNutrientName(name);
  return NUTRIENT_ALIASES.get(normalized) || normalized;
}

function convertAmount(amount, fromUnit, toUnit) {
  const value = clampNumber(amount);
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!value) return 0;
  if (from === to) return value;
  if (from === 'mg' && to === 'g') return value / 1000;
  if (from === 'g' && to === 'mg') return value * 1000;
  if (from === 'mcg' && to === 'mg') return value / 1000;
  if (from === 'mg' && to === 'mcg') return value * 1000;
  if (from === 'g' && to === 'mcg') return value * 1000 * 1000;
  if (from === 'mcg' && to === 'g') return value / 1000 / 1000;
  return value;
}

// function fallbackParseText(text, { allowCounts = false } = {}) {
//   const cleaned = normalizeLogText(text);
//   const lines = String(cleaned || '')
//     .split(/\r?\n/)
//     .map((line) => line.trim())
//     .filter((line) => line.length);
//   const items = [];
//   const splitSegments = (line) =>
//     line
//       .split(/\s*,\s*|\s+and\s+/i)
//       .map((part) => part.trim())
//       .filter(Boolean);
//   for (const line of lines) {
//     if (/^meal\s*\d+/i.test(line)) continue;
//     const segments = line.includes(',') || /\sand\s/i.test(line) ? splitSegments(line) : [line];
//     for (const segment of segments) {
//       const gramMatch = segment.match(/^(\d+(?:\.\d+)?)\s*(g|grams?)\s+(.+)$/i);
//       if (gramMatch) {
//         const grams = clampNumber(gramMatch[1]);
//         const name = normalizeName(gramMatch[3]);
//         if (!name || !grams) continue;
//         items.push({
//           name,
//           quantity: grams,
//           unit: 'g',
//           grams_estimate: grams,
//           confidence: 0.6
//         });
//         continue;
//       }
//       if (allowCounts) {
//         const countMatch = segment.match(/^(\d+(?:\.\d+)?)\s+([a-zA-Z].+)$/);
//         if (countMatch) {
//           const count = clampNumber(countMatch[1]);
//           const name = normalizeName(countMatch[2]);
//           if (!name || !count) continue;
//           items.push({
//             name,
//             quantity: count,
//             unit: 'count',
//             grams_estimate: 0,
//             confidence: 0.2
//           });
//           continue;
//         }
//       }
//       const multiRegex = /(\d+(?:\.\d+)?)\s*(g|grams?)\s+([^0-9]+?)(?=(\d+(?:\.\d+)?)\s*(g|grams?)\s+|$)/gi;
//       const matches = Array.from(segment.matchAll(multiRegex));
//       for (const part of matches) {
//         const grams = clampNumber(part[1]);
//         const name = normalizeName(part[3]);
//         if (!name || !grams) continue;
//         items.push({
//           name,
//           quantity: grams,
//           unit: 'g',
//           grams_estimate: grams,
//           confidence: 0.6
//         });
//       }
//     }
//   }
//   return { items };
// }

// function parseJsonResponse(result) {
//   if (!result) return null;
//   if (result.response) return result.response;
//   if (typeof result === 'string') {
//     return parseJsonFromText(result);
//   }
//   return result;
// }

function parseJsonFromText(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return { items: parsed };
    return parsed;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    const arrStart = trimmed.indexOf('[');
    const arrEnd = trimmed.lastIndexOf(']');
    if (arrStart === -1 || arrEnd === -1 || arrEnd <= arrStart) return null;
    const candidate = trimmed.slice(arrStart, arrEnd + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return { items: parsed };
      return parsed;
    } catch {
      return null;
    }
  }
}

function extractXaiContent(data) {
  if (!data) return '';
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') return part.text;
      if (typeof part?.json === 'string') return part.json;
      if (typeof part?.value === 'string') return part.value;
    }
  }
  return '';
}

async function callXaiVision(env, prompt, imageBytes, imageUrl) {
  if (!env.XAI_AUTH_TOKEN) return null;
  if (!imageUrl) {
    console.log('xAI vision skipped: missing image URL');
    return null;
  }

  const contentImage = { type: 'input_image', image_url: imageUrl, detail: 'high' };
  const body = {
    model: env.XAI_MODEL || 'grok-4-1-fast',
    input: [
      {
        role: 'user',
        content: [
          contentImage,
          { type: 'input_text', text: prompt }
        ]
      }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
    max_output_tokens: 1200
  };

  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.XAI_AUTH_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.log('xAI vision error:', res.status, errorText);
      return null;
    }

    const data = await res.json();
    console.log('xAI vision raw response:', JSON.stringify(data));
    const content = extractXaiContent(data);
    return parseJsonFromText(content);
  } catch (err) {
    console.log('xAI vision exception:', err?.message || err);
    return null;
  }
}

// disabled workers AI, to use xAI.
// async function callTextModel(env, messages) {
//   const result = await env.AI.run(env.AI_MODEL_TEXT, {
//     messages,
//     temperature: 0.2,
//     max_tokens: 1200,
//     response_format: { type: 'json_object' }
//   });
//   return parseJsonResponse(result);
// }

async function callXaiText(env, messages) {
  if (!env.XAI_AUTH_TOKEN) return null;
  try {
    const body = {
      model: env.XAI_MODEL || 'grok-4-1-fast',
      input: messages,
      temperature: 0.2,
      max_output_tokens: 1200
    };
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.XAI_AUTH_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.log('xAI text error:', res.status, errorText);
      return null;
    }
    const data = await res.json();
    const content = extractXaiContent(data);
    return parseJsonFromText(content);
  } catch (err) {
    console.log('xAI text exception:', err?.message || err);
    return null;
  }
}

async function callXaiSearch(env, messages) {
  if (!env.XAI_AUTH_TOKEN) {
    console.log('xAI auth token missing; skipping xAI search');
    return null;
  }
  console.log('xAI search request start');
  const body = {
    model: env.XAI_MODEL || 'grok-4-1-fast',
    input: messages,
    tools: [{ type: 'web_search' }],
    temperature: 0.2,
    response_format: { type: 'json_object' },
    max_output_tokens: 1200
  };
  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.XAI_AUTH_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.log('xAI search error:', res.status, errorText);
      return null;
    }
    const data = await res.json();
    console.log('xAI raw response:', JSON.stringify(data));
    const content = extractXaiContent(data);
    console.log('xAI content preview:', String(content || '').slice(0, 200));
    return parseJsonFromText(content);
  } catch (err) {
    console.log('xAI fetch exception:', err?.message || err);
    return null;
  }
}

async function callVisionModel(env, prompt, imageBytes, imageUrl) {
  if (!env.XAI_AUTH_TOKEN) {
    console.log('xAI vision skipped: missing auth token');
    return null;
  }
  return callXaiVision(env, prompt, imageBytes, imageUrl);
}

export class FoodAgentSql extends Agent {
  constructor(state, env) {
    super(state, env);
    this.env = env;
    this.nutrientIndex = null;
  }

  async run(task) {
    if (task?.type === 'image') {
      return this.handleImage(task);
    }
    return this.handleText(task);
  }

  async storeMemory(userId, payload) {
    if (!userId) return;
    const key = `memory:${userId}`;
    const existing = (await this.ctx.storage.get(key)) || [];
    const next = [...existing, payload].slice(-10);
    await this.ctx.storage.put(key, next);
  }

  async searchFoodDatabase({ query }) {
    const db = getDb(this.env);
    const results = await searchFoodsByName(db, query);
    return results;
  }

  async getNutrientIndex() {
    if (this.nutrientIndex) return this.nutrientIndex;
    const db = getDb(this.env);
    const nutrients = await getNutrients(db);
    console.log('Loaded nutrients from DB:', nutrients.length);
    const index = new Map();
    const compactIndex = new Map();
    for (const nutrient of nutrients) {
      const key = resolveNutrientKey(nutrient.name);
      index.set(key, nutrient);
      compactIndex.set(key.replace(/\s+/g, ''), nutrient);
    }
    this.nutrientIndex = { index, compactIndex };
    return this.nutrientIndex;
  }

  async mapNutrientsToDb(nutrients) {
    const { index, compactIndex } = await this.getNutrientIndex();
    const mapped = [];
    const unknown = [];
    const list = nutrients || [];
    let sampleLogged = 0;

    for (const nutrient of list) {
      const key = resolveNutrientKey(nutrient.name);
      let target = index.get(key);
      if (!target) {
        const compactKey = key.replace(/\s+/g, '');
        target = compactIndex.get(compactKey);
      }

      if (!target) {
        for (const [indexKey, indexValue] of index.entries()) {
          if (indexKey.includes(key) || key.includes(indexKey)) {
            target = indexValue;
            break;
          }
        }
      }

      if (!target) {
        if (sampleLogged < 5) {
          console.log('No match for nutrient:', nutrient.name, '->', key);
          sampleLogged += 1;
        }

        unknown.push(nutrient.name);
        continue;
      }
      mapped.push({
        nutrient_id: target.id,
        amount_per_100g: convertAmount(nutrient.amount_per_100g, nutrient.unit, target.unit)
      });
    }

    if (unknown.length) {
      console.log('Unmapped nutrients:', unknown.slice(0, 10));
    }

    console.log('Mapped nutrients:', mapped.length);
    return mapped;
  }

  async addFoodToCatalog({ name, nutrients }) {
    const db = getDb(this.env);
    const foodId = await addFood(db, { name, source: 'ai', sourceDetail: 'ai', isEstimated: 1 });

    if (Array.isArray(nutrients) && nutrients.length) {
      const mapped = await this.mapNutrientsToDb(nutrients);
      if (mapped.length) {
        await addFoodNutrients(db, foodId, mapped);
      } else {
        console.log('No nutrient mappings found for new food:', name);
      }
    }
    return { foodId };
  }

  async backfillNutrientsIfMissing(foodId, name) {
    const db = getDb(this.env);
    const existing = await getFoodNutrients(db, foodId);
    if (existing && existing.length) return;

    console.log('Backfilling nutrients for food:', name);
    const nutrients = await this.estimateNutrientsForFood(name);
    const mapped = await this.mapNutrientsToDb(nutrients);

    if (mapped.length) {
      await addFoodNutrients(db, foodId, mapped);
    } else {
      console.log('Backfill produced no mappings for:', name);
    }
  }

  async logFoodEntry({ userId, entry }) {
    const db = getDb(this.env);
    const id = await logFoodEntryDb(db, {
      userId,
      foodId: entry.foodId,
      entryDate: entry.entryDate,
      grams: entry.grams,
      source: entry.source || 'ai'
    });
    return { id };
  }

  async getDaySummary({ userId, date }) {
    const db = getDb(this.env);
    const entries = await getFoodEntriesByDate(db, userId, date);
    const nutrients = await getDayNutrients(db, userId, date);
    return { entries, nutrients };
  }

  async estimateFromText({ text }) {
    const normalizedText = normalizeLogText(text);
    const useXai = Boolean(this.env.XAI_AUTH_TOKEN);
    const buildMessages = (inputText, { strictGrams = false } = {}) => [
      {
        role: 'system',
        content: 'You are a nutrition parser. Return strict JSON only. Do not include markdown.'
      },
      {
        role: 'user',
        content:
          'Parse this food log into items. Include grams_estimate even if unit is not grams. Ignore lines like "Meal 1". ' +
          'If a line looks like "237g whole eggs" treat it as grams + food name. If the user provides counts like "3 kiwis" or "2 big bananas", estimate grams per item based on typical averages for that food and size modifiers (small/medium/large/big). Items may be space-separated; treat each grams value as a new item.' +
          (strictGrams ? ' grams_estimate must be a positive number; never return 0.' : '')
      },
      {
        role: 'user',
        content: JSON.stringify({
          schema: {
            items: [
              {
                name: 'string',
                quantity: 'number',
                unit: 'string',
                grams_estimate: 'number',
                confidence: 'number'
              }
            ]
          },
          example_input: 'Meal 1\n237g whole eggs\n40g parmesan cheese',
          example_output: {
            items: [
              { name: 'whole eggs', quantity: 237, unit: 'g', grams_estimate: 237, confidence: 0.9 },
              { name: 'parmesan cheese', quantity: 40, unit: 'g', grams_estimate: 40, confidence: 0.9 }
            ]
          },
          text: inputText
        })
      }
    ];

    const buildClassifierMessages = (inputText) => [
      {
        role: 'system',
        content: 'You classify whether text is a food log. Return strict JSON only.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          schema: { is_food: 'boolean', reason: 'string' },
          text: inputText
        })
      }
    ];

    const runAi = async (inputText, options = {}) => {
      const messages = buildMessages(inputText, options);
      if (useXai) return callXaiText(this.env, messages);
      return null;
    };

    const runClassifier = async (inputText) => {
      const messages = buildClassifierMessages(inputText);
      if (useXai) return callXaiText(this.env, messages);
      return null;
    };

    const hasMissingGrams = (items) =>
      Array.isArray(items) && items.some((item) => Number(item.grams_estimate || 0) <= 0);

    const classification = await runClassifier(normalizedText);
    if (classification && classification.is_food === false) {
      return { items: [], nonFoodReason: classification.reason || 'No food detected.' };
    }

    const result = await runAi(normalizedText);
    if (!result?.items || !Array.isArray(result.items) || result.items.length === 0) {
      const expandedText = normalizedText.replace(/,\s*/g, '\n').replace(/\s+and\s+/gi, '\n');
      const retry = await runAi(expandedText);

      if (retry?.items && Array.isArray(retry.items) && retry.items.length) {
        if (hasMissingGrams(retry.items)) {
          const strictRetry = await runAi(expandedText, { strictGrams: true });
          if (strictRetry?.items?.length) return strictRetry;
        }
        return retry;
      }
      return { items: [] };
    }

    if (hasMissingGrams(result.items)) {
      const strictResult = await runAi(normalizedText, { strictGrams: true });
      if (strictResult?.items?.length) return strictResult;
    }

    if (result.items.length <= 1 && /,|\sand\s/i.test(normalizedText)) {
      const segments = normalizedText
        .replace(/,\s*/g, '\n')
        .replace(/\s+and\s+/gi, '\n')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const collected = [];

      for (const segment of segments) {
        let segmentResult = await runAi(segment);
        if (segmentResult?.items && Array.isArray(segmentResult.items) && segmentResult.items.length) {
          if (hasMissingGrams(segmentResult.items)) {
            const strictSegment = await runAi(segment, { strictGrams: true });
            if (strictSegment?.items?.length) {
              segmentResult = strictSegment;
            }
          }
          collected.push(...segmentResult.items);
        }
      }

      if (collected.length > result.items.length) {
        return { items: collected };
      }
    }
    
    return result;
  }

  async estimateNutrientsForFood(name) {
    const db = getDb(this.env);
    const nutrients = await getNutrients(db);
    const nutrientNames = nutrients.map((n) => n.name);
    console.log('Estimate nutrients for food:', name, 'XAI token present:', Boolean(this.env.XAI_AUTH_TOKEN));
    console.log('Nutrient list size:', nutrientNames.length);
    const messages = [
      {
        role: 'system',
        content:
          'You are a nutrition researcher. Use web_search to find nutrient data. Return strict JSON only.'
      },
      {
        role: 'user',
        content:
          `Find nutrient amounts per 100g for "${name}". Use sources from the web. ` +
          'Return numeric amounts and use nutrient names exactly as provided in the nutrient list.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          nutrient_list: nutrientNames,
          schema: {
            nutrients: [
              { name: 'string', unit: 'string', amount_per_100g: 'number', confidence: 'number' }
            ]
          },
          name
        })
      }
    ];

    const xai = await callXaiSearch(this.env, messages);
    console.log('xAI parsed nutrients count:', Array.isArray(xai?.nutrients) ? xai.nutrients.length : 0);
    if (Array.isArray(xai?.nutrients) && xai.nutrients.length) {
      console.log('xAI first nutrient sample:', xai.nutrients[0]);
    }

    if (Array.isArray(xai?.nutrients) && xai.nutrients.length) {
      return xai.nutrients;
    }

    return [];
  }

  async estimateFromImage({ imageBytes, imageUrl, hint }) {
    const basePrompt =
      'Identify foods and estimate portion sizes. Return strict JSON only with items array: name, quantity, unit, grams_estimate, confidence. Confidence must be a number between 0 and 1.';
    const hintLine = hint ? ` User hint: ${hint}` : '';
    return callVisionModel(this.env, basePrompt + hintLine, imageBytes, imageUrl);
  }

  async handleText(task) {
    const parsed = await this.estimateFromText({ text: task.text });
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const db = getDb(this.env);
    const results = [];

    for (const item of items) {
      const name = normalizeName(item.name);
      if (!name) continue;

      const matches = await searchFoodsByName(db, name, 1);
      let foodId = matches[0]?.id;
      let isEstimated = false;

      if (!foodId) {
        const nutrients = await this.estimateNutrientsForFood(name);
        const created = await this.addFoodToCatalog({ name, nutrients });
        foodId = created.foodId;
        isEstimated = true;
      } else {
        await this.backfillNutrientsIfMissing(foodId, name);
      }

      const warnings = SPECIAL_WARNINGS.filter((w) => w.match.test(name)).map((w) => w.warning);
      results.push({
        name,
        quantity: item.quantity,
        unit: item.unit,
        grams_estimate: clampNumber(item.grams_estimate || item.grams || 0),
        confidence: normalizeConfidence(item.confidence || 0.5),
        foodId,
        isEstimated,
        warnings
      });
    }

    await this.storeMemory(task?.userId, { type: 'text', items: results, at: Date.now() });
    return { items: results };
  }

  async handleImage(task) {
    let parsed = await this.estimateFromImage({
      imageBytes: task.imageBytes,
      imageUrl: task.imageUrl,
      hint: task.hint
    });
    let items = Array.isArray(parsed?.items) ? parsed.items : [];

    if (!items.length && task?.hint) {
      const hintParsed = await this.estimateFromText({ text: task.hint });
      items = Array.isArray(hintParsed?.items) ? hintParsed.items : [];
    }

    const db = getDb(this.env);
    const results = [];

    for (const item of items) {
      const name = normalizeName(item.name);
      if (!name) continue;

      const matches = await searchFoodsByName(db, name, 1);
      let foodId = matches[0]?.id;
      let isEstimated = false;

      if (!foodId) {
        const nutrients = await this.estimateNutrientsForFood(name);
        const created = await this.addFoodToCatalog({ name, nutrients });
        foodId = created.foodId;
        isEstimated = true;
      } else {
        await this.backfillNutrientsIfMissing(foodId, name);
      }

      const warnings = SPECIAL_WARNINGS.filter((w) => w.match.test(name)).map((w) => w.warning);
      results.push({
        name,
        quantity: item.quantity,
        unit: item.unit,
        grams_estimate: clampNumber(item.grams_estimate || 0),
        confidence: normalizeConfidence(item.confidence || 0.4),
        foodId,
        isEstimated,
        warnings
      });
    }

    await this.storeMemory(task?.userId, { type: 'image', items: results, at: Date.now() });
    return { items: results };
  }
}
