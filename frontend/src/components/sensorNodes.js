import { toLeftPct, toTopPct } from "../estimate/geometry";

// DBから取得できないときに使う、隣り合うノードの間隔[m]
export const DEFAULT_NODE_SPACING_M = 10;

// 各ノードがフィールドの中心から見てどちらにあるか [x, y]（東が+x、北が+y）
const NODE_DIRECTIONS = {
  "0002": [1, 1],
  "0003": [1, -1],
  "0004": [-1, -1],
  "0005": [-1, 1],
};

// ノード間隔が spacing[m] のときの、30m四方の地図上のノードの位置: { ノードID: { routeTop, routeLeft } }
export const nodeRoutePositions = (spacing) =>
  Object.fromEntries(
    Object.entries(NODE_DIRECTIONS).map(([nodeId, [x, y]]) => [
      nodeId,
      { routeTop: `${toTopPct((y * spacing) / 2)}%`, routeLeft: `${toLeftPct((x * spacing) / 2)}%` },
    ])
  );
