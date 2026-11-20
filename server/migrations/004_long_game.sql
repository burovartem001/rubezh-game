-- Долгая игра: исследования, оборона, именные бойцы, рейтинг и сезоны, контракты, серия входов,
-- роты, набеги, престиж, привязка к сайту «Учёт дронов».

ALTER TABLE players
  ADD COLUMN prestige INT NOT NULL DEFAULT 0,
  ADD COLUMN login_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN last_login_day TEXT NOT NULL DEFAULT '',
  ADD COLUMN streak_claimed_day TEXT NOT NULL DEFAULT '',
  ADD COLUMN attacks_checked_at TIMESTAMPTZ,
  ADD COLUMN site_user_id TEXT UNIQUE,
  ADD COLUMN link_code TEXT,
  ADD COLUMN link_code_exp TIMESTAMPTZ;

INSERT INTO buildings(user_id, key, level) SELECT user_id, 'defense', 1 FROM players ON CONFLICT DO NOTHING;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_queue_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_queue_check CHECK (queue IN ('build', 'train', 'workshop', 'recovery', 'research'));

-- отчёты бывают и без похода: атака на полигон, набег на вас
ALTER TABLE reports ALTER COLUMN expedition_id DROP NOT NULL;

ALTER TABLE sectors ADD COLUMN control_at TIMESTAMPTZ;
UPDATE sectors SET control_at = now() WHERE control > 0;

ALTER TABLE expeditions ADD COLUMN target_id BIGINT;

CREATE TABLE research (
  user_id BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  done_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE soldiers (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  name          TEXT NOT NULL,
  trait         TEXT NOT NULL,
  xp            INT NOT NULL DEFAULT 0,
  level         INT NOT NULL DEFAULT 1,
  missions      INT NOT NULL DEFAULT 0,
  scars         INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'mission', 'wounded', 'recovering', 'lost', 'retired')),
  expedition_id BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  lost_at       TIMESTAMPTZ
);
CREATE INDEX soldiers_user_idx ON soldiers(user_id, status);

-- очки рейтинга по периодам: W<номер недели>, S<номер сезона>; counters — счётчики сюжета сезона
CREATE TABLE scores (
  user_id  BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  period   TEXT NOT NULL,
  points   INT NOT NULL DEFAULT 0,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, period)
);
CREATE INDEX scores_period_idx ON scores(period, points DESC);

-- недельные контракты
CREATE TABLE weekly (
  user_id  BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  week     TEXT NOT NULL,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed  JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, week)
);

-- роты
CREATE TABLE companies (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  tag        TEXT NOT NULL,
  motto      TEXT NOT NULL DEFAULT '',
  supplies   INT NOT NULL DEFAULT 0 CHECK (supplies >= 0),
  parts      INT NOT NULL DEFAULT 0 CHECK (parts >= 0),
  fuel       INT NOT NULL DEFAULT 0 CHECK (fuel >= 0),
  data       INT NOT NULL DEFAULT 0 CHECK (data >= 0),
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE company_members (
  user_id    BIGINT PRIMARY KEY REFERENCES players(user_id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX company_members_idx ON company_members(company_id);
CREATE TABLE company_log (
  id         BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  text       TEXT NOT NULL
);
CREATE INDEX company_log_idx ON company_log(company_id, at DESC);
-- еженедельный совместный штурм укрепрайона
CREATE TABLE company_ops (
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  week        TEXT NOT NULL,
  hp          INT NOT NULL,
  damage      INT NOT NULL DEFAULT 0,
  defeated_at TIMESTAMPTZ,
  PRIMARY KEY (company_id, week)
);
CREATE TABLE company_op_claims (
  company_id BIGINT NOT NULL,
  week       TEXT NOT NULL,
  user_id    BIGINT NOT NULL,
  PRIMARY KEY (company_id, week, user_id)
);
-- помощь в стройке и передачи со склада роты применяются при следующем входе получателя
CREATE TABLE company_helps (
  job_id     BIGINT NOT NULL,
  helper_id  BIGINT NOT NULL,
  target_id  BIGINT NOT NULL,
  seconds    INT NOT NULL,
  applied    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, helper_id)
);
CREATE INDEX company_helps_target_idx ON company_helps(target_id) WHERE NOT applied;
CREATE TABLE pending_grants (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  cost       JSONB NOT NULL,
  text       TEXT NOT NULL,
  applied    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pending_grants_idx ON pending_grants(user_id) WHERE NOT applied;

-- набеги: последствия для обороняющегося применяются при его следующем входе
CREATE TABLE pvp_hits (
  id                BIGSERIAL PRIMARY KEY,
  attacker_id       BIGINT NOT NULL,
  defender_id       BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  expedition_id     BIGINT UNIQUE,
  at                TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome           TEXT NOT NULL,
  loot              JSONB NOT NULL,
  attacker_callsign TEXT NOT NULL,
  attack_power      INT NOT NULL,
  defense           INT NOT NULL,
  applied           BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX pvp_hits_defender_idx ON pvp_hits(defender_id, at);
CREATE INDEX pvp_hits_attacker_idx ON pvp_hits(attacker_id, created_at);
