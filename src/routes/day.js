import { renderLayout } from '../ui/templates.js';
import { renderDay, dashboardScripts } from '../ui/pages.js';
import { getDb } from '../db/client.js';
import { getFoodEntriesByDate, getDayNutrients } from '../db/queries.js';
import { normalizeDate } from '../utils/date.js';
import { buildPersonalizedReferences } from '../utils/rda.js';

export async function dayHandler(c) {
  const session = c.get('session');
  const db = getDb(c.env);
  const date = normalizeDate(c.req.param('date'));
  const entries = await getFoodEntriesByDate(db, session.userId, date);
  const nutrients = await getDayNutrients(db, session.userId, date);
  const user = c.get('user');
  const references = buildPersonalizedReferences(nutrients, user);
  const body = await renderDay(c.env, { date, entries, nutrients, references });
  return c.html(await renderLayout(c.env, { title: `Day ${date}`, body, user: c.get('user'), scripts: dashboardScripts() }));
}
