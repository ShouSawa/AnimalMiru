import { useEffect, useState } from "react";
import styles from "./ConfigPanel.module.css";
import ConfigField from "./ConfigField";
import { CONFIG_FIELDS, SENSOR_FIELDS, parseFieldValue, sensorValue } from "./configFields";
import { fetchConfigs, postActive, postConfig } from "./configApi";

// 経路推定のパラメータ（estimator_config と estimator_sensor）の表示・編集・使用する設定番号の選択
export default function ConfigPanel() {
  const [data, setData] = useState({ active_config_id: null, configs: [] });
  // 編集中の属性だけが入る: { 属性名: 入力中の文字列 }
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () =>
    fetchConfigs()
      .then(setData)
      .catch((err) => {
        console.error("推定設定の取得失敗:", err);
        setMessage("推定設定を取得できませんでした");
      });

  useEffect(() => {
    reload();
  }, []);

  const current = data.configs.find((c) => c.config_id === data.active_config_id);

  const run = async (action) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setDrafts({});
      await reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = (e) =>
    run(async () => {
      const id = Number(e.target.value);
      await postActive(id);
      setMessage(`config_id=${id} の設定で推定します`);
    });

  const handleUpdate = () =>
    run(async () => {
      const values = { ...current, sensors: current.sensors.map((s) => ({ ...s })) };
      for (const field of CONFIG_FIELDS) {
        if (drafts[field.key] !== undefined) values[field.key] = parseFieldValue(field, drafts[field.key]);
      }
      for (const field of SENSOR_FIELDS) {
        if (drafts[field.key] === undefined) continue;
        values.sensors.find((s) => s.sensor_no === field.sensorNo)[field.column] = parseFieldValue(
          field,
          drafts[field.key]
        );
      }
      if (
        CONFIG_FIELDS.every((f) => values[f.key] === current[f.key]) &&
        SENSOR_FIELDS.every((f) => sensorValue(values, f) === sensorValue(current, f))
      ) {
        throw new Error("変更がありません");
      }
      const result = await postConfig(values);
      setMessage(
        result.created
          ? `config_id=${result.config_id} を追加して、この設定で推定します`
          : `同じ設定が config_id=${result.config_id} にあるため、それを使用します`
      );
    });

  const setDraft = (key, text) => setDrafts((prev) => ({ ...prev, [key]: text }));
  const cancelDraft = (key) =>
    setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>パラメータ調整エリア</div>
        <button className={styles.updateButton} disabled={busy || !current} onClick={handleUpdate}>
          更新
        </button>
      </div>

      {current && (
        <div className={styles.columns}>
          <div>
            <div className={styles.subtitle}>estimator_config</div>
            <div className={styles.row}>
              <div className={styles.label}>設定番号（config_id）</div>
              <span className={styles.value}>{current.config_id}</span>
            </div>
            <div className={styles.row}>
              <div className={styles.label}>作成日時</div>
              <span className={styles.value}>{new Date(current.created_at).toLocaleString("ja-JP")}</span>
            </div>
            <div className={styles.row}>
              <div className={styles.label}>推定に使う設定番号</div>
              <select className={styles.select} value={current.config_id} disabled={busy} onChange={handleSelect}>
                {data.configs.map((c) => (
                  <option key={c.config_id} value={c.config_id}>
                    {c.config_id}: {c.name}
                  </option>
                ))}
              </select>
            </div>
            {CONFIG_FIELDS.map((field) => (
              <ConfigField
                key={field.key}
                field={field}
                value={current[field.key]}
                draft={drafts[field.key]}
                onEdit={() => setDraft(field.key, String(current[field.key] ?? ""))}
                onChange={(text) => setDraft(field.key, text)}
                onCancel={() => cancelDraft(field.key)}
              />
            ))}
          </div>
          <div>
            <div className={styles.subtitle}>estimator_sensor</div>
            {SENSOR_FIELDS.map((field) => (
              <ConfigField
                key={field.key}
                field={field}
                value={sensorValue(current, field)}
                draft={drafts[field.key]}
                onEdit={() => setDraft(field.key, String(sensorValue(current, field)))}
                onChange={(text) => setDraft(field.key, text)}
                onCancel={() => cancelDraft(field.key)}
              />
            ))}
          </div>
        </div>
      )}
      {message && <div className={styles.message}>{message}</div>}
    </div>
  );
}
