export const templateCache = new Map();

export async function loadTemplate(env, name) {
  const key = name;
  if (templateCache.has(key)) return templateCache.get(key);
  const url = `https://assets.local/templates/${name}.html`;
  const res = await env.ASSETS.fetch(new Request(url));
  if (!res.ok) {
    throw new Error(`Template not found: ${name}`);
  }
  const text = await res.text();
  templateCache.set(key, text);
  return text;
}

export function applyTemplate(template, data) {
  let output = template;
  for (const [key, value] of Object.entries(data || {})) {
    const token = `{{${key}}}`;
    output = output.split(token).join(String(value ?? ''));
  }
  return output;
}

export async function renderLayout(env, { title, body, user, scripts = '' }) {
  const template = await loadTemplate(env, 'layout');
  const burger = user ? '<div class="navbar-burger" data-target="nav-menu"><span></span><span></span><span></span></div>' : '';
  const navLinks = user
    ? `<a class="navbar-item" href="/dashboard">Dashboard</a>
        <a class="navbar-item" href="/foods">Foods</a>
        <a class="navbar-item" href="/settings">Settings</a>`
    : '';
  const navUser = user
    ? `<div class="navbar-item">${user.name || user.email}</div>
        <div class="navbar-item">
          <form method="post" action="/auth/logout">
            <button class="button is-light" type="submit">Log out</button>
          </form>
        </div>`
    : '';
  return applyTemplate(template, {
    title,
    body,
    nav_burger: burger,
    nav_links: navLinks,
    nav_user: navUser,
    scripts
  });
}
