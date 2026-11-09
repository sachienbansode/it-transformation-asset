import { useEffect } from "react";
import { useLocation } from "wouter";

/* Old address — everything is under Chats now. */
export default function Redirect() {
  const [, navigate] = useLocation();
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (window.location.pathname.startsWith("/itsm") || window.location.pathname.startsWith("/asset-agents")) q.set("box", q.get("box") || "support"); navigate(`/chats?${q}`, { replace: true }); }, []);
  return null;
}
