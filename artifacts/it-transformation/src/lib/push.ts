import { apiFetch } from "@/lib/api";

/* Browser push notifications: opt in per device. All in-app notifications (approvals, tickets, policies, devices) are pushed. */
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
const toKey = (b64: string) => { const p = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };

export async function pushStatus(): Promise<"unsupported" | "blocked" | "on" | "off"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}
export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser does not support push notifications (use Edge or Chrome over HTTPS).");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked for this site — allow them in the browser's site settings.");
  const { publicKey, enabled } = await apiFetch<any>("/push/key");
  if (!enabled) throw new Error("Push notifications are switched off by the administrator.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" }); await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  await apiFetch("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON() }) });
  return true;
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/"); const sub = await reg?.pushManager.getSubscription();
  if (sub) { await apiFetch("/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
}
