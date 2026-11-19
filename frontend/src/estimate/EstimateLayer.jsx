import { useEffect, useRef } from "react";
import styles from "./EstimateLayer.module.css";
import { FIELD_SIZE_M, NX, toLeftPct, toTopPct } from "./geometry";

// 存在確率を赤の濃淡（不透明度 = q/255）で重ねる。60×60のcanvasを地図いっぱいに拡大して表示する
export default function EstimateLayer({ frame }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, NX, NX);
    if (!frame?.map_q) return;
    const image = ctx.createImageData(NX, NX);
    frame.map_q.forEach((q, i) => {
      // セル (ix, iy) は iy が南から北へ増えるので、上が北になるよう行を 59-iy にする
      const p = ((NX - 1 - Math.floor(i / NX)) * NX + (i % NX)) * 4;
      image.data[p] = 255;
      image.data[p + 3] = q;
    });
    ctx.putImageData(image, 0, 0);
  }, [frame]);

  const diameterPct = frame ? ((2 * frame.radius90) / FIELD_SIZE_M) * 100 : 0;
  const pos = frame && { left: `${toLeftPct(frame.est_x)}%`, top: `${toTopPct(frame.est_y)}%` };

  return (
    <div className={styles.layer}>
      <canvas ref={canvasRef} className={styles.canvas} width={NX} height={NX} />
      {frame && (
        <>
          <div className={styles.radius} style={{ ...pos, width: `${diameterPct}%`, height: `${diameterPct}%` }} />
          <div className={styles.est} style={pos} />
        </>
      )}
    </div>
  );
}
