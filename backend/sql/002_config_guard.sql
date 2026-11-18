\set ON_ERROR_STOP on
BEGIN;

-- 設定(estimator_config + estimator_sensor 12行)を複製し，新しい config_id を返す
CREATE FUNCTION clone_estimator_config(src integer, new_name text, new_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE new_id integer;
BEGIN
  INSERT INTO estimator_config (
    name, note, code_version,
    grid_nx, grid_ny, cell_size_m, grid_x_min_m, grid_y_min_m, map_encoding,
    window_sec, delay_sec, min_samples, active_thresh_v,
    fov_half_deg, range_m, d0_m, sigma_obs, epsilon, beta,
    sigma_move_m, quiet_reset_sec)
  SELECT
    new_name, new_note, code_version,
    grid_nx, grid_ny, cell_size_m, grid_x_min_m, grid_y_min_m, map_encoding,
    window_sec, delay_sec, min_samples, active_thresh_v,
    fov_half_deg, range_m, d0_m, sigma_obs, epsilon, beta,
    sigma_move_m, quiet_reset_sec
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

-- 推定結果で使用済みの config_id は変更させない(name と note の修正だけは許可)
CREATE FUNCTION forbid_change_if_used() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid integer;
BEGIN
  IF TG_TABLE_NAME = 'estimator_config' AND TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'name' - 'note') = (to_jsonb(OLD) - 'name' - 'note') THEN
    RETURN NEW;
  END IF;

  cid := CASE WHEN TG_OP = 'INSERT' THEN NEW.config_id ELSE OLD.config_id END;
  IF EXISTS (SELECT 1 FROM estimation_result WHERE config_id = cid) THEN
    RAISE EXCEPTION 'config_id=% は推定結果で使用済みのため変更できません．clone_estimator_config() で新しい設定を作ってください', cid;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER trg_config_guard BEFORE UPDATE ON estimator_config
  FOR EACH ROW EXECUTE FUNCTION forbid_change_if_used();
CREATE TRIGGER trg_sensor_guard BEFORE INSERT OR UPDATE OR DELETE ON estimator_sensor
  FOR EACH ROW EXECUTE FUNCTION forbid_change_if_used();

COMMIT;
