-- Награды за особые заслуги, которые выдаёт сайт «Учёт дронов»

ALTER TABLE equipment DROP CONSTRAINT IF EXISTS equipment_rarity_check;
ALTER TABLE equipment ADD CONSTRAINT equipment_rarity_check CHECK (rarity IN ('common', 'improved', 'rare', 'award'));

CREATE TABLE awards (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  award       TEXT NOT NULL,
  count       INT NOT NULL DEFAULT 1 CHECK (count BETWEEN 1 AND 50),
  reason      TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL,
  external_id TEXT,
  seen        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- один и тот же внешний идентификатор не выдаст награду дважды
CREATE UNIQUE INDEX awards_external_idx ON awards(source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX awards_user_idx ON awards(user_id, created_at DESC);
