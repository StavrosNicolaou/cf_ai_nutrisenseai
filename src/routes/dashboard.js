import { renderLayout } from '../ui/templates.js';
import { renderDashboard, dashboardScripts } from '../ui/pages.js';
import { getDb } from '../db/client.js';
import { getFoodEntriesByDate, getDayNutrients, getEntryDatesInRange } from '../db/queries.js';
import { todayISO } from '../utils/date.js';
import { buildPersonalizedReferences, computeMacroTargets } from '../utils/rda.js';

function shiftDate(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date);
}

export async function dashboardHandler(c) {
  const session = c.get('session');
  const db = getDb(c.env);
  const date = todayISO();
  const entries = await getFoodEntriesByDate(db, session.userId, date);
  const nutrients = await getDayNutrients(db, session.userId, date);
  const user = c.get('user');
  const references = buildPersonalizedReferences(nutrients, user);
  const macroTargets = computeMacroTargets(user);
  const weekDates = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    weekDates.push(shiftDate(date, offset));
  }
  const entryDates = await getEntryDatesInRange(db, {
    userId: session.userId,
    startDate: weekDates[0],
    endDate: weekDates[weekDates.length - 1]
  });
  const entrySet = new Set(entryDates);
  const weekDays = weekDates.map((iso) => ({
    iso,
    label: formatWeekLabel(iso),
    day: Number(iso.slice(8, 10)),
    hasEntries: entrySet.has(iso),
    isToday: iso === date
  }));
  let streak = 0;
  const startDate = entrySet.has(date)
    ? date
    : entrySet.has(shiftDate(date, -1))
      ? shiftDate(date, -1)
      : null;
  if (startDate) {
    for (let i = 0; i < 365; i += 1) {
      const current = shiftDate(startDate, -i);
      if (!entrySet.has(current)) break;
      streak += 1;
    }
  }
  const body = await renderDashboard(c.env, { date, entries, nutrients, references, weekDays, streak, macroTargets });
  return c.html(await renderLayout(c.env, { title: 'Dashboard', body, user: c.get('user'), scripts: dashboardScripts() }));
}
