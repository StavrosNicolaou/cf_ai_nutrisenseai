# NutriSense AI

AI food + micronutrient tracker built on Cloudflare Workers. Log meals with text or photos, get macros + micros + amino acids + vitamin-like compounds, and track RDA/TDEE targets. Single Worker handles SSR + API.

## Why I built this

I would always open ChatGPT or any other LLM's website and type in the meals I ate at a given day so I could get an estimate on the micronutrients I consumed and see if I maxxed my RDA's for the day or if I would need to eat something specific to fill the gaps. At the same time I would sometimes upload a meal that I would eat at a restaurant to get both calories, macros but also the micronutrients. The problem was that each time the LLM would take a while to be able to gather all the macros and micros (could take more than 8 minutes on average) and sometimes if it weren't thinking or researching enough it would be totally inaccurate. 

This is why I wanted to build something just for this purpose (while also combining it as a project that would be submitted to Cloudflare Software Engineer Summer Internship application), so that I could either type the meals I ate or upload a picture so I could get a close estimate on what micronutrients I ate on the go, but make sure to save the responses in a database so the next time someone uploads a picture of a kiwi for example, if the macros and micros of a kiwi are already in the DB, the response will be much faster.

I decided to give it a bit more features rather than just leave it as a micronutrient tracker, which is why this tool also calculates your TDEE (total daily energy expenditure) and gives you macros based on your goals (maintain, lose fat, gain mass, etc).

## Highlights

- Text + photo logging with background jobs and review flow
- Full macro/micro/amino/vitamin-like coverage
- RDA + TDEE targets (Cunningham BMR) with macro overrides
- Meals: Breakfast/Lunch/Dinner/Snack/Uncategorized
- Entry modal for edits (grams, meal, time) + nutrient detail
- Google OAuth + optional TOTP 2FA (JWT cookies)
- xAI Grok for text + vision + web search
- R2 signed uploads (checksum + size validation, short-lived URLs)
- Turso (libSQL) persistence
- KV rate limiting + per-user concurrency cap for jobs

## Stack

- Cloudflare Workers (SSR + API)
- Cloudflare Queues (background parsing)
- Cloudflare KV (rate limiting)
- Cloudflare R2 (image uploads)
- Cloudflare Agents (Durable Object)
- xAI Grok (text + vision)
- Turso (libSQL)
- Bulma CSS

## Setup

1) Install deps

```bash
npm install
```

2) Authenticate

```bash
wrangler login
```

3) Create Turso DB

```bash
turso db create nutrisense
```

4) Configure `wrangler.jsonc`

Required:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `APP_BASE_URL`
- `XAI_AUTH_TOKEN`
- `XAI_MODEL` (e.g. `grok-4-1-fast`)
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Optional:

- `R2_PUBLIC_BASE` (custom GET domain like `https://track-images.stavros.xyz`)
- `CONCURRENT_USER_LIMIT` (default 3)

5) Run migrations

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run migrate
```

6) Dev

```bash
wrangler dev
```

7) Deploy

```bash
wrangler deploy
```

## Routes

- `/` landing
- `/dashboard` today
- `/day/:date` specific day
- `/foods` catalog
- `/settings` profile + 2FA
- `/auth/google` OAuth start
- `/auth/google/callback` OAuth callback
- `/auth/logout` logout

## API

- `POST /api/food/parse-text`
- `POST /api/food/image-upload-url`
- `POST /api/food/parse-image`
- `POST /api/food/add`
- `POST /api/food/update`
- `POST /api/food/delete`
- `GET /api/food/entry/:id`
- `GET /api/day?date=YYYY-MM-DD`
- `GET /api/nutrients/list`
- `GET /api/foods/search?q=...`
- `GET /api/foods/:id`
- `GET /api/jobs`
- `POST /api/jobs/:id/consume`
- `POST /api/jobs/:id/retry`
- `DELETE /api/jobs/:id`

## Notes

- Photo flow: choose a file, optionally add a hint, then click Upload & Analyze.
- Jobs UI shows retries and lets you review before adding to a day.
- Prompt history for this project is summarized in `PROMPTS.md`.
- Food safety warnings are surfaced for:
  - Laetrile/Amygdalin (cyanide risk)
  - Frequent liver consumption (vitamin A toxicity)
  - High sodium foods (processed meats, soy sauce, instant noodles, etc.)
  - High mercury fish (shark, swordfish, king mackerel, bigeye tuna, marlin, orange roughy)
  - Raw/undercooked foods (raw eggs, sushi, unpasteurized dairy)
  - High caffeine items (energy drinks, preworkout, espresso shots)
  - High added sugar foods (soda, candy, desserts)
- xAI is the primary LLM (text + vision) with web search enabled.
- Rate limits apply per user for parse endpoints to prevent abuse.
- Jobs are processed with a per‑user concurrency cap (default 3).
