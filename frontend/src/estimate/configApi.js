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

// 設定（config.sensors に12センサ分の較正値を含む）を追加し、使用中にする: { config_id, created }
export async function postConfig(config) {
  const res = await fetch("/api/estimator/configs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return (await checkOk(res)).json();
}
