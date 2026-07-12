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

CREATE TABLE IF NOT EXISTS org_position (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  position_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS org_position_assignment (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  position_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  is_delegate TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_position_assignment_position FOREIGN KEY (position_id) REFERENCES org_position(id),
  CONSTRAINT fk_position_assignment_employee FOREIGN KEY (employee_id) REFERENCES org_employee(id),
  UNIQUE KEY uk_position_employee_start (position_id, employee_id, starts_on),
  INDEX idx_position_assignment_active (position_id, status, starts_on, ends_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wf_template (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  business_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wf_template_node (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  node_order SMALLINT UNSIGNED NOT NULL,
  node_name VARCHAR(128) NOT NULL,
  position_code VARCHAR(64) NOT NULL,
  minimum_amount DECIMAL(18,2) NULL,
  maximum_amount DECIMAL(18,2) NULL,
  is_cc TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  CONSTRAINT fk_template_node_template FOREIGN KEY (template_id) REFERENCES wf_template(id),
  UNIQUE KEY uk_template_node_order (template_id, node_order, is_cc),
  INDEX idx_template_node_amount (template_id, minimum_amount, maximum_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wf_instance (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  instance_code VARCHAR(64) NOT NULL UNIQUE,
  template_id BIGINT UNSIGNED NOT NULL,
  business_type VARCHAR(64) NOT NULL,
  business_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  amount DECIMAL(18,2) NULL,
  applicant_id BIGINT UNSIGNED NOT NULL,
  current_node_order SMALLINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  configuration_snapshot JSON NOT NULL,
  submitted_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_instance_template FOREIGN KEY (template_id) REFERENCES wf_template(id),
  UNIQUE KEY uk_instance_business (business_type, business_id),
  INDEX idx_instance_applicant_status (applicant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wf_task (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  instance_id BIGINT UNSIGNED NOT NULL,
  node_order SMALLINT UNSIGNED NOT NULL,
  position_code VARCHAR(64) NOT NULL,
  assignee_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  assigned_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  completed_by BIGINT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_task_instance FOREIGN KEY (instance_id) REFERENCES wf_instance(id),
  UNIQUE KEY uk_task_instance_node_assignee (instance_id, node_order, assignee_id),
  INDEX idx_task_assignee_status (assignee_id, status, assigned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wf_action_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  action_key VARCHAR(128) NOT NULL UNIQUE,
  instance_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NULL,
  node_order SMALLINT UNSIGNED NULL,
  action VARCHAR(32) NOT NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  comment VARCHAR(1000) NULL,
  operated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_action_instance FOREIGN KEY (instance_id) REFERENCES wf_instance(id),
  CONSTRAINT fk_action_task FOREIGN KEY (task_id) REFERENCES wf_task(id),
  INDEX idx_action_instance_time (instance_id, operated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wf_cc_recipient (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  instance_id BIGINT UNSIGNED NOT NULL,
  position_code VARCHAR(64) NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_cc_instance FOREIGN KEY (instance_id) REFERENCES wf_instance(id),
  UNIQUE KEY uk_cc_instance_recipient (instance_id, recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sys_message (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  recipient_id BIGINT UNSIGNED NOT NULL,
  message_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content VARCHAR(2000) NOT NULL,
  business_type VARCHAR(64) NULL,
  business_id BIGINT UNSIGNED NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_message_recipient_read (recipient_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO org_position (position_code, name, created_by, updated_by)
VALUES
  ('OPERATIONS_MANAGER', '经营负责人', 0, 0),
  ('COMPANY_PRINCIPAL', '公司负责人', 0, 0),
  ('FINANCE_REVIEWER', '财务复核人', 0, 0),
  ('PROJECT_MANAGER', '项目负责人', 0, 0),
  ('DEPARTMENT_MANAGER', '部门负责人', 0, 0),
  ('AUTHORIZED_MANAGER', '授权负责人', 0, 0),
  ('PROCUREMENT_REVIEWER', '采购复核人', 0, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO wf_template (template_code, name, business_type, created_by, updated_by)
VALUES
  ('MARKET_REGISTRATION', '市场报备', 'LEAD', 0, 0),
  ('PROJECT_ESTABLISHMENT', '项目立项', 'PROJECT_APPLICATION', 0, 0),
  ('BID_APPLICATION', '投标申请', 'BID_APPLICATION', 0, 0),
  ('CONTRACT_APPROVAL', '合同审批', 'CONTRACT', 0, 0),
  ('PROJECT_START', '项目启动', 'PROJECT_START', 0, 0),
  ('PROJECT_CHANGE', '项目变更', 'PROJECT_CHANGE', 0, 0),
  ('INVOICE_APPLICATION', '开票申请', 'INVOICE_APPLICATION', 0, 0),
  ('EXPENSE_REIMBURSEMENT', '费用报销', 'EXPENSE_REIMBURSEMENT', 0, 0),
  ('PROJECT_PAYMENT', '项目付款', 'PROJECT_PAYMENT', 0, 0),
  ('PARTNER_SETTLEMENT', '合作方结算', 'PARTNER_SETTLEMENT', 0, 0),
  ('DEPOSIT_PAYMENT', '保证金', 'DEPOSIT', 0, 0),
  ('DAILY_PURCHASE', '日常采购', 'DAILY_PURCHASE', 0, 0),
  ('PROJECT_CLOSE', '项目结项', 'PROJECT_CLOSE', 0, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name), business_type = VALUES(business_type);

INSERT IGNORE INTO wf_template_node
  (template_id, node_order, node_name, position_code, minimum_amount, maximum_amount, is_cc)
SELECT template.id, node.node_order, node.node_name, node.position_code, node.minimum_amount, NULL, 0
FROM wf_template AS template
JOIN (
  SELECT 'MARKET_REGISTRATION' template_code, 1 node_order, '经营审核' node_name, 'OPERATIONS_MANAGER' position_code, NULL minimum_amount
  UNION ALL SELECT 'MARKET_REGISTRATION', 2, '负责人审批', 'COMPANY_PRINCIPAL', NULL
  UNION ALL SELECT 'PROJECT_ESTABLISHMENT', 1, '经营审核', 'OPERATIONS_MANAGER', NULL
  UNION ALL SELECT 'PROJECT_ESTABLISHMENT', 2, '负责人审批', 'COMPANY_PRINCIPAL', NULL
  UNION ALL SELECT 'BID_APPLICATION', 1, '经营审核', 'OPERATIONS_MANAGER', NULL
  UNION ALL SELECT 'BID_APPLICATION', 2, '负责人审批', 'COMPANY_PRINCIPAL', NULL
  UNION ALL SELECT 'CONTRACT_APPROVAL', 1, '项目审核', 'PROJECT_MANAGER', NULL
  UNION ALL SELECT 'CONTRACT_APPROVAL', 2, '财务核对', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'CONTRACT_APPROVAL', 3, '负责人审批', 'COMPANY_PRINCIPAL', NULL
  UNION ALL SELECT 'PROJECT_START', 1, '经营确认', 'OPERATIONS_MANAGER', NULL
  UNION ALL SELECT 'PROJECT_START', 2, '负责人确认', 'COMPANY_PRINCIPAL', NULL
  UNION ALL SELECT 'PROJECT_CHANGE', 1, '经营审核', 'OPERATIONS_MANAGER', NULL
  UNION ALL SELECT 'PROJECT_CHANGE', 2, '负责人审批', 'COMPANY_PRINCIPAL', 100000.00
  UNION ALL SELECT 'INVOICE_APPLICATION', 1, '财务审核', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'INVOICE_APPLICATION', 2, '授权审批', 'AUTHORIZED_MANAGER', NULL
  UNION ALL SELECT 'EXPENSE_REIMBURSEMENT', 1, '部门审核', 'DEPARTMENT_MANAGER', NULL
  UNION ALL SELECT 'EXPENSE_REIMBURSEMENT', 2, '财务审核', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'EXPENSE_REIMBURSEMENT', 3, '负责人审批', 'COMPANY_PRINCIPAL', 100000.00
  UNION ALL SELECT 'PROJECT_PAYMENT', 1, '项目审核', 'PROJECT_MANAGER', NULL
  UNION ALL SELECT 'PROJECT_PAYMENT', 2, '财务审核', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'PROJECT_PAYMENT', 3, '负责人审批', 'COMPANY_PRINCIPAL', 100000.00
  UNION ALL SELECT 'PARTNER_SETTLEMENT', 1, '财务复核', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'PARTNER_SETTLEMENT', 2, '负责人审批', 'COMPANY_PRINCIPAL', NULL
  UNION ALL SELECT 'DEPOSIT_PAYMENT', 1, '项目审核', 'PROJECT_MANAGER', NULL
  UNION ALL SELECT 'DEPOSIT_PAYMENT', 2, '财务审核', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'DEPOSIT_PAYMENT', 3, '授权审批', 'AUTHORIZED_MANAGER', NULL
  UNION ALL SELECT 'DAILY_PURCHASE', 1, '部门审核', 'DEPARTMENT_MANAGER', NULL
  UNION ALL SELECT 'DAILY_PURCHASE', 2, '采购复核', 'PROCUREMENT_REVIEWER', NULL
  UNION ALL SELECT 'DAILY_PURCHASE', 3, '财务审核', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'DAILY_PURCHASE', 4, '负责人审批', 'COMPANY_PRINCIPAL', 100000.00
  UNION ALL SELECT 'PROJECT_CLOSE', 1, '财务核对', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'PROJECT_CLOSE', 2, '经营审核', 'OPERATIONS_MANAGER', NULL
  UNION ALL SELECT 'PROJECT_CLOSE', 3, '负责人审批', 'COMPANY_PRINCIPAL', NULL
) AS node ON node.template_code = template.template_code;

CREATE TABLE IF NOT EXISTS file_object (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  business_type VARCHAR(64) NOT NULL,
  business_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  logical_name VARCHAR(255) NOT NULL,
  classification VARCHAR(32) NOT NULL DEFAULT 'INTERNAL',
  current_version INT UNSIGNED NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_file_business (business_type, business_id, status),
  INDEX idx_file_project (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS file_version (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  file_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  storage_key VARCHAR(512) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  extension VARCHAR(32) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_file_version_file FOREIGN KEY (file_id) REFERENCES file_object(id),
  UNIQUE KEY uk_file_version (file_id, version_number),
  INDEX idx_file_version_hash (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS file_access_log (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  file_id BIGINT UNSIGNED NOT NULL,
  version_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(32) NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  denial_code VARCHAR(64) NULL,
  request_id VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64) NULL,
  accessed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_file_access_file FOREIGN KEY (file_id) REFERENCES file_object(id),
  CONSTRAINT fk_file_access_version FOREIGN KEY (version_id) REFERENCES file_version(id),
  INDEX idx_file_access_user_time (user_id, accessed_at),
  INDEX idx_file_access_file_time (file_id, accessed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bid_application (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  bid_code VARCHAR(64) NOT NULL UNIQUE,
  project_id BIGINT UNSIGNED NOT NULL,
  tenderer_id BIGINT UNSIGNED NOT NULL,
  agency_id BIGINT UNSIGNED NULL,
  tender_number VARCHAR(128) NULL,
  project_budget DECIMAL(18,2) NULL,
  bid_ceiling DECIMAL(18,2) NULL,
  registration_at DATETIME(3) NULL,
  document_purchase_at DATETIME(3) NULL,
  clarification_at DATETIME(3) NULL,
  deadline_at DATETIME(3) NOT NULL,
  opening_at DATETIME(3) NULL,
  bid_location VARCHAR(255) NULL,
  bid_method VARCHAR(64) NOT NULL,
  deposit_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  document_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
  business_owner_id BIGINT UNSIGNED NOT NULL,
  technical_owner_id BIGINT UNSIGNED NOT NULL,
  pricing_owner_id BIGINT UNSIGNED NOT NULL,
  application_reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_bid_amounts CHECK (deposit_amount >= 0 AND document_fee >= 0),
  CONSTRAINT fk_bid_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_bid_tenderer FOREIGN KEY (tenderer_id) REFERENCES crm_counterparty(id),
  CONSTRAINT fk_bid_agency FOREIGN KEY (agency_id) REFERENCES crm_counterparty(id),
  INDEX idx_bid_project_status (project_id, status),
  INDEX idx_bid_deadline (deadline_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bid_task (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  bid_id BIGINT UNSIGNED NOT NULL,
  task_type VARCHAR(64) NOT NULL,
  task_name VARCHAR(255) NOT NULL,
  assignee_id BIGINT UNSIGNED NULL,
  collaborator_ids JSON NOT NULL,
  starts_at DATETIME(3) NULL,
  due_at DATETIME(3) NOT NULL,
  delivery_requirement TEXT NOT NULL,
  completion_description TEXT NULL,
  checker_id BIGINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'UNASSIGNED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_bid_task_bid FOREIGN KEY (bid_id) REFERENCES bid_application(id),
  INDEX idx_bid_task_assignee (assignee_id, status, due_at),
  INDEX idx_bid_task_bid (bid_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bid_check (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  bid_id BIGINT UNSIGNED NOT NULL,
  check_item VARCHAR(255) NOT NULL,
  check_standard TEXT NOT NULL,
  responsible_id BIGINT UNSIGNED NOT NULL,
  result VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  issue_description TEXT NULL,
  rectifier_id BIGINT UNSIGNED NULL,
  rectification_due_at DATETIME(3) NULL,
  recheck_result VARCHAR(32) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_bid_check_bid FOREIGN KEY (bid_id) REFERENCES bid_application(id),
  INDEX idx_bid_check_result (bid_id, result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bid_result (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  bid_id BIGINT UNSIGNED NOT NULL UNIQUE,
  opened_on DATE NOT NULL,
  quoted_amount DECIMAL(18,2) NOT NULL,
  ranking INT UNSIGNED NULL,
  result VARCHAR(32) NOT NULL,
  winning_amount DECIMAL(18,2) NULL,
  notice_on DATE NULL,
  loss_reason TEXT NULL,
  competitors TEXT NULL,
  retrospective TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_bid_result_bid FOREIGN KEY (bid_id) REFERENCES bid_application(id),
  CONSTRAINT chk_bid_result_amount CHECK (quoted_amount >= 0 AND (winning_amount IS NULL OR winning_amount >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bid_partner_cooperation (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NULL,
  lead_id BIGINT UNSIGNED NULL,
  partner_id BIGINT UNSIGNED NOT NULL,
  final_customer_id BIGINT UNSIGNED NOT NULL,
  cooperation_type VARCHAR(64) NOT NULL,
  registration_at DATETIME(3) NULL,
  quotation_at DATETIME(3) NULL,
  bidding_at DATETIME(3) NULL,
  our_quotation DECIMAL(18,2) NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  result VARCHAR(64) NULL,
  description TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_partner_bid_parent CHECK (project_id IS NOT NULL OR lead_id IS NOT NULL),
  CONSTRAINT fk_partner_bid_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_partner_bid_lead FOREIGN KEY (lead_id) REFERENCES mkt_lead(id),
  CONSTRAINT fk_partner_bid_partner FOREIGN KEY (partner_id) REFERENCES crm_counterparty(id),
  CONSTRAINT fk_partner_bid_customer FOREIGN KEY (final_customer_id) REFERENCES crm_counterparty(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS con_contract (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  contract_code VARCHAR(64) NOT NULL UNIQUE,
  contract_name VARCHAR(255) NOT NULL,
  contract_type VARCHAR(32) NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  party_a_id BIGINT UNSIGNED NOT NULL,
  party_b_id BIGINT UNSIGNED NOT NULL,
  signing_entity_id BIGINT UNSIGNED NOT NULL,
  tax_inclusive_amount DECIMAL(18,2) NOT NULL,
  tax_exclusive_amount DECIMAL(18,2) NOT NULL,
  tax_rate DECIMAL(8,6) NOT NULL,
  tax_amount DECIMAL(18,2) NOT NULL,
  amount_status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
  signed_on DATE NULL,
  effective_on DATE NULL,
  expires_on DATE NULL,
  service_content TEXT NOT NULL,
  payment_terms TEXT NOT NULL,
  invoice_terms TEXT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  parent_contract_id BIGINT UNSIGNED NULL,
  contract_version INT UNSIGNED NOT NULL DEFAULT 1,
  performance_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_contract_amounts CHECK (
    tax_inclusive_amount >= 0 AND tax_exclusive_amount >= 0 AND tax_amount >= 0 AND tax_rate >= 0
  ),
  CONSTRAINT chk_contract_tax CHECK (ABS(tax_inclusive_amount - tax_exclusive_amount - tax_amount) <= 0.02),
  CONSTRAINT fk_contract_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_contract_party_a FOREIGN KEY (party_a_id) REFERENCES crm_counterparty(id),
  CONSTRAINT fk_contract_party_b FOREIGN KEY (party_b_id) REFERENCES crm_counterparty(id),
  CONSTRAINT fk_contract_parent FOREIGN KEY (parent_contract_id) REFERENCES con_contract(id),
  INDEX idx_contract_project_type (project_id, contract_type, status),
  INDEX idx_contract_expiry (expires_on, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS con_contract_change (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  change_code VARCHAR(64) NOT NULL UNIQUE,
  change_type VARCHAR(64) NOT NULL,
  original_tax_inclusive_amount DECIMAL(18,2) NOT NULL,
  new_tax_inclusive_amount DECIMAL(18,2) NOT NULL,
  net_change_amount DECIMAL(18,2) GENERATED ALWAYS AS (new_tax_inclusive_amount - original_tax_inclusive_amount) STORED,
  original_end_on DATE NULL,
  new_end_on DATE NULL,
  change_content TEXT NOT NULL,
  reason TEXT NOT NULL,
  effective_on DATE NOT NULL,
  applicant_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_contract_change_contract FOREIGN KEY (contract_id) REFERENCES con_contract(id),
  INDEX idx_contract_change_status (contract_id, status, effective_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS con_contract_milestone (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  milestone_type VARCHAR(32) NOT NULL,
  milestone_name VARCHAR(255) NOT NULL,
  planned_on DATE NOT NULL,
  planned_amount DECIMAL(18,2) NULL,
  condition_description TEXT NULL,
  completed_on DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_contract_milestone_contract FOREIGN KEY (contract_id) REFERENCES con_contract(id),
  INDEX idx_contract_milestone_due (planned_on, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
