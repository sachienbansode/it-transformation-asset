-- AMC SEBI system audit: management replies with policy references and the SharePoint link,
-- ONLY for checkpoint lines answered by the 13 drafted IT / IS policies (88 lines) and the 36 policy-register lines.
-- Lines that need evidence of operation (logs, reviews, tests, physical checks) and business controls (9a–9g) are left for the owners.
-- Manual run only (not part of deploy). Safe to re-run: fills empty replies only, unless overwrite is set to true below.
-- It also clears replies written by an earlier run of this script on lines that are no longer in scope.
BEGIN;
CREATE TEMP TABLE _cfg AS SELECT 'AUD-2026-0001'::text AS audit_no, false AS overwrite, 'Bulk update (policy references)'::text AS by_name;
CREATE TEMP TABLE _r (kind text, sheet text, ref_no text, n int, reply text) ON COMMIT DROP;  -- n = seq for checkpoints, source row for policy lines
INSERT INTO _r VALUES
  ('checklist', 'Sys Audit Checklist', '1a', 1, 'IT governance framework defined in the IT Policy: Board, IT Strategy Committee, Technology Committee and Risk Management Committee with defined roles.
Committees: IT Strategy Committee, Technology Committee, Risk Management Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.3 IT governance.
Evidence: Board-approved IT Policy; IT organisation chart; committee terms of reference.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1b', 1, 'IT Strategy Committee constituted with Board representation and senior IT / business management; meets at least twice a year and reports to the Board.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.3.1.
Evidence: Board resolution constituting the committee; composition; terms of reference; minutes of last two meetings.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1b', 3, 'IT Strategy Committee constituted with Board representation and senior IT / business management; meets at least twice a year and reports to the Board.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.3.1.
Evidence: Board resolution constituting the committee; composition; terms of reference; minutes of last two meetings.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1b', 4, 'IT Strategy Committee constituted with Board representation and senior IT / business management; meets at least twice a year and reports to the Board.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.3.1.
Evidence: Board resolution constituting the committee; composition; terms of reference; minutes of last two meetings.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1c', 1, 'IT and information security risks are assessed at least yearly and on major change, recorded in the risk register with owners and treatment plans, and reported to the IT Strategy Committee.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.3.3; IS-01 Information Security Policy and Framework s.4.
Evidence: Risk assessment report; risk register; committee minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1c', 2, 'IT and information security risks are assessed at least yearly and on major change, recorded in the risk register with owners and treatment plans, and reported to the IT Strategy Committee.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.3.3; IS-01 Information Security Policy and Framework s.4.
Evidence: Risk assessment report; risk register; committee minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1c', 3, 'IT and information security risks are assessed at least yearly and on major change, recorded in the risk register with owners and treatment plans, and reported to the IT Strategy Committee.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.3.3; IS-01 Information Security Policy and Framework s.4.
Evidence: Risk assessment report; risk register; committee minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1d', 1, 'IT Policy with operating policies (a)–(l) drafted and placed for Board approval; reviewed at least yearly.
Policy reference: IT-01 Information Technology Policy.
Evidence: IT Policy; Board approval minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1d', 3, 'IT Policy with operating policies (a)–(l) drafted and placed for Board approval; reviewed at least yearly.
Policy reference: IT-01 Information Technology Policy.
Evidence: IT Policy; Board approval minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1d', 4, 'IT Policy with operating policies (a)–(l) drafted and placed for Board approval; reviewed at least yearly.
Policy reference: IT-01 Information Technology Policy.
Evidence: IT Policy; Board approval minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1e', 1, 'IT organisation structure with authorities, reporting lines and roles defined; CISO independent of IT operations.
Policy reference: IT-01 Information Technology Policy s.3.2.
Evidence: Organisation chart; role descriptions.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1e', 2, 'IT organisation structure with authorities, reporting lines and roles defined; CISO independent of IT operations.
Policy reference: IT-01 Information Technology Policy s.3.2.
Evidence: Organisation chart; role descriptions.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '1f', 1, 'Controls are independently reviewed by Internal Audit and the annual SEBI system audit; findings are tracked to closure and reported to the IT Strategy Committee.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IS-01 Information Security Policy and Framework s.4 and Compliance section; IT-01 Information Technology Policy Compliance section.
Evidence: Internal audit plan / IS audit reports; finding tracker.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2a', 1, 'Information security function headed by a CISO, distinct from IT operations, with a quarterly Information Security Steering Committee.
Committees: Information Security Steering Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IS-01 Information Security Policy and Framework s.3.
Evidence: CISO appointment letter; organisation chart; committee minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2a', 2, 'Information security function headed by a CISO, distinct from IT operations, with a quarterly Information Security Steering Committee.
Committees: Information Security Steering Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IS-01 Information Security Policy and Framework s.3.
Evidence: CISO appointment letter; organisation chart; committee minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2a', 3, 'Information security function headed by a CISO, distinct from IT operations, with a quarterly Information Security Steering Committee.
Committees: Information Security Steering Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IS-01 Information Security Policy and Framework s.3.
Evidence: CISO appointment letter; organisation chart; committee minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2b', 1, 'Information Security Policy and Framework covering areas (a)–(k), with supporting procedures for hardening, cryptography, third-party security, HR controls and information classification; drafted and placed for Board approval.
Policy reference: IS-01 Information Security Policy and Framework; IS-02 System Hardening Standard; IS-03 Cryptography and Key Management Procedure; IS-04 Third-Party Security Procedure; IS-05 Human Resource Security Procedure; IS-06 Information Classification and Handling Procedure.
Evidence: IS Policy and procedures; Board approval minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2b', 2, 'Information Security Policy and Framework covering areas (a)–(k), with supporting procedures for hardening, cryptography, third-party security, HR controls and information classification; drafted and placed for Board approval.
Policy reference: IS-01 Information Security Policy and Framework; IS-02 System Hardening Standard; IS-03 Cryptography and Key Management Procedure; IS-04 Third-Party Security Procedure; IS-05 Human Resource Security Procedure; IS-06 Information Classification and Handling Procedure.
Evidence: IS Policy and procedures; Board approval minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2b', 3, 'Information Security Policy and Framework covering areas (a)–(k), with supporting procedures for hardening, cryptography, third-party security, HR controls and information classification; drafted and placed for Board approval.
Policy reference: IS-01 Information Security Policy and Framework; IS-02 System Hardening Standard; IS-03 Cryptography and Key Management Procedure; IS-04 Third-Party Security Procedure; IS-05 Human Resource Security Procedure; IS-06 Information Classification and Handling Procedure.
Evidence: IS Policy and procedures; Board approval minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2b', 4, 'Information Security Policy and Framework covering areas (a)–(k), with supporting procedures for hardening, cryptography, third-party security, HR controls and information classification; drafted and placed for Board approval.
Policy reference: IS-01 Information Security Policy and Framework; IS-02 System Hardening Standard; IS-03 Cryptography and Key Management Procedure; IS-04 Third-Party Security Procedure; IS-05 Human Resource Security Procedure; IS-06 Information Classification and Handling Procedure.
Evidence: IS Policy and procedures; Board approval minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2c', 1, 'Information security risk assessment at least yearly and on major change; VAPT by a CERT-In empanelled auditor; findings fixed within CSCRF timelines.
Policy reference: IS-01 Information Security Policy and Framework s.4.
Evidence: IS risk assessment; VAPT reports and closure evidence.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2c', 2, 'Information security risk assessment at least yearly and on major change; VAPT by a CERT-In empanelled auditor; findings fixed within CSCRF timelines.
Policy reference: IS-01 Information Security Policy and Framework s.4.
Evidence: IS risk assessment; VAPT reports and closure evidence.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2c', 3, 'Information security risk assessment at least yearly and on major change; VAPT by a CERT-In empanelled auditor; findings fixed within CSCRF timelines.
Policy reference: IS-01 Information Security Policy and Framework s.4.
Evidence: IS risk assessment; VAPT reports and closure evidence.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2d', 1, 'Framework aligned to SEBI CSCRF; applicable category determined yearly and its requirements implemented; incidents reported to CERT-In and SEBI as required.
Policy reference: IS-01 Information Security Policy and Framework s.3–6.
Evidence: CSCRF compliance checklist / gap assessment; cyber audit report.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2e', 1, 'Security awareness on joining and yearly, phishing simulations twice a year, role-based training for privileged users; completion tracked.
Policy reference: IS-01 Information Security Policy and Framework s.6; IS-05 Human Resource Security Procedure s.3.
Evidence: Training calendar; completion reports; phishing simulation results.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2e', 2, 'Security awareness on joining and yearly, phishing simulations twice a year, role-based training for privileged users; completion tracked.
Policy reference: IS-01 Information Security Policy and Framework s.6; IS-05 Human Resource Security Procedure s.3.
Evidence: Training calendar; completion reports; phishing simulation results.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2f', 1, 'Privacy and Personal Data Protection Policy aligned to the DPDP Act and Rules, 2025; drafted and placed for Board approval.
Policy reference: IS-07 Privacy and Personal Data Protection Policy.
Evidence: Privacy Policy; privacy notice; data principal request log.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2f', 2, 'Privacy and Personal Data Protection Policy aligned to the DPDP Act and Rules, 2025; drafted and placed for Board approval.
Policy reference: IS-07 Privacy and Personal Data Protection Policy.
Evidence: Privacy Policy; privacy notice; data principal request log.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2g', 1, 'HR security controls in place: background checks before joining, induction and policy acceptance, yearly re-acknowledgement, timely access removal on exit.
Policy reference: IS-05 Human Resource Security Procedure.
Evidence: Background verification reports (sample); signed policy acknowledgements; leaver reconciliation.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2g', 2, 'HR security controls in place: background checks before joining, induction and policy acceptance, yearly re-acknowledgement, timely access removal on exit.
Policy reference: IS-05 Human Resource Security Procedure.
Evidence: Background verification reports (sample); signed policy acknowledgements; leaver reconciliation.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2g', 4, 'HR security controls in place: background checks before joining, induction and policy acceptance, yearly re-acknowledgement, timely access removal on exit.
Policy reference: IS-05 Human Resource Security Procedure.
Evidence: Background verification reports (sample); signed policy acknowledgements; leaver reconciliation.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2g', 5, 'HR security controls in place: background checks before joining, induction and policy acceptance, yearly re-acknowledgement, timely access removal on exit.
Policy reference: IS-05 Human Resource Security Procedure.
Evidence: Background verification reports (sample); signed policy acknowledgements; leaver reconciliation.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2h', 1, 'Digital technologies are adopted only after business case, risk and data-protection assessment, security testing and approval; social media use governed by a separate policy.
Policy reference: IT-02 Digital Technology Adoption Policy and Process; IS-08 Social Media Usage Policy.
Evidence: Technology proposal register; approval minutes; VAPT before go-live; Social Media Policy.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2h', 2, 'Digital technologies are adopted only after business case, risk and data-protection assessment, security testing and approval; social media use governed by a separate policy.
Policy reference: IT-02 Digital Technology Adoption Policy and Process; IS-08 Social Media Usage Policy.
Evidence: Technology proposal register; approval minutes; VAPT before go-live; Social Media Policy.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2h', 3, 'Digital technologies are adopted only after business case, risk and data-protection assessment, security testing and approval; social media use governed by a separate policy.
Policy reference: IT-02 Digital Technology Adoption Policy and Process; IS-08 Social Media Usage Policy.
Evidence: Technology proposal register; approval minutes; VAPT before go-live; Social Media Policy.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2i', 1, 'Vendor management framework covers due diligence, risk rating, contracting (clauses a–g), onboarding, monitoring and exit; critical vendors reviewed yearly.
Policy reference: IS-09 Vendor Management and Outsourcing Framework; IS-04 Third-Party Security Procedure.
Evidence: Vendor register; due-diligence records; agreements; annual vendor reviews.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2i', 2, 'Vendor management framework covers due diligence, risk rating, contracting (clauses a–g), onboarding, monitoring and exit; critical vendors reviewed yearly.
Policy reference: IS-09 Vendor Management and Outsourcing Framework; IS-04 Third-Party Security Procedure.
Evidence: Vendor register; due-diligence records; agreements; annual vendor reviews.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2i', 3, 'Vendor management framework covers due diligence, risk rating, contracting (clauses a–g), onboarding, monitoring and exit; critical vendors reviewed yearly.
Policy reference: IS-09 Vendor Management and Outsourcing Framework; IS-04 Third-Party Security Procedure.
Evidence: Vendor register; due-diligence records; agreements; annual vendor reviews.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2i', 4, 'Vendor management framework covers due diligence, risk rating, contracting (clauses a–g), onboarding, monitoring and exit; critical vendors reviewed yearly.
Policy reference: IS-09 Vendor Management and Outsourcing Framework; IS-04 Third-Party Security Procedure.
Evidence: Vendor register; due-diligence records; agreements; annual vendor reviews.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '2j', 1, 'Compliance with policies monitored by the CISO and Head of IT, reviewed by Internal Audit; exceptions recorded and reported to the IT Strategy Committee quarterly.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IS-01 Information Security Policy and Framework Compliance section; IT-01 Information Technology Policy Compliance section.
Evidence: Compliance reviews; exception register; committee reports.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3a', 1, 'Access management policy covers approval as per authorisation matrix, revocation, periodic review, privileged access and log review.
Policy reference: IT-01 Information Technology Policy s.5.2; IS-01 Information Security Policy and Framework s.5.1.
Evidence: IT Policy s.5.2; authorisation matrix.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3a', 2, 'Access management policy covers approval as per authorisation matrix, revocation, periodic review, privileged access and log review.
Policy reference: IT-01 Information Technology Policy s.5.2; IS-01 Information Security Policy and Framework s.5.1.
Evidence: IT Policy s.5.2; authorisation matrix.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3a', 3, 'Access management policy covers approval as per authorisation matrix, revocation, periodic review, privileged access and log review.
Policy reference: IT-01 Information Technology Policy s.5.2; IS-01 Information Security Policy and Framework s.5.1.
Evidence: IT Policy s.5.2; authorisation matrix.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3b', 2, 'Privileged access limited to named administrators, approved per person, managed through privileged identity management with MFA, logged and reviewed.
Policy reference: IT-01 Information Technology Policy s.5.2.
Evidence: Privileged user list; PIM / vault configuration; review sign-offs.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3c', 3, 'Access granted on approved requests, role-based and least privilege; changed on role change and removed on the last working day.
Policy reference: IT-01 Information Technology Policy s.5.2.
Evidence: Sample access requests and approvals; leaver report vs active users.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3d', 2, 'Unique IDs, MFA for email, cloud, remote and privileged access; password and lockout rules defined in the IS Policy.
Policy reference: IT-01 Information Technology Policy s.5.2; IS-01 Information Security Policy and Framework s.5.1.
Evidence: Password / MFA configuration screenshots.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3d', 3, 'Unique IDs, MFA for email, cloud, remote and privileged access; password and lockout rules defined in the IS Policy.
Policy reference: IT-01 Information Technology Policy s.5.2; IS-01 Information Security Policy and Framework s.5.1.
Evidence: Password / MFA configuration screenshots.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3d', 4, 'Unique IDs, MFA for email, cloud, remote and privileged access; password and lockout rules defined in the IS Policy.
Policy reference: IT-01 Information Technology Policy s.5.2; IS-01 Information Security Policy and Framework s.5.1.
Evidence: Password / MFA configuration screenshots.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3f', 1, 'Segregation of duties maintained: no single person can develop, approve and deploy a change, or create and approve own access; SOD matrix maintained.
Policy reference: IT-01 Information Technology Policy s.4.
Evidence: SOD matrix; access review evidence.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '3g', 1, 'Physical access to office, network room and records restricted to authorised persons through access cards / registers, revoked on exit and reviewed quarterly.
Policy reference: IS-01 Information Security Policy and Framework s.5.1; IT-01 Information Technology Policy s.5.8.
Evidence: Physical access list; access register; quarterly review.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '4a', 1, 'Formal change management covering request, risk and impact, testing, approval, rollback, emergency changes and post-implementation review.
Policy reference: IT-01 Information Technology Policy s.5.3.
Evidence: IT Policy s.5.3; change procedure.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '4b', 2, 'All production changes logged in the ITSM tool with approvals, test and UAT evidence; emergency changes ratified by the CAB.
Committees: Change Advisory Board (CAB) constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.5.3.
Evidence: Change register; sample change records with approvals and UAT sign-off.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '4b', 6, 'All production changes logged in the ITSM tool with approvals, test and UAT evidence; emergency changes ratified by the CAB.
Committees: Change Advisory Board (CAB) constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.5.3.
Evidence: Change register; sample change records with approvals and UAT sign-off.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '4b', 8, 'All production changes logged in the ITSM tool with approvals, test and UAT evidence; emergency changes ratified by the CAB.
Committees: Change Advisory Board (CAB) constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-01 Information Technology Policy s.5.3.
Evidence: Change register; sample change records with approvals and UAT sign-off.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '4c', 1, 'Separate development, test and production environments; developers have no write access to production; deployments by authorised operations staff.
Policy reference: IT-01 Information Technology Policy s.5.3.
Evidence: Environment diagram; production access list.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '4c', 4, 'Separate development, test and production environments; developers have no write access to production; deployments by authorised operations staff.
Policy reference: IT-01 Information Technology Policy s.5.3.
Evidence: Environment diagram; production access list.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '5a', 1, 'Formal incident management with categorisation, priorities, escalation, root-cause analysis and reporting.
Policy reference: IT-01 Information Technology Policy s.5.6; IS-01 Information Security Policy and Framework s.5.5.
Evidence: IT Policy s.5.6; incident procedure.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '5a', 2, 'Formal incident management with categorisation, priorities, escalation, root-cause analysis and reporting.
Policy reference: IT-01 Information Technology Policy s.5.6; IS-01 Information Security Policy and Framework s.5.5.
Evidence: IT Policy s.5.6; incident procedure.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '5c', 1, 'Target response and resolution times defined per priority; service provider SLAs defined in contracts and reviewed monthly.
Policy reference: IT-01 Information Technology Policy s.5.6; IS-09 Vendor Management and Outsourcing Framework s.5.
Evidence: SLA matrix; SLA reports.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '5d', 1, 'Cyber Crisis Management Plan with playbooks; cyber incidents reported to CERT-In within 6 hours and to SEBI as required; evidence preserved.
Policy reference: IS-01 Information Security Policy and Framework s.5.5.
Evidence: Cyber crisis management plan; incident reports.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '5d', 4, 'Cyber Crisis Management Plan with playbooks; cyber incidents reported to CERT-In within 6 hours and to SEBI as required; evidence preserved.
Policy reference: IS-01 Information Security Policy and Framework s.5.5.
Evidence: Cyber crisis management plan; incident reports.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '6a', 1, 'Documented backup policy covering scope, schedule, encryption, monitoring and retention; failures handled as incidents.
Policy reference: IT-01 Information Technology Policy s.5.4; IS-01 Information Security Policy and Framework s.5.3.
Evidence: Backup policy / schedule; daily backup reports.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '6a', 5, 'Documented backup policy covering scope, schedule, encryption, monitoring and retention; failures handled as incidents.
Policy reference: IT-01 Information Technology Policy s.5.4; IS-01 Information Security Policy and Framework s.5.3.
Evidence: Backup policy / schedule; daily backup reports.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '7a', 1, 'Scheduled jobs recorded in a job register; changes via change management; completion and failures monitored daily; file transfers over secure channels.
Policy reference: IT-01 Information Technology Policy s.5.5; IS-01 Information Security Policy and Framework s.5.4.
Evidence: Job register; scheduler access list; job failure logs.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8a', 1, 'Crisis Management Team provides BCP oversight; BCP & DR Policy drafted and placed for Board approval.
Committees: Crisis Management Team constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.6.
Evidence: BCP & DR Policy; Crisis Management Team composition.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8a', 2, 'Crisis Management Team provides BCP oversight; BCP & DR Policy drafted and placed for Board approval.
Committees: Crisis Management Team constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.6.
Evidence: BCP & DR Policy; Crisis Management Team composition.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8a', 3, 'Crisis Management Team provides BCP oversight; BCP & DR Policy drafted and placed for Board approval.
Committees: Crisis Management Team constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.6.
Evidence: BCP & DR Policy; Crisis Management Team composition.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8a', 4, 'Crisis Management Team provides BCP oversight; BCP & DR Policy drafted and placed for Board approval.
Committees: Crisis Management Team constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.6.
Evidence: BCP & DR Policy; Crisis Management Team composition.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8b', 1, 'BCP methodology covers BIA, risk assessment, continuity strategy and plans per critical process.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.3–6.
Evidence: BCP & DR Policy; BCP documents.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8b', 2, 'BCP methodology covers BIA, risk assessment, continuity strategy and plans per critical process.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.3–6.
Evidence: BCP & DR Policy; BCP documents.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8b', 3, 'BCP methodology covers BIA, risk assessment, continuity strategy and plans per critical process.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.3–6.
Evidence: BCP & DR Policy; BCP documents.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8b', 4, 'BCP methodology covers BIA, risk assessment, continuity strategy and plans per critical process.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.3–6.
Evidence: BCP & DR Policy; BCP documents.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8c', 1, 'BIA identifies critical processes, dependencies and RTO/RPO by application tier; reviewed yearly.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.3.
Evidence: BIA report.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8c', 2, 'BIA identifies critical processes, dependencies and RTO/RPO by application tier; reviewed yearly.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.3.
Evidence: BIA report.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8c', 3, 'BIA identifies critical processes, dependencies and RTO/RPO by application tier; reviewed yearly.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.3.
Evidence: BIA report.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8d', 1, 'BCP reviewed yearly; DR drills twice a year and BCP exercise yearly; results and gaps reported to the IT Strategy Committee.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.7.
Evidence: DR drill reports; BCP exercise report.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8d', 2, 'BCP reviewed yearly; DR drills twice a year and BCP exercise yearly; results and gaps reported to the IT Strategy Committee.
Committees: IT Strategy Committee constituted; constitution, members and terms of reference available at the SharePoint site.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.7.
Evidence: DR drill reports; BCP exercise report.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8e', 1, 'BCP awareness for all staff on joining and yearly; role-based training for crisis and recovery teams before drills; completion tracked.
Policy reference: IT-04 BCP Training and Awareness Procedure; IT-03 Business Continuity and Disaster Recovery Policy s.8.
Evidence: Training records; drill attendance.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8e', 2, 'BCP awareness for all staff on joining and yearly; role-based training for crisis and recovery teams before drills; completion tracked.
Policy reference: IT-04 BCP Training and Awareness Procedure; IT-03 Business Continuity and Disaster Recovery Policy s.8.
Evidence: Training records; drill attendance.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'Sys Audit Checklist', '8f', 1, 'IT DR plan per critical system with recovery steps, secondary site / region and tested failover.
Policy reference: IT-03 Business Continuity and Disaster Recovery Policy s.5–7.
Evidence: DR plan; DR drill report.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'DC Walkthrough Checkpoints', '2b', 1, 'Information Security Policy and Framework covering areas (a)–(k), with supporting procedures for hardening, cryptography, third-party security, HR controls and information classification; drafted and placed for Board approval.
Policy reference: IS-01 Information Security Policy and Framework; IS-02 System Hardening Standard; IS-03 Cryptography and Key Management Procedure; IS-04 Third-Party Security Procedure; IS-05 Human Resource Security Procedure; IS-06 Information Classification and Handling Procedure.
Evidence: IS Policy and procedures; Board approval minutes.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('checklist', 'DC Walkthrough Checkpoints', '3g', 1, 'Physical access to office, network room and records restricted to authorised persons through access cards / registers, revoked on exit and reviewed quarterly.
Policy reference: IS-01 Information Security Policy and Framework s.5.1; IT-01 Information Technology Policy s.5.8.
Evidence: Physical access list; access register; quarterly review.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 2, 'Covered by IT-01 Information Technology Policy. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 3, 'Covered by IT-01 Information Technology Policy s.5.1. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 4, 'Covered by IT-01 Information Technology Policy s.5.2. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 5, 'Covered by IT-01 Information Technology Policy s.5.3. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 6, 'Covered by IT-01 Information Technology Policy s.5.4. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 7, 'Covered by IT-01 Information Technology Policy s.5.5. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 8, 'Covered by IT-01 Information Technology Policy s.5.6. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 9, 'Covered by IT-01 Information Technology Policy s.5.7. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 10, 'Covered by IT-01 Information Technology Policy s.5.8. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 11, 'Covered by IT-01 Information Technology Policy s.5.9. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 12, 'Covered by IT-01 Information Technology Policy s.5.10. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 13, 'Covered by IT-01 Information Technology Policy s.5.11. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 14, 'Covered by IT-01 Information Technology Policy s.5.12. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 15, 'Covered by IS-01 Information Security Policy and Framework s.5.1. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 16, 'Covered by IS-01 Information Security Policy and Framework s.5.2. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 17, 'Covered by IS-01 Information Security Policy and Framework s.5.3. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 18, 'Covered by IS-01 Information Security Policy and Framework s.5.4. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 19, 'Covered by IS-01 Information Security Policy and Framework s.5.5. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 20, 'Covered by IS-01 Information Security Policy and Framework s.5.6. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 21, 'Covered by IS-01 Information Security Policy and Framework s.5.7. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 22, 'Covered by IS-01 Information Security Policy and Framework s.5.8. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 23, 'Covered by IS-01 Information Security Policy and Framework s.5.9. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 24, 'Covered by IS-01 Information Security Policy and Framework s.5.10. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 25, 'Covered by IS-01 Information Security Policy and Framework s.5.11. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 26, 'Covered by IS-02 System Hardening Standard. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 27, 'Covered by IS-03 Cryptography and Key Management Procedure. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 28, 'Covered by IS-04 Third-Party Security Procedure. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 29, 'Covered by IS-05 Human Resource Security Procedure. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 30, 'Covered by IS-06 Information Classification and Handling Procedure. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 31, 'Covered by IS-01 Information Security Policy and Framework. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 32, 'Covered by IS-07 Privacy and Personal Data Protection Policy. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 33, 'Covered by IT-02 Digital Technology Adoption Policy and Process. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 34, 'Covered by IS-08 Social Media Usage Policy. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 35, 'Covered by IS-09 Vendor Management and Outsourcing Framework. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 36, 'Covered by IT-03 Business Continuity and Disaster Recovery Policy. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'),
  ('policy', 'Policy Procedure Summary', NULL, 37, 'Covered by IT-04 BCP Training and Awareness Procedure. Draft prepared and placed for review / Board approval on [●]; reviewed at least yearly.
Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026');

-- undo the earlier bulk replies on lines that are not covered by the policies
WITH a AS (SELECT id FROM cmp_audits WHERE audit_no = (SELECT audit_no FROM _cfg)),
clr AS (
  UPDATE cmp_items i SET management_reply = NULL, updated_at = now()
  FROM a WHERE i.audit_id = a.id AND i.kind = 'checklist' AND i.updated_by = (SELECT by_name FROM _cfg)
    AND i.management_reply LIKE '%Policy documents: https://ashikagroup1.sharepoint.com/sites/AMC-System-Audit-Oct-2026'
    AND NOT EXISTS (SELECT 1 FROM _r r WHERE r.kind = 'checklist' AND r.sheet = i.sheet AND r.ref_no = i.ref_no AND r.n = i.seq)
  RETURNING i.id
)
INSERT INTO cmp_comments (item_id, author, system, body, visibility)
SELECT id, (SELECT by_name FROM _cfg), true, 'Bulk management reply removed (line not covered by the drafted policies)', 'internal' FROM clr;

WITH a AS (SELECT id FROM cmp_audits WHERE audit_no = (SELECT audit_no FROM _cfg)),
upd AS (
  UPDATE cmp_items i SET management_reply = r.reply, updated_by = (SELECT by_name FROM _cfg), updated_at = now()
  FROM _r r, a
  WHERE i.audit_id = a.id AND i.kind = r.kind AND i.sheet = r.sheet
    AND ((r.kind = 'checklist' AND i.ref_no = r.ref_no AND i.seq = r.n) OR (r.kind = 'policy' AND i.source_row = r.n))
    AND i.management_reply IS DISTINCT FROM r.reply
    -- fills empty replies and refreshes ones written by this bulk script; replies typed by the team are kept
    AND ((SELECT overwrite FROM _cfg) OR coalesce(btrim(i.management_reply), '') = '' OR i.updated_by = (SELECT by_name FROM _cfg))
  RETURNING i.id
)
INSERT INTO cmp_comments (item_id, author, system, body, visibility)
SELECT id, (SELECT by_name FROM _cfg), true, 'Management reply filled / refreshed with policy reference, committee status and SharePoint link (bulk update)', 'internal' FROM upd;

-- Status -> Submitted for the applicable lines that have a reply. Only moves Pending / In Progress forward;
-- Submitted and auditor statuses (Under Review, Closed, ...) are never touched. Sharing to the auditor stays a separate step.
WITH a AS (SELECT id FROM cmp_audits WHERE audit_no = (SELECT audit_no FROM _cfg)),
st AS (
  UPDATE cmp_items i SET status = 'Submitted', submitted_at = now(), updated_at = now()
  FROM _r r, a
  WHERE i.audit_id = a.id AND i.kind = r.kind AND i.sheet = r.sheet
    AND ((r.kind = 'checklist' AND i.ref_no = r.ref_no AND i.seq = r.n) OR (r.kind = 'policy' AND i.source_row = r.n))
    AND i.status IN ('Pending', 'In Progress') AND coalesce(btrim(i.management_reply), '') <> ''
  RETURNING i.id
)
INSERT INTO cmp_comments (item_id, author, system, body, visibility)
SELECT id, (SELECT by_name FROM _cfg), true, 'Status changed to Submitted (bulk update)', 'internal' FROM st;

SELECT i.kind, count(*) FILTER (WHERE coalesce(btrim(i.management_reply), '') <> '') AS with_reply, count(*) FILTER (WHERE i.status = 'Submitted') AS submitted, count(*) AS total
FROM cmp_items i JOIN cmp_audits a ON a.id = i.audit_id WHERE a.audit_no = (SELECT audit_no FROM _cfg) GROUP BY i.kind ORDER BY 1;
COMMIT;
