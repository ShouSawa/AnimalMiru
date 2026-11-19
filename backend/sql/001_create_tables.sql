\set ON_ERROR_STOP on
BEGIN;

-- 1) 設定(1行=1つの計算条件．作った行は書き換えず，変えるときは新しい行を作る)
CREATE TABLE estimator_config (
  config_id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text        NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  code_version    text,
  note            text,
  -- 格子
  grid_nx         smallint NOT NULL DEFAULT 60   CHECK (grid_nx > 0),
  grid_ny         smallint NOT NULL DEFAULT 60   CHECK (grid_ny > 0),
  cell_size_m     real     NOT NULL DEFAULT 0.5  CHECK (cell_size_m > 0),
  grid_x_min_m    real     NOT NULL DEFAULT -15.0,
  grid_y_min_m    real     NOT NULL DEFAULT -15.0,
  map_encoding    smallint NOT NULL DEFAULT 1    CHECK (map_encoding IN (1, 2)),
  -- 時間
  window_sec      smallint NOT NULL DEFAULT 1    CHECK (window_sec > 0),
  delay_sec       real     NOT NULL DEFAULT 3.0  CHECK (delay_sec >= 0),
  min_samples     smallint NOT NULL DEFAULT 5    CHECK (min_samples > 0),
  active_thresh_v real     NOT NULL DEFAULT 0.7  CHECK (active_thresh_v > 0),
  -- センサのモデル
  fov_half_deg    real     NOT NULL DEFAULT 72   CHECK (fov_half_deg > 0 AND fov_half_deg <= 90),
  range_m         real     NOT NULL DEFAULT 10   CHECK (range_m > 0),
  d0_m            real     NOT NULL DEFAULT 8    CHECK (d0_m > 0),
  sigma_obs       real     NOT NULL DEFAULT 0.3  CHECK (sigma_obs > 0),
  epsilon         real     NOT NULL DEFAULT 0.1  CHECK (epsilon >= 0 AND epsilon <= 1),
  beta            real     NOT NULL DEFAULT 0.7  CHECK (beta > 0 AND beta <= 1),
  -- 動き
  sigma_move_m    real     NOT NULL DEFAULT 2.0  CHECK (sigma_move_m > 0),
  quiet_reset_sec smallint          DEFAULT 30   CHECK (quiet_reset_sec > 0)  -- NULL=リセットしない
);

-- 2) センサごとの n_k(雑音下限), u_k(反応1.0とみなす上限)
CREATE TABLE estimator_sensor (
  config_id    integer  NOT NULL REFERENCES estimator_config (config_id) ON DELETE CASCADE,
  sensor_no    smallint NOT NULL CHECK (sensor_no BETWEEN 1 AND 12),
  noise_floor  real     NOT NULL CHECK (noise_floor >= 0),
  upper_level  real     NOT NULL,
  PRIMARY KEY (config_id, sensor_no),
  CHECK (upper_level > noise_floor)
);

-- 3) 推定結果(1行=1秒窓)
CREATE TABLE estimation_result (
  config_id    integer       NOT NULL REFERENCES estimator_config (config_id),
  ts           timestamptz(3) NOT NULL,
  update_type  smallint      NOT NULL CHECK (update_type IN (0, 1)),
  node_mask    smallint      NOT NULL CHECK (node_mask BETWEEN 0 AND 15),
  active       boolean       NOT NULL,
  est_x        real,
  est_y        real,
  mean_x       real,
  mean_y       real,
  p_max        real          CHECK (p_max BETWEEN 0 AND 100),
  radius90     real          CHECK (radius90 >= 0),
  entropy      real          CHECK (entropy >= 0),
  n_sensors    smallint      NOT NULL CHECK (n_sensors BETWEEN 0 AND 12),
  active_sum   real          CHECK (active_sum >= 0),
  s_01 smallint CHECK (s_01 BETWEEN 0 AND 100),
  s_02 smallint CHECK (s_02 BETWEEN 0 AND 100),
  s_03 smallint CHECK (s_03 BETWEEN 0 AND 100),
  s_04 smallint CHECK (s_04 BETWEEN 0 AND 100),
  s_05 smallint CHECK (s_05 BETWEEN 0 AND 100),
  s_06 smallint CHECK (s_06 BETWEEN 0 AND 100),
  s_07 smallint CHECK (s_07 BETWEEN 0 AND 100),
  s_08 smallint CHECK (s_08 BETWEEN 0 AND 100),
  s_09 smallint CHECK (s_09 BETWEEN 0 AND 100),
  s_10 smallint CHECK (s_10 BETWEEN 0 AND 100),
  s_11 smallint CHECK (s_11 BETWEEN 0 AND 100),
  s_12 smallint CHECK (s_12 BETWEEN 0 AND 100),
  map_z        bytea,
  computed_at  timestamptz(3) NOT NULL,
  event_id     integer,
  PRIMARY KEY (config_id, ts)
);

-- map_z は圧縮済みなので，TOASTでの再圧縮を避ける
ALTER TABLE estimation_result ALTER COLUMN map_z SET STORAGE EXTERNAL;

COMMIT;
