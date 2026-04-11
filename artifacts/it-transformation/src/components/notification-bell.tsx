import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Bell, BellRing, Check, CheckCheck, Info, AlertTriangle, AlertCircle, Trash2, X } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: number;
  userId: number | null;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: Check,
};

const TYPE_COLOR: Record<string, string> = {
  info: "text-blue-500",
  warning: "text-amber-500",
  error: "text-red-500",
  success: "text-green-500",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsResponse>({ notifications: [], unreadCount: 0 });
  const [, navigate] = useLocation();

  const fetchNotifications = useCallback(() => {
    apiFetch<NotificationsResponse>("/notifications")
      .then(d => setData(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const markRead = useCallback(async (id: number) => {
    await apiFetch(`/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
    setData(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));
  }, []);

  const markAllRead = useCallback(async () => {
    await apiFetch("/notifications/read-all", { method: "POST" }).catch(() => {});
    setData(prev => ({
      notifications: prev.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  }, []);

  const deleteNotification = useCallback(async (id: number) => {
    await apiFetch(`/notifications/${id}`, { method: "DELETE" }).catch(() => {});
    setData(prev => {
      const n = prev.notifications.find(x => x.id === id);
      return {
        notifications: prev.notifications.filter(x => x.id !== id),
        unreadCount: n && !n.read ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount,
      };
    });
  }, []);

  const handleClick = useCallback(async (n: Notification) => {
    if (!n.read) await markRead(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  }, [markRead, navigate]);

  const { notifications, unreadCount } = data;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
          title="Notifications"
        >
          {unreadCount > 0 ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-xs">No notifications</p>
            </div>
          ) : (
            notifications.slice(0, 20).map(n => {
              const Icon = TYPE_ICON[n.type] ?? Info;
              const iconColor = TYPE_COLOR[n.type] ?? "text-blue-500";
              return (
                <div
                  key={n.id}
                  className={cn(
                    "group flex gap-2.5 px-3 py-2.5 border-b border-border/50 transition-colors",
                    !n.read ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40",
                    n.link ? "cursor-pointer" : ""
                  )}
                  onClick={() => handleClick(n)}
                >
                  <div className={cn("flex-shrink-0 mt-0.5", iconColor)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-xs font-medium leading-snug", !n.read ? "text-foreground" : "text-muted-foreground")}>
                      {n.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                      {n.message}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read && (
                      <button
                        onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                        title="Mark as read"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); deleteNotification(n.id); }}
                      className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
