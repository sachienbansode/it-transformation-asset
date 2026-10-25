-- ITSM category / sub-category Excel upload: email rule (archive batch is attached).
BEGIN;
INSERT INTO public.notification_rules (event_key, label, module, description, attach_excel, sort_order)
SELECT 'itsm_catalog_upload', 'ITSM category upload', 'ITSM', 'Sent when the category / sub-category sheet is uploaded in ITSM Setup. Attached: changes, new and old catalog.', true, 22
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules WHERE event_key = 'itsm_catalog_upload');
COMMIT;
