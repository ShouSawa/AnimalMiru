import { checkOk } from "../estimate/configApi";

// 保存されている正解経路を新しい順に取得する: { routes }
export async function fetchRoutes() {
  return (await checkOk(await fetch("/api/routes"))).json();
}

// 正解経路を1件保存する（同じタイトルは上書き）: { route_id, overwritten }
export async function postRoute(route) {
  const res = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });
  return (await checkOk(res)).json();
}

export async function deleteRoute(routeId) {
  await checkOk(await fetch(`/api/routes?id=${routeId}`, { method: "DELETE" }));
}
