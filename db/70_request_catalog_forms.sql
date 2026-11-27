-- 2.09 (ITH-192/193): service request catalogue — each category / item can ask its own questions (form fields) and has a
-- fulfilment checklist (tasks). A request cannot be completed until its tasks are done. Re-runnable; defaults are only
-- written where nothing is set yet (an admin's changes are kept).
ALTER TABLE public.itsm_catalog ADD COLUMN IF NOT EXISTS form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tasks jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.itsm_service_requests ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS public.itsm_request_tasks (
  id          serial PRIMARY KEY,
  request_id  integer NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'Open',      -- Open | Done | Not needed
  note        text,
  done_by     text,
  done_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS itsm_request_tasks_req ON public.itsm_request_tasks (request_id, sort_order);

-- default questions and checklists per service-request category (the items under a category use them unless set on the item)
WITH d(category, fields, tasks) AS (VALUES
 ('Access Request', '[{"key":"system","label":"System / folder / application","type":"text","required":true},{"key":"access","label":"Access needed","type":"select","options":["Read","Read and write","Admin"],"required":true},{"key":"till","label":"Needed until (leave blank if permanent)","type":"date"},{"key":"why","label":"Business reason","type":"textarea","required":true}]',
   '["Check the approval","Grant the access","Confirm with the requester"]'),
 ('Account Setup', '[{"key":"forWhom","label":"For whom (name and employee code)","type":"text","required":true},{"key":"what","label":"What is needed","type":"textarea","required":true}]',
   '["Create / unlock the account","Share the details securely","Confirm with the requester"]'),
 ('Data Export / Report', '[{"key":"source","label":"System / data source","type":"text","required":true},{"key":"fields","label":"Data / columns needed","type":"textarea","required":true},{"key":"by","label":"Needed by","type":"date"},{"key":"sensitive","label":"Contains personal or confidential data?","type":"yesno","required":true}]',
   '["Check data-owner approval","Prepare the extract","Share through an approved channel"]'),
 ('Email Setup', '[{"key":"mailbox","label":"Mailbox / list name","type":"text","required":true},{"key":"members","label":"Members or owners","type":"textarea"}]',
   '["Make the change in Microsoft 365","Confirm with the requester"]'),
 ('Hardware Request', '[{"key":"item","label":"Item","type":"select","options":["Laptop","Desktop","Monitor","Keyboard / mouse","Headset","Docking station","Other"],"required":true},{"key":"qty","label":"Quantity","type":"number","required":true},{"key":"replace","label":"Is this a replacement?","type":"yesno","required":true},{"key":"why","label":"Reason","type":"textarea","required":true}]',
   '["Check stock / raise purchase","Prepare and tag the asset","Hand over and record in the asset register"]'),
 ('Mobile Device', '[{"key":"device","label":"Device (make / model)","type":"text","required":true},{"key":"need","label":"What is needed","type":"textarea","required":true}]',
   '["Enrol / configure the device","Confirm with the requester"]'),
 ('New Joinee Onboarding', '[{"key":"name","label":"New joiner name","type":"text","required":true},{"key":"code","label":"Employee code","type":"text","required":true},{"key":"joining","label":"Joining date","type":"date","required":true},{"key":"dept","label":"Department","type":"text","required":true},{"key":"designation","label":"Designation","type":"text","required":true},{"key":"manager","label":"Reporting manager","type":"user","required":true},{"key":"laptop","label":"Laptop needed?","type":"yesno","required":true},{"key":"apps","label":"Applications needed","type":"textarea"}]',
   '["Create the user ID and email","Add to IT Hub (User Master)","Prepare and issue the laptop","Grant application access","Share the welcome / IT policy pack"]'),
 ('Offboarding / Exit', '[{"key":"name","label":"Employee leaving","type":"user","required":true},{"key":"lastDay","label":"Last working day","type":"date","required":true},{"key":"mailbox","label":"Forward / hand over the mailbox to","type":"user"}]',
   '["Disable the accounts on the last day","Remove application and VPN access","Collect the assets and update the register","Hand over the mailbox / data"]'),
 ('Password Reset', '[{"key":"system","label":"Which system","type":"text","required":true}]',
   '["Verify the person","Reset and share securely"]'),
 ('Printer Setup', '[{"key":"location","label":"Location / floor","type":"text","required":true},{"key":"printer","label":"Printer name (if known)","type":"text"}]',
   '["Install / map the printer","Test print with the requester"]'),
 ('Software Install', '[{"key":"software","label":"Software name and version","type":"text","required":true},{"key":"licence","label":"Paid licence needed?","type":"yesno","required":true},{"key":"why","label":"Business reason","type":"textarea","required":true}]',
   '["Check the licence / approval","Install the software","Confirm with the requester"]'),
 ('VPN Access', '[{"key":"till","label":"Needed until (leave blank if permanent)","type":"date"},{"key":"systems","label":"Systems to reach over VPN","type":"textarea","required":true}]',
   '["Create the VPN access / token","Test the connection with the requester"]'))
UPDATE public.itsm_catalog c SET form_fields = d.fields::jsonb, tasks = d.tasks::jsonb
FROM d WHERE c.ticket_type = 'Service Request' AND c.subcategory IS NULL AND lower(c.category) = lower(d.category)
  AND c.form_fields = '[]'::jsonb AND c.tasks = '[]'::jsonb;
