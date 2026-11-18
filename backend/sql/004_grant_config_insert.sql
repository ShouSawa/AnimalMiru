\set ON_ERROR_STOP on
-- 画面のパラメータ調整エリアから設定を追加するために，アプリ用ユーザーへ INSERT を許可する．
-- UPDATE は許可しない(作った行は書き換えない方針．IDENTITYのシーケンス権限は不要)．
GRANT INSERT ON estimator_config, estimator_sensor TO animalmiru_user;
