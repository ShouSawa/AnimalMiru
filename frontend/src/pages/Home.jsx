export default function Home() {
  // テストフィールドの仮ノード座標（後から実測値に差し替え可能）
  const nodes = [
    { node_id: "0002", label: "ノードA", top: "20%", left: "20%" },
    { node_id: "0003", label: "ノードB", top: "20%", left: "75%" },
    { node_id: "0004", label: "ノードC", top: "70%", left: "20%" },
    { node_id: "0005", label: "ノードD", top: "70%", left: "75%" },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <h2>テストフィールド - 行動経路表示</h2>

      {/* 地図エリア：後からLeafletに差し替える四角いプレースホルダー */}
      <div style={{
        position: "relative",
        width: "100%",
        height: "500px",
        background: "#e8f5e9",       /* 薄い緑（フィールドのイメージ） */
        border: "2px solid #2d6a4f",
        borderRadius: "8px",
        marginTop: "16px",
      }}>

        {/* 仮ラベル（Leaflet導入後に削除） */}
        <span style={{
          position: "absolute",
          top: "8px", left: "12px",
          color: "#888", fontSize: "13px",
        }}>
          ※ この領域は後からLeaflet地図に差し替えます
        </span>

        {/* センサノードのピン */}
        {nodes.map((node) => (
          <div
            key={node.node_id}
            style={{
              position: "absolute",
              top: node.top,
              left: node.left,
              transform: "translate(-50%, -50%)",
              background: "#2d6a4f",
              color: "white",
              borderRadius: "50%",
              width: "48px",
              height: "48px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              fontWeight: "bold",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              cursor: "pointer",
            }}
          >
            📡
            <span>{node.node_id}</span>
          </div>
        ))}
      </div>

      {/* ノード一覧 */}
      <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
        {nodes.map((node) => (
          <div key={node.node_id} style={{
            padding: "12px 16px",
            background: "#f1f8f4",
            border: "1px solid #2d6a4f",
            borderRadius: "8px",
            minWidth: "120px",
          }}>
            <div style={{ fontWeight: "bold" }}>{node.label}</div>
            <div style={{ fontSize: "13px", color: "#555" }}>{node.node_id}</div>
          </div>
        ))}
      </div>
    </div>
  );
}