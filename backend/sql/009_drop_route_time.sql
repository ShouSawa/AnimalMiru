\set ON_ERROR_STOP on
BEGIN;

-- 正解経路は通過点と開始からの秒だけを持てばよいため，記録開始・終了時間の列を削除する
-- (2列を参照する CHECK 制約も一緒に削除される)
ALTER TABLE ground_truth_route
  DROP COLUMN start_time,
  DROP COLUMN end_time;

COMMIT;
