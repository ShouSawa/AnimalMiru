\set ON_ERROR_STOP on
BEGIN;

-- 正解経路の上書き保存と削除をアプリ用ユーザーに許可する
GRANT UPDATE, DELETE ON ground_truth_route TO animalmiru_user;

COMMIT;
