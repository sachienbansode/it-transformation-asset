import React, { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ScreenShare } from "@/components/screen-share";

/* ITH-082 — IT's screen-share viewer in its own window (opened from the chat): full screen, take control, end / close. */
export default function ScreenSession() {
  const { chatId } = useParams<{ chatId: string }>(); const id = Number(chatId);
  const { data, error } = useQuery({ queryKey: ["chat", id], queryFn: () => apiFetch<any>(`/chats/${id}`), retry: false });
  const c = data?.chat;
  const title = c ? `${c.subject || "Screen session"}${c.userName ? ` — ${c.userName}` : ""}${c.hostname ? ` · ${c.hostname}` : ""}` : "Screen session";
  useEffect(() => { document.title = `Screen · ${title}`; }, [title]);
  if (error) return <div className="h-screen flex items-center justify-center bg-neutral-950 text-neutral-300 text-sm">{(error as Error).message}</div>;
  if (!data) return <div className="h-screen bg-neutral-950" />;
  if (data.role !== "it") return <div className="h-screen flex items-center justify-center bg-neutral-950 text-neutral-300 text-sm">Only the IT person on this chat can open the screen viewer.</div>;
  return <ScreenShare chatId={id} role="it" popup title={title} onClose={() => window.close()} />;
}
