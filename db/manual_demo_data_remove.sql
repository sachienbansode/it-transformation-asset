-- ITH-112 — remove the demo data loaded by db/manual_demo_data.sql (only rows marked created_by = 'Demo data').
BEGIN;
DELETE FROM itsm_ticket_history h USING itsm_incidents t WHERE h.ticket_type = 'incident' AND h.ticket_id = t.id AND t.created_by = 'Demo data';
DELETE FROM itsm_ticket_history h USING itsm_service_requests t WHERE h.ticket_type = 'service_request' AND h.ticket_id = t.id AND t.created_by = 'Demo data';
DELETE FROM itsm_incidents WHERE created_by = 'Demo data' AND NOT EXISTS (SELECT 1 FROM itsm_ticket_workflows w WHERE w.ticket_type = 'incident' AND w.ticket_id = itsm_incidents.id);
DELETE FROM itsm_service_requests WHERE created_by = 'Demo data' AND NOT EXISTS (SELECT 1 FROM itsm_ticket_workflows w WHERE w.ticket_type = 'request' AND w.ticket_id = itsm_service_requests.id);
DELETE FROM itsm_problems WHERE created_by = 'Demo data';
DELETE FROM itsm_changes WHERE created_by = 'Demo data';
INSERT INTO audit_logs (entity_type, action, performed_by, summary) VALUES ('itsm', 'demo_data_removed', 'System', 'Demo data removed (incidents, service requests, problems, change requests marked Demo data)');
COMMIT;
