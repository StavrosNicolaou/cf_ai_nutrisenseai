import { renderLayout } from '../ui/templates.js';
import { renderFoods, foodsScripts } from '../ui/pages.js';
import { getDb } from '../db/client.js';
import { getFoodsForCatalog } from '../db/queries.js';

export async function foodsHandler(c) {
  const db = getDb(c.env);
  const foods = await getFoodsForCatalog(db);
  const body = await renderFoods(c.env, { foods });
  return c.html(await renderLayout(c.env, { title: 'Food Catalog', body, user: c.get('user'), scripts: foodsScripts() }));
}