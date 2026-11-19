\set ON_ERROR_STOP on
BEGIN;
-- 初期設定(config_id=1)．パラメータは既定値(DEFAULT)を使う．
-- noise_floor / upper_level は仮の値(20 / 120)．実測の雑音と最大反応に合わせて自分で設定すること．
-- 設定を変えるときは UPDATE せず，clone_estimator_config() で新しい config_id を作る．
INSERT INTO estimator_config (name, note) VALUES ('初期値', '初期設定．n_k=20, u_k=120 は仮の値');
INSERT INTO estimator_sensor (config_id, sensor_no, noise_floor, upper_level)
SELECT (SELECT config_id FROM estimator_config WHERE name = '初期値'), g, 20, 120
FROM generate_series(1, 12) AS g;
COMMIT;
