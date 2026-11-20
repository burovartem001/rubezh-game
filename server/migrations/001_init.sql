-- «Рубеж»: начальная схема

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- Полигон и командир: одна строка на игрока, служит замком для всех игровых действий
CREATE TABLE players (
  user_id         BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  callsign        TEXT NOT NULL,
  commander_name  TEXT NOT NULL,
  portrait        INT NOT NULL DEFAULT 0,
  insignia        INT NOT NULL DEFAULT 0,
  supplies        DOUBLE PRECISION NOT NULL CHECK (supplies >= 0),
  parts           DOUBLE PRECISION NOT NULL CHECK (parts >= 0),
  fuel            DOUBLE PRECISION NOT NULL CHECK (fuel >= 0),
  data            DOUBLE PRECISION NOT NULL CHECK (data >= 0),
  res_updated_at  TIMESTAMPTZ NOT NULL,
  tutorial_step   INT NOT NULL DEFAULT 0,
  cmd_xp          INT NOT NULL DEFAULT 0,
  cmd_level       INT NOT NULL DEFAULT 1,
  skills          JSONB NOT NULL DEFAULT '{}'::jsonb,
  free_reset_used BOOLEAN NOT NULL DEFAULT false,
  stats           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE buildings (
  user_id BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  level   INT NOT NULL CHECK (level BETWEEN 1 AND 10),
  PRIMARY KEY (user_id, key)
);

-- Количества операторов по типам: доступны / в походе / ранены / на восстановлении
CREATE TABLE operators (
  user_id     BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  available   INT NOT NULL DEFAULT 0 CHECK (available >= 0),
  on_mission  INT NOT NULL DEFAULT 0 CHECK (on_mission >= 0),
  wounded     INT NOT NULL DEFAULT 0 CHECK (wounded >= 0),
  recovering  INT NOT NULL DEFAULT 0 CHECK (recovering >= 0),
  lost_total  INT NOT NULL DEFAULT 0 CHECK (lost_total >= 0),
  trained     INT NOT NULL DEFAULT 0,
  rank        INT NOT NULL DEFAULT 1 CHECK (rank BETWEEN 1 AND 5),
  PRIMARY KEY (user_id, type)
);

CREATE TABLE vehicles (
  user_id BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  type    TEXT NOT NULL,
  level   INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  status  TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'mission', 'damaged', 'workshop')),
  PRIMARY KEY (user_id, type)
);

CREATE TABLE equipment (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  rarity     TEXT NOT NULL CHECK (rarity IN ('common', 'improved', 'rare')),
  level      INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  status     TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'mission')),
  source     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX equipment_user_idx ON equipment(user_id);

-- Очереди: строительство, обучение, мастерская, восстановление
CREATE TABLE jobs (
  id       BIGSERIAL PRIMARY KEY,
  user_id  BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  queue    TEXT NOT NULL CHECK (queue IN ('build', 'train', 'workshop', 'recovery')),
  kind     TEXT NOT NULL,
  payload  JSONB NOT NULL,
  cost     JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_at TIMESTAMPTZ NOT NULL,
  end_at   TIMESTAMPTZ NOT NULL,
  done     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX jobs_active_idx ON jobs(user_id) WHERE NOT done;

CREATE TABLE sectors (
  user_id   BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  sector_id INT NOT NULL,
  recon     INT NOT NULL DEFAULT 0 CHECK (recon BETWEEN 0 AND 100),
  control   INT NOT NULL DEFAULT 0 CHECK (control BETWEEN 0 AND 100),
  attempts  INT NOT NULL DEFAULT 0,
  successes INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, sector_id)
);

CREATE TABLE expeditions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  sector_id   INT NOT NULL,
  mission     TEXT NOT NULL,
  group_comp  JSONB NOT NULL,
  vehicle     TEXT NOT NULL,
  equipment   JSONB NOT NULL DEFAULT '[]'::jsonb,
  cost        JSONB NOT NULL,
  plan        JSONB NOT NULL,
  result      JSONB NOT NULL, -- рассчитывается при отправке с фиксированным случайным фактором, раскрывается по завершении
  seed        BIGINT NOT NULL,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done'))
);
CREATE INDEX expeditions_active_idx ON expeditions(user_id) WHERE status = 'active';

-- Отчёты: один отчёт на поход — защищает от повторной выдачи награды
CREATE TABLE reports (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  expedition_id BIGINT NOT NULL UNIQUE REFERENCES expeditions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL,
  is_read       BOOLEAN NOT NULL DEFAULT false,
  body          JSONB NOT NULL
);
CREATE INDEX reports_user_idx ON reports(user_id, created_at DESC);

-- Идемпотентность игровых действий: повтор запроса с тем же request_id возвращает прежний ответ
CREATE TABLE action_log (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  response   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);

CREATE TABLE daily (
  user_id  BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed  JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, day)
);
