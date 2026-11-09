import { useEffect } from "react";
import { useLocation } from "wouter";

/* Old address — IT chats moved to ITSM › IT Chats. */
export default function AgentChats() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(`/itsm-chats${window.location.search}`, { replace: true }); }, []);
  return null;
}
