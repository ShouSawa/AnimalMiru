import styles from "./ConfigPanel.module.css";

// 1つの属性の行。「編集」を押すとテキストボックスが出て、値を変更できる
export default function ConfigField({ field, value, draft, onEdit, onChange, onCancel }) {
  const editing = draft !== undefined;
  return (
    <div className={styles.row}>
      <div className={styles.label}>
        {field.label}
        <span className={styles.caption}>
          {field.column ?? field.key} · {field.type}
        </span>
      </div>
      {editing ? (
        <input
          className={styles.input}
          value={draft}
          placeholder={field.nullable ? "空欄でなし" : ""}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      ) : (
        <span className={styles.value}>{value ?? "（なし）"}</span>
      )}
      <button className={styles.editButton} onClick={editing ? onCancel : onEdit}>
        {editing ? "取消" : "編集"}
      </button>
    </div>
  );
}
