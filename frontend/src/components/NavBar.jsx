import { Link } from "react-router-dom";

export default function NavBar() {
  return (
    <nav style={{
      background: "#2d6a4f",
      padding: "12px 24px",
      display: "flex",
      gap: "24px",
      alignItems: "center",
    }}>
      <span style={{ color: "white", fontWeight: "bold", fontSize: "18px" }}>
        🦌 アニマルミル
      </span>
      <Link to="/"        style={{ color: "white", textDecoration: "none" }}>ホーム</Link>
      <Link to="/db" style={{ color: "white", textDecoration: "none" }}>DB</Link>
    </nav>
  );
}