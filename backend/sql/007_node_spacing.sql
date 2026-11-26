\set ON_ERROR_STOP on
BEGIN;

-- 隣り合うセンサノードの間隔[m]．4ノードはフィールド中心を中央にした正方形の頂点に置く．既存の設定は10mになる
ALTER TABLE estimator_config
  ADD COLUMN node_spacing_m real NOT NULL DEFAULT 10 CHECK (node_spacing_m > 0 AND node_spacing_m <= 30);

-- 設定の複製にも node_spacing_m を引き継ぐ
CREATE OR REPLACE FUNCTION clone_estimator_config(src integer, new_name text, new_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE new_id integer;
BEGIN
  INSERT INTO estimator_config (
    name, note, code_version,
    grid_nx, grid_ny, cell_size_m, grid_x_min_m, grid_y_min_m, map_encoding,
    window_sec, delay_sec, min_samples, active_thresh_v,
    fov_half_deg, range_m, d0_m, sigma_obs, epsilon, beta,
    sigma_move_m, quiet_reset_sec, node_spacing_m)
  SELECT
    new_name, new_note, code_version,
    grid_nx, grid_ny, cell_size_m, grid_x_min_m, grid_y_min_m, map_encoding,
    window_sec, delay_sec, min_samples, active_thresh_v,
    fov_half_deg, range_m, d0_m, sigma_obs, epsilon, beta,
    sigma_move_m, quiet_reset_sec, node_spacing_m
  FROM estimator_config WHERE config_id = src
  RETURNING config_id INTO new_id;

  IF new_id IS NULL THEN
    RAISE EXCEPTION 'config_id=% は存在しません', src;
  END IF;

  INSERT INTO estimator_sensor (config_id, sensor_no, noise_floor, upper_level)
  SELECT new_id, sensor_no, noise_floor, upper_level
  FROM estimator_sensor WHERE config_id = src;

  RETURN new_id;
END $$;

COMMIT;
