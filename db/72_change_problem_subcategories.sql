-- 2.12 (ITH-198): sub-categories for Change Requests (what kind of change: bug fix, enhancement, patch, upgrade …)
-- and Problems. Added only to a category that has no sub-categories yet, so a client's own catalogue is never changed.
-- Sub-categories take the team and days of their category (team_id NULL). Re-runnable.
BEGIN;
-- Change Request: "Application" (business applications — bug fix / enhancement) next to "Software" (desktop / packaged software)
INSERT INTO public.itsm_catalog (ticket_type, category, subcategory, team_id, resolution_days, sort_order, is_active, updated_by)
SELECT 'Change Request', 'Application',
  NULL, s.team_id, s.resolution_days, 1, true, 'system'   -- same team as Software; re-map in ITSM Setup if needed
FROM public.itsm_catalog s
WHERE s.ticket_type = 'Change Request' AND lower(s.category) = 'software' AND s.subcategory IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.itsm_catalog x WHERE x.ticket_type = 'Change Request' AND lower(x.category) = 'application' AND x.subcategory IS NULL)
LIMIT 1;

CREATE TEMP TABLE _subs (ticket_type text, category text, subcategory text, n int) ON COMMIT DROP;
INSERT INTO _subs VALUES
 ('Change Request','Application','Bug fix',1),('Change Request','Application','Enhancement / change request',2),('Change Request','Application','New feature / module',3),
 ('Change Request','Application','Configuration / parameter change',4),('Change Request','Application','Version upgrade / patch',5),('Change Request','Application','Report change',6),
 ('Change Request','Application','Integration / interface',7),('Change Request','Application','Data fix',8),('Change Request','Application','Others',99),
 ('Change Request','Software','Install / deploy',1),('Change Request','Software','Upgrade / patch',2),('Change Request','Software','Uninstall / retire',3),('Change Request','Software','Licence change',4),('Change Request','Software','Configuration change',5),('Change Request','Software','Others',99),
 ('Change Request','Hardware','Replacement',1),('Change Request','Hardware','Add / upgrade capacity',2),('Change Request','Hardware','Firmware update',3),('Change Request','Hardware','Relocation',4),('Change Request','Hardware','Decommission',5),('Change Request','Hardware','Others',99),
 ('Change Request','Infrastructure','Server build / change',1),('Change Request','Infrastructure','OS patching',2),('Change Request','Infrastructure','Storage',3),('Change Request','Infrastructure','Backup / DR',4),('Change Request','Infrastructure','Virtualisation',5),('Change Request','Infrastructure','Decommission',6),('Change Request','Infrastructure','Others',99),
 ('Change Request','Network','Firewall rule',1),('Change Request','Network','Switch / router configuration',2),('Change Request','Network','VPN',3),('Change Request','Network','Wi-Fi',4),('Change Request','Network','Internet / leased line',5),('Change Request','Network','DNS / IP',6),('Change Request','Network','Others',99),
 ('Change Request','Database','Schema change',1),('Change Request','Database','Data fix / script',2),('Change Request','Database','Upgrade / patch',3),('Change Request','Database','Performance tuning',4),('Change Request','Database','User / access',5),('Change Request','Database','Others',99),
 ('Change Request','Cloud','Azure resource',1),('Change Request','Cloud','Microsoft 365 configuration',2),('Change Request','Cloud','Scaling / cost',3),('Change Request','Cloud','Identity / Entra ID',4),('Change Request','Cloud','Others',99),
 ('Change Request','Security','Access / permission',1),('Change Request','Security','Security policy / GPO',2),('Change Request','Security','Certificate renewal',3),('Change Request','Security','Antivirus / EDR',4),('Change Request','Security','Vulnerability fix',5),('Change Request','Security','Others',99),
 ('Change Request','End-User','Software rollout',1),('Change Request','End-User','Group policy',2),('Change Request','End-User','Email / Teams settings',3),('Change Request','End-User','Device refresh',4),('Change Request','End-User','Others',99),
 ('Change Request','Process','Batch job / scheduler',1),('Change Request','Process','Process / SOP change',2),('Change Request','Process','Monitoring / alert rule',3),('Change Request','Process','Others',99),
 ('Change Request','Others','Others',99),
 ('Problem','Application','Recurring error / bug',1),('Problem','Application','Performance',2),('Problem','Application','Integration failure',3),('Problem','Application','Data quality',4),('Problem','Application','Others',99),
 ('Problem','Hardware','Repeated device failure',1),('Problem','Hardware','Model / batch defect',2),('Problem','Hardware','Others',99),
 ('Problem','Infrastructure','Server instability',1),('Problem','Infrastructure','Capacity',2),('Problem','Infrastructure','Backup failures',3),('Problem','Infrastructure','Others',99),
 ('Problem','Network','Intermittent connectivity',1),('Problem','Network','Slow network',2),('Problem','Network','VPN drops',3),('Problem','Network','Others',99),
 ('Problem','Database','Slow queries',1),('Problem','Database','Locking / deadlocks',2),('Problem','Database','Replication / backup',3),('Problem','Database','Others',99),
 ('Problem','Cloud','Service outage',1),('Problem','Cloud','Permissions / identity',2),('Problem','Cloud','Cost spikes',3),('Problem','Cloud','Others',99),
 ('Problem','Security','Repeated phishing / malware',1),('Problem','Security','Access control gap',2),('Problem','Security','Vulnerability',3),('Problem','Security','Others',99),
 ('Problem','Operations','Job failures',1),('Problem','Operations','Monitoring gaps',2),('Problem','Operations','Others',99),
 ('Problem','Process','Process gap',1),('Problem','Process','Training / awareness',2),('Problem','Process','Others',99),
 ('Problem','Others','Others',99);

INSERT INTO public.itsm_catalog (ticket_type, category, subcategory, team_id, sort_order, is_active, updated_by)
SELECT s.ticket_type, c.category, s.subcategory, NULL::integer, s.n, true, 'system'
FROM _subs s
JOIN public.itsm_catalog c ON c.ticket_type = s.ticket_type AND lower(c.category) = lower(s.category) AND c.subcategory IS NULL
WHERE NOT EXISTS (SELECT 1 FROM public.itsm_catalog x WHERE x.ticket_type = s.ticket_type AND lower(x.category) = lower(s.category) AND x.subcategory IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM _subs y WHERE y.ticket_type = x.ticket_type AND lower(y.category) = lower(x.category) AND lower(y.subcategory) = lower(x.subcategory)))   -- the client has its own sub-categories
  AND NOT EXISTS (SELECT 1 FROM public.itsm_catalog x WHERE x.ticket_type = s.ticket_type AND lower(x.category) = lower(s.category) AND lower(x.subcategory) = lower(s.subcategory));
COMMIT;
