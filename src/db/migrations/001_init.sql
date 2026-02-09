PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture_url TEXT,
  sex TEXT,
  age INTEGER,
  height_cm REAL,
  weight_kg REAL,
  activity_level TEXT,
  body_fat_percent REAL,
  goal_type TEXT,
  goal_rate_kg REAL,
  protein_pref TEXT,
  carb_pref TEXT,
  calories_override REAL,
  protein_override REAL,
  carbs_override REAL,
  fat_override REAL,
  totp_enabled INTEGER DEFAULT 0,
  totp_secret_enc TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  access_token TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_user_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  last_seen TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  source TEXT DEFAULT 'seed',
  is_estimated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nutrients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT,
  is_macro INTEGER DEFAULT 0,
  is_micro INTEGER DEFAULT 0,
  is_vitamin_like INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS food_nutrients (
  food_id TEXT NOT NULL,
  nutrient_id TEXT NOT NULL,
  amount_per_100g REAL NOT NULL,
  PRIMARY KEY (food_id, nutrient_id),
  FOREIGN KEY(food_id) REFERENCES foods(id) ON DELETE CASCADE,
  FOREIGN KEY(nutrient_id) REFERENCES nutrients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS food_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  food_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  entry_time TEXT,
  grams REAL NOT NULL,
  meal_type TEXT DEFAULT 'uncategorized',
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(food_id) REFERENCES foods(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  totals_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, entry_date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nutrient_reference (
  id TEXT PRIMARY KEY,
  nutrient_id TEXT NOT NULL,
  sex TEXT DEFAULT 'any',
  age_min INTEGER DEFAULT 19,
  age_max INTEGER DEFAULT 50,
  rda REAL,
  ai REAL,
  ul REAL,
  unit TEXT NOT NULL,
  FOREIGN KEY(nutrient_id) REFERENCES nutrients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
CREATE INDEX IF NOT EXISTS idx_food_entries_user_date ON food_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_food_entries_date ON food_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_foods_search ON foods(name);

INSERT OR IGNORE INTO nutrients (id, name, unit, category, is_macro, is_micro, is_vitamin_like) VALUES
  ('calories', 'Calories', 'kcal', 'macro', 1, 0, 0),
  ('protein', 'Protein', 'g', 'macro', 1, 0, 0),
  ('carbs', 'Carbohydrates', 'g', 'macro', 1, 0, 0),
  ('fat', 'Total Fat', 'g', 'macro', 1, 0, 0),
  ('fiber', 'Fiber', 'g', 'macro', 1, 0, 0),
  ('sugar', 'Sugar', 'g', 'macro', 1, 0, 0),
  ('vitamin_a', 'Vitamin A', 'mcg RAE', 'vitamin', 0, 1, 0),
  ('vitamin_c', 'Vitamin C', 'mg', 'vitamin', 0, 1, 0),
  ('vitamin_d', 'Vitamin D', 'mcg', 'vitamin', 0, 1, 0),
  ('vitamin_e', 'Vitamin E', 'mg', 'vitamin', 0, 1, 0),
  ('vitamin_k', 'Vitamin K', 'mcg', 'vitamin', 0, 1, 0),
  ('thiamin', 'Thiamin (B1)', 'mg', 'vitamin', 0, 1, 0),
  ('riboflavin', 'Riboflavin (B2)', 'mg', 'vitamin', 0, 1, 0),
  ('niacin', 'Niacin (B3)', 'mg', 'vitamin', 0, 1, 0),
  ('vitamin_b6', 'Vitamin B6', 'mg', 'vitamin', 0, 1, 0),
  ('folate', 'Folate', 'mcg DFE', 'vitamin', 0, 1, 0),
  ('vitamin_b12', 'Vitamin B12', 'mcg', 'vitamin', 0, 1, 0),
  ('pantothenic', 'Pantothenic Acid', 'mg', 'vitamin', 0, 1, 0),
  ('biotin', 'Biotin', 'mcg', 'vitamin', 0, 1, 0),
  ('choline', 'Choline', 'mg', 'vitamin-like', 0, 1, 1),
  ('calcium', 'Calcium', 'mg', 'mineral', 0, 1, 0),
  ('iron', 'Iron', 'mg', 'mineral', 0, 1, 0),
  ('magnesium', 'Magnesium', 'mg', 'mineral', 0, 1, 0),
  ('phosphorus', 'Phosphorus', 'mg', 'mineral', 0, 1, 0),
  ('potassium', 'Potassium', 'mg', 'mineral', 0, 1, 0),
  ('sodium', 'Sodium', 'mg', 'mineral', 0, 1, 0),
  ('zinc', 'Zinc', 'mg', 'mineral', 0, 1, 0),
  ('copper', 'Copper', 'mg', 'mineral', 0, 1, 0),
  ('manganese', 'Manganese', 'mg', 'mineral', 0, 1, 0),
  ('selenium', 'Selenium', 'mcg', 'mineral', 0, 1, 0),
  ('iodine', 'Iodine', 'mcg', 'mineral', 0, 1, 0),
  ('chromium', 'Chromium', 'mcg', 'mineral', 0, 1, 0),
  ('molybdenum', 'Molybdenum', 'mcg', 'mineral', 0, 1, 0),
  ('chloride', 'Chloride', 'mg', 'mineral', 0, 1, 0),
  ('histidine', 'Histidine', 'g', 'amino', 0, 1, 0),
  ('isoleucine', 'Isoleucine', 'g', 'amino', 0, 1, 0),
  ('leucine', 'Leucine', 'g', 'amino', 0, 1, 0),
  ('lysine', 'Lysine', 'g', 'amino', 0, 1, 0),
  ('methionine', 'Methionine', 'g', 'amino', 0, 1, 0),
  ('phenylalanine', 'Phenylalanine', 'g', 'amino', 0, 1, 0),
  ('threonine', 'Threonine', 'g', 'amino', 0, 1, 0),
  ('tryptophan', 'Tryptophan', 'g', 'amino', 0, 1, 0),
  ('valine', 'Valine', 'g', 'amino', 0, 1, 0),
  ('alanine', 'Alanine', 'g', 'amino', 0, 1, 0),
  ('arginine', 'Arginine', 'g', 'amino', 0, 1, 0),
  ('asparagine', 'Asparagine', 'g', 'amino', 0, 1, 0),
  ('aspartic_acid', 'Aspartic Acid', 'g', 'amino', 0, 1, 0),
  ('cysteine', 'Cysteine', 'g', 'amino', 0, 1, 0),
  ('glutamic_acid', 'Glutamic Acid', 'g', 'amino', 0, 1, 0),
  ('glutamine', 'Glutamine', 'g', 'amino', 0, 1, 0),
  ('glycine', 'Glycine', 'g', 'amino', 0, 1, 0),
  ('proline', 'Proline', 'g', 'amino', 0, 1, 0),
  ('serine', 'Serine', 'g', 'amino', 0, 1, 0),
  ('tyrosine', 'Tyrosine', 'g', 'amino', 0, 1, 0),
  ('inositol', 'Inositol', 'mg', 'vitamin-like', 0, 1, 1),
  ('carnitine', 'Carnitine', 'mg', 'vitamin-like', 0, 1, 1),
  ('coq10', 'Coenzyme Q10', 'mg', 'vitamin-like', 0, 1, 1),
  ('alpha_lipoic', 'Alpha-Lipoic Acid', 'mg', 'vitamin-like', 0, 1, 1),
  ('taurine', 'Taurine', 'mg', 'vitamin-like', 0, 1, 1),
  ('creatine', 'Creatine', 'mg', 'vitamin-like', 0, 1, 1),
  ('betaine', 'Betaine (TMG)', 'mg', 'vitamin-like', 0, 1, 1),
  ('paba', 'PABA', 'mg', 'vitamin-like', 0, 1, 1),
  ('orotic_acid', 'Orotic Acid', 'mg', 'vitamin-like', 0, 1, 1),
  ('pangamic_acid', 'Pangamic Acid', 'mg', 'vitamin-like', 0, 1, 1),
  ('laetrile', 'Laetrile / Amygdalin', 'mg', 'vitamin-like', 0, 1, 1),
  ('bioflavonoids', 'Bioflavonoids', 'mg', 'vitamin-like', 0, 1, 1),
  ('vitamin_u', 'S-Methylmethionine (Vitamin U)', 'mg', 'vitamin-like', 0, 1, 1),
  ('linoleic_acid', 'Linoleic Acid (Omega-6)', 'g', 'vitamin-like', 0, 1, 1),
  ('alpha_linolenic_acid', 'Alpha-Linolenic Acid (Omega-3)', 'g', 'vitamin-like', 0, 1, 1);

INSERT OR IGNORE INTO nutrient_reference (id, nutrient_id, sex, age_min, age_max, rda, ai, ul, unit) VALUES
  ('ref_vitc', 'vitamin_c', 'any', 19, 50, 90, NULL, 2000, 'mg'),
  ('ref_vitd', 'vitamin_d', 'any', 19, 70, 15, NULL, 100, 'mcg'),
  ('ref_calc', 'calcium', 'any', 19, 50, 1000, NULL, 2500, 'mg'),
  ('ref_iron', 'iron', 'any', 19, 50, 18, NULL, 45, 'mg'),
  ('ref_mag', 'magnesium', 'any', 19, 50, 400, NULL, 350, 'mg'),
  ('ref_pot', 'potassium', 'any', 19, 50, NULL, 3400, NULL, 'mg'),
  ('ref_choline', 'choline', 'any', 19, 50, NULL, 550, 3500, 'mg');

INSERT OR IGNORE INTO foods (id, name, source, is_estimated) VALUES
  ('food_egg', 'Egg, whole, raw', 'seed', 0),
  ('food_chicken', 'Chicken breast, cooked', 'seed', 0),
  ('food_banana', 'Banana, raw', 'seed', 0),
  ('food_oats', 'Oats, rolled, dry', 'seed', 0),
  ('food_oliveoil', 'Olive oil', 'seed', 0),
  ('food_salmon', 'Salmon, cooked', 'seed', 0),
  ('food_spinach', 'Spinach, raw', 'seed', 0),
  ('food_rice', 'Brown rice, cooked', 'seed', 0),
  ('food_milk', 'Milk, 2% fat', 'seed', 0),
  ('food_almonds', 'Almonds, raw', 'seed', 0),
  ('food_broccoli', 'Broccoli, raw', 'seed', 0),
  ('food_apple', 'Apple, raw', 'seed', 0),
  ('food_quinoa', 'Quinoa, cooked', 'seed', 0),
  ('food_yogurt', 'Greek yogurt, plain', 'seed', 0),
  ('food_tofu', 'Tofu, firm', 'seed', 0);

INSERT OR IGNORE INTO food_nutrients (food_id, nutrient_id, amount_per_100g) VALUES
  ('food_egg', 'calories', 143),
  ('food_egg', 'protein', 13),
  ('food_egg', 'fat', 10),
  ('food_egg', 'carbs', 1.1),
  ('food_egg', 'vitamin_b12', 1.1),
  ('food_egg', 'choline', 293),
  ('food_chicken', 'calories', 165),
  ('food_chicken', 'protein', 31),
  ('food_chicken', 'fat', 3.6),
  ('food_banana', 'calories', 89),
  ('food_banana', 'carbs', 22.8),
  ('food_banana', 'fiber', 2.6),
  ('food_banana', 'sugar', 12.2),
  ('food_oats', 'calories', 389),
  ('food_oats', 'protein', 16.9),
  ('food_oats', 'carbs', 66.3),
  ('food_oats', 'fiber', 10.6),
  ('food_oliveoil', 'calories', 884),
  ('food_oliveoil', 'fat', 100),
  ('food_salmon', 'calories', 208),
  ('food_salmon', 'protein', 20),
  ('food_salmon', 'fat', 13),
  ('food_spinach', 'calories', 23),
  ('food_spinach', 'carbs', 3.6),
  ('food_spinach', 'fiber', 2.2),
  ('food_spinach', 'vitamin_a', 469),
  ('food_spinach', 'vitamin_c', 28.1),
  ('food_rice', 'calories', 123),
  ('food_rice', 'carbs', 25.6),
  ('food_rice', 'protein', 2.7),
  ('food_milk', 'calories', 50),
  ('food_milk', 'protein', 3.4),
  ('food_milk', 'carbs', 5),
  ('food_milk', 'fat', 1.9),
  ('food_almonds', 'calories', 579),
  ('food_almonds', 'protein', 21.2),
  ('food_almonds', 'fat', 49.9),
  ('food_almonds', 'fiber', 12.5),
  ('food_broccoli', 'calories', 34),
  ('food_broccoli', 'carbs', 6.6),
  ('food_broccoli', 'fiber', 2.6),
  ('food_broccoli', 'vitamin_c', 89.2),
  ('food_apple', 'calories', 52),
  ('food_apple', 'carbs', 13.8),
  ('food_apple', 'fiber', 2.4),
  ('food_quinoa', 'calories', 120),
  ('food_quinoa', 'carbs', 21.3),
  ('food_quinoa', 'protein', 4.4),
  ('food_yogurt', 'calories', 59),
  ('food_yogurt', 'protein', 10.3),
  ('food_yogurt', 'carbs', 3.6),
  ('food_tofu', 'calories', 144),
  ('food_tofu', 'protein', 15.7),
  ('food_tofu', 'fat', 8.7);



CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT,
  result_json TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_created ON jobs(user_id, created_at);
