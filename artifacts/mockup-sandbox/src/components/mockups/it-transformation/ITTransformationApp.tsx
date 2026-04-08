import React, { useState } from 'react';
import { 
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { 
  LayoutDashboard, CheckSquare, Map, Archive, Database, 
  Cpu, Shield, Settings, Search, Download, Filter, Plus, MoreVertical,
  AlertTriangle, CheckCircle2, Clock, ArrowRight
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

// --- DUMMY DATA ---

const checklistData = [
  // Core Banking & NBFC
  { id: 1, category: 'Core Banking & NBFC', feature: 'Loan Origination System (LOS)', business: 'NBFC', currentApp: 'Nucleus FinnOne', status: 'Legacy', priority: 'High', comments: 'Needs urgent cloud migration' },
  { id: 2, category: 'Core Banking & NBFC', feature: 'Loan Management System (LMS)', business: 'NBFC', currentApp: 'Nucleus FinnOne', status: 'Legacy', priority: 'High', comments: 'Performance issues at month-end' },
  { id: 3, category: 'Core Banking & NBFC', feature: 'NPA Management', business: 'NBFC', currentApp: 'In-house (Excel)', status: 'Partial', priority: 'High', comments: 'Manual process, error prone' },
  { id: 4, category: 'Core Banking & NBFC', feature: 'SARFAESI Compliance', business: 'NBFC', currentApp: 'Legal Dept Manual', status: 'Not Available', priority: 'Medium', comments: 'Evaluate automated compliance tools' },
  { id: 5, category: 'Core Banking & NBFC', feature: 'CIBIL Integration', business: 'NBFC', currentApp: 'CIBIL API V1', status: 'Available', priority: 'Low', comments: 'Working fine, needs v2 upgrade' },
  { id: 6, category: 'Core Banking & NBFC', feature: 'RBI Reporting', business: 'NBFC', currentApp: 'TCS BaNCS Reporter', status: 'Available', priority: 'Medium', comments: 'Automate data extraction' },
  { id: 7, category: 'Core Banking & NBFC', feature: 'NACH/eMandate', business: 'NBFC', currentApp: 'Razorpay eMandate', status: 'Available', priority: 'Low', comments: 'Stable' },
  { id: 8, category: 'Core Banking & NBFC', feature: 'Treasury Management', business: 'NBFC', currentApp: 'Kastle Treasury', status: 'Legacy', priority: 'Medium', comments: 'Upgrade required' },
  { id: 9, category: 'Core Banking & NBFC', feature: 'Co-Lending Integration', business: 'NBFC', currentApp: 'Yubi', status: 'Partial', priority: 'High', comments: 'API integrations pending' },
  { id: 10, category: 'Core Banking & NBFC', feature: 'Collections App', business: 'NBFC', currentApp: 'Credgenics', status: 'Available', priority: 'Low', comments: '' },
  
  // Broking Platform
  { id: 11, category: 'Broking Platform', feature: 'Order Management System (OMS)', business: 'Broking', currentApp: 'Omnesys NEST', status: 'Legacy', priority: 'High', comments: 'Latency issues during market open' },
  { id: 12, category: 'Broking Platform', feature: 'Risk Management System (RMS)', business: 'Broking', currentApp: 'Omnesys NEST RMS', status: 'Legacy', priority: 'High', comments: 'Tight coupling with OMS' },
  { id: 13, category: 'Broking Platform', feature: 'Back Office System', business: 'Broking', currentApp: 'Class Backoffice', status: 'Partial', priority: 'Medium', comments: 'UI is dated' },
  { id: 14, category: 'Broking Platform', feature: 'Algo Trading Engine', business: 'Broking', currentApp: 'Symphony Presto', status: 'Available', priority: 'Medium', comments: 'Requires co-location upgrade' },
  { id: 15, category: 'Broking Platform', feature: 'SEBI Compliance', business: 'Broking', currentApp: 'In-house DB Scripts', status: 'Partial', priority: 'High', comments: 'Need a dedicated compliance suite' },
  { id: 16, category: 'Broking Platform', feature: 'CDSL/NSDL Integration', business: 'Broking', currentApp: 'Direct API', status: 'Available', priority: 'Low', comments: '' },
  { id: 17, category: 'Broking Platform', feature: 'Margin System', business: 'Broking', currentApp: 'Class Margin', status: 'Available', priority: 'Medium', comments: 'Intraday margin calc needs speedup' },
  { id: 18, category: 'Broking Platform', feature: 'Brokerage Calculator', business: 'Broking', currentApp: 'Web Tool', status: 'Legacy', priority: 'Low', comments: 'Needs React rewrite' },
  { id: 19, category: 'Broking Platform', feature: 'Mutual Fund Engine', business: 'Broking', currentApp: 'BSE StAR MF', status: 'Available', priority: 'Low', comments: '' },
  { id: 20, category: 'Broking Platform', feature: 'IPO Bidding', business: 'Broking', currentApp: 'NSE eIPO', status: 'Available', priority: 'Medium', comments: 'Integration could be smoother' },
  
  // AIF / Fund Management
  { id: 21, category: 'AIF / Fund Management', feature: 'Fund Accounting', business: 'AIF', currentApp: 'Miles Fund Accounting', status: 'Available', priority: 'Medium', comments: 'Expensive licensing' },
  { id: 22, category: 'AIF / Fund Management', feature: 'NAV Computation', business: 'AIF', currentApp: 'Miles', status: 'Available', priority: 'Medium', comments: '' },
  { id: 23, category: 'AIF / Fund Management', feature: 'Investor Portal', business: 'AIF', currentApp: 'Custom Web Portal', status: 'Legacy', priority: 'High', comments: 'Mobile unresponsive, poor UX' },
  { id: 24, category: 'AIF / Fund Management', feature: 'SEBI AIF Compliance', business: 'AIF', currentApp: 'Manual', status: 'Not Available', priority: 'High', comments: 'Regulatory risk' },
  { id: 25, category: 'AIF / Fund Management', feature: 'Capital Call Management', business: 'AIF', currentApp: 'Excel', status: 'Partial', priority: 'Medium', comments: 'Automate via portal' },
  { id: 26, category: 'AIF / Fund Management', feature: 'Distribution Mgmt', business: 'AIF', currentApp: 'Excel', status: 'Not Available', priority: 'Medium', comments: 'Needs a system' },
  { id: 27, category: 'AIF / Fund Management', feature: 'Portfolio Analytics', business: 'AIF', currentApp: 'Bloomberg', status: 'Available', priority: 'Low', comments: '' },
  { id: 28, category: 'AIF / Fund Management', feature: 'Factsheet Generator', business: 'AIF', currentApp: 'In-house VBA', status: 'Legacy', priority: 'Medium', comments: 'Prone to macro errors' },
  
  // Institutional Equities
  { id: 29, category: 'Institutional Equities', feature: 'Research Platform', business: 'Inst. Equities', currentApp: 'Bloomberg Terminal', status: 'Available', priority: 'Low', comments: '' },
  { id: 30, category: 'Institutional Equities', feature: 'Analyst Tools', business: 'Inst. Equities', currentApp: 'FactSet', status: 'Available', priority: 'Low', comments: '' },
  { id: 31, category: 'Institutional Equities', feature: 'Client Relationship Mgmt', business: 'Inst. Equities', currentApp: 'Salesforce', status: 'Available', priority: 'Medium', comments: 'Low adoption by sales team' },
  { id: 32, category: 'Institutional Equities', feature: 'Deal Flow Mgmt', business: 'Inst. Equities', currentApp: 'Salesforce', status: 'Partial', priority: 'Medium', comments: 'Customization required' },
  { id: 33, category: 'Institutional Equities', feature: 'FIX Protocol Gateway', business: 'Inst. Equities', currentApp: 'CameronFIX', status: 'Available', priority: 'Low', comments: '' },
  { id: 34, category: 'Institutional Equities', feature: 'Trade Allocation', business: 'Inst. Equities', currentApp: 'Omnesys', status: 'Legacy', priority: 'High', comments: 'Needs upgrade' },
  { id: 35, category: 'Institutional Equities', feature: 'Corporate Access Events', business: 'Inst. Equities', currentApp: 'Tier1 CRM', status: 'Partial', priority: 'Medium', comments: '' },
  
  // IT Infrastructure
  { id: 36, category: 'IT Infrastructure', feature: 'Core Servers', business: 'All', currentApp: 'On-Premise (Mumbai DC)', status: 'Legacy', priority: 'High', comments: 'Hardware EOL next year' },
  { id: 37, category: 'IT Infrastructure', feature: 'Network & Leased Lines', business: 'All', currentApp: 'Tata Comm / Airtel', status: 'Available', priority: 'Medium', comments: 'Evaluate SD-WAN' },
  { id: 38, category: 'IT Infrastructure', feature: 'DR / BCP', business: 'All', currentApp: 'CtrlS (Chennai)', status: 'Available', priority: 'High', comments: 'RTO/RPO needs testing' },
  { id: 39, category: 'IT Infrastructure', feature: 'Cloud Migration', business: 'All', currentApp: 'AWS (Partial)', status: 'Partial', priority: 'High', comments: 'Move non-core apps to AWS' },
  { id: 40, category: 'IT Infrastructure', feature: 'Backup System', business: 'All', currentApp: 'Veeam', status: 'Available', priority: 'Low', comments: 'Running smoothly' },
  { id: 41, category: 'IT Infrastructure', feature: 'Monitoring & Alerting', business: 'All', currentApp: 'Nagios', status: 'Legacy', priority: 'Medium', comments: 'Consider Datadog/NewRelic' },
  { id: 42, category: 'IT Infrastructure', feature: 'Endpoint Management', business: 'All', currentApp: 'Microsoft Intune', status: 'Available', priority: 'Low', comments: '' },
  
  // Cybersecurity & Compliance
  { id: 43, category: 'Cybersecurity & Compliance', feature: 'VAPT', business: 'All', currentApp: 'Outsourced (Quarterly)', status: 'Available', priority: 'Low', comments: '' },
  { id: 44, category: 'Cybersecurity & Compliance', feature: 'SOC', business: 'All', currentApp: 'None', status: 'Not Available', priority: 'High', comments: 'Setup 24x7 MSSP SOC' },
  { id: 45, category: 'Cybersecurity & Compliance', feature: 'SIEM', business: 'All', currentApp: 'None', status: 'Not Available', priority: 'High', comments: 'IBM QRadar or Splunk proposed' },
  { id: 46, category: 'Cybersecurity & Compliance', feature: 'DLP', business: 'All', currentApp: 'Symantec DLP', status: 'Available', priority: 'Medium', comments: 'Tuning required for false positives' },
  { id: 47, category: 'Cybersecurity & Compliance', feature: 'ISMS / ISO 27001', business: 'All', currentApp: 'Manual', status: 'Partial', priority: 'Medium', comments: 'Audit due in Nov' },
  { id: 48, category: 'Cybersecurity & Compliance', feature: 'Data Classification', business: 'All', currentApp: 'Microsoft AIP', status: 'Partial', priority: 'High', comments: 'Implementation incomplete' },
  { id: 49, category: 'Cybersecurity & Compliance', feature: 'Identity & Access Mgmt', business: 'All', currentApp: 'Active Directory', status: 'Available', priority: 'Low', comments: 'Need Okta for SSO' },
  
  // Digital / Mobile
  { id: 50, category: 'Digital / Mobile', feature: 'Customer App', business: 'Both', currentApp: 'Old Native Apps', status: 'Legacy', priority: 'High', comments: 'Rebuild in React Native/Flutter' },
  { id: 51, category: 'Digital / Mobile', feature: 'Digital Onboarding', business: 'Both', currentApp: 'Web forms', status: 'Partial', priority: 'High', comments: 'Drop-off rate is 60%' },
  { id: 52, category: 'Digital / Mobile', feature: 'Video KYC', business: 'Both', currentApp: 'Signzy', status: 'Available', priority: 'Low', comments: '' },
  { id: 53, category: 'Digital / Mobile', feature: 'Partner/Advisor App', business: 'Both', currentApp: 'None', status: 'Not Available', priority: 'Medium', comments: 'High demand from sales' },
  { id: 54, category: 'Digital / Mobile', feature: 'eSign Integration', business: 'Both', currentApp: 'Digio', status: 'Available', priority: 'Low', comments: '' },
  { id: 55, category: 'Digital / Mobile', feature: 'Push Notifications', business: 'Both', currentApp: 'CleverTap', status: 'Available', priority: 'Low', comments: '' },
  
  // Data & Analytics
  { id: 56, category: 'Data & Analytics', feature: 'Data Warehouse', business: 'All', currentApp: 'SQL Server', status: 'Legacy', priority: 'High', comments: 'Migrate to Snowflake/Redshift' },
  { id: 57, category: 'Data & Analytics', feature: 'BI Tools', business: 'All', currentApp: 'PowerBI', status: 'Available', priority: 'Medium', comments: 'Consolidate licenses' },
  { id: 58, category: 'Data & Analytics', feature: 'MIS Reporting', business: 'All', currentApp: 'Excel/SSRS', status: 'Legacy', priority: 'High', comments: 'Automate via PowerBI' },
  { id: 59, category: 'Data & Analytics', feature: 'Real-time Dashboards', business: 'All', currentApp: 'None', status: 'Not Available', priority: 'Medium', comments: 'Requested by Board' },
  { id: 60, category: 'Data & Analytics', feature: 'Master Data Management', business: 'All', currentApp: 'None', status: 'Not Available', priority: 'High', comments: 'Need single source of truth' },
  
  // Integrations
  { id: 61, category: 'Integrations', feature: 'BSE/NSE API', business: 'Broking', currentApp: 'Direct API', status: 'Available', priority: 'Low', comments: 'Stable' },
  { id: 62, category: 'Integrations', feature: 'CAMS / KFintech', business: 'Both', currentApp: 'SFTP/API', status: 'Available', priority: 'Low', comments: '' },
  { id: 63, category: 'Integrations', feature: 'KRA Integration', business: 'Both', currentApp: 'CVL/NDML', status: 'Available', priority: 'Medium', comments: 'API timeouts observed' },
  { id: 64, category: 'Integrations', feature: 'Payment Gateway', business: 'Both', currentApp: 'Razorpay/BillDesk', status: 'Available', priority: 'Low', comments: '' },
];

const roadmapData = [
  { id: 1, phase: 'Phase 1 (Month 1-2)', name: 'Assessment & Quick Wins', budget: '₹120L',
    initiatives: [
      { name: 'Real-time Risk Dashboard', budget: '₹20L', bu: 'Broking', status: 'In Progress', priority: 'High' },
      { name: 'Cloud Migration - Quick Wins', budget: '₹40L', bu: 'All', status: 'Planned', priority: 'Medium' },
      { name: 'VAPT & Security Audit', budget: '₹15L', bu: 'All', status: 'In Progress', priority: 'High' },
      { name: 'Mobile App UX Redesign', budget: '₹45L', bu: 'Both', status: 'Planned', priority: 'High' },
      { name: 'Identity & Access Mgmt (Okta) Pilot', budget: '₹10L', bu: 'All', status: 'Planned', priority: 'Medium' }
    ]
  },
  { id: 2, phase: 'Phase 2 (Month 3-6)', name: 'Core Transformation', budget: '₹280L',
    initiatives: [
      { name: 'Replace Legacy NBFC LMS with Nucleus FinnOne', budget: '₹145L', bu: 'NBFC', status: 'Planned', priority: 'High' },
      { name: 'Deploy Centralized SIEM (IBM QRadar)', budget: '₹65L', bu: 'All', status: 'Planned', priority: 'High' },
      { name: 'AIF Investor Portal Launch', budget: '₹35L', bu: 'AIF', status: 'Planned', priority: 'Medium' },
      { name: 'Data Warehouse Migration (Snowflake)', budget: '₹35L', bu: 'All', status: 'Planned', priority: 'Medium' },
      { name: 'Digital Onboarding V2', budget: '₹25L', bu: 'Both', status: 'Planned', priority: 'High' }
    ]
  },
  { id: 3, phase: 'Phase 3 (Month 7-12)', name: 'Innovation & Scale', budget: '₹350L',
    initiatives: [
      { name: 'Upgrade OMS to Symphony Presto Pro', budget: '₹135L', bu: 'Broking', status: 'Planned', priority: 'High' },
      { name: 'Customer-facing Mobile App (iOS + Android)', budget: '₹160L', bu: 'Both', status: 'Planned', priority: 'High' },
      { name: 'AI-driven Algo Trading Signals', budget: '₹55L', bu: 'Broking', status: 'Planned', priority: 'Medium' },
      { name: 'Master Data Management Rollout', budget: '₹80L', bu: 'All', status: 'Planned', priority: 'High' },
      { name: 'Partner/Advisor App Launch', budget: '₹40L', bu: 'Both', status: 'Planned', priority: 'Medium' },
      { name: 'Cloud DR Complete Switchover', budget: '₹60L', bu: 'All', status: 'Planned', priority: 'High' }
    ]
  }
];

const retirementData = [
  { id: 1, app: 'Omnesys NEST OMS', bu: 'Broking', reason: 'Legacy architecture', targetDate: 'Q4 2024', successor: 'Symphony Presto Pro', effort: 'High', budget: '35', status: 'Planned' },
  { id: 2, app: 'Custom AIF Portal', bu: 'AIF', reason: 'Poor UX, Unresponsive', targetDate: 'Q3 2024', successor: 'New Web/Mobile Portal', effort: 'Medium', budget: '15', status: 'In Progress' },
  { id: 3, app: 'Old Native Android App', bu: 'Both', reason: 'Codebase unmaintainable', targetDate: 'Q1 2025', successor: 'Unified React Native App', effort: 'High', budget: '60', status: 'Planned' },
  { id: 4, app: 'SQL Server 2012', bu: 'All', reason: 'EOL, Security Risk', targetDate: 'Q3 2024', successor: 'Snowflake', effort: 'High', budget: '40', status: 'Planned' },
  { id: 5, app: 'In-house NPA Tracker', bu: 'NBFC', reason: 'Manual, Error Prone', targetDate: 'Q2 2024', successor: 'Nucleus FinnOne Module', effort: 'Low', budget: '5', status: 'Completed' },
  { id: 6, app: 'Kastle Treasury', bu: 'NBFC', reason: 'Unsupported vendor', targetDate: 'Q4 2024', successor: 'TCS BaNCS Treasury', effort: 'High', budget: '25', status: 'Planned' },
  { id: 7, app: 'Nagios Monitoring', bu: 'All', reason: 'Obsolete UI/Features', targetDate: 'Q2 2024', successor: 'Datadog', effort: 'Medium', budget: '10', status: 'Completed' },
  { id: 8, app: 'Legacy Web Brokerage Calc', bu: 'Broking', reason: 'Hard to maintain', targetDate: 'Q3 2024', successor: 'React Calculator Widget', effort: 'Low', budget: '3', status: 'In Progress' },
  { id: 9, app: 'In-house VBA Factsheet', bu: 'AIF', reason: 'Fragile macros', targetDate: 'Q3 2024', successor: 'PowerBI Automated Reports', effort: 'Medium', budget: '8', status: 'Planned' },
  { id: 10, app: 'Legacy Support Desk App', bu: 'Both', reason: 'Missing omnichannel', targetDate: 'Q4 2024', successor: 'Zendesk', effort: 'Medium', budget: '12', status: 'Planned' },
  { id: 11, app: 'Old On-Prem HRMS', bu: 'All', reason: 'Server cost, UX', targetDate: 'Q3 2024', successor: 'Darwinbox', effort: 'Low', budget: '5', status: 'Planned' },
  { id: 12, app: 'Physical Backup Tapes', bu: 'All', reason: 'Reliability/Risk', targetDate: 'Q2 2024', successor: 'AWS S3 Glacier', effort: 'Medium', budget: '15', status: 'In Progress' },
];

const inventoryData = [
  { id: 'APP-001', name: 'Nucleus FinnOne', vendor: 'Nucleus Software', version: 'v4.5', bu: 'NBFC', category: 'Core', hosting: 'On-Premise', criticality: 'Critical', license: 'Perpetual', cost: '₹45,000,000', support: 'Active' },
  { id: 'APP-002', name: 'Omnesys NEST', vendor: 'Thomson Reuters', version: 'v3.1', bu: 'Broking', category: 'Core', hosting: 'On-Premise', criticality: 'Critical', license: 'Subscription', cost: '₹12,000,000', support: 'Extended' },
  { id: 'APP-003', name: 'Salesforce Financial', vendor: 'Salesforce', version: 'Cloud', bu: 'Inst. Equities', category: 'Supporting', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹8,500,000', support: 'Active' },
  { id: 'APP-004', name: 'Miles Fund Accounting', vendor: 'Miles Software', version: 'v6.0', bu: 'AIF', category: 'Core', hosting: 'Cloud', criticality: 'High', license: 'Subscription', cost: '₹5,200,000', support: 'Active' },
  { id: 'APP-005', name: 'TCS BaNCS', vendor: 'TCS', version: 'v10', bu: 'NBFC', category: 'Integration', hosting: 'On-Premise', criticality: 'High', license: 'Perpetual', cost: '₹18,000,000', support: 'Active' },
  { id: 'APP-006', name: 'Symantec DLP', vendor: 'Broadcom', version: 'v15', bu: 'All', category: 'Infrastructure', hosting: 'On-Premise', criticality: 'High', license: 'Subscription', cost: '₹3,500,000', support: 'Active' },
  { id: 'APP-007', name: 'PowerBI', vendor: 'Microsoft', version: 'Cloud', bu: 'All', category: 'Supporting', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹4,200,000', support: 'Active' },
  { id: 'APP-008', name: 'Credgenics', vendor: 'Credgenics', version: 'Cloud', bu: 'NBFC', category: 'Core', hosting: 'SaaS', criticality: 'High', license: 'Subscription', cost: '₹2,500,000', support: 'Active' },
  { id: 'APP-009', name: 'Symphony Presto', vendor: 'Symphony', version: 'v2.1', bu: 'Broking', category: 'Core', hosting: 'On-Premise', criticality: 'Critical', license: 'Subscription', cost: '₹8,000,000', support: 'Active' },
  { id: 'APP-010', name: 'Class Backoffice', vendor: 'Class Systems', version: 'v8', bu: 'Broking', category: 'Supporting', hosting: 'On-Premise', criticality: 'High', license: 'Perpetual', cost: '₹4,000,000', support: 'Active' },
  { id: 'APP-011', name: 'Bloomberg Terminal', vendor: 'Bloomberg', version: 'Anywhere', bu: 'Inst. Equities', category: 'Core', hosting: 'SaaS', criticality: 'High', license: 'Subscription', cost: '₹15,000,000', support: 'Active' },
  { id: 'APP-012', name: 'FactSet', vendor: 'FactSet', version: 'Web', bu: 'Inst. Equities', category: 'Supporting', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹6,000,000', support: 'Active' },
  { id: 'APP-013', name: 'CameronFIX', vendor: 'CameronTec', version: 'v6', bu: 'Inst. Equities', category: 'Integration', hosting: 'On-Premise', criticality: 'Critical', license: 'Perpetual', cost: '₹3,000,000', support: 'Active' },
  { id: 'APP-014', name: 'Veeam Backup', vendor: 'Veeam', version: 'v11', bu: 'All', category: 'Infrastructure', hosting: 'On-Premise', criticality: 'Critical', license: 'Subscription', cost: '₹2,800,000', support: 'Active' },
  { id: 'APP-015', name: 'Microsoft Intune', vendor: 'Microsoft', version: 'Cloud', bu: 'All', category: 'Infrastructure', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹1,500,000', support: 'Active' },
  { id: 'APP-016', name: 'Signzy eKYC', vendor: 'Signzy', version: 'API', bu: 'Both', category: 'Integration', hosting: 'SaaS', criticality: 'High', license: 'Subscription', cost: '₹3,200,000', support: 'Active' },
  { id: 'APP-017', name: 'CleverTap', vendor: 'CleverTap', version: 'Cloud', bu: 'Both', category: 'Supporting', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹1,800,000', support: 'Active' },
  { id: 'APP-018', name: 'Digio eSign', vendor: 'Digio', version: 'API', bu: 'Both', category: 'Integration', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹1,200,000', support: 'Active' },
  { id: 'APP-019', name: 'Razorpay Gateway', vendor: 'Razorpay', version: 'API', bu: 'Both', category: 'Integration', hosting: 'SaaS', criticality: 'High', license: 'Subscription', cost: 'Transaction Based', support: 'Active' },
  { id: 'APP-020', name: 'SQL Server 2012', vendor: 'Microsoft', version: '2012', bu: 'All', category: 'Infrastructure', hosting: 'On-Premise', criticality: 'High', license: 'Perpetual', cost: '₹0', support: 'EOL' },
  { id: 'APP-021', name: 'Active Directory', vendor: 'Microsoft', version: '2019', bu: 'All', category: 'Infrastructure', hosting: 'On-Premise', criticality: 'Critical', license: 'Perpetual', cost: 'Bundled', support: 'Active' },
  { id: 'APP-022', name: 'Kastle Treasury', vendor: 'Kastle', version: 'v2', bu: 'NBFC', category: 'Core', hosting: 'On-Premise', criticality: 'High', license: 'Perpetual', cost: '₹2,000,000', support: 'Extended' },
  { id: 'APP-023', name: 'Yubi Co-Lending', vendor: 'Yubi', version: 'Cloud', bu: 'NBFC', category: 'Integration', hosting: 'SaaS', criticality: 'High', license: 'Subscription', cost: '₹5,000,000', support: 'Active' },
  { id: 'APP-024', name: 'NSE eIPO', vendor: 'NSE', version: 'Web', bu: 'Broking', category: 'Integration', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹500,000', support: 'Active' },
  { id: 'APP-025', name: 'BSE StAR MF', vendor: 'BSE', version: 'API', bu: 'Broking', category: 'Integration', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹500,000', support: 'Active' },
  { id: 'APP-026', name: 'Tier1 CRM', vendor: 'Tier1', version: 'Cloud', bu: 'Inst. Equities', category: 'Supporting', hosting: 'SaaS', criticality: 'Low', license: 'Subscription', cost: '₹1,000,000', support: 'Active' },
  { id: 'APP-027', name: 'Nagios', vendor: 'Open Source', version: 'v4', bu: 'All', category: 'Infrastructure', hosting: 'On-Premise', criticality: 'Medium', license: 'Open Source', cost: '₹0', support: 'Active' },
  { id: 'APP-028', name: 'Datadog', vendor: 'Datadog', version: 'Cloud', bu: 'All', category: 'Infrastructure', hosting: 'SaaS', criticality: 'High', license: 'Subscription', cost: '₹4,500,000', support: 'Active' },
  { id: 'APP-029', name: 'Zendesk', vendor: 'Zendesk', version: 'Cloud', bu: 'Both', category: 'Supporting', hosting: 'SaaS', criticality: 'Medium', license: 'Subscription', cost: '₹2,200,000', support: 'Active' },
  { id: 'APP-030', name: 'Darwinbox HRMS', vendor: 'Darwinbox', version: 'Cloud', bu: 'All', category: 'Supporting', hosting: 'SaaS', criticality: 'Low', license: 'Subscription', cost: '₹1,800,000', support: 'Active' },
  { id: 'APP-031', name: 'AWS Infrastructure', vendor: 'AWS', version: 'Cloud', bu: 'All', category: 'Infrastructure', hosting: 'Cloud', criticality: 'Critical', license: 'Subscription', cost: '₹25,000,000', support: 'Active' }
];

const aibomData = [
  { id: 'AI-001', name: 'Customer Support Bot', type: 'Chatbot (LLM)', provider: 'OpenAI (Azure)', purpose: 'L1 Support Queries', data: 'Public FAQ, User Chat Logs', risk: 'Medium', compliance: 'Review needed' },
  { id: 'AI-002', name: 'KYC Document OCR', type: 'Computer Vision', provider: 'AWS Textract', purpose: 'Extract PAN/Aadhaar details', data: 'PII, IDs', risk: 'High', compliance: 'SEBI compliant' },
  { id: 'AI-003', name: 'Credit Scoring Model', type: 'ML Model (XGBoost)', provider: 'In-house', purpose: 'NBFC Loan Approval', data: 'Financials, CIBIL', risk: 'High', compliance: 'SEBI compliant' },
  { id: 'AI-004', name: 'Market Sentiment Analysis', type: 'NLP', provider: 'In-house', purpose: 'Trading Signals', data: 'News, Twitter', risk: 'Low', compliance: 'SEBI compliant' },
  { id: 'AI-005', name: 'Algo Trading Signal Gen', type: 'Deep Learning', provider: 'In-house', purpose: 'Proprietary Trading', data: 'Market Tick Data', risk: 'High', compliance: 'Review needed' },
  { id: 'AI-006', name: 'Fraud Detection Engine', type: 'Anomaly Detection', provider: 'AWS Fraud Detector', purpose: 'Transaction Monitoring', data: 'Txn Data, User IP/Location', risk: 'High', compliance: 'SEBI compliant' },
  { id: 'AI-007', name: 'Robo-Advisor Portfolio Alloc', type: 'Optimization Model', provider: 'In-house', purpose: 'Retail Client Advice', data: 'Risk Profile, Market Data', risk: 'High', compliance: 'Review needed' },
  { id: 'AI-008', name: 'Document Summarizer', type: 'LLM', provider: 'Anthropic Claude', purpose: 'Research Reports Summary', data: 'Public Financial Reports', risk: 'Low', compliance: 'Review needed' },
  { id: 'AI-009', name: 'Internal Code Assistant', type: 'Copilot', provider: 'GitHub Copilot', purpose: 'Dev Productivity', data: 'Internal Codebase', risk: 'Medium', compliance: 'Review needed' }
];

const sbomData = [
  { name: 'React', version: '18.2.0', license: 'MIT', cve: 'None', scan: '2024-03-01', apps: 'Web Portal, Dashboard', risk: 'Low' },
  { name: 'Log4j', version: '2.14.1', license: 'Apache 2.0', cve: 'CVE-2021-44228', scan: '2024-03-01', apps: 'Legacy Java Backend', risk: 'Critical' },
  { name: 'OpenSSL', version: '1.1.1t', license: 'OpenSSL', cve: 'CVE-2023-0286', scan: '2024-02-15', apps: 'API Gateway', risk: 'High' },
  { name: 'Express', version: '4.17.1', license: 'MIT', cve: 'None', scan: '2024-03-01', apps: 'Node Microservices', risk: 'Low' },
  { name: 'Axios', version: '0.21.1', license: 'MIT', cve: 'CVE-2021-3749', scan: '2024-03-01', apps: 'Customer App', risk: 'High' },
  { name: 'Spring Boot', version: '2.4.2', license: 'Apache 2.0', cve: 'CVE-2021-22112', scan: '2024-02-20', apps: 'Core NBFC Service', risk: 'High' },
  { name: 'Lodash', version: '4.17.20', license: 'MIT', cve: 'CVE-2021-23337', scan: '2024-03-01', apps: 'Internal Dashboard', risk: 'Medium' },
  { name: 'Moment.js', version: '2.29.1', license: 'MIT', cve: 'CVE-2022-24785', scan: '2024-02-28', apps: 'Reporting Tool', risk: 'Medium' },
  { name: 'Nginx', version: '1.18.0', license: 'BSD', cve: 'CVE-2021-23017', scan: '2024-02-15', apps: 'Reverse Proxy', risk: 'Medium' },
  { name: 'Django', version: '3.1.6', license: 'BSD', cve: 'CVE-2021-32052', scan: '2024-02-22', apps: 'Partner Portal', risk: 'High' },
  { name: 'Pandas', version: '1.2.3', license: 'BSD', cve: 'None', scan: '2024-03-01', apps: 'Data Pipeline', risk: 'Low' },
  { name: 'TensorFlow', version: '2.4.1', license: 'Apache 2.0', cve: 'CVE-2021-29530', scan: '2024-02-25', apps: 'ML Models', risk: 'High' },
  { name: 'PostgreSQL', version: '12.4', license: 'PostgreSQL', cve: 'CVE-2020-25695', scan: '2024-02-10', apps: 'AIF DB', risk: 'Medium' },
  { name: 'Redis', version: '6.0.9', license: 'BSD', cve: 'CVE-2021-21309', scan: '2024-02-15', apps: 'Cache Layer', risk: 'Medium' },
  { name: 'Kafka', version: '6.0.0', license: 'Apache 2.0', cve: 'None', scan: '2024-03-01', apps: 'Message Queue', risk: 'Low' },
  { name: 'Elasticsearch', version: '7.10.2', license: 'Elastic', cve: 'CVE-2021-22144', scan: '2024-02-20', apps: 'Search Service', risk: 'Medium' },
  { name: 'jQuery', version: '3.5.1', license: 'MIT', cve: 'CVE-2020-11022', scan: '2024-02-10', apps: 'Legacy Web App', risk: 'Medium' },
  { name: 'Angular', version: '11.0.5', license: 'MIT', cve: 'None', scan: '2024-03-01', apps: 'Partner App', risk: 'Low' },
  { name: 'Vue.js', version: '2.6.12', license: 'MIT', cve: 'None', scan: '2024-03-01', apps: 'Internal Tools', risk: 'Low' },
  { name: 'Bootstrap', version: '4.5.3', license: 'MIT', cve: 'None', scan: '2024-03-01', apps: 'Legacy Site', risk: 'Low' },
  { name: 'Hibernate', version: '5.4.28', license: 'LGPL', cve: 'None', scan: '2024-03-01', apps: 'Java Services', risk: 'Low' },
  { name: 'Jackson', version: '2.11.4', license: 'Apache 2.0', cve: 'CVE-2020-36179', scan: '2024-02-28', apps: 'Java Services', risk: 'Medium' }
];

const chartData = [
  { name: 'Broking', value: 45, color: '#3b82f6' }, // blue
  { name: 'NBFC', value: 30, color: '#10b981' },    // green
  { name: 'AIF', value: 15, color: '#8b5cf6' },     // purple
  { name: 'Inst. Eq', value: 10, color: '#f59e0b' } // gold
];

const budgetData = [
  { name: 'Q1', Opex: 40, Capex: 24 },
  { name: 'Q2', Opex: 30, Capex: 13 },
  { name: 'Q3', Opex: 20, Capex: 98 },
  { name: 'Q4', Opex: 27, Capex: 39 },
];

export function ITTransformationApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [businessFilter, setBusinessFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  
  const { toast } = useToast();

  const handleExport = () => {
    toast({
      title: "Preparing Excel Export",
      description: "Your download will begin shortly.",
    });
  };

  const filteredChecklist = checklistData.filter(item => {
    const matchesSearch = item.feature.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.currentApp.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBusiness = businessFilter === 'All' || item.business === businessFilter || item.business === 'Both' || item.business === 'All';
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesBusiness && matchesStatus;
  });

  const getBusinessColor = (bu: string) => {
    switch(bu) {
      case 'Broking': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'NBFC': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'AIF': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'Both': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'All': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Available': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Partial': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'Not Available': return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'Legacy': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#0b1120] text-slate-200 overflow-hidden font-sans">
      
      {/* Sidebar */}
      <div className="w-64 bg-[#0f172a] border-r border-slate-800 flex flex-col shrink-0 z-10">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-[#0a0f1c]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="font-bold text-lg tracking-tight text-white">Ashika Group</div>
          </div>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto space-y-1 scrollbar-hide">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 mt-2 px-2">Planning Suite</div>
          
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Executive Summary
          </button>
          
          <button 
            onClick={() => setActiveTab('checklist')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'checklist' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <CheckSquare className="w-4 h-4" />
            IT Master Checklist
          </button>
          
          <button 
            onClick={() => setActiveTab('roadmap')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'roadmap' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Map className="w-4 h-4" />
            Transformation Roadmap
          </button>
          
          <button 
            onClick={() => setActiveTab('retirement')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'retirement' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Archive className="w-4 h-4" />
            App Retirement Plan
          </button>

          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 mt-8 px-2">Inventories</div>

          <button 
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'inventory' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Database className="w-4 h-4" />
            Application Inventory
          </button>
          
          <button 
            onClick={() => setActiveTab('aibom')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'aibom' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Cpu className="w-4 h-4" />
            AI BOM (AIBOM)
          </button>

          <button 
            onClick={() => setActiveTab('sbom')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'sbom' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Shield className="w-4 h-4" />
            Software BOM (SBOM)
          </button>
        </div>
        
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">CTO</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-200 truncate">Chief Technology Officer</div>
              <div className="text-xs text-slate-500 truncate">Office of the CTO</div>
            </div>
            <Settings className="w-4 h-4 text-slate-500 hover:text-slate-300 cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0b1120] relative">
        
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800/60 bg-[#0b1120]/80 backdrop-blur-md sticky top-0 z-10">
          <h1 className="text-xl font-semibold text-slate-100">
            {activeTab === 'dashboard' && 'Executive Summary Dashboard'}
            {activeTab === 'checklist' && 'IT Transformation Master Checklist'}
            {activeTab === 'roadmap' && 'Transformation Roadmap (12 Months)'}
            {activeTab === 'retirement' && 'Application Retirement & Consolidation Plan'}
            {activeTab === 'inventory' && 'Enterprise Application Inventory'}
            {activeTab === 'aibom' && 'AI Bill of Materials (AIBOM)'}
            {activeTab === 'sbom' && 'Software Bill of Materials (SBOM)'}
          </h1>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" className="bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold shadow-lg shadow-amber-500/20" onClick={() => toast({ title: "Changes Saved", description: "All updates have been saved successfully." })}>
              Save Changes
            </Button>
          </div>
        </header>

        {/* Scrollable Area */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          
          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">Total IT Spend (FY24)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">₹14.2 Cr</div>
                    <p className="text-xs text-emerald-400 mt-1 flex items-center"><ArrowRight className="w-3 h-3 mr-1 rotate-45" /> +12% from FY23</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">Apps to Retire</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">12</div>
                    <p className="text-xs text-amber-400 mt-1 flex items-center">Est. Savings: ₹1.2 Cr/yr</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">Total Applications</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">84</div>
                    <p className="text-xs text-slate-500 mt-1 flex items-center">Across 4 Business Units</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">Security Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-emerald-500">B+</div>
                    <p className="text-xs text-amber-400 mt-1 flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> 3 Critical CVEs found</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-lg text-slate-200">Application Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9' }} />
                        <Legend wrapperStyle={{ color: '#94a3b8' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-lg text-slate-200">Transformation Budget Allocation (₹ Lakhs)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={budgetData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9' }} />
                        <Legend wrapperStyle={{ color: '#94a3b8' }} />
                        <Bar dataKey="Opex" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                        <Bar dataKey="Capex" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-200">Top 5 Strategic Priorities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { title: "Implement Centralized SIEM (IBM QRadar)", status: "Pending", bu: "All" },
                      { title: "Migrate Broking OMS to Symphony Presto Pro", status: "In Progress", bu: "Broking" },
                      { title: "Launch Unified Mobile App for Broking & AIF", status: "Planning", bu: "Both" },
                      { title: "Replace Legacy NBFC LMS", status: "Vendor Eval", bu: "NBFC" },
                      { title: "Establish Cloud DR on AWS", status: "Testing", bu: "All" }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/30 hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer" />
                          <span className="font-medium text-slate-300">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={`font-normal ${getBusinessColor(item.bu)}`}>{item.bu}</Badge>
                          <span className="text-sm text-slate-500 w-24 text-right">{item.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* CHECKLIST TAB */}
          {activeTab === 'checklist' && (
            <div className="flex flex-col h-full space-y-4">
              <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-sm shrink-0">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    placeholder="Search systems, apps, features..." 
                    className="pl-9 bg-slate-950 border-slate-800 text-slate-200 focus-visible:ring-amber-500 h-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <Select value={businessFilter} onValueChange={setBusinessFilter}>
                  <SelectTrigger className="w-[180px] bg-slate-950 border-slate-800 text-slate-200 h-10">
                    <SelectValue placeholder="Business Unit" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <SelectItem value="All">All Business Units</SelectItem>
                    <SelectItem value="Broking">Broking</SelectItem>
                    <SelectItem value="NBFC">NBFC</SelectItem>
                    <SelectItem value="AIF">AIF</SelectItem>
                    <SelectItem value="Inst. Equities">Inst. Equities</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px] bg-slate-950 border-slate-800 text-slate-200 h-10">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <SelectItem value="All">All Statuses</SelectItem>
                    <SelectItem value="Available">Available</SelectItem>
                    <SelectItem value="Partial">Partial</SelectItem>
                    <SelectItem value="Legacy">Legacy</SelectItem>
                    <SelectItem value="Not Available">Not Available</SelectItem>
                  </SelectContent>
                </Select>

                <div className="ml-auto text-sm text-slate-400 font-medium">
                  Showing {filteredChecklist.length} items
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50 flex-1 flex flex-col">
                <div className="overflow-auto flex-1">
                  <Table>
                    <TableHeader className="bg-slate-900/90 sticky top-0 backdrop-blur supports-[backdrop-filter]:bg-slate-900/50 z-10">
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="w-[50px] text-slate-400">#</TableHead>
                        <TableHead className="min-w-[200px] text-slate-400">Feature / System</TableHead>
                        <TableHead className="text-slate-400">Category</TableHead>
                        <TableHead className="text-slate-400">Business Unit</TableHead>
                        <TableHead className="min-w-[200px] text-slate-400">Current App/Service</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                        <TableHead className="min-w-[250px] text-slate-400">CTO Comments</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredChecklist.map((item) => (
                        <TableRow key={item.id} className="border-slate-800/50 hover:bg-slate-800/30 group">
                          <TableCell className="py-3">
                            <input type="checkbox" className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer" />
                          </TableCell>
                          <TableCell className="font-medium text-slate-200 py-3">{item.feature}</TableCell>
                          <TableCell className="text-slate-400 py-3 text-sm">{item.category}</TableCell>
                          <TableCell className="py-3">
                            <Badge variant="outline" className={`font-normal ${getBusinessColor(item.business)}`}>
                              {item.business}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3">
                            <Input 
                              defaultValue={item.currentApp} 
                              className="h-8 bg-slate-950/50 border-slate-800 text-slate-300 text-sm focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all"
                            />
                          </TableCell>
                          <TableCell className="py-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                              {item.status}
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            <Input 
                              defaultValue={item.comments} 
                              placeholder="Add comment..."
                              className="h-8 bg-slate-950/50 border-transparent hover:border-slate-800 focus:border-amber-500 text-slate-400 text-sm focus-visible:ring-amber-500 transition-all w-full"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {/* ROADMAP TAB */}
          {activeTab === 'roadmap' && (
            <div className="space-y-8 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {roadmapData.map((phase) => (
                  <div key={phase.id} className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="bg-slate-900 p-4 border-b border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="text-xs font-bold tracking-wider text-amber-500 uppercase">{phase.phase}</div>
                        <h3 className="text-lg font-semibold text-slate-200 mt-1">{phase.name}</h3>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Budget</div>
                        <div className="font-mono font-medium text-slate-300">{phase.budget}</div>
                      </div>
                    </div>
                    <div className="p-4 flex-1 space-y-3 bg-[#0b1120]/50">
                      {phase.initiatives.map((init, i) => (
                        <div key={i} className="bg-slate-900 border border-slate-800/80 p-3 rounded-lg hover:border-slate-700 transition-colors shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="text-sm font-medium text-slate-200 leading-snug pr-4">{init.name}</h4>
                            <MoreVertical className="w-4 h-4 text-slate-600 shrink-0" />
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-[10px] py-0 ${getBusinessColor(init.bu)}`}>
                                {init.bu}
                              </Badge>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${init.priority === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                {init.priority}
                              </span>
                            </div>
                            <div className="text-xs font-mono text-slate-400">{init.budget}</div>
                          </div>
                        </div>
                      ))}
                      <Button variant="ghost" className="w-full mt-2 border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800">
                        <Plus className="w-4 h-4 mr-2" /> Add Initiative
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Card className="bg-slate-900/50 border-slate-800 mt-8">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-200">Gantt Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative pt-4 pb-8 overflow-x-auto">
                    <div className="min-w-[800px]">
                      {/* Months Header */}
                      <div className="flex mb-4 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-2">
                        <div className="w-48 shrink-0">Initiative</div>
                        {[...Array(12)].map((_, i) => (
                          <div key={i} className="flex-1 text-center">M{i+1}</div>
                        ))}
                      </div>
                      
                      {/* Bars */}
                      <div className="space-y-4">
                        <div className="flex items-center">
                          <div className="w-48 shrink-0 text-sm text-slate-300 pr-4 truncate">SIEM Deployment</div>
                          <div className="flex-1 relative h-6 bg-slate-800/30 rounded">
                            <div className="absolute left-0 w-[50%] h-full bg-blue-500/80 rounded-md"></div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="w-48 shrink-0 text-sm text-slate-300 pr-4 truncate">OMS Upgrade</div>
                          <div className="flex-1 relative h-6 bg-slate-800/30 rounded">
                            <div className="absolute left-[33%] w-[66%] h-full bg-amber-500/80 rounded-md"></div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="w-48 shrink-0 text-sm text-slate-300 pr-4 truncate">Cloud DR (Phase 1)</div>
                          <div className="flex-1 relative h-6 bg-slate-800/30 rounded">
                            <div className="absolute left-[16%] w-[40%] h-full bg-emerald-500/80 rounded-md"></div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="w-48 shrink-0 text-sm text-slate-300 pr-4 truncate">Mobile App Rewrite</div>
                          <div className="flex-1 relative h-6 bg-slate-800/30 rounded">
                            <div className="absolute left-[50%] w-[50%] h-full bg-purple-500/80 rounded-md"></div>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="w-48 shrink-0 text-sm text-slate-300 pr-4 truncate">Data Warehouse Migr</div>
                          <div className="flex-1 relative h-6 bg-slate-800/30 rounded">
                            <div className="absolute left-[16%] w-[66%] h-full bg-sky-500/80 rounded-md"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* RETIREMENT TAB */}
          {activeTab === 'retirement' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-400">Total Apps to Retire</p>
                        <h3 className="text-3xl font-bold text-white mt-1">12</h3>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                        <Archive className="w-6 h-6 text-red-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-400">Migration Budget</p>
                        <h3 className="text-3xl font-bold text-white mt-1">₹155L</h3>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <span className="text-xl font-bold text-amber-500">₹</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-400">Completed Retirements</p>
                        <h3 className="text-3xl font-bold text-white mt-1">2 <span className="text-sm font-normal text-slate-500">/ 12</span></h3>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                <Table>
                  <TableHeader className="bg-slate-900">
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Application to Retire</TableHead>
                      <TableHead className="text-slate-400">Business Unit</TableHead>
                      <TableHead className="text-slate-400">Reason</TableHead>
                      <TableHead className="text-slate-400">Target Date</TableHead>
                      <TableHead className="text-slate-400">Successor Application</TableHead>
                      <TableHead className="text-slate-400 text-right">Budget (₹ L)</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retirementData.map((item) => (
                      <TableRow key={item.id} className="border-slate-800/50 hover:bg-slate-800/30">
                        <TableCell className="font-medium text-red-400 line-through decoration-red-900/50">{item.app}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`font-normal ${getBusinessColor(item.bu)}`}>
                            {item.bu}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm">{item.reason}</TableCell>
                        <TableCell className="text-slate-400 text-sm font-mono">{item.targetDate}</TableCell>
                        <TableCell className="text-emerald-400 font-medium">{item.successor}</TableCell>
                        <TableCell className="text-right text-slate-300 font-mono">{item.budget}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium 
                            ${item.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                              item.status === 'In Progress' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                              'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                            {item.status === 'Completed' && <CheckCircle2 className="w-3 h-3" />}
                            {item.status === 'In Progress' && <Clock className="w-3 h-3" />}
                            {item.status === 'Planned' && <AlertTriangle className="w-3 h-3" />}
                            {item.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* INVENTORY TAB */}
          {activeTab === 'inventory' && (
            <div className="space-y-4 h-full flex flex-col">
              <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-sm shrink-0">
                <div className="relative w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    placeholder="Search applications..." 
                    className="pl-9 bg-slate-950 border-slate-800 text-slate-200 focus-visible:ring-amber-500"
                  />
                </div>
                <Button className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
                  <Filter className="w-4 h-4 mr-2" /> More Filters
                </Button>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50 flex-1">
                <div className="overflow-auto h-full">
                  <Table>
                    <TableHeader className="bg-slate-900 sticky top-0 z-10">
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400 font-mono text-xs">App ID</TableHead>
                        <TableHead className="text-slate-400">Application Name</TableHead>
                        <TableHead className="text-slate-400">Vendor</TableHead>
                        <TableHead className="text-slate-400">Business Unit</TableHead>
                        <TableHead className="text-slate-400">Category</TableHead>
                        <TableHead className="text-slate-400">Hosting</TableHead>
                        <TableHead className="text-slate-400">Criticality</TableHead>
                        <TableHead className="text-slate-400 text-right">Annual Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryData.map((app) => (
                        <TableRow key={app.id} className="border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors">
                          <TableCell className="text-slate-500 font-mono text-xs">{app.id}</TableCell>
                          <TableCell className="font-medium text-slate-200">{app.name}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{app.vendor}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`font-normal text-[10px] py-0 ${getBusinessColor(app.bu)}`}>
                              {app.bu}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-300 text-sm">{app.category}</TableCell>
                          <TableCell className="text-slate-400 text-sm">
                            {app.hosting === 'Cloud' ? <span className="text-sky-400 font-medium">Cloud</span> : 
                             app.hosting === 'SaaS' ? <span className="text-purple-400 font-medium">SaaS</span> : 
                             <span className="text-slate-400">On-Premise</span>}
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs font-semibold uppercase tracking-wider 
                              ${app.criticality === 'Critical' ? 'text-red-500' : 
                                app.criticality === 'High' ? 'text-amber-500' : 'text-blue-500'}`}>
                              {app.criticality}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-slate-300 font-mono text-sm">{app.cost}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {/* AIBOM TAB */}
          {activeTab === 'aibom' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-indigo-500/30 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="flex items-start justify-between relative z-10">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-indigo-400" />
                      AI Bill of Materials (AIBOM)
                    </h2>
                    <p className="text-indigo-200/70 mt-1 text-sm max-w-2xl">
                      Central registry of all Artificial Intelligence, Machine Learning models, and LLMs deployed across the enterprise to ensure regulatory compliance and risk governance.
                    </p>
                  </div>
                  <Button className="bg-indigo-600 hover:bg-indigo-500 text-white border-0">
                    <Plus className="w-4 h-4 mr-2" /> Register Component
                  </Button>
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                <Table>
                  <TableHeader className="bg-slate-900">
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400 font-mono text-xs">ID</TableHead>
                      <TableHead className="text-slate-400">Component Name</TableHead>
                      <TableHead className="text-slate-400">Type</TableHead>
                      <TableHead className="text-slate-400">Provider</TableHead>
                      <TableHead className="text-slate-400">Data Processed</TableHead>
                      <TableHead className="text-slate-400">Risk Level</TableHead>
                      <TableHead className="text-slate-400">Compliance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aibomData.map((item) => (
                      <TableRow key={item.id} className="border-slate-800/50 hover:bg-slate-800/30">
                        <TableCell className="text-slate-500 font-mono text-xs">{item.id}</TableCell>
                        <TableCell className="font-medium text-slate-200">{item.name}</TableCell>
                        <TableCell>
                          <span className="text-indigo-300 text-sm bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded inline-block">
                            {item.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">{item.provider}</TableCell>
                        <TableCell className="text-slate-400 text-sm">{item.data}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border
                            ${item.risk === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                              item.risk === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                              'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                            {item.risk}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5 text-sm">
                            {item.compliance === 'SEBI compliant' ? 
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : 
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            }
                            <span className={item.compliance === 'SEBI compliant' ? 'text-emerald-400' : 'text-amber-400'}>
                              {item.compliance}
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* SBOM TAB */}
          {activeTab === 'sbom' && (
            <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase">Components Scanned</p>
                      <h3 className="text-2xl font-bold text-white mt-1">1,248</h3>
                    </div>
                    <Database className="w-8 h-8 text-blue-500/30" />
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-red-900/30 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent"></div>
                  <CardContent className="p-4 flex items-center justify-between relative z-10">
                    <div>
                      <p className="text-xs font-medium text-red-400/80 uppercase">Critical CVEs</p>
                      <h3 className="text-2xl font-bold text-red-500 mt-1">3</h3>
                    </div>
                    <AlertTriangle className="w-8 h-8 text-red-500/50" />
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase">GPL Licenses (Risk)</p>
                      <h3 className="text-2xl font-bold text-amber-500 mt-1">14</h3>
                    </div>
                    <Shield className="w-8 h-8 text-amber-500/30" />
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase">Last Global Scan</p>
                      <h3 className="text-lg font-bold text-white mt-2">Today, 04:00 AM</h3>
                    </div>
                    <Clock className="w-8 h-8 text-slate-600" />
                  </CardContent>
                </Card>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                <Table>
                  <TableHeader className="bg-slate-900">
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Library / Component</TableHead>
                      <TableHead className="text-slate-400">Version</TableHead>
                      <TableHead className="text-slate-400">License</TableHead>
                      <TableHead className="text-slate-400">Vulnerability (CVE)</TableHead>
                      <TableHead className="text-slate-400">Used In</TableHead>
                      <TableHead className="text-slate-400">Risk</TableHead>
                      <TableHead className="text-slate-400 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sbomData.map((item, i) => (
                      <TableRow key={i} className="border-slate-800/50 hover:bg-slate-800/30">
                        <TableCell className="font-medium text-slate-200 font-mono text-sm">{item.name}</TableCell>
                        <TableCell className="text-slate-400 text-sm">{item.version}</TableCell>
                        <TableCell className="text-slate-400 text-sm">{item.license}</TableCell>
                        <TableCell>
                          {item.cve !== 'None' ? (
                            <span className="text-red-400 text-xs font-mono bg-red-500/10 px-2 py-1 rounded border border-red-500/20">{item.cve}</span>
                          ) : (
                            <span className="text-slate-500 text-sm">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">{item.apps}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border
                            ${item.risk === 'Critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 
                              item.risk === 'High' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 
                              item.risk === 'Medium' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 
                              'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                            {item.risk}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-8 text-slate-400 hover:text-white hover:bg-slate-800">
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
        </main>
      </div>
    </div>
  );
}
