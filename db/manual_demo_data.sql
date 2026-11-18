-- ITH-112 — DEMO DATA for client demonstrations (run by hand; NOT run by deploy.sh).
-- Loads ~90 days of realistic ITSM history: incidents, service requests, problems, change requests and their history,
-- using the real users, teams and categories already in IT Hub. Every row is marked created_by = 'Demo data' and
-- is removed again by db/manual_demo_data_remove.sql. Safe to run twice (it does nothing if demo data exists).
DO $$
DECLARE
  people int[]; names text[]; emails text[]; agents text[]; n int; i int; k int;
  cat record;
  pr text; sev text; st text; cr timestamptz; fr timestamptz; rs timestamptz; ttl text; sub text; team text; tid int; who int; ag text;
  inc_no bigint; req_no bigint; prb_no bigint; chg_no bigint; new_id int; age_days numeric; res_h numeric; resp_h numeric;
  pr_list text[] := ARRAY['Critical','High','High','Medium','Medium','Medium','Medium','Low','Low','Low'];
  pr_req text[] := ARRAY['High','Medium','Medium','Medium','Low','Low'];
  t_inc jsonb := '{
   "Performance":["{s} is very slow for the Mumbai branch","Reports in {s} take over 5 minutes to open","Back-office screens freezing after login"],
   "Error / Exception":["Error 500 when saving client onboarding form","Contract note generation fails with exception","Unexpected error on order book export"],
   "Access Denied":["Access denied to settlement dashboard","Cannot open RMS limits screen — permission error"],
   "Data Issue":["Duplicate client codes after overnight import","Ledger balance mismatch for AIF investors"],
   "Integration Failure":["Bank payout API not responding","Exchange file upload job failing since morning"],
   "Instance Down":["UAT application server not reachable","Reporting VM stopped unexpectedly"],
   "Storage":["Shared drive nearly full","Blob storage quota warning on archive account"],
   "Permissions":["IAM role missing for backup service","Cannot assign Key Vault access to app"],
   "Cost Alert":["Cloud spend alert: storage cost up 40%"],
   "Auto-scaling":["Scale-out not triggered during market open"],
   "Backup":["Nightly database backup did not complete","Backup verification failed for CRM database"],
   "Connection Failure":["Application cannot connect to database","Intermittent DB connection timeouts"],
   "Slow Query":["Trade report query taking 12 minutes","Month-end MIS query timing out"],
   "Replication Lag":["Read replica lagging 20 minutes"],
   "Corruption":["Index corruption reported on audit table"],
   "Account Lock":["Account locked after password change","Domain account locked — cannot log in"],
   "Outlook / Email":["Outlook not syncing emails","Emails to external clients bouncing","Shared mailbox not visible in Outlook"],
   "Printing":["Cannot print to 3rd floor printer","Print jobs stuck in queue"],
   "SharePoint":["SharePoint site access request failing","Cannot upload files to compliance SharePoint"],
   "Teams":["Teams calls dropping every few minutes","Teams not opening after update"],
   "Battery / Power":["Laptop battery drains within an hour","Laptop not charging"],
   "Laptop / Desktop":["Laptop very slow and hangs frequently","Blue screen error on startup","Laptop overheating and shutting down"],
   "Monitor":["External monitor not detected","Second screen flickering"],
   "Peripherals":["Keyboard keys not working","Mouse not responding","Headset microphone not working in calls"],
   "Printer":["Printer showing paper jam constantly"],
   "Backup Failure":["Server backup job failed for file server"],
   "CPU / Memory":["High CPU on application server","Memory usage above 95% on DB server"],
   "Disk Space":["C: drive full on reporting server","Low disk space alert on log server"],
   "Server Down":["File server not reachable","Print server down"],
   "VM / Container Issue":["Container restarting repeatedly","VM not booting after patching"],
   "Bandwidth":["Internet very slow at Kolkata branch","Video calls choppy — bandwidth saturated"],
   "Connectivity":["Branch office lost network connectivity","No network on 2nd floor"],
   "DNS":["Internal sites not resolving","DNS resolution slow for intranet"],
   "Firewall":["Firewall blocking exchange connectivity port","New vendor IP needs whitelisting"],
   "VPN":["VPN disconnects every 10 minutes","Cannot connect to VPN from home"],
   "WiFi":["WiFi not working in conference room","Guest WiFi not issuing IP"],
   "Deployment":["Release deployment failed in UAT"],
   "Maintenance":["Planned patching overran maintenance window"],
   "Monitoring Alert":["Monitoring alert: certificate expires in 7 days","Disk latency alert on storage array"],
   "Scheduled Job":["End-of-day job did not run","Scheduled report not emailed"],
   "Data Leak":["Sensitive file shared externally by mistake"],
   "MFA Issue":["MFA prompt not received on phone","Cannot register new phone for MFA"],
   "Malware":["Antivirus detected malware on laptop","Suspicious executable quarantined"],
   "Phishing":["Phishing email reported by staff","Suspicious link clicked — needs check"],
   "Unauthorized Access":["Multiple failed logins from unknown IP","Unrecognised login on admin account"],
   "Vulnerability":["Critical vulnerability on web server","Outdated Java version flagged by scan"]
  }';
  t_req jsonb := '{
   "Admin rights":["Local admin rights for software testing"],"Application access":["Access to back-office reporting module","Access to CRM for new RM"],"Remove access":["Remove access for transferred employee"],"Shared folder access":["Access to Finance shared folder"],
   "Domain account unlock":["Unlock domain account"],"Email ID":["New email ID for new joiner","Email ID for consultant"],"New user ID":["New user ID for operations analyst"],
   "Data extract":["Client master data extract for audit"],"One-time report":["One-time report of dormant accounts"],
   "Distribution list":["Create distribution list for AIF team"],"Mailbox size increase":["Increase mailbox size to 100 GB"],"Shared mailbox":["Shared mailbox for investor relations"],
   "Docking station":["Docking station for new laptop"],"Headset":["Headset for call centre"],"Keyboard / Mouse":["Wireless keyboard and mouse","Replacement mouse"],"Laptop / Desktop":["New laptop for new joiner","Laptop replacement — old model"],"Monitor":["Additional monitor for dealer desk"],
   "Company mobile":["Company mobile for regional head"],"Email on mobile":["Email on personal mobile"],"IT kit and accounts":["Onboarding: IT kit and accounts for new analyst"],"Access removal and asset return":["Exit: access removal and laptop return"],
   "Application":["Reset password for back-office application"],"Email":["Reset email password"],"Windows / domain":["Reset Windows password"],
   "Add printer":["Add 4th floor printer"],"Scanner setup":["Set up scanner to email"],"Browser plug-in":["Install PDF browser plug-in"],"Licensed software":["Install Microsoft Visio","Install Adobe Acrobat Pro"],"Standard software":["Install 7-Zip","Install Notepad++"],
   "New VPN access":["VPN access for work from home"],"VPN token issue":["VPN token not working"]
  }';
  arr jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM itsm_incidents WHERE created_by = 'Demo data') THEN RAISE NOTICE 'Demo data already loaded — nothing to do'; RETURN; END IF;
  PERFORM setseed(0.42);
  SELECT array_agg(id ORDER BY id), array_agg(name ORDER BY id), array_agg(email ORDER BY id) INTO people, names, emails FROM users WHERE is_active AND coalesce(user_type, 'internal') = 'internal';
  IF people IS NULL THEN RAISE EXCEPTION 'No active internal users'; END IF;
  SELECT coalesce(max(nullif(regexp_replace(ticket_no, '\D', '', 'g'), '')::bigint), 0) INTO inc_no FROM itsm_incidents;
  SELECT coalesce(max(nullif(regexp_replace(request_no, '\D', '', 'g'), '')::bigint), 0) INTO req_no FROM itsm_service_requests;
  SELECT coalesce(max(nullif(regexp_replace(problem_no, '\D', '', 'g'), '')::bigint), 0) INTO prb_no FROM itsm_problems;
  SELECT coalesce(max(nullif(regexp_replace(change_no, '\D', '', 'g'), '')::bigint), 0) INTO chg_no FROM itsm_changes;

  /* ── incidents: 75 over the last 90 days ── */
  FOR i IN 1..75 LOOP
    SELECT c.category, c.subcategory, coalesce(c.team_id, p.team_id) AS team_id INTO cat
      FROM itsm_catalog c LEFT JOIN itsm_catalog p ON p.ticket_type = c.ticket_type AND p.category = c.category AND p.subcategory IS NULL AND p.is_active
      WHERE c.ticket_type = 'Incident' AND c.is_active AND c.subcategory IS NOT NULL ORDER BY random() LIMIT 1;
    pr := pr_list[1 + floor(random() * array_length(pr_list, 1))::int];
    sev := CASE pr WHEN 'Critical' THEN (ARRAY['S1','S2'])[1 + floor(random()*2)::int] WHEN 'High' THEN 'S2' WHEN 'Medium' THEN 'S3' ELSE 'S4' END;
    age_days := power(random(), 1.6) * 90;   -- more recent tickets than old ones
    cr := date_trunc('minute', now() - (age_days || ' days')::interval);
    cr := cr - ((extract(hour from cr AT TIME ZONE 'Asia/Kolkata')::int % 9) || ' hours')::interval;   -- mostly working hours
    arr := t_inc -> cat.subcategory;
    ttl := CASE WHEN arr IS NOT NULL THEN arr ->> floor(random() * jsonb_array_length(arr))::int ELSE cat.subcategory || ' issue reported' END;
    ttl := replace(ttl, '{s}', (ARRAY['Back-office','CRM','Trading terminal','Settlement system','Client portal'])[1 + floor(random()*5)::int]);
    SELECT name INTO team FROM itsm_teams WHERE id = cat.team_id; tid := cat.team_id;
    SELECT u.name INTO ag FROM itsm_team_members m JOIN users u ON u.id = m.user_id AND u.is_active WHERE m.team_id = tid ORDER BY random() LIMIT 1;
    IF ag IS NULL THEN ag := names[1 + floor(random() * array_length(names, 1))::int]; END IF;
    who := 1 + floor(random() * array_length(people, 1))::int;
    resp_h := CASE pr WHEN 'Critical' THEN 0.3 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2.5 ELSE 5 END * (0.3 + random());
    res_h := CASE pr WHEN 'Critical' THEN 3 WHEN 'High' THEN 7 WHEN 'Medium' THEN 20 ELSE 40 END * (0.25 + random() * (CASE WHEN random() < 0.12 THEN 1.8 ELSE 0.9 END));
    fr := cr + (resp_h || ' hours')::interval; rs := cr + (res_h || ' hours')::interval;
    st := CASE WHEN (age_days < 12 AND random() < 0.65) OR random() < 0.04 THEN (ARRAY['Open','In Progress','In Progress','In Progress','On Hold','Escalated'])[1 + floor(random()*6)::int]
               WHEN rs > now() THEN (ARRAY['Open','In Progress','In Progress','On Hold'])[1 + floor(random()*4)::int]
               WHEN rs < now() - interval '2 days' THEN 'Closed' ELSE (ARRAY['Resolved','Closed'])[1 + floor(random()*2)::int] END;
    IF st NOT IN ('Resolved','Closed') AND fr > now() THEN fr := now() - interval '10 minutes'; END IF;
    inc_no := inc_no + 1;
    INSERT INTO itsm_incidents (ticket_no, title, description, status, priority, severity, urgency, impact_level, source, category, subcategory, assigned_to, assigned_group, team_id,
        reported_by, reporter_email, requester_user_id, resolution_notes, resolved_at, closed_at, first_response_at, expected_closure_date, sla_paused_mins, is_active, created_by, updated_by, created_at, updated_at)
      VALUES ('INC-' || lpad(inc_no::text, greatest(5, length(inc_no::text)), '0'), ttl, ttl || '. Reported by the user; details captured by the service desk.', st, pr, sev, pr, CASE WHEN pr IN ('Critical','High') THEN 'High' ELSE 'Medium' END,
        (ARRAY['Portal','Email','Phone','IT Hub agent','Chat'])[1 + floor(random()*5)::int], cat.category, cat.subcategory,
        CASE WHEN st = 'Open' THEN NULL ELSE ag END, team, tid, names[who], emails[who], people[who],
        CASE WHEN st IN ('Resolved','Closed') THEN (ARRAY['Root cause fixed and verified with the user.','Configuration corrected; monitoring for 24 hours.','Replaced faulty component; user confirmed.','Patch applied and service restored.'])[1 + floor(random()*4)::int] END,
        CASE WHEN st IN ('Resolved','Closed') THEN rs END, CASE WHEN st = 'Closed' THEN rs + interval '1 day' END,
        CASE WHEN st <> 'Open' THEN least(fr, now()) END, (cr + interval '3 days')::date, 0, true, 'Demo data', 'Demo data', cr, greatest(cr, least(rs, now())))
      RETURNING id INTO new_id;
    INSERT INTO itsm_ticket_history (ticket_id, ticket_type, old_status, new_status, updated_by, notes, created_at) VALUES
      (new_id, 'incident', NULL, 'Open', 'Demo data', 'Incident raised by ' || names[who] || ' — routed to ' || coalesce(team, 'service desk'), cr);
    IF st <> 'Open' THEN INSERT INTO itsm_ticket_history (ticket_id, ticket_type, old_status, new_status, updated_by, notes, created_at) VALUES (new_id, 'incident', 'Open', 'In Progress', ag, 'Assigned to ' || ag, least(fr, now())); END IF;
    IF st IN ('Resolved','Closed') THEN INSERT INTO itsm_ticket_history (ticket_id, ticket_type, old_status, new_status, updated_by, notes, created_at) VALUES (new_id, 'incident', 'In Progress', 'Resolved', ag, 'Resolved', rs); END IF;
    IF st = 'Closed' THEN INSERT INTO itsm_ticket_history (ticket_id, ticket_type, old_status, new_status, updated_by, notes, created_at) VALUES (new_id, 'incident', 'Resolved', 'Closed', 'Demo data', 'Closed after user confirmation', rs + interval '1 day'); END IF;
    IF st = 'On Hold' THEN UPDATE itsm_incidents SET sla_paused_at = greatest(fr, now() - interval '4 hours') WHERE id = new_id; END IF;
  END LOOP;

  /* ── service requests: 45 ── */
  FOR i IN 1..45 LOOP
    SELECT c.category, c.subcategory, coalesce(c.team_id, p.team_id) AS team_id INTO cat
      FROM itsm_catalog c LEFT JOIN itsm_catalog p ON p.ticket_type = c.ticket_type AND p.category = c.category AND p.subcategory IS NULL AND p.is_active
      WHERE c.ticket_type = 'Service Request' AND c.is_active AND c.subcategory IS NOT NULL ORDER BY random() LIMIT 1;
    pr := pr_req[1 + floor(random() * array_length(pr_req, 1))::int];
    age_days := power(random(), 1.5) * 90; cr := date_trunc('minute', now() - (age_days || ' days')::interval);
    arr := t_req -> cat.subcategory;
    ttl := CASE WHEN arr IS NOT NULL THEN arr ->> floor(random() * jsonb_array_length(arr))::int ELSE cat.subcategory || ' request' END;
    SELECT name INTO team FROM itsm_teams WHERE id = cat.team_id; tid := cat.team_id;
    SELECT u.name INTO ag FROM itsm_team_members m JOIN users u ON u.id = m.user_id AND u.is_active WHERE m.team_id = tid ORDER BY random() LIMIT 1;
    IF ag IS NULL THEN ag := names[1 + floor(random() * array_length(names, 1))::int]; END IF;
    who := 1 + floor(random() * array_length(people, 1))::int;
    res_h := CASE pr WHEN 'High' THEN 10 WHEN 'Medium' THEN 20 ELSE 32 END * (0.3 + random());
    fr := cr + ((1 + random() * 4) || ' hours')::interval; rs := cr + (res_h || ' hours')::interval;
    st := CASE WHEN rs > now() OR (age_days < 8 AND random() < 0.6) THEN (ARRAY['Open','Pending Approval','In Progress','In Progress','On Hold'])[1 + floor(random()*5)::int]
               ELSE (ARRAY['Completed','Completed','Completed','Completed','Completed','Completed','Rejected','Cancelled'])[1 + floor(random()*8)::int] END;
    req_no := req_no + 1;
    INSERT INTO itsm_service_requests (request_no, title, description, category, subcategory, status, priority, urgency, requested_by, assigned_to, assigned_group, team_id, department,
        requester_user_id, fulfillment_notes, completed_at, first_response_at, expected_closure_date, sla_paused_mins, is_active, created_by, updated_by, created_at, updated_at)
      VALUES ('SR-' || lpad(req_no::text, greatest(5, length(req_no::text)), '0'), ttl, ttl || '.', cat.category, cat.subcategory, st, pr, pr, names[who], CASE WHEN st IN ('Open','Pending Approval') THEN NULL ELSE ag END, team, tid,
        (SELECT department FROM users WHERE id = people[who]), people[who],
        CASE WHEN st = 'Completed' THEN 'Done and confirmed with the requester.' WHEN st = 'Rejected' THEN 'Not approved by the reporting manager.' END,
        CASE WHEN st IN ('Completed','Rejected','Cancelled') THEN rs END, CASE WHEN st NOT IN ('Open','Pending Approval') THEN least(fr, now()) END,
        (cr + interval '3 days')::date, 0, true, 'Demo data', 'Demo data', cr, greatest(cr, least(rs, now())))
      RETURNING id INTO new_id;
    INSERT INTO itsm_ticket_history (ticket_id, ticket_type, old_status, new_status, updated_by, notes, created_at) VALUES (new_id, 'service_request', NULL, 'Open', 'Demo data', 'Request raised by ' || names[who], cr);
    IF st IN ('Completed','Rejected','Cancelled') THEN INSERT INTO itsm_ticket_history (ticket_id, ticket_type, old_status, new_status, updated_by, notes, created_at) VALUES (new_id, 'service_request', 'In Progress', st, ag, st, rs); END IF;
    IF st IN ('Pending Approval','On Hold') THEN UPDATE itsm_service_requests SET sla_paused_at = now() - interval '2 hours' WHERE id = new_id; END IF;
  END LOOP;

  /* ── problems: 6 ── */
  FOR i IN 1..6 LOOP
    prb_no := prb_no + 1; cr := now() - ((5 + random() * 70) || ' days')::interval;
    INSERT INTO itsm_problems (problem_no, title, description, root_cause, workaround, status, priority, category, impact_level, assigned_to, assigned_group, related_incidents, affected_systems, is_active, created_by, updated_by, created_at, updated_at)
      VALUES ('PRB-' || lpad(prb_no::text, greatest(5, length(prb_no::text)), '0'),
        (ARRAY['Recurring VPN disconnects for remote staff','Repeated database connection timeouts at market open','Laptop batteries degrading early on one model','Nightly backup failures on file server','Slow reports after month-end','Outlook sync issues after update'])[i],
        'Several related incidents point to a common cause.', CASE WHEN i % 2 = 0 THEN 'Identified: configuration limit reached under peak load.' END, 'Restart the service / reconnect as a temporary fix.',
        (ARRAY['Under Investigation','Root Cause Identified','Known Error','Resolved','Open','Closed'])[i], (ARRAY['High','Critical','Medium','High','Medium','Low'])[i],
        (ARRAY['Network','Database','Hardware','Infrastructure','Application','End-User'])[i], 'High', names[1 + (i % array_length(names, 1))], NULL, NULL, NULL, true, 'Demo data', 'Demo data', cr, cr + interval '2 days');
  END LOOP;

  /* ── change requests: 8 ── */
  FOR i IN 1..8 LOOP
    chg_no := chg_no + 1; cr := now() - ((2 + random() * 60) || ' days')::interval;
    INSERT INTO itsm_changes (change_no, title, description, type, category, risk_level, impact, approval_status, requested_by, approved_by, implementation_date, rollback_plan, test_plan, backout_duration, status, is_active, created_by, updated_by, created_at, updated_at)
      VALUES ('CHG-' || lpad(chg_no::text, greatest(5, length(chg_no::text)), '0'),
        (ARRAY['Monthly Windows patching — all laptops','Firewall rule for new exchange connectivity','Upgrade database to latest minor version','Increase VPN concurrent user licences','Emergency fix: expired SSL certificate','Replace core switch at Kolkata branch','Enable MFA for all VPN users','Decommission old file server'])[i],
        'Planned change with test and rollback plans.', (ARRAY['Standard','Normal','Normal','Standard','Emergency','Major','Normal','Normal'])[i], (ARRAY['Infrastructure','Network','Database','Network','Security','Network','Security','Infrastructure'])[i],
        (ARRAY['Low','Medium','High','Low','High','High','Medium','Low'])[i], 'Medium', (ARRAY['Approved','Approved','Approved','Approved','Approved','Pending','Approved','Approved'])[i],
        names[1 + (i % array_length(names, 1))], CASE WHEN i <> 6 THEN 'CAB' END, to_char(cr + interval '5 days', 'YYYY-MM-DD'), 'Restore previous configuration from backup.', 'Tested in UAT.', '1 hour',
        (ARRAY['Completed','Completed','Scheduled','Completed','Completed','Pending Approval','In Progress','Scheduled'])[i], true, 'Demo data', 'Demo data', cr, cr + interval '1 day');
  END LOOP;
  RAISE NOTICE 'Demo data loaded: 75 incidents, 45 service requests, 6 problems, 8 change requests';
END $$;
