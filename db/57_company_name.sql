-- ITH-128 (r90): company name is used on policy watermarks, reports, asset labels, emails and the header.
-- Fill it once from the tagline ("… — Company") when it was never set. Re-runnable; never overwrites a saved value.
INSERT INTO public.settings (key, value, description)
SELECT 'company_name', to_jsonb(btrim(split_part(t.v, '—', 2))), 'Company name (Admin › Settings › Branding)'
FROM (SELECT value #>> '{}' AS v FROM public.settings WHERE key = 'app_tagline') t
WHERE t.v LIKE '%—%' AND btrim(split_part(t.v, '—', 2)) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'company_name' AND coalesce(value #>> '{}', '') <> '')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE coalesce(public.settings.value #>> '{}', '') = '';
