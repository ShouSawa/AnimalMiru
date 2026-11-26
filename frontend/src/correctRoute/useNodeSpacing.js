import { useEffect, useState } from "react";
import { DEFAULT_NODE_SPACING_M } from "../components/sensorNodes";
import { fetchConfigs } from "../estimate/configApi";

// 使用中（main=true）の推定設定のノード間隔[m]を返す。取得できないときは既定値
export default function useNodeSpacing() {
  const [spacing, setSpacing] = useState(DEFAULT_NODE_SPACING_M);

  useEffect(() => {
    fetchConfigs()
      .then(({ configs }) => setSpacing(configs.find((c) => c.main)?.node_spacing_m ?? DEFAULT_NODE_SPACING_M))
      .catch((err) => console.error("ノード間隔の取得失敗:", err));
  }, []);

  return spacing;
}
