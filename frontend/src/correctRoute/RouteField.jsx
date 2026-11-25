import { useEffect, useRef } from "react";
import styles from "./RouteField.module.css";
import MapGrid from "../components/MapGrid";
import { NX } from "../estimate/geometry";
import { rainbowColor } from "./waypoints";

// フィールドをタップしたセル (ix, iy) を onTap で伝える。points（{ ix, iy }、通過順）のセルを虹色に塗り、薄い赤線でつなぐ。
// セルは推定と同じく ix が西→東、iy が南→北に増える
export default function RouteField({ points, onTap }) {
  const canvasRef = useRef(null);

  // 60×60のcanvasの1ピクセルを1セルとして塗る。同じセルは後から塗った色で上書きされる
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, NX, NX);
    points.forEach(({ ix, iy }, i) => {
      ctx.fillStyle = rainbowColor(i);
      // canvasは上が北になるよう、行を 59-iy にする
      ctx.fillRect(ix, NX - 1 - iy, 1, 1);
    });
  }, [points]);

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ix = Math.floor(((e.clientX - rect.left) / rect.width) * NX);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * NX);
    onTap(ix, NX - 1 - row);
  };

  // 線はセルの中心を結ぶ（viewBox を 0〜100 にして、地図の大きさに関係なく%で指定する）
  const linePoints = points
    .map(({ ix, iy }) => `${((ix + 0.5) / NX) * 100},${((NX - 1 - iy + 0.5) / NX) * 100}`)
    .join(" ");

  return (
    <div className={styles.mapArea}>
      <MapGrid />
      <div className={styles.tapLayer} onClick={handleClick}>
        <canvas ref={canvasRef} className={styles.canvas} width={NX} height={NX} />
      </div>
      <svg className={styles.line} viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={linePoints} />
      </svg>
    </div>
  );
}
