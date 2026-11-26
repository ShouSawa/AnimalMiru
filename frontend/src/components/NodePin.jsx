import styles from "./NodePin.module.css";

// 地図上の (top, left) に置くセンサノードのピン
export default function NodePin({ nodeId, top, left }) {
  return (
    <div className={styles.nodePin} style={{ "--top": top, "--left": left }}>
      <img className={styles.nodePinImage} src={`/Sensornode${nodeId}.png`} alt={nodeId} />
      <span className={styles.nodePinLabel}>{nodeId}</span>
    </div>
  );
}
