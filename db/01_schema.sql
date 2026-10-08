-- IT Transformation Hub — 01 schema (tables, sequences, indexes, constraints)
-- Target DB: it-hub   Run as: root_admin (connected to it-hub)
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: aibom_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aibom_entries (
    id integer NOT NULL,
    component_id text NOT NULL,
    name text NOT NULL,
    version text,
    type text NOT NULL,
    provider text NOT NULL,
    endpoint text,
    use_case text,
    data_used text,
    data_classification text,
    risk_level text NOT NULL,
    compliance_status text NOT NULL,
    governance_framework text,
    governance_review_date text,
    last_audit_date text,
    comments text,
    created_by text,
    modified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aibom_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aibom_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aibom_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aibom_entries_id_seq OWNED BY public.aibom_entries.id;


--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id integer NOT NULL,
    app_id text NOT NULL,
    name text NOT NULL,
    vendor text,
    version text,
    business text NOT NULL,
    category text NOT NULL,
    hosting text NOT NULL,
    criticality text NOT NULL,
    license_type text,
    license_expiry text,
    annual_cost_lakhs integer,
    data_classification text,
    owner text,
    support_status text DEFAULT 'Active'::text NOT NULL,
    comments text,
    application_status text DEFAULT 'Active'::text NOT NULL,
    date_of_onboarding text,
    date_of_retirement text,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    modified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.applications_id_seq OWNED BY public.applications.id;


--
-- Name: asset_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_allocations (
    id integer NOT NULL,
    asset_id integer NOT NULL,
    user_id integer,
    user_name text,
    employee_code text,
    designation text,
    department text,
    location text,
    start_date text,
    end_date text,
    status text DEFAULT 'Active'::text NOT NULL,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asset_allocations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asset_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asset_allocations_id_seq OWNED BY public.asset_allocations.id;


--
-- Name: asset_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_categories (
    id integer NOT NULL,
    name text NOT NULL,
    parent_id integer,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asset_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asset_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asset_categories_id_seq OWNED BY public.asset_categories.id;


--
-- Name: asset_licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_licenses (
    id integer NOT NULL,
    product_name text NOT NULL,
    vendor_name text,
    vendor_id integer,
    license_key text,
    license_type text DEFAULT 'Perpetual'::text NOT NULL,
    expiry_date text,
    seats_total integer DEFAULT 1 NOT NULL,
    seats_used integer DEFAULT 0 NOT NULL,
    cost numeric(12,2),
    status text DEFAULT 'Active'::text NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_licenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asset_licenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asset_licenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asset_licenses_id_seq OWNED BY public.asset_licenses.id;


--
-- Name: asset_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_transactions (
    id integer NOT NULL,
    asset_id integer NOT NULL,
    action text NOT NULL,
    old_status text,
    new_status text,
    user_id integer,
    user_name text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asset_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asset_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asset_transactions_id_seq OWNED BY public.asset_transactions.id;


--
-- Name: asset_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_vendors (
    id integer NOT NULL,
    name text NOT NULL,
    contact_person text,
    email text,
    phone text,
    address text,
    contract_start text,
    contract_end text,
    rating integer,
    status text DEFAULT 'Active'::text NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asset_vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asset_vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asset_vendors_id_seq OWNED BY public.asset_vendors.id;


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id integer NOT NULL,
    asset_tag text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    category_id integer,
    serial_number text,
    status text DEFAULT 'In Stock'::text NOT NULL,
    owner_id integer,
    owner_name text,
    department text,
    location text,
    purchase_date text,
    purchase_order_no text,
    cost numeric(12,2),
    vendor_id integer,
    vendor_name text,
    warranty_expiry text,
    ip_address text,
    mac_address text,
    os_version text,
    configuration text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id integer,
    action text NOT NULL,
    performed_by text,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    summary text,
    old_values jsonb,
    new_values jsonb,
    context jsonb
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: business_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_units (
    id integer NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_units_id_seq OWNED BY public.business_units.id;


--
-- Name: checklist_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_comments (
    id integer NOT NULL,
    checklist_item_id integer NOT NULL,
    author_name text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: checklist_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checklist_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checklist_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checklist_comments_id_seq OWNED BY public.checklist_comments.id;


--
-- Name: checklist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_items (
    id integer NOT NULL,
    category text NOT NULL,
    feature text NOT NULL,
    business text NOT NULL,
    current_app text,
    status text DEFAULT 'Not Available'::text NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    comments text,
    created_by text,
    modified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: checklist_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checklist_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checklist_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checklist_items_id_seq OWNED BY public.checklist_items.id;


--
-- Name: itsm_approval_matrix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_approval_matrix (
    id integer NOT NULL,
    ticket_type text NOT NULL,
    condition text,
    approver_role text NOT NULL,
    approver_level text NOT NULL,
    sequence integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_approval_matrix_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_approval_matrix_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_approval_matrix_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_approval_matrix_id_seq OWNED BY public.itsm_approval_matrix.id;


--
-- Name: itsm_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_approvals (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    ticket_type text NOT NULL,
    approver_level text NOT NULL,
    approver_role text NOT NULL,
    approver_name text,
    status text DEFAULT 'Pending'::text NOT NULL,
    notes text,
    action_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_approvals_id_seq OWNED BY public.itsm_approvals.id;


--
-- Name: itsm_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_attachments (
    id integer NOT NULL,
    ticket_type text NOT NULL,
    ticket_id integer NOT NULL,
    file_name text NOT NULL,
    file_size integer NOT NULL,
    content_type text NOT NULL,
    object_path text NOT NULL,
    uploaded_by integer,
    uploaded_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_attachments_id_seq OWNED BY public.itsm_attachments.id;


--
-- Name: itsm_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_changes (
    id integer NOT NULL,
    change_no text NOT NULL,
    title text NOT NULL,
    description text,
    type text DEFAULT 'Normal'::text NOT NULL,
    category text,
    risk_level text DEFAULT 'Medium'::text NOT NULL,
    impact text,
    approval_status text DEFAULT 'Pending'::text NOT NULL,
    requested_by text,
    approved_by text,
    implementation_date text,
    rollback_plan text,
    test_plan text,
    backout_duration text,
    status text DEFAULT 'Draft'::text NOT NULL,
    problem_id integer,
    affected_assets text,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_changes_id_seq OWNED BY public.itsm_changes.id;


--
-- Name: itsm_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_incidents (
    id integer NOT NULL,
    ticket_no text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'Open'::text NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    severity text DEFAULT 'S3'::text NOT NULL,
    urgency text,
    impact_level text,
    source text,
    category text,
    subcategory text,
    assigned_to text,
    assigned_group text,
    reported_by text,
    reporter_email text,
    affected_system text,
    sla_id integer,
    sla_breach_at timestamp with time zone,
    problem_id integer,
    resolution_notes text,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_incidents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_incidents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_incidents_id_seq OWNED BY public.itsm_incidents.id;


--
-- Name: itsm_knowledge_base; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_knowledge_base (
    id integer NOT NULL,
    title text NOT NULL,
    content text,
    category text,
    tags text,
    author_name text,
    views integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'Published'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_knowledge_base_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_knowledge_base_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_knowledge_base_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_knowledge_base_id_seq OWNED BY public.itsm_knowledge_base.id;


--
-- Name: itsm_problems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_problems (
    id integer NOT NULL,
    problem_no text NOT NULL,
    title text NOT NULL,
    description text,
    root_cause text,
    workaround text,
    status text DEFAULT 'Open'::text NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    category text,
    impact_level text,
    assigned_to text,
    assigned_group text,
    related_incidents text,
    affected_systems text,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_problems_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_problems_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_problems_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_problems_id_seq OWNED BY public.itsm_problems.id;


--
-- Name: itsm_service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_service_requests (
    id integer NOT NULL,
    request_no text NOT NULL,
    title text NOT NULL,
    description text,
    category text,
    status text DEFAULT 'Submitted'::text NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    urgency text,
    requested_by text,
    assigned_to text,
    assigned_group text,
    department text,
    due_date text,
    fulfillment_notes text,
    completed_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_service_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_service_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_service_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_service_requests_id_seq OWNED BY public.itsm_service_requests.id;


--
-- Name: itsm_sla_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_sla_policies (
    id integer NOT NULL,
    name text NOT NULL,
    ticket_type text DEFAULT 'Incident'::text NOT NULL,
    priority text NOT NULL,
    response_time_hours integer NOT NULL,
    resolution_time_hours integer NOT NULL,
    escalation_enabled boolean DEFAULT true NOT NULL,
    escalation_policy text,
    business_hours boolean DEFAULT true NOT NULL,
    sla_type text DEFAULT '24x7'::text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_sla_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_sla_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_sla_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_sla_policies_id_seq OWNED BY public.itsm_sla_policies.id;


--
-- Name: itsm_ticket_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itsm_ticket_history (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    ticket_type text NOT NULL,
    old_status text,
    new_status text,
    updated_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itsm_ticket_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itsm_ticket_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itsm_ticket_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itsm_ticket_history_id_seq OWNED BY public.itsm_ticket_history.id;


--
-- Name: kpi_actuals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_actuals (
    id integer NOT NULL,
    kpi_id integer NOT NULL,
    year_id integer NOT NULL,
    quarter integer NOT NULL,
    actual_value numeric(15,4),
    score numeric(5,2),
    score_override boolean DEFAULT false NOT NULL,
    comments text,
    evidence_url text,
    evidence_file_name text,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_actuals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_actuals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_actuals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_actuals_id_seq OWNED BY public.kpi_actuals.id;


--
-- Name: kpi_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_approvals (
    id integer NOT NULL,
    kpi_id integer NOT NULL,
    requested_by integer,
    reviewed_by integer,
    status text DEFAULT 'Pending'::text NOT NULL,
    comments text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);


--
-- Name: kpi_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_approvals_id_seq OWNED BY public.kpi_approvals.id;


--
-- Name: kpi_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_categories (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    color text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_categories_id_seq OWNED BY public.kpi_categories.id;


--
-- Name: kpi_persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_persons (
    id integer NOT NULL,
    name text NOT NULL,
    designation text NOT NULL,
    department text,
    email text,
    employee_code text,
    approving_authority_id integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_persons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_persons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_persons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_persons_id_seq OWNED BY public.kpi_persons.id;


--
-- Name: kpi_set_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_set_items (
    id integer NOT NULL,
    set_id integer NOT NULL,
    version_id integer NOT NULL,
    sno integer,
    kpi_name text NOT NULL,
    description text,
    category text,
    weightage numeric(8,2),
    metric text,
    unit text,
    annual_target numeric(14,2),
    q1_target numeric(14,2),
    q2_target numeric(14,2),
    q3_target numeric(14,2),
    q4_target numeric(14,2),
    q1_actual numeric(14,2),
    q2_actual numeric(14,2),
    q3_actual numeric(14,2),
    q4_actual numeric(14,2),
    remarks text,
    kpi_id text,
    kpi_type text,
    owner text,
    business_alignment text,
    data_source text,
    risk_dependency text,
    approval_status text DEFAULT 'Draft'::text NOT NULL,
    approved_by integer,
    approval_comments text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_set_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_set_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_set_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_set_items_id_seq OWNED BY public.kpi_set_items.id;


--
-- Name: kpi_set_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_set_versions (
    id integer NOT NULL,
    set_id integer NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    file_name text,
    file_data text,
    file_size integer,
    item_count integer DEFAULT 0,
    uploaded_by integer,
    comments text,
    is_current boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_set_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_set_versions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_set_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_set_versions_id_seq OWNED BY public.kpi_set_versions.id;


--
-- Name: kpi_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_sets (
    id integer NOT NULL,
    person_id integer NOT NULL,
    year_id integer NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    current_version_id integer,
    notes text,
    submitted_at timestamp with time zone,
    approved_at timestamp with time zone,
    approved_by integer,
    approval_comments text,
    actuals_status text DEFAULT 'NotStarted'::text NOT NULL,
    actuals_submitted_at timestamp with time zone,
    actuals_reviewed_at timestamp with time zone,
    actuals_reviewed_by integer,
    actuals_review_comments text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_sets_id_seq OWNED BY public.kpi_sets.id;


--
-- Name: kpi_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_settings (
    id integer NOT NULL,
    approval_enabled boolean DEFAULT false NOT NULL,
    scoring_model text DEFAULT 'percentage'::text NOT NULL,
    default_weightage_type text DEFAULT 'equal'::text NOT NULL,
    allow_cto_override boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_settings_id_seq OWNED BY public.kpi_settings.id;


--
-- Name: kpi_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_targets (
    id integer NOT NULL,
    kpi_id integer NOT NULL,
    year_id integer NOT NULL,
    annual_target numeric(15,4),
    q1_target numeric(15,4),
    q2_target numeric(15,4),
    q3_target numeric(15,4),
    q4_target numeric(15,4),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_targets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_targets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_targets_id_seq OWNED BY public.kpi_targets.id;


--
-- Name: kpi_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_years (
    id integer NOT NULL,
    label text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_current boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_years_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_years_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_years_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_years_id_seq OWNED BY public.kpi_years.id;


--
-- Name: kpis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpis (
    id integer NOT NULL,
    year_id integer NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    description text,
    category_id integer,
    weightage numeric(5,2),
    metric text,
    unit text,
    owner text,
    owner_email text,
    business_unit text,
    status text DEFAULT 'Draft'::text NOT NULL,
    approval_required boolean DEFAULT false NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpis_id_seq OWNED BY public.kpis.id;


--
-- Name: maintenance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_records (
    id integer NOT NULL,
    asset_id integer NOT NULL,
    type text DEFAULT 'Preventive'::text NOT NULL,
    description text,
    scheduled_date text,
    completed_date text,
    cost numeric(12,2),
    vendor_id integer,
    vendor_name text,
    status text DEFAULT 'Scheduled'::text NOT NULL,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: maintenance_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.maintenance_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: maintenance_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.maintenance_records_id_seq OWNED BY public.maintenance_records.id;


--
-- Name: masters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.masters (
    id integer NOT NULL,
    category text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    color text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: masters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.masters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: masters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.masters_id_seq OWNED BY public.masters.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    link text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: retirement_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retirement_documents (
    id integer NOT NULL,
    retirement_id integer NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_size integer,
    mime_type text,
    uploaded_by text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: retirement_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retirement_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retirement_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retirement_documents_id_seq OWNED BY public.retirement_documents.id;


--
-- Name: retirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retirements (
    id integer NOT NULL,
    application_id integer,
    app_name text NOT NULL,
    business text NOT NULL,
    reason text NOT NULL,
    target_date text,
    successor text,
    migration_effort text NOT NULL,
    budget_lakhs real,
    status text DEFAULT 'Planned'::text NOT NULL,
    comments text,
    created_by text,
    modified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: retirements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retirements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retirements_id_seq OWNED BY public.retirements.id;


--
-- Name: roadmap_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roadmap_items (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    phase text NOT NULL,
    business text NOT NULL,
    status text DEFAULT 'Planning'::text NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    budget_lakhs integer DEFAULT 0 NOT NULL,
    start_month integer DEFAULT 1 NOT NULL,
    end_month integer DEFAULT 6 NOT NULL,
    start_date text,
    end_date text,
    is_active boolean DEFAULT true NOT NULL,
    owner text,
    upload_batch_id integer,
    archived_at timestamp with time zone,
    archived_by text,
    created_by text,
    modified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roadmap_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roadmap_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roadmap_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roadmap_items_id_seq OWNED BY public.roadmap_items.id;


--
-- Name: roadmap_upload_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roadmap_upload_batches (
    id integer NOT NULL,
    file_name text,
    file_content text,
    uploaded_by text,
    row_count integer DEFAULT 0 NOT NULL,
    imported_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    archived_count integer DEFAULT 0 NOT NULL,
    row_errors text DEFAULT '[]'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roadmap_upload_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roadmap_upload_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roadmap_upload_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roadmap_upload_batches_id_seq OWNED BY public.roadmap_upload_batches.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id integer NOT NULL,
    role_id integer NOT NULL,
    module text NOT NULL,
    access_level text DEFAULT 'none'::text NOT NULL
);


--
-- Name: role_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_permissions_id_seq OWNED BY public.role_permissions.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    default_dashboard text DEFAULT '/'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: sbom_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sbom_entries (
    id integer NOT NULL,
    name text NOT NULL,
    version text,
    license_type text,
    cve text,
    severity text,
    purl text,
    supplier text,
    last_scan text,
    used_in text,
    risk_level text NOT NULL,
    action_required text,
    comments text,
    created_by text,
    modified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sbom_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sbom_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sbom_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sbom_entries_id_seq OWNED BY public.sbom_entries.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    key text NOT NULL,
    value jsonb,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role_id integer NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by integer
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    password_hash text,
    name text NOT NULL,
    user_type text DEFAULT 'internal'::text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    department text,
    designation text,
    employee_code text,
    mobile text,
    mfa_enabled boolean DEFAULT false NOT NULL,
    mfa_secret text,
    mfa_method text DEFAULT 'totp'::text NOT NULL,
    azure_id text,
    is_active boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    photo_url text,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: aibom_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aibom_entries ALTER COLUMN id SET DEFAULT nextval('public.aibom_entries_id_seq'::regclass);


--
-- Name: applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications ALTER COLUMN id SET DEFAULT nextval('public.applications_id_seq'::regclass);


--
-- Name: asset_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_allocations ALTER COLUMN id SET DEFAULT nextval('public.asset_allocations_id_seq'::regclass);


--
-- Name: asset_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories ALTER COLUMN id SET DEFAULT nextval('public.asset_categories_id_seq'::regclass);


--
-- Name: asset_licenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_licenses ALTER COLUMN id SET DEFAULT nextval('public.asset_licenses_id_seq'::regclass);


--
-- Name: asset_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_transactions ALTER COLUMN id SET DEFAULT nextval('public.asset_transactions_id_seq'::regclass);


--
-- Name: asset_vendors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_vendors ALTER COLUMN id SET DEFAULT nextval('public.asset_vendors_id_seq'::regclass);


--
-- Name: assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets ALTER COLUMN id SET DEFAULT nextval('public.assets_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: business_units id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_units ALTER COLUMN id SET DEFAULT nextval('public.business_units_id_seq'::regclass);


--
-- Name: checklist_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_comments ALTER COLUMN id SET DEFAULT nextval('public.checklist_comments_id_seq'::regclass);


--
-- Name: checklist_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_items ALTER COLUMN id SET DEFAULT nextval('public.checklist_items_id_seq'::regclass);


--
-- Name: itsm_approval_matrix id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_approval_matrix ALTER COLUMN id SET DEFAULT nextval('public.itsm_approval_matrix_id_seq'::regclass);


--
-- Name: itsm_approvals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_approvals ALTER COLUMN id SET DEFAULT nextval('public.itsm_approvals_id_seq'::regclass);


--
-- Name: itsm_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_attachments ALTER COLUMN id SET DEFAULT nextval('public.itsm_attachments_id_seq'::regclass);


--
-- Name: itsm_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_changes ALTER COLUMN id SET DEFAULT nextval('public.itsm_changes_id_seq'::regclass);


--
-- Name: itsm_incidents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_incidents ALTER COLUMN id SET DEFAULT nextval('public.itsm_incidents_id_seq'::regclass);


--
-- Name: itsm_knowledge_base id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_knowledge_base ALTER COLUMN id SET DEFAULT nextval('public.itsm_knowledge_base_id_seq'::regclass);


--
-- Name: itsm_problems id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_problems ALTER COLUMN id SET DEFAULT nextval('public.itsm_problems_id_seq'::regclass);


--
-- Name: itsm_service_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_service_requests ALTER COLUMN id SET DEFAULT nextval('public.itsm_service_requests_id_seq'::regclass);


--
-- Name: itsm_sla_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_sla_policies ALTER COLUMN id SET DEFAULT nextval('public.itsm_sla_policies_id_seq'::regclass);


--
-- Name: itsm_ticket_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_ticket_history ALTER COLUMN id SET DEFAULT nextval('public.itsm_ticket_history_id_seq'::regclass);


--
-- Name: kpi_actuals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_actuals ALTER COLUMN id SET DEFAULT nextval('public.kpi_actuals_id_seq'::regclass);


--
-- Name: kpi_approvals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_approvals ALTER COLUMN id SET DEFAULT nextval('public.kpi_approvals_id_seq'::regclass);


--
-- Name: kpi_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_categories ALTER COLUMN id SET DEFAULT nextval('public.kpi_categories_id_seq'::regclass);


--
-- Name: kpi_persons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_persons ALTER COLUMN id SET DEFAULT nextval('public.kpi_persons_id_seq'::regclass);


--
-- Name: kpi_set_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_set_items ALTER COLUMN id SET DEFAULT nextval('public.kpi_set_items_id_seq'::regclass);


--
-- Name: kpi_set_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_set_versions ALTER COLUMN id SET DEFAULT nextval('public.kpi_set_versions_id_seq'::regclass);


--
-- Name: kpi_sets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_sets ALTER COLUMN id SET DEFAULT nextval('public.kpi_sets_id_seq'::regclass);


--
-- Name: kpi_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_settings ALTER COLUMN id SET DEFAULT nextval('public.kpi_settings_id_seq'::regclass);


--
-- Name: kpi_targets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_targets ALTER COLUMN id SET DEFAULT nextval('public.kpi_targets_id_seq'::regclass);


--
-- Name: kpi_years id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_years ALTER COLUMN id SET DEFAULT nextval('public.kpi_years_id_seq'::regclass);


--
-- Name: kpis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpis ALTER COLUMN id SET DEFAULT nextval('public.kpis_id_seq'::regclass);


--
-- Name: maintenance_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_records ALTER COLUMN id SET DEFAULT nextval('public.maintenance_records_id_seq'::regclass);


--
-- Name: masters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.masters ALTER COLUMN id SET DEFAULT nextval('public.masters_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: retirement_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retirement_documents ALTER COLUMN id SET DEFAULT nextval('public.retirement_documents_id_seq'::regclass);


--
-- Name: retirements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retirements ALTER COLUMN id SET DEFAULT nextval('public.retirements_id_seq'::regclass);


--
-- Name: roadmap_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_items ALTER COLUMN id SET DEFAULT nextval('public.roadmap_items_id_seq'::regclass);


--
-- Name: roadmap_upload_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_upload_batches ALTER COLUMN id SET DEFAULT nextval('public.roadmap_upload_batches_id_seq'::regclass);


--
-- Name: role_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions ALTER COLUMN id SET DEFAULT nextval('public.role_permissions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: sbom_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbom_entries ALTER COLUMN id SET DEFAULT nextval('public.sbom_entries_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: aibom_entries aibom_entries_component_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aibom_entries
    ADD CONSTRAINT aibom_entries_component_id_unique UNIQUE (component_id);


--
-- Name: aibom_entries aibom_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aibom_entries
    ADD CONSTRAINT aibom_entries_pkey PRIMARY KEY (id);


--
-- Name: applications applications_app_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_app_id_unique UNIQUE (app_id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: asset_allocations asset_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_allocations
    ADD CONSTRAINT asset_allocations_pkey PRIMARY KEY (id);


--
-- Name: asset_categories asset_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);


--
-- Name: asset_licenses asset_licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_licenses
    ADD CONSTRAINT asset_licenses_pkey PRIMARY KEY (id);


--
-- Name: asset_transactions asset_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_transactions
    ADD CONSTRAINT asset_transactions_pkey PRIMARY KEY (id);


--
-- Name: asset_vendors asset_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_vendors
    ADD CONSTRAINT asset_vendors_pkey PRIMARY KEY (id);


--
-- Name: assets assets_asset_tag_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_tag_unique UNIQUE (asset_tag);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: business_units business_units_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_units
    ADD CONSTRAINT business_units_code_unique UNIQUE (code);


--
-- Name: business_units business_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_units
    ADD CONSTRAINT business_units_pkey PRIMARY KEY (id);


--
-- Name: checklist_comments checklist_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_comments
    ADD CONSTRAINT checklist_comments_pkey PRIMARY KEY (id);


--
-- Name: checklist_items checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_items
    ADD CONSTRAINT checklist_items_pkey PRIMARY KEY (id);


--
-- Name: itsm_approval_matrix itsm_approval_matrix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_approval_matrix
    ADD CONSTRAINT itsm_approval_matrix_pkey PRIMARY KEY (id);


--
-- Name: itsm_approvals itsm_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_approvals
    ADD CONSTRAINT itsm_approvals_pkey PRIMARY KEY (id);


--
-- Name: itsm_attachments itsm_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_attachments
    ADD CONSTRAINT itsm_attachments_pkey PRIMARY KEY (id);


--
-- Name: itsm_changes itsm_changes_change_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_changes
    ADD CONSTRAINT itsm_changes_change_no_unique UNIQUE (change_no);


--
-- Name: itsm_changes itsm_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_changes
    ADD CONSTRAINT itsm_changes_pkey PRIMARY KEY (id);


--
-- Name: itsm_incidents itsm_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_incidents
    ADD CONSTRAINT itsm_incidents_pkey PRIMARY KEY (id);


--
-- Name: itsm_incidents itsm_incidents_ticket_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_incidents
    ADD CONSTRAINT itsm_incidents_ticket_no_unique UNIQUE (ticket_no);


--
-- Name: itsm_knowledge_base itsm_knowledge_base_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_knowledge_base
    ADD CONSTRAINT itsm_knowledge_base_pkey PRIMARY KEY (id);


--
-- Name: itsm_problems itsm_problems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_problems
    ADD CONSTRAINT itsm_problems_pkey PRIMARY KEY (id);


--
-- Name: itsm_problems itsm_problems_problem_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_problems
    ADD CONSTRAINT itsm_problems_problem_no_unique UNIQUE (problem_no);


--
-- Name: itsm_service_requests itsm_service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_service_requests
    ADD CONSTRAINT itsm_service_requests_pkey PRIMARY KEY (id);


--
-- Name: itsm_service_requests itsm_service_requests_request_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_service_requests
    ADD CONSTRAINT itsm_service_requests_request_no_unique UNIQUE (request_no);


--
-- Name: itsm_sla_policies itsm_sla_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_sla_policies
    ADD CONSTRAINT itsm_sla_policies_pkey PRIMARY KEY (id);


--
-- Name: itsm_ticket_history itsm_ticket_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itsm_ticket_history
    ADD CONSTRAINT itsm_ticket_history_pkey PRIMARY KEY (id);


--
-- Name: kpi_actuals kpi_actuals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_actuals
    ADD CONSTRAINT kpi_actuals_pkey PRIMARY KEY (id);


--
-- Name: kpi_approvals kpi_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_approvals
    ADD CONSTRAINT kpi_approvals_pkey PRIMARY KEY (id);


--
-- Name: kpi_categories kpi_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_categories
    ADD CONSTRAINT kpi_categories_pkey PRIMARY KEY (id);


--
-- Name: kpi_persons kpi_persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_persons
    ADD CONSTRAINT kpi_persons_pkey PRIMARY KEY (id);


--
-- Name: kpi_set_items kpi_set_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_set_items
    ADD CONSTRAINT kpi_set_items_pkey PRIMARY KEY (id);


--
-- Name: kpi_set_versions kpi_set_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_set_versions
    ADD CONSTRAINT kpi_set_versions_pkey PRIMARY KEY (id);


--
-- Name: kpi_sets kpi_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_sets
    ADD CONSTRAINT kpi_sets_pkey PRIMARY KEY (id);


--
-- Name: kpi_settings kpi_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_settings
    ADD CONSTRAINT kpi_settings_pkey PRIMARY KEY (id);


--
-- Name: kpi_targets kpi_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_targets
    ADD CONSTRAINT kpi_targets_pkey PRIMARY KEY (id);


--
-- Name: kpi_years kpi_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_years
    ADD CONSTRAINT kpi_years_pkey PRIMARY KEY (id);


--
-- Name: kpis kpis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpis
    ADD CONSTRAINT kpis_pkey PRIMARY KEY (id);


--
-- Name: maintenance_records maintenance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_records
    ADD CONSTRAINT maintenance_records_pkey PRIMARY KEY (id);


--
-- Name: masters masters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: retirement_documents retirement_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retirement_documents
    ADD CONSTRAINT retirement_documents_pkey PRIMARY KEY (id);


--
-- Name: retirements retirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retirements
    ADD CONSTRAINT retirements_pkey PRIMARY KEY (id);


--
-- Name: roadmap_items roadmap_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_items
    ADD CONSTRAINT roadmap_items_pkey PRIMARY KEY (id);


--
-- Name: roadmap_upload_batches roadmap_upload_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_upload_batches
    ADD CONSTRAINT roadmap_upload_batches_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_unique UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sbom_entries sbom_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbom_entries
    ADD CONSTRAINT sbom_entries_pkey PRIMARY KEY (id);


--
-- Name: settings settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_key_unique UNIQUE (key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_id_pk PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--



-- Session store table used by connect-pg-simple (express-session)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON public.user_sessions (expire);
