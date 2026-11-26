\set ON_ERROR_STOP on
BEGIN;

-- 正解経路(1行=1経路)
-- waypoints は [ix, iy, 秒] を通過順に並べた配列．
-- ix(西→東), iy(南→北)は推定と同じ60×60格子のセル番号(0-59)，秒は start_time からの経過時間
CREATE TABLE ground_truth_route (
  route_id     integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        text        NOT NULL CHECK (title <> ''),
  start_time   timestamptz NOT NULL,
  end_time     timestamptz NOT NULL CHECK (end_time >= start_time),
  target       text        NOT NULL CHECK (target IN ('人', 'シカ', 'サル', 'イノシシ')),
  memo         text        NOT NULL DEFAULT '',
  interval_sec integer     NOT NULL CHECK (interval_sec >= 0),
  waypoints    jsonb       NOT NULL CHECK (jsonb_typeof(waypoints) = 'array' AND jsonb_array_length(waypoints) > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- アプリ用ユーザーには追加と参照だけを許可する
GRANT SELECT, INSERT ON ground_truth_route TO animalmiru_user;

COMMIT;
