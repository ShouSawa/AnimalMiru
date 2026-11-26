import { checkOk } from "../estimate/configApi";

// 正解経路を1件保存する: { route_id }
export async function postRoute(route) {
  const res = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });
  return (await checkOk(res)).json();
}
