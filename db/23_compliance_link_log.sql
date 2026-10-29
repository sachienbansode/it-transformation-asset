-- Evidence Library: link / un-link history so every document shows Linked / Un-linked and where it was used. Re-runnable.
BEGIN;
CREATE TABLE IF NOT EXISTS public.cmp_document_link_log (
  id          serial PRIMARY KEY,
  document_id int  NOT NULL REFERENCES public.cmp_documents(id) ON DELETE CASCADE,
  item_id     int  REFERENCES public.cmp_items(id) ON DELETE CASCADE,
  grid_id     int  REFERENCES public.cmp_grids(id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN ('link', 'unlink')),
  by_name     text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmp_document_link_log_doc ON public.cmp_document_link_log (document_id, at DESC);
-- existing links → history
INSERT INTO public.cmp_document_link_log (document_id, item_id, action, by_name, at)
SELECT l.document_id, l.item_id, 'link', l.linked_by, coalesce(l.linked_at, now()) FROM public.cmp_item_documents l
WHERE NOT EXISTS (SELECT 1 FROM public.cmp_document_link_log x WHERE x.document_id = l.document_id AND x.item_id = l.item_id);
INSERT INTO public.cmp_document_link_log (document_id, grid_id, action, by_name, at)
SELECT l.document_id, l.grid_id, 'link', l.linked_by, l.linked_at FROM public.cmp_grid_documents l
WHERE NOT EXISTS (SELECT 1 FROM public.cmp_document_link_log x WHERE x.document_id = l.document_id AND x.grid_id = l.grid_id);
COMMIT;
