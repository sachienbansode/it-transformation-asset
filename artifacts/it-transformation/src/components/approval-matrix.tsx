import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { CheckCircle2, XCircle, Clock, ChevronRight, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const STATUS_STYLES: Record<string, { icon: any; bg: string; text: string; badge: string }> = {
  Pending: { icon: Clock, bg: "bg-amber-50 dark:bg-amber-900/10", text: "text-amber-600", badge: "border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-400/10" },
  Approved: { icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-900/10", text: "text-emerald-600", badge: "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-400/10" },
  Rejected: { icon: XCircle, bg: "bg-red-50 dark:bg-red-900/10", text: "text-red-600", badge: "border-red-500/30 text-red-600 bg-red-50 dark:bg-red-400/10" },
};

interface ApprovalMatrixProps {
  ticketId: number;
  ticketType: string;
  readonly?: boolean;
}

export function ApprovalMatrix({ ticketId, ticketType, readonly = false }: ApprovalMatrixProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, canAccess } = useAuth();
  const MOD: Record<string, string> = { "Incident": "itsm_incidents", "Problem": "itsm_problems", "Change Request": "itsm_changes", "Service Request": "itsm_requests" };
  const canApprove = canAccess(MOD[ticketType] || "", "admin");
  const [actionNotes, setActionNotes] = useState<Record<number, string>>({});

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["approvals", ticketType, ticketId],
    queryFn: () => apiFetch<any[]>(`/approvals/${ticketType}/${ticketId}`),
    enabled: !!ticketId,
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action, notes }: { id: number; action: string; notes?: string }) =>
      apiFetch(`/approvals/${id}/action`, {
        method: "POST",
        body: JSON.stringify({ action, notes }),
      }),
    onSuccess: (r: any) => {
      ["approvals", "changes", "changes-stats", "service-requests", "problems", "incidents"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast({ title: r?.ticketApproval === "Approved" ? "Fully approved — the ticket can now proceed" : r?.ticketApproval === "Rejected" ? "Rejected — the approval flow has ended" : "Approval recorded — passed to the next level" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="text-xs text-muted-foreground py-2">Loading approvals...</div>;
  if (approvals.length === 0) return null;

  const allApproved = approvals.every((a: any) => a.status === "Approved" || a.status === "Auto-Approved");
  const anyRejected = approvals.some((a: any) => a.status === "Rejected");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-[#2D7FF9]" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Approval Workflow</h4>
        {allApproved && <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-50 text-[10px]">All Approved</Badge>}
        {anyRejected && <Badge variant="outline" className="border-red-500/30 text-red-600 bg-red-50 text-[10px]">Rejected</Badge>}
        {!allApproved && !anyRejected && <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-50 text-[10px]">In Progress</Badge>}
      </div>

      <div className="flex items-start gap-0">
        {approvals.map((a: any, i: number) => {
          const style = STATUS_STYLES[a.status] || STATUS_STYLES.Pending;
          const Icon = style.icon;
          return (
            <React.Fragment key={a.id}>
              <div className={`flex-1 rounded-lg border p-3 ${style.bg} border-border/50`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`w-4 h-4 ${style.text}`} />
                  <span className="text-xs font-bold">{a.approverLevel}</span>
                  <Badge variant="outline" className={`${style.badge} text-[9px]`}>{a.status}</Badge>
                </div>
                <p className="text-[11px] font-medium">{a.approverRole}</p>
                {a.approverName && <p className="text-[10px] text-muted-foreground mt-0.5">By: {a.approverName}</p>}
                {a.actionAt && <p className="text-[10px] text-muted-foreground">{new Date(a.actionAt).toLocaleDateString()}</p>}
                {a.notes && <p className="text-[10px] text-muted-foreground mt-1 italic">"{a.notes}"</p>}

                {a.status === "Pending" && !a.isNext && <p className="text-[10px] text-muted-foreground mt-1">Waiting for the previous level</p>}
                {!readonly && a.status === "Pending" && a.isNext && !anyRejected && canApprove && (
                  <div className="mt-2 space-y-1.5">
                    <Input
                      className="h-7 text-xs"
                      placeholder="Notes (required to reject)"
                      value={actionNotes[a.id] || ""}
                      onChange={e => setActionNotes(p => ({ ...p, [a.id]: e.target.value }))}
                    />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => actionMut.mutate({ id: a.id, action: "Approved", notes: actionNotes[a.id] })}
                        disabled={actionMut.isPending}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-[10px]"
                        onClick={() => actionMut.mutate({ id: a.id, action: "Rejected", notes: actionNotes[a.id] })}
                        disabled={actionMut.isPending || (actionNotes[a.id] || "").trim().length < 5}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {i < approvals.length - 1 && (
                <div className="flex items-center px-1 pt-5">
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
