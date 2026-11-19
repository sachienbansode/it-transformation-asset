-- ITH-115 (r85): switch on the 10 core preconfigured workflows ONCE. Runs on every deploy but acts only the first time
-- (marker: settings key 'itsm.core_workflows_enabled'), so an ITSM admin who later switches one off is never overridden.
-- Only published workflows are switched on. Every change is audited.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM settings WHERE key = 'itsm.core_workflows_enabled') THEN RETURN; END IF;

  WITH core(tt, nm) AS (VALUES
    ('incident', 'Major incident (S1)'),
    ('incident', 'Critical priority incident'),
    ('incident', 'High priority incident (S2)'),
    ('incident', 'Standard incident (S3 / S4)'),
    ('request',  'Standard service request'),
    ('request',  'Service request with approval (High / Critical)'),
    ('request',  'Email / user ID creation (manager approval)'),
    ('request',  'IT hardware & accessories (manager approval)'),
    ('change',   'Normal change (CAB approval)'),
    ('change',   'Emergency change')),
  turned_on AS (
    UPDATE itsm_workflows w SET is_active = true, updated_by = 'System (deploy)', updated_at = now()
    FROM core c
    WHERE w.ticket_type = c.tt AND lower(w.name) = lower(c.nm) AND NOT w.is_active
      AND EXISTS (SELECT 1 FROM itsm_workflow_versions v WHERE v.workflow_id = w.id AND v.status = 'Published')
    RETURNING w.id, w.name)
  INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, summary)
  SELECT 'itsm_workflow', id, 'enable', 'System (deploy)', 'Workflow “' || name || '” switched on as one of the 10 core workflows (an ITSM admin can switch it off)' FROM turned_on;

  INSERT INTO settings (key, value, description)
  VALUES ('itsm.core_workflows_enabled', to_jsonb(now()), 'Core ITSM workflows switched on once by deploy (db/52); not repeated')
  ON CONFLICT (key) DO NOTHING;
END $$;
