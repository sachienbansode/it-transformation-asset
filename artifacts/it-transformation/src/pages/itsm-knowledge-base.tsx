import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Search, Eye, BookOpen, CheckCircle2, Clock, FileText, ThumbsUp, Download } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/contexts/auth-context";
import { Pagination } from "@/components/pagination";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/components/confirm-dialog";

function exportToCsv(rows: any[], cols: { label: string; key: string }[], filename: string) {
  const esc = (v: any) => { const s = String(v ?? "").replace(/"/g, '""'); return /[,"\n]/.test(s) ? `"${s}"` : s; };
  const csv = [cols.map(c => c.label).join(","), ...rows.map(r => cols.map(c => esc(r[c.key])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

const PAGE_SIZE = 10;
const CATEGORIES = ["How-To", "Troubleshooting", "Policy", "FAQ", "Best Practice", "Architecture"];
const KB_STATUSES = ["Draft", "Published", "Archived"];

export default function ItsmKnowledgeBase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: articles = [] } = useQuery({ queryKey: ["knowledge-base"], queryFn: () => apiFetch<any[]>("/knowledge-base") });

  const createArticle = useMutation({ mutationFn: (d: any) => apiFetch("/knowledge-base", { method: "POST", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-base"] }) });
  const updateArticle = useMutation({ mutationFn: ({ id, ...d }: any) => apiFetch(`/knowledge-base/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-base"] }) });
  const deleteArticle = useMutation({ mutationFn: (id: number) => apiFetch(`/knowledge-base/${id}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-base"] }) });

  const filtered = useMemo(() => {
    let list = articles;
    if (search) list = list.filter((a: any) => [a.title, a.content, a.tags, a.authorName].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    if (filterCategory) list = list.filter((a: any) => a.category === filterCategory);
    if (filterStatus) list = list.filter((a: any) => a.status === filterStatus);
    return list;
  }, [articles, search, filterCategory, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const publishedCount = articles.filter((a: any) => a.status === "Published").length;
  const draftCount = articles.filter((a: any) => a.status === "Draft").length;
  const totalViews = articles.reduce((s: number, a: any) => s + (a.views || 0), 0);

  function openCreate() { setEditingItem(null); setFormData({ status: "Draft", category: "How-To" }); setIsModalOpen(true); }
  function openEdit(item: any) { setEditingItem(item); setFormData({ ...item }); setIsModalOpen(true); }

  async function handleSave() {
    try {
      if (editingItem) { await updateArticle.mutateAsync({ id: editingItem.id, ...formData }); toast({ title: "Article updated" }); }
      else { await createArticle.mutateAsync(formData); toast({ title: "Article created" }); }
      setIsModalOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(id: number, title: string) {
    if (!await confirmDialog(`Delete article "${title}"?`)) return;
    try { await deleteArticle.mutateAsync(id); toast({ title: "Article deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">IT knowledge articles and documentation — {user?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToCsv(articles, [{label:"Title",key:"title"},{label:"Category",key:"category"},{label:"Type",key:"type"},{label:"Status",key:"status"},{label:"Tags",key:"tags"},{label:"Created By",key:"createdByName"},{label:"Views",key:"views"},{label:"Created At",key:"createdAt"}], "knowledge-base.csv")} className="gap-1.5"><Download className="w-4 h-4" />Export CSV</Button>
          <Button onClick={openCreate} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white gap-2"><Plus className="w-4 h-4" />New Article</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={BookOpen} label="Total Articles" value={articles.length} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600" borderColor="border-l-emerald-500" />
        <StatCard icon={CheckCircle2} label="Published" value={publishedCount} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600" borderColor="border-l-blue-500" />
        <StatCard icon={Clock} label="Drafts" value={draftCount} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600" borderColor="border-l-amber-500" />
        <StatCard icon={ThumbsUp} label="Total Views" value={totalViews} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600" borderColor="border-l-violet-500" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search articles..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
            <Select value={filterCategory} onValueChange={v => { setFilterCategory(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[150px]"><SelectValue placeholder="All Categories" /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem>{KB_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Author</TableHead><TableHead>Tags</TableHead><TableHead>Views</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead className="w-[100px] text-center">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No articles found</TableCell></TableRow>}
              {paged.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">{a.title}</TableCell>
                  <TableCell><Badge variant="outline">{a.category}</Badge></TableCell>
                  <TableCell className="text-sm">{a.authorName || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{a.tags || "—"}</TableCell>
                  <TableCell className="text-sm">{a.views || 0}</TableCell>
                  <TableCell><Badge variant="outline" className={a.status === "Published" ? "border-emerald-500/30 text-emerald-600 bg-emerald-50" : a.status === "Draft" ? "border-amber-500/30 text-amber-600 bg-amber-50" : "border-gray-400/30 text-gray-500 bg-gray-50"}>{a.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setViewModal(a)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-muted"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                      {isAdmin && <button onClick={() => handleDelete(a.id, a.title)} className="p-1.5 rounded hover:bg-muted"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </CardContent>
      </Card>

      <Dialog open={!!viewModal} onOpenChange={() => setViewModal(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewModal?.title}</DialogTitle></DialogHeader>
          {viewModal && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{viewModal.category}</Badge>
                <Badge variant="outline" className={viewModal.status === "Published" ? "border-emerald-500/30 text-emerald-600" : ""}>{viewModal.status}</Badge>
                <span className="text-xs text-muted-foreground">By {viewModal.authorName || "Unknown"}</span>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="text-sm whitespace-pre-wrap bg-muted/30 p-4 rounded-lg">{viewModal.content || "No content"}</div>
              </div>
              {viewModal.tags && <div><span className="text-[10px] uppercase text-muted-foreground font-semibold">Tags: </span><span className="text-xs">{viewModal.tags}</span></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Article" : "New Knowledge Article"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Title *</Label><Input value={formData.title || ""} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
            <div><Label>Category</Label><Select value={formData.category || "How-To"} onValueChange={v => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={formData.status || "Draft"} onValueChange={v => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KB_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Author</Label><Input value={formData.authorName || ""} onChange={e => setFormData({ ...formData, authorName: e.target.value })} /></div>
            <div><Label>Tags</Label><Input value={formData.tags || ""} onChange={e => setFormData({ ...formData, tags: e.target.value })} placeholder="Comma-separated" /></div>
            <div className="col-span-2"><Label>Content *</Label><Textarea value={formData.content || ""} onChange={e => setFormData({ ...formData, content: e.target.value })} rows={10} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.title} className="bg-[#2D7FF9] hover:bg-[#1B63D6] text-white">{editingItem ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
