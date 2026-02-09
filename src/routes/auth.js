import { renderLayout } from '../ui/templates.js';
import { renderOtp } from '../ui/pages.js';

export async function otpHandler(c) {
  const body = await renderOtp(c.env);
  return c.html(await renderLayout(c.env, { title: 'Verify 2FA', body, user: c.get('user') }));
}