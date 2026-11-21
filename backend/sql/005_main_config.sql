\set ON_ERROR_STOP on
BEGIN;

-- 経路推定に使う設定を main=true で示す．true にできるのは1行だけ(部分一意インデックス)
ALTER TABLE estimator_config ADD COLUMN main boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX estimator_config_main_key ON estimator_config (main) WHERE main;

-- 使用済みの設定でも name・note に加えて main は変更できるようにする
CREATE OR REPLACE FUNCTION forbid_change_if_used() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid integer;
BEGIN
  IF TG_TABLE_NAME = 'estimator_config' AND TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'name' - 'note' - 'main') = (to_jsonb(OLD) - 'name' - 'note' - 'main') THEN
    RETURN NEW;
  END IF;

  cid := CASE WHEN TG_OP = 'INSERT' THEN NEW.config_id ELSE OLD.config_id END;
  IF EXISTS (SELECT 1 FROM estimation_result WHERE config_id = cid) THEN
    RAISE EXCEPTION 'config_id=% は推定結果で使用済みのため変更できません．clone_estimator_config() で新しい設定を作ってください', cid;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- アプリ(画面)から main を付け替えるため，main 列だけ UPDATE を許可する
GRANT UPDATE (main) ON estimator_config TO animalmiru_user;

-- 初期設定(config_id=1)を main にする
UPDATE estimator_config SET main = true WHERE config_id = 1;

COMMIT;
