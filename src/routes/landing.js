import { renderLayout } from '../ui/templates.js';
import { renderLanding } from '../ui/pages.js';

export async function landingHandler(c) {
  const body = await renderLanding(c.env);
  return c.html(await renderLayout(c.env, { title: 'NutriSense AI', body, user: null }));
}