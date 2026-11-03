import styles from "./SensorRanges.module.css";

const FIELD_SIZE_M = 30; // 地図の一辺
const RANGE_M = 10; // 赤外線焦電センサの検知距離
const FOV_DEG = 144; // 赤外線焦電センサの検知角度
const FILL_OPACITY = 0.1;
// 地図の一辺を 100 としたときの検知距離
const RANGE_PERCENT = (RANGE_M / FIELD_SIZE_M) * 100;

// 中心(x, y)から angle（東を0°とした反時計回り）の向きに開く扇形のpath。座標は地図に対する割合(0〜100)
function sectorPath(x, y, angle) {
  const point = (deg) => {
    const rad = (deg * Math.PI) / 180;
    // 画面のy軸は下向きなので、sinの符号を反転する
    return `${x + RANGE_PERCENT * Math.cos(rad)} ${y - RANGE_PERCENT * Math.sin(rad)}`;
  };
  // 扇形の端から端へ反時計回り(sweep-flag=0)に円弧を描く。検知角度は180°未満なので large-arc-flag=0
  return `M${x} ${y} L${point(angle - FOV_DEG / 2)} A${RANGE_PERCENT} ${RANGE_PERCENT} 0 0 0 ${point(angle + FOV_DEG / 2)} Z`;
}

// sectors: [{ top, left, angle, color }, ...]（top, left は "33%" のような地図に対する割合）
export default function SensorRanges({ sectors }) {
  return (
    <svg className={styles.ranges} viewBox="0 0 100 100" preserveAspectRatio="none">
      {sectors.map(({ top, left, angle, color }, i) => (
        <path key={i} d={sectorPath(parseFloat(left), parseFloat(top), angle)} fill={color} fillOpacity={FILL_OPACITY} />
      ))}
    </svg>
  );
}
