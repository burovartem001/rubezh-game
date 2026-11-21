-- Глубина полигона и сюжет: новые здания, конструктор дронов, износ, бойцы, передовые пункты, кампания, встречи.

ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_level_check;
ALTER TABLE buildings ADD CONSTRAINT buildings_level_check CHECK (level BETWEEN 0 AND 10);
INSERT INTO buildings(user_id, key, level)
  SELECT p.user_id, k.key, 0 FROM players p CROSS JOIN (VALUES ('motorpool'), ('repairyard'), ('medbay'), ('analytics'), ('testrange')) AS k(key)
  ON CONFLICT DO NOTHING;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_queue_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_queue_check CHECK (queue IN ('build', 'train', 'workshop', 'recovery', 'research', 'outpost'));

-- износ оснащения
ALTER TABLE equipment ADD COLUMN durability INT NOT NULL DEFAULT 100 CHECK (durability BETWEEN 0 AND 100);

-- бойцы: специализация, усталость, связки, инструкторы
ALTER TABLE soldiers
  ADD COLUMN spec TEXT,
  ADD COLUMN fatigue INT NOT NULL DEFAULT 0,
  ADD COLUMN fatigue_at TIMESTAMPTZ,
  ADD COLUMN bonds JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN instructor BOOLEAN NOT NULL DEFAULT false;

-- чертежи деталей и модели дронов (одна модель на класс операторов)
CREATE TABLE blueprints (
  user_id    BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  part       TEXT NOT NULL,
  source     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, part)
);
CREATE TABLE drone_models (
  user_id    BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  cls        TEXT NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  parts      JSONB NOT NULL,
  durability INT NOT NULL DEFAULT 100 CHECK (durability BETWEEN 0 AND 100),
  built_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cls)
);

-- передовые пункты
CREATE TABLE outposts (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  sector_id  INT NOT NULL,
  level      INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 0 AND 5),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  built_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sector_id)
);

-- сюжетная кампания: { step, flags, done }
ALTER TABLE players ADD COLUMN campaign JSONB NOT NULL DEFAULT '{"step":0,"flags":{}}'::jsonb;
