import { useEffect, useRef } from "react";
import styles from "./EstimateLayer.module.css";
import { NX } from "./geometry";

const MIN_ALPHA = 0.3; // 最も古い秒の不透明度

// 各秒で存在確率が最大のセル（同値なら全て）を青で塗る。新しい秒ほど濃く、同じセルは新しい秒の色で上書きする。
// 濃さの段階は from〜to の秒数分（frames は ts の昇順）
export default function RouteLayer({ frames, from, to }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, NX, NX);
    const image = ctx.createImageData(NX, NX);
    const steps = to - from;
    for (const { ts, map_q: q } of frames) {
      const max = Math.max(...q);
      if (max === 0) continue;
      const age = steps > 1 ? (Math.floor(ts) - from) / (steps - 1) : 1;
      const alpha = Math.round(255 * (MIN_ALPHA + (1 - MIN_ALPHA) * age));
      q.forEach((v, i) => {
        if (v !== max) return;
        // セル (ix, iy) は iy が南から北へ増えるので、上が北になるよう行を 59-iy にする
        const p = ((NX - 1 - Math.floor(i / NX)) * NX + (i % NX)) * 4;
        image.data[p + 2] = 255;
        image.data[p + 3] = alpha;
      });
    }
    ctx.putImageData(image, 0, 0);
  }, [frames, from, to]);

  return (
    <div className={styles.layer}>
      <canvas ref={canvasRef} className={styles.canvas} width={NX} height={NX} />
    </div>
  );
}
