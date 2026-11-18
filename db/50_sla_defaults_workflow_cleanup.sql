-- ITH-112: standard SLA policies (business hours) where none exist; workflows switched on without a published version are switched off.
INSERT INTO itsm_sla_policies (name, ticket_type, priority, response_time_hours, resolution_time_hours, escalation_enabled, escalation_policy, business_hours, sla_type, status, is_active)
SELECT v.name, v.tt, v.pr, v.resp, v.res, true, 'Notify the team at the warning level; escalate to ITSM Admins when breached', true, 'Business Hours', 'Active', true
FROM (VALUES
  ('Incident – Critical', 'Incident', 'Critical', 1, 4), ('Incident – High', 'Incident', 'High', 2, 8), ('Incident – Medium', 'Incident', 'Medium', 4, 24), ('Incident – Low', 'Incident', 'Low', 8, 48),
  ('Service Request – Critical', 'Service Request', 'Critical', 2, 8), ('Service Request – High', 'Service Request', 'High', 4, 16), ('Service Request – Medium', 'Service Request', 'Medium', 8, 24), ('Service Request – Low', 'Service Request', 'Low', 8, 40)
) AS v(name, tt, pr, resp, res)
WHERE NOT EXISTS (SELECT 1 FROM itsm_sla_policies p WHERE p.ticket_type = v.tt AND p.priority = v.pr AND p.is_active);

WITH off AS (
  UPDATE itsm_workflows w SET is_active = false, updated_by = 'System', updated_at = now()
  WHERE w.is_active AND NOT EXISTS (SELECT 1 FROM itsm_workflow_versions v WHERE v.workflow_id = w.id AND v.status = 'Published')
  RETURNING w.id, w.name)
INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary)
SELECT 'itsm_workflow', id, 'disable', 'System', 'Workflow “' || name || '” switched off: it was on but has no published version, so no ticket could use it' FROM off;
