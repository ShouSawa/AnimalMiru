async function checkOk(res) {
  if (!res.ok) throw new Error((await res.text()).trim() || `HTTP ${res.status}`);
  return res;
}

// 全設定を取得する（使用中の設定は main=true）: { configs }
export async function fetchConfigs() {
  return (await checkOk(await fetch("/api/estimator/configs"))).json();
}

// config_id を main にして、以降の推定に使う設定を切り替える
export async function postActive(configId) {
  await checkOk(
    await fetch("/api/estimator/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config_id: configId }),
    })
  );
}

// baseConfigId の12センサの較正値を引き継いで設定を追加し、main にする: { config_id, created }
export async function postConfig(baseConfigId, config) {
  const res = await fetch("/api/estimator/configs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_config_id: baseConfigId, config }),
  });
  return (await checkOk(res)).json();
}
