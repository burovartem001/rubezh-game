-- Шевроны: коллекция игрока и носимый шеврон (виден другим игрокам)
-- Старый столбец players.insignia больше не используется; данные не удаляем.

ALTER TABLE players ADD COLUMN chevron TEXT NOT NULL DEFAULT 'polygon';

CREATE TABLE player_chevrons (
  user_id    BIGINT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  chevron    TEXT NOT NULL,
  source     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chevron)
);

-- стартовые шевроны — всем существующим игрокам
INSERT INTO player_chevrons(user_id, chevron, source) SELECT user_id, 'polygon', 'start' FROM players ON CONFLICT DO NOTHING;
INSERT INTO player_chevrons(user_id, chevron, source) SELECT user_id, 'platoon', 'start' FROM players ON CONFLICT DO NOTHING;

CREATE INDEX players_xp_idx ON players(cmd_xp DESC);
