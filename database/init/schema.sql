-- V2.2 phase 1: initialize a new empty database.
-- There is no historical database or existing data migration.
CREATE TABLE IF NOT EXISTS org_department (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS iam_user (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  cloudbase_uid VARCHAR(128) NOT NULL UNIQUE,
  employee_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  last_synced_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_iam_user_department FOREIGN KEY (department_id) REFERENCES org_department(id),
  INDEX idx_iam_user_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS iam_role (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS iam_permission (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  permission_type VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS iam_user_role (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES iam_user(id),
  CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES iam_role(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS iam_role_permission (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES iam_role(id),
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES iam_permission(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sys_audit_log (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id VARCHAR(64) NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NULL,
  outcome VARCHAR(16) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  details JSON NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  INDEX idx_audit_request (request_id),
  INDEX idx_audit_actor_time (actor_user_id, occurred_at),
  INDEX idx_audit_resource (resource_type, resource_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS org_employee (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  employee_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  employee_type VARCHAR(32) NOT NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  position_name VARCHAR(128) NULL,
  mobile VARCHAR(32) NULL,
  email VARCHAR(255) NULL,
  joined_on DATE NULL,
  left_on DATE NULL,
  supervisor_id BIGINT UNSIGNED NULL,
  account_status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_employee_department FOREIGN KEY (department_id) REFERENCES org_department(id),
  CONSTRAINT fk_employee_supervisor FOREIGN KEY (supervisor_id) REFERENCES org_employee(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS crm_counterparty (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  counterparty_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(128) NULL,
  credit_code VARCHAR(32) NULL UNIQUE,
  counterparty_type VARCHAR(32) NOT NULL,
  industry VARCHAR(128) NULL,
  scale_code VARCHAR(32) NULL,
  region VARCHAR(128) NULL,
  address VARCHAR(512) NULL,
  phone VARCHAR(32) NULL,
  website VARCHAR(255) NULL,
  bank_name VARCHAR(255) NULL,
  bank_account VARCHAR(128) NULL,
  tax_number VARCHAR(64) NULL,
  invoice_information VARCHAR(1000) NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  source_code VARCHAR(64) NULL,
  cooperation_status VARCHAR(32) NOT NULL DEFAULT 'POTENTIAL',
  remark VARCHAR(1000) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_counterparty_name (name),
  INDEX idx_counterparty_owner (owner_id, cooperation_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS crm_contact (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  counterparty_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL,
  gender VARCHAR(16) NULL,
  department_name VARCHAR(128) NULL,
  position_name VARCHAR(128) NULL,
  mobile VARCHAR(32) NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(255) NULL,
  wechat VARCHAR(128) NULL,
  is_key_contact TINYINT(1) NOT NULL DEFAULT 0,
  relationship_level VARCHAR(32) NULL,
  decision_role VARCHAR(64) NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  remark VARCHAR(1000) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_contact_counterparty FOREIGN KEY (counterparty_id) REFERENCES crm_counterparty(id),
  INDEX idx_contact_counterparty (counterparty_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS crm_visit (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  visit_code VARCHAR(64) NOT NULL UNIQUE,
  customer_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NULL,
  visited_at DATETIME(3) NOT NULL,
  visit_method VARCHAR(32) NOT NULL,
  location VARCHAR(255) NULL,
  purpose VARCHAR(500) NOT NULL,
  communication TEXT NOT NULL,
  customer_needs TEXT NULL,
  opportunity_assessment TEXT NULL,
  next_action TEXT NULL,
  next_follow_up_at DATETIME(3) NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  generate_lead TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_visit_customer FOREIGN KEY (customer_id) REFERENCES crm_counterparty(id),
  CONSTRAINT fk_visit_contact FOREIGN KEY (contact_id) REFERENCES crm_contact(id),
  INDEX idx_visit_customer_time (customer_id, visited_at),
  INDEX idx_visit_owner_followup (owner_id, next_follow_up_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS crm_visit_participant (
  visit_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (visit_id, employee_id),
  CONSTRAINT fk_visit_participant_visit FOREIGN KEY (visit_id) REFERENCES crm_visit(id),
  CONSTRAINT fk_visit_participant_employee FOREIGN KEY (employee_id) REFERENCES org_employee(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mkt_lead (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  lead_code VARCHAR(64) NOT NULL UNIQUE,
  project_name VARCHAR(255) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  source_code VARCHAR(64) NOT NULL,
  source_description VARCHAR(500) NULL,
  discovered_on DATE NOT NULL,
  estimated_amount DECIMAL(18,2) NULL,
  estimated_start_on DATE NULL,
  project_type VARCHAR(64) NOT NULL,
  project_background TEXT NULL,
  requirement_summary TEXT NOT NULL,
  competition TEXT NULL,
  success_probability TINYINT UNSIGNED NOT NULL DEFAULT 0,
  owner_id BIGINT UNSIGNED NOT NULL,
  registration_status VARCHAR(32) NOT NULL DEFAULT 'NOT_SUBMITTED',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  next_follow_up_at DATETIME(3) NULL,
  source_visit_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_lead_probability CHECK (success_probability BETWEEN 0 AND 100),
  CONSTRAINT fk_lead_customer FOREIGN KEY (customer_id) REFERENCES crm_counterparty(id),
  CONSTRAINT fk_lead_source_visit FOREIGN KEY (source_visit_id) REFERENCES crm_visit(id),
  INDEX idx_lead_owner_status (owner_id, status),
  INDEX idx_lead_customer (customer_id, status),
  INDEX idx_lead_followup (next_follow_up_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mkt_lead_collaborator (
  lead_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (lead_id, employee_id),
  CONSTRAINT fk_lead_collaborator_lead FOREIGN KEY (lead_id) REFERENCES mkt_lead(id),
  CONSTRAINT fk_lead_collaborator_employee FOREIGN KEY (employee_id) REFERENCES org_employee(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mkt_lead_follow_up (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  followed_up_at DATETIME(3) NOT NULL,
  follow_up_method VARCHAR(32) NOT NULL,
  participants VARCHAR(1000) NULL,
  communication TEXT NOT NULL,
  customer_feedback TEXT NULL,
  opportunity_change TEXT NULL,
  success_probability TINYINT UNSIGNED NOT NULL,
  next_action TEXT NOT NULL,
  next_follow_up_at DATETIME(3) NULL,
  recorder_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_followup_probability CHECK (success_probability BETWEEN 0 AND 100),
  CONSTRAINT fk_followup_lead FOREIGN KEY (lead_id) REFERENCES mkt_lead(id),
  INDEX idx_followup_lead_time (lead_id, followed_up_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sys_status_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  object_type VARCHAR(64) NOT NULL,
  object_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  action VARCHAR(64) NOT NULL,
  reason VARCHAR(1000) NULL,
  operated_by BIGINT UNSIGNED NOT NULL,
  operated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_status_history_object (object_type, object_id, operated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sys_number_rule (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  rule_code VARCHAR(64) NOT NULL UNIQUE,
  prefix VARCHAR(32) NOT NULL,
  year_pattern VARCHAR(16) NOT NULL DEFAULT 'YYYY',
  serial_length TINYINT UNSIGNED NOT NULL DEFAULT 4,
  next_serial INT UNSIGNED NOT NULL DEFAULT 1,
  current_year SMALLINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO sys_number_rule (rule_code, prefix, current_year, updated_by)
VALUES ('PROJECT_APPLICATION', 'LA', YEAR(CURRENT_DATE), 0), ('PROJECT', 'ZK', YEAR(CURRENT_DATE), 0)
ON DUPLICATE KEY UPDATE rule_code = VALUES(rule_code);

CREATE TABLE IF NOT EXISTS prj_project_application (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_code VARCHAR(64) NOT NULL UNIQUE,
  project_name VARCHAR(255) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  source_lead_id BIGINT UNSIGNED NULL,
  project_type VARCHAR(64) NOT NULL,
  background TEXT NULL,
  service_scope TEXT NOT NULL,
  estimated_revenue DECIMAL(18,2) NOT NULL,
  estimated_cost DECIMAL(18,2) NOT NULL,
  estimated_profit DECIMAL(18,2) GENERATED ALWAYS AS (estimated_revenue - estimated_cost) STORED,
  estimated_start_on DATE NOT NULL,
  estimated_end_on DATE NOT NULL,
  proposed_manager_id BIGINT UNSIGNED NOT NULL,
  bidding_method VARCHAR(64) NULL,
  risk_description TEXT NULL,
  necessity TEXT NOT NULL,
  applicant_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_application_amounts CHECK (estimated_revenue >= 0 AND estimated_cost >= 0),
  CONSTRAINT chk_application_dates CHECK (estimated_end_on >= estimated_start_on),
  CONSTRAINT fk_application_customer FOREIGN KEY (customer_id) REFERENCES crm_counterparty(id),
  CONSTRAINT fk_application_lead FOREIGN KEY (source_lead_id) REFERENCES mkt_lead(id),
  INDEX idx_application_status (status, applicant_id),
  INDEX idx_application_customer (customer_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_application_member_suggestion (
  application_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  proposed_role VARCHAR(64) NOT NULL,
  PRIMARY KEY (application_id, employee_id),
  CONSTRAINT fk_suggestion_application FOREIGN KEY (application_id) REFERENCES prj_project_application(id),
  CONSTRAINT fk_suggestion_employee FOREIGN KEY (employee_id) REFERENCES org_employee(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_project (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_code VARCHAR(64) NOT NULL UNIQUE,
  application_id BIGINT UNSIGNED NOT NULL UNIQUE,
  project_name VARCHAR(255) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  project_type VARCHAR(64) NOT NULL,
  service_scope TEXT NOT NULL,
  project_manager_id BIGINT UNSIGNED NOT NULL,
  estimated_revenue DECIMAL(18,2) NOT NULL,
  estimated_cost DECIMAL(18,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ESTABLISHED',
  original_status VARCHAR(32) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_project_application FOREIGN KEY (application_id) REFERENCES prj_project_application(id),
  CONSTRAINT fk_project_customer FOREIGN KEY (customer_id) REFERENCES crm_counterparty(id),
  INDEX idx_project_manager_status (project_manager_id, status),
  INDEX idx_project_customer (customer_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_project_member (
  project_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  project_role VARCHAR(64) NOT NULL,
  joined_on DATE NOT NULL,
  left_on DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, employee_id),
  CONSTRAINT fk_project_member_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_project_member_employee FOREIGN KEY (employee_id) REFERENCES org_employee(id),
  INDEX idx_project_member_employee (employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
