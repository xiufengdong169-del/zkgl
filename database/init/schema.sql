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

CREATE TABLE IF NOT EXISTS iam_role_data_scope (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id BIGINT UNSIGNED NOT NULL,
  scope_type VARCHAR(32) NOT NULL,
  scope_value VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  CONSTRAINT fk_role_scope_role FOREIGN KEY (role_id) REFERENCES iam_role(id),
  UNIQUE KEY uk_role_scope (role_id, scope_type, scope_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS iam_sensitive_field_grant (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id BIGINT UNSIGNED NOT NULL,
  field_code VARCHAR(128) NOT NULL,
  access_level VARCHAR(16) NOT NULL,
  explicit_deny TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  CONSTRAINT fk_sensitive_grant_role FOREIGN KEY (role_id) REFERENCES iam_role(id),
  CONSTRAINT chk_sensitive_access CHECK (access_level IN ('FULL','MASKED')),
  UNIQUE KEY uk_role_sensitive_field (role_id, field_code)
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
  CONSTRAINT fk_iam_user_employee FOREIGN KEY (employee_id) REFERENCES org_employee(id),
  CONSTRAINT fk_iam_user_department FOREIGN KEY (department_id) REFERENCES org_department(id),
  UNIQUE KEY uk_iam_user_employee (employee_id)
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

CREATE TABLE IF NOT EXISTS sys_dictionary_type (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  type_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(500) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sys_dictionary_item (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  type_id BIGINT UNSIGNED NOT NULL,
  item_code VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  value_text VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_dictionary_item_type FOREIGN KEY (type_id) REFERENCES sys_dictionary_type(id),
  UNIQUE KEY uk_dictionary_item_code (type_id, item_code),
  INDEX idx_dictionary_item_sort (type_id, status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sys_parameter (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  param_key VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  param_value VARCHAR(1000) NOT NULL,
  value_type VARCHAR(32) NOT NULL DEFAULT 'STRING',
  description VARCHAR(500) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  created_by BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_sys_parameter_type CHECK (value_type IN ('STRING','NUMBER','BOOLEAN','JSON')),
  INDEX idx_sys_parameter_status (status, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO sys_number_rule (rule_code, prefix, current_year, updated_by)
VALUES ('PROJECT_APPLICATION', 'LA', YEAR(CURRENT_DATE), 0), ('PROJECT', 'ZK', YEAR(CURRENT_DATE), 0)
  , ('COUNTERPARTY', 'DW', YEAR(CURRENT_DATE), 0)
  , ('LEAD', 'XS', YEAR(CURRENT_DATE), 0)
  , ('VISIT', 'BF', YEAR(CURRENT_DATE), 0)
  , ('BID', 'TB', YEAR(CURRENT_DATE), 0)
  , ('CONTRACT', 'HT', YEAR(CURRENT_DATE), 0)
  , ('CONTRACT_CHANGE', 'BG', YEAR(CURRENT_DATE), 0)
  , ('INVOICE_APPLICATION', 'KP', YEAR(CURRENT_DATE), 0)
  , ('RECEIPT', 'SK', YEAR(CURRENT_DATE), 0)
  , ('REIMBURSEMENT', 'BX', YEAR(CURRENT_DATE), 0)
  , ('PAYMENT', 'FK', YEAR(CURRENT_DATE), 0)
  , ('EXPORT_TASK', 'DC', YEAR(CURRENT_DATE), 0)
  , ('PARTNER_PLAN', 'HZ', YEAR(CURRENT_DATE), 0)
  , ('PARTNER_SETTLEMENT', 'JS', YEAR(CURRENT_DATE), 0)
  , ('DEPOSIT', 'BZJ', YEAR(CURRENT_DATE), 0)
  , ('PROJECT_CLOSE', 'JX', YEAR(CURRENT_DATE), 0)
ON DUPLICATE KEY UPDATE rule_code = VALUES(rule_code);

INSERT INTO sys_parameter(param_key,name,param_value,value_type,description,created_by,updated_by)
VALUES
('company.name','公司名称','众肯科技','STRING','用于页面、导出和通知中的公司名称展示',0,0),
('reminder.contract_expiry_days','合同到期提醒天数','30','NUMBER','合同到期前多少天生成提醒',0,0),
('reminder.bid_deadline_days','投标截止提醒天数','7','NUMBER','投标截止前多少天生成提醒',0,0),
('export.retention_days','导出文件保留天数','7','NUMBER','后台导出文件默认保留天数',0,0),
('approval.amount_unit','审批金额单位','CNY','STRING','审批与金额展示默认币种单位',0,0)
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description);

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

CREATE TABLE IF NOT EXISTS iam_project_grant (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NULL,
  reason VARCHAR(500) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  granted_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_project_grant_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_project_grant_employee FOREIGN KEY (employee_id) REFERENCES org_employee(id),
  CONSTRAINT fk_project_grant_user FOREIGN KEY (granted_by) REFERENCES iam_user(id),
  UNIQUE KEY uk_project_grant_period (project_id, employee_id, starts_on),
  INDEX idx_project_grant_employee (employee_id, status, starts_on, ends_on),
  INDEX idx_project_grant_project (project_id, status)
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
  version INT UNSIGNED NOT NULL DEFAULT 0,
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
  ('CONTRACT_CHANGE', '合同变更', 'CONTRACT_CHANGE', 0, 0),
  ('PROJECT_START', '项目启动', 'PROJECT_START', 0, 0),
  ('PROJECT_CHANGE', '项目变更', 'PROJECT_CHANGE', 0, 0),
  ('PROJECT_ACCEPTANCE', '项目验收申请', 'PROJECT_ACCEPTANCE', 0, 0),
  ('INVOICE_APPLICATION', '开票申请', 'INVOICE_APPLICATION', 0, 0),
  ('EXPENSE_REIMBURSEMENT', '费用报销', 'EXPENSE_REIMBURSEMENT', 0, 0),
  ('PROJECT_PAYMENT', '项目付款', 'PROJECT_PAYMENT', 0, 0),
  ('PARTNER_SETTLEMENT', '合作方结算', 'PARTNER_SETTLEMENT', 0, 0),
  ('DEPOSIT_PAYMENT', '保证金缴纳', 'DEPOSIT', 0, 0),
  ('DEPOSIT_LOSS', '保证金没收损失', 'DEPOSIT_LOSS', 0, 0),
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
  UNION ALL SELECT 'CONTRACT_CHANGE', 1, '项目审核', 'PROJECT_MANAGER', NULL
  UNION ALL SELECT 'CONTRACT_CHANGE', 2, '财务核对', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'CONTRACT_CHANGE', 3, '负责人审批', 'COMPANY_PRINCIPAL', NULL
  UNION ALL SELECT 'PROJECT_START', 1, '经营确认', 'OPERATIONS_MANAGER', NULL
  UNION ALL SELECT 'PROJECT_START', 2, '负责人确认', 'COMPANY_PRINCIPAL', NULL
  UNION ALL SELECT 'PROJECT_CHANGE', 1, '经营审核', 'OPERATIONS_MANAGER', NULL
  UNION ALL SELECT 'PROJECT_CHANGE', 2, '负责人审批', 'COMPANY_PRINCIPAL', 100000.00
  UNION ALL SELECT 'PROJECT_ACCEPTANCE', 1, '项目审核', 'PROJECT_MANAGER', NULL
  UNION ALL SELECT 'PROJECT_ACCEPTANCE', 2, '经营确认', 'OPERATIONS_MANAGER', NULL
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
  UNION ALL SELECT 'DEPOSIT_LOSS', 1, '项目审核', 'PROJECT_MANAGER', NULL
  UNION ALL SELECT 'DEPOSIT_LOSS', 2, '财务审核', 'FINANCE_REVIEWER', NULL
  UNION ALL SELECT 'DEPOSIT_LOSS', 3, '负责人审批', 'COMPANY_PRINCIPAL', NULL
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
  new_tax_exclusive_amount DECIMAL(18,2) NOT NULL,
  new_tax_rate DECIMAL(8,6) NOT NULL,
  new_tax_amount DECIMAL(18,2) NOT NULL,
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

CREATE TABLE IF NOT EXISTS prj_start (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL UNIQUE,
  start_type VARCHAR(16) NOT NULL,
  started_on DATE NOT NULL,
  project_manager_id BIGINT UNSIGNED NOT NULL,
  objectives TEXT NOT NULL,
  scope_description TEXT NOT NULL,
  communication_mechanism TEXT NOT NULL,
  deliverables TEXT NOT NULL,
  risks TEXT NULL,
  current_contract_status VARCHAR(32) NULL,
  early_start_reason TEXT NULL,
  start_basis TEXT NULL,
  estimated_contract_amount DECIMAL(18,2) NULL,
  expected_signing_on DATE NULL,
  contract_reminder_active TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_start_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT chk_early_start_fields CHECK (
    start_type = 'NORMAL' OR (early_start_reason IS NOT NULL AND start_basis IS NOT NULL AND expected_signing_on IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_stage (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  stage_name VARCHAR(255) NOT NULL,
  stage_order SMALLINT UNSIGNED NOT NULL,
  planned_start_on DATE NOT NULL,
  planned_end_on DATE NOT NULL,
  actual_start_on DATE NULL,
  actual_end_on DATE NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  objective TEXT NOT NULL,
  deliverables TEXT NOT NULL,
  completion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_stage_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT chk_stage_dates CHECK (planned_end_on >= planned_start_on),
  CONSTRAINT chk_stage_percentage CHECK (completion_percentage BETWEEN 0 AND 100),
  UNIQUE KEY uk_project_stage_order (project_id, stage_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_progress (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  stage_id BIGINT UNSIGNED NULL,
  recorded_on DATE NOT NULL,
  completed_work TEXT NOT NULL,
  current_progress DECIMAL(5,2) NOT NULL,
  next_plan TEXT NOT NULL,
  deviation_description TEXT NULL,
  coordination_needed TEXT NULL,
  recorder_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_progress_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_progress_stage FOREIGN KEY (stage_id) REFERENCES prj_stage(id),
  CONSTRAINT chk_progress_percentage CHECK (current_progress BETWEEN 0 AND 100),
  INDEX idx_progress_project_date (project_id, recorded_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_risk_issue (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  item_type VARCHAR(16) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(16) NOT NULL,
  impact TEXT NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  discovered_on DATE NOT NULL,
  planned_resolution_on DATE NOT NULL,
  measures TEXT NOT NULL,
  actual_resolution_on DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_risk_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  INDEX idx_risk_project_status (project_id, status, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_change (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  change_type VARCHAR(64) NOT NULL,
  original_content TEXT NOT NULL,
  new_content TEXT NOT NULL,
  reason TEXT NOT NULL,
  impact_scope TEXT NOT NULL,
  schedule_impact_days INT NOT NULL DEFAULT 0,
  amount_impact DECIMAL(18,2) NOT NULL DEFAULT 0,
  applicant_id BIGINT UNSIGNED NOT NULL,
  effective_on DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_project_change_project FOREIGN KEY (project_id) REFERENCES prj_project(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_deliverable (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  stage_id BIGINT UNSIGNED NULL,
  deliverable_name VARCHAR(255) NOT NULL,
  deliverable_type VARCHAR(64) NOT NULL,
  deliverable_version VARCHAR(64) NOT NULL,
  submitted_on DATE NOT NULL,
  submitter_id BIGINT UNSIGNED NOT NULL,
  recipient VARCHAR(255) NULL,
  description TEXT NULL,
  confirmation_result VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_deliverable_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_deliverable_stage FOREIGN KEY (stage_id) REFERENCES prj_stage(id),
  UNIQUE KEY uk_deliverable_version (project_id, deliverable_name, deliverable_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_acceptance (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  contract_id BIGINT UNSIGNED NULL,
  acceptance_type VARCHAR(64) NOT NULL,
  applied_on DATE NOT NULL,
  acceptance_scope TEXT NOT NULL,
  acceptance_basis TEXT NOT NULL,
  accepted_on DATE NULL,
  acceptance_organization VARCHAR(255) NULL,
  result VARCHAR(32) NULL,
  remaining_issues TEXT NULL,
  rectification_due_on DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_acceptance_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_acceptance_contract FOREIGN KEY (contract_id) REFERENCES con_contract(id),
  INDEX idx_acceptance_project_status (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_invoice_application (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_code VARCHAR(64) NOT NULL UNIQUE,
  project_id BIGINT UNSIGNED NOT NULL,
  contract_id BIGINT UNSIGNED NOT NULL,
  requested_amount DECIMAL(18,2) NOT NULL,
  invoice_type VARCHAR(32) NOT NULL,
  tax_rate DECIMAL(8,6) NOT NULL,
  invoice_content TEXT NOT NULL,
  buyer_information TEXT NOT NULL,
  planned_invoice_on DATE NOT NULL,
  collection_condition TEXT NULL,
  applicant_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0, version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_invoice_app_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_invoice_app_contract FOREIGN KEY (contract_id) REFERENCES con_contract(id),
  CONSTRAINT chk_invoice_app_amount CHECK (requested_amount > 0),
  INDEX idx_invoice_app_contract (contract_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_sales_invoice (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  contract_id BIGINT UNSIGNED NOT NULL,
  invoice_number VARCHAR(64) NOT NULL,
  invoice_code VARCHAR(64) NULL,
  invoiced_on DATE NOT NULL,
  tax_inclusive_amount DECIMAL(18,2) NOT NULL,
  tax_exclusive_amount DECIMAL(18,2) NOT NULL,
  tax_amount DECIMAL(18,2) NOT NULL,
  buyer_name VARCHAR(255) NOT NULL,
  is_reversed TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'UNALLOCATED',
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_sales_invoice_app FOREIGN KEY (application_id) REFERENCES fin_invoice_application(id),
  CONSTRAINT fk_sales_invoice_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_sales_invoice_contract FOREIGN KEY (contract_id) REFERENCES con_contract(id),
  CONSTRAINT chk_sales_invoice_tax CHECK (ABS(tax_inclusive_amount - tax_exclusive_amount - tax_amount) <= 0.02),
  UNIQUE KEY uk_invoice_number_code (invoice_number, invoice_code),
  INDEX idx_invoice_contract_date (contract_id, invoiced_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_receipt (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  receipt_code VARCHAR(64) NOT NULL UNIQUE,
  project_id BIGINT UNSIGNED NOT NULL,
  contract_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  received_on DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  receiving_account VARCHAR(128) NOT NULL,
  payer_name VARCHAR(255) NOT NULL,
  payer_account VARCHAR(128) NULL,
  receipt_type VARCHAR(32) NOT NULL,
  voucher_number VARCHAR(128) NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_receipt_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_receipt_contract FOREIGN KEY (contract_id) REFERENCES con_contract(id),
  CONSTRAINT fk_receipt_customer FOREIGN KEY (customer_id) REFERENCES crm_counterparty(id),
  CONSTRAINT chk_receipt_amount CHECK (amount > 0),
  INDEX idx_receipt_contract_date (contract_id, received_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_receipt_invoice_allocation (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  receipt_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  allocated_amount DECIMAL(18,2) NOT NULL,
  allocated_on DATE NOT NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_allocation_receipt FOREIGN KEY (receipt_id) REFERENCES fin_receipt(id),
  CONSTRAINT fk_allocation_invoice FOREIGN KEY (invoice_id) REFERENCES fin_sales_invoice(id),
  CONSTRAINT chk_allocation_amount CHECK (allocated_amount > 0),
  UNIQUE KEY uk_receipt_invoice_active (receipt_id, invoice_id, status),
  INDEX idx_allocation_invoice (invoice_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_reimbursement (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  reimbursement_code VARCHAR(64) NOT NULL UNIQUE,
  claimant_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  reason TEXT NOT NULL,
  payment_recipient VARCHAR(255) NOT NULL,
  receiving_account VARCHAR(128) NOT NULL,
  approval_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'UNPAID',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0, version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_reimbursement_department FOREIGN KEY (department_id) REFERENCES org_department(id),
  CONSTRAINT fk_reimbursement_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  INDEX idx_reimbursement_claimant (claimant_id, approval_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_reimbursement_detail (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  reimbursement_id BIGINT UNSIGNED NOT NULL,
  expense_type VARCHAR(64) NOT NULL,
  incurred_on DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  has_invoice TINYINT(1) NOT NULL DEFAULT 0,
  invoice_number VARCHAR(128) NULL,
  invoicing_party VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_reimbursement_detail_header FOREIGN KEY (reimbursement_id) REFERENCES fin_reimbursement(id),
  CONSTRAINT chk_reimbursement_detail_amount CHECK (amount > 0),
  INDEX idx_reimbursement_detail_header (reimbursement_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_payment_application (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  payment_code VARCHAR(64) NOT NULL UNIQUE,
  project_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  payment_type VARCHAR(64) NOT NULL,
  requested_amount DECIMAL(18,2) NOT NULL,
  planned_on DATE NOT NULL,
  payment_basis TEXT NOT NULL,
  receiving_account VARCHAR(128) NOT NULL,
  invoice_required TINYINT(1) NOT NULL DEFAULT 0,
  operator_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_payment_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT chk_payment_requested CHECK (requested_amount > 0),
  INDEX idx_payment_source (source_type, source_id, status),
  INDEX idx_payment_project_status (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_payment_detail (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  paid_on DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  paying_account VARCHAR(128) NOT NULL,
  receiving_account VARCHAR(128) NOT NULL,
  bank_reference VARCHAR(128) NOT NULL,
  recorder_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_payment_detail_header FOREIGN KEY (payment_id) REFERENCES fin_payment_application(id),
  CONSTRAINT fk_payment_detail_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT chk_payment_detail_amount CHECK (amount > 0),
  INDEX idx_payment_detail_header (payment_id, status),
  INDEX idx_payment_detail_project_date (project_id, paid_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS partner_plan (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  partner_id BIGINT UNSIGNED NOT NULL,
  plan_code VARCHAR(64) NOT NULL UNIQUE,
  current_version INT UNSIGNED NOT NULL DEFAULT 1,
  owner_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0, version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_partner_plan_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_partner_plan_partner FOREIGN KEY (partner_id) REFERENCES crm_counterparty(id),
  INDEX idx_partner_plan_project (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS partner_plan_version (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  plan_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  settlement_method VARCHAR(32) NOT NULL,
  fixed_amount DECIMAL(18,2) NULL,
  ratio DECIMAL(9,6) NULL,
  calculation_basis VARCHAR(64) NOT NULL,
  deductible_cost_scope JSON NOT NULL,
  upper_limit DECIMAL(18,2) NULL,
  lower_limit DECIMAL(18,2) NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  conditions TEXT NULL,
  rounding_rule VARCHAR(32) NOT NULL DEFAULT 'ROUND_HALF_UP',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_partner_plan_version_plan FOREIGN KEY (plan_id) REFERENCES partner_plan(id),
  CONSTRAINT chk_partner_ratio CHECK (ratio IS NULL OR (ratio >= 0 AND ratio <= 1)),
  UNIQUE KEY uk_plan_version (plan_id, version_number),
  INDEX idx_plan_version_effective (plan_id, effective_from, effective_to, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS partner_settlement (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  settlement_code VARCHAR(64) NOT NULL UNIQUE,
  project_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  plan_version_id BIGINT UNSIGNED NOT NULL,
  partner_id BIGINT UNSIGNED NOT NULL,
  period_start_on DATE NOT NULL,
  period_end_on DATE NOT NULL,
  basis_amount_snapshot DECIMAL(18,2) NOT NULL,
  ratio_snapshot DECIMAL(9,6) NULL,
  rule_snapshot JSON NOT NULL,
  gross_settlement_amount DECIMAL(18,2) NOT NULL,
  historical_settled_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  deduction_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  net_settlement_amount DECIMAL(18,2) NOT NULL,
  rounding_difference DECIMAL(18,2) NOT NULL DEFAULT 0,
  invoice_requirement TEXT NULL,
  payment_status VARCHAR(32) NOT NULL DEFAULT 'UNPAID',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  confirmed_cost_amount DECIMAL(18,2) NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_settlement_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_settlement_plan FOREIGN KEY (plan_id) REFERENCES partner_plan(id),
  CONSTRAINT fk_settlement_plan_version FOREIGN KEY (plan_version_id) REFERENCES partner_plan_version(id),
  CONSTRAINT fk_settlement_partner FOREIGN KEY (partner_id) REFERENCES crm_counterparty(id),
  CONSTRAINT chk_settlement_period CHECK (period_end_on >= period_start_on),
  INDEX idx_settlement_project_status (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_deposit (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  deposit_code VARCHAR(64) NOT NULL UNIQUE,
  project_id BIGINT UNSIGNED NOT NULL,
  bid_id BIGINT UNSIGNED NULL,
  contract_id BIGINT UNSIGNED NULL,
  deposit_type VARCHAR(64) NOT NULL,
  direction VARCHAR(16) NOT NULL,
  counterparty_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  due_payment_on DATE NOT NULL,
  paid_on DATE NULL,
  due_return_on DATE NULL,
  returned_on DATE NULL,
  account VARCHAR(128) NULL,
  occupied_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  loss_confirmed_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_deposit_project FOREIGN KEY (project_id) REFERENCES prj_project(id),
  CONSTRAINT fk_deposit_bid FOREIGN KEY (bid_id) REFERENCES bid_application(id),
  CONSTRAINT fk_deposit_contract FOREIGN KEY (contract_id) REFERENCES con_contract(id),
  CONSTRAINT fk_deposit_counterparty FOREIGN KEY (counterparty_id) REFERENCES crm_counterparty(id),
  CONSTRAINT chk_deposit_amount CHECK (amount > 0 AND occupied_amount >= 0 AND loss_confirmed_amount >= 0),
  INDEX idx_deposit_project_status (project_id, status),
  INDEX idx_deposit_due_return (due_return_on, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_deposit_event (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  deposit_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  occurred_on DATE NOT NULL,
  approval_instance_id BIGINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
  description VARCHAR(1000) NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_deposit_event_deposit FOREIGN KEY (deposit_id) REFERENCES fin_deposit(id),
  CONSTRAINT chk_deposit_event_amount CHECK (amount > 0),
  INDEX idx_deposit_event_history (deposit_id, occurred_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_close_application (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  close_code VARCHAR(64) NOT NULL UNIQUE,
  project_id BIGINT UNSIGNED NOT NULL UNIQUE,
  applied_on DATE NOT NULL,
  completion_summary TEXT NOT NULL,
  acceptance_conclusion TEXT NOT NULL,
  contract_amount_snapshot DECIMAL(18,2) NOT NULL,
  invoiced_amount_snapshot DECIMAL(18,2) NOT NULL,
  received_amount_snapshot DECIMAL(18,2) NOT NULL,
  confirmed_cost_snapshot DECIMAL(18,2) NOT NULL,
  settlement_amount_snapshot DECIMAL(18,2) NOT NULL,
  archive_check_passed TINYINT(1) NOT NULL DEFAULT 0,
  profit_snapshot JSON NOT NULL,
  close_description TEXT NOT NULL,
  close_type VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
  special_approval_comment TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_close_project FOREIGN KEY (project_id) REFERENCES prj_project(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS prj_close_open_item (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  close_application_id BIGINT UNSIGNED NOT NULL,
  item_type VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  responsible_id BIGINT UNSIGNED NOT NULL,
  due_on DATE NOT NULL,
  completed_on DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  last_reminded_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_close_item_application FOREIGN KEY (close_application_id) REFERENCES prj_close_application(id),
  INDEX idx_close_item_due (status, due_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fin_daily_purchase (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  purchase_code VARCHAR(64) NOT NULL UNIQUE,
  applicant_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  purchase_type VARCHAR(64) NOT NULL,
  supplier_id BIGINT UNSIGNED NULL,
  item_description TEXT NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  budget_amount DECIMAL(18,2) NOT NULL,
  purpose TEXT NOT NULL,
  expected_on DATE NOT NULL,
  payment_method VARCHAR(64) NOT NULL,
  contract_related TINYINT(1) NOT NULL DEFAULT 0,
  contract_id BIGINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  approval_instance_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  is_deleted TINYINT(1) NOT NULL DEFAULT 0, version INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_purchase_department FOREIGN KEY (department_id) REFERENCES org_department(id),
  CONSTRAINT fk_purchase_supplier FOREIGN KEY (supplier_id) REFERENCES crm_counterparty(id),
  CONSTRAINT fk_purchase_contract FOREIGN KEY (contract_id) REFERENCES con_contract(id),
  CONSTRAINT chk_purchase_values CHECK (quantity > 0 AND budget_amount >= 0),
  CONSTRAINT chk_purchase_contract CHECK (contract_related = 0 OR contract_id IS NOT NULL),
  INDEX idx_purchase_applicant_status (applicant_id, status),
  INDEX idx_purchase_expected (expected_on, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sys_export_task (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  task_code VARCHAR(64) NOT NULL UNIQUE,
  requester_id BIGINT UNSIGNED NOT NULL,
  export_type VARCHAR(64) NOT NULL,
  filter_snapshot JSON NOT NULL,
  permission_snapshot JSON NOT NULL,
  estimated_rows INT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  file_id BIGINT UNSIGNED NULL,
  expires_at DATETIME(3) NULL,
  failure_reason VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  CONSTRAINT fk_export_file FOREIGN KEY (file_id) REFERENCES file_object(id),
  INDEX idx_export_requester (requester_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO iam_role(code,name,status,created_at,updated_at)
VALUES ('ADMIN','系统管理员','ENABLED',NOW(3),NOW(3)),('COMPANY_PRINCIPAL','公司负责人','ENABLED',NOW(3),NOW(3)),
('MARKET_BUSINESS','市场商务','ENABLED',NOW(3),NOW(3)),('PROJECT_MANAGER','项目经理','ENABLED',NOW(3),NOW(3)),
('PROJECT_MEMBER','项目成员','ENABLED',NOW(3),NOW(3)),('BID_STAFF','投标人员','ENABLED',NOW(3),NOW(3)),
('FINANCE','财务资金','ENABLED',NOW(3),NOW(3)),('EMPLOYEE','普通员工','ENABLED',NOW(3),NOW(3))
ON DUPLICATE KEY UPDATE name=VALUES(name),status='ENABLED';

INSERT INTO iam_permission(code,name,permission_type)
VALUES
('crm.counterparty.read','查看往来单位','READ'),('crm.counterparty.create','创建往来单位','WRITE'),('crm.contact.create','创建联系人','WRITE'),('crm.visit.create','创建拜访','WRITE'),
('lead.read','查看线索','READ'),('lead.create','创建线索','WRITE'),('lead.followUp.create','创建跟进','WRITE'),
('project.application.read','查看立项申请','READ'),('project.application.create','创建立项申请','WRITE'),('project.read','查看项目','READ'),
('bid.application.read','查看投标','READ'),('bid.application.create','创建投标','WRITE'),('contract.read','查看合同','READ'),('contract.create','创建合同','WRITE'),('contract.change.create','创建合同变更','WRITE'),('contract.milestone.create','维护合同履约节点','WRITE'),
('approval.task.read','查看审批待办','READ'),('approval.task.process','处理审批','APPROVE'),('approval.instance.withdraw','撤回本人审批','WRITE'),
('approval.instance.submit','提交审批','WRITE'),
('finance.read','查看收支','READ'),('invoice.application.create','申请开票','WRITE'),('receipt.create','登记收款','WRITE'),('reimbursement.create','创建报销','WRITE'),('payment.application.create','创建付款','WRITE'),
('sales.invoice.create','完成开票','WRITE'),('receipt.invoice.allocate','收款发票核销','WRITE'),
('payment.detail.create','登记实际付款','WRITE'),
('partner.plan.create','创建合作方案','WRITE'),('partner.settlement.create','创建合作结算','WRITE'),('settlement.read','查看结算保证金','READ'),
('deposit.create','创建保证金','WRITE'),('deposit.event.create','登记保证金事件','WRITE'),('project.close.create','创建结项申请','WRITE'),('project.close.openItem.complete','确认结项未清事项完成','WRITE'),('daily.purchase.create','创建日常采购','WRITE'),
('project.start.create','创建项目启动','WRITE'),('project.delivery.read','查看项目实施','READ'),('project.stage.create','创建项目阶段','WRITE'),('project.progress.create','记录项目进展','WRITE'),('project.risk.create','登记问题风险','WRITE')
,('project.deliverable.create','提交项目成果','WRITE'),('project.deliverable.confirm','确认项目成果','WRITE'),('project.acceptance.create','登记项目验收','WRITE')
,('project.change.create','创建项目变更','WRITE')
,('file.read','查看附件','READ'),('file.upload','上传附件','WRITE'),('file.download','下载附件','READ'),('file.sensitive.read','查看敏感附件','READ')
,('system.admin','系统管理','ADMIN')
,('report.financial.read','查看经营看板','READ'),('project.export','导出项目经营数据','EXPORT')
,('message.read','查看站内提醒','READ')
ON DUPLICATE KEY UPDATE name=VALUES(name),permission_type=VALUES(permission_type);

INSERT IGNORE INTO iam_role_permission(role_id,permission_id)
SELECT r.id,p.id FROM iam_role r CROSS JOIN iam_permission p WHERE r.code='ADMIN';

INSERT IGNORE INTO iam_role_permission(role_id,permission_id)
SELECT r.id,p.id FROM iam_role r JOIN iam_permission p ON p.code IN
('crm.counterparty.read','lead.read','project.application.read','project.read','bid.application.read','contract.read','approval.task.read','approval.task.process','finance.read','settlement.read','project.delivery.read','project.close.openItem.complete','report.financial.read','project.export','message.read')
WHERE r.code='COMPANY_PRINCIPAL';

INSERT IGNORE INTO iam_role_permission(role_id,permission_id)
SELECT r.id,p.id FROM iam_role r JOIN iam_permission p ON p.code IN
('crm.counterparty.read','crm.counterparty.create','crm.contact.create','crm.visit.create','lead.read','lead.create','lead.followUp.create','project.application.read','project.application.create','project.read','bid.application.read','bid.application.create','contract.read','deposit.create','deposit.event.create','message.read','approval.instance.submit')
WHERE r.code='MARKET_BUSINESS';

INSERT IGNORE INTO iam_role_permission(role_id,permission_id)
SELECT r.id,p.id FROM iam_role r JOIN iam_permission p ON p.code IN
('crm.counterparty.read','lead.read','project.application.read','project.application.create','project.read','bid.application.read','bid.application.create','contract.read','contract.change.create','contract.milestone.create','approval.task.read','approval.task.process','approval.instance.withdraw','approval.instance.submit','finance.read','invoice.application.create','reimbursement.create','payment.application.create','daily.purchase.create','partner.plan.create','partner.settlement.create','settlement.read','deposit.create','deposit.event.create','project.close.create','project.close.openItem.complete','project.start.create','project.delivery.read','project.stage.create','project.progress.create','project.risk.create','project.deliverable.create','project.deliverable.confirm','project.acceptance.create','project.change.create','file.read','file.upload','file.download','report.financial.read','project.export','message.read')
WHERE r.code='PROJECT_MANAGER';

INSERT IGNORE INTO iam_role_permission(role_id,permission_id)
SELECT r.id,p.id FROM iam_role r JOIN iam_permission p ON p.code IN
('crm.counterparty.read','lead.read','project.read','approval.task.read','approval.task.process','approval.instance.withdraw','project.delivery.read','project.progress.create','project.risk.create','project.deliverable.create','project.close.openItem.complete','reimbursement.create','daily.purchase.create','file.read','file.upload','file.download','message.read')
WHERE r.code='PROJECT_MEMBER';

INSERT IGNORE INTO iam_role_permission(role_id,permission_id)
SELECT r.id,p.id FROM iam_role r JOIN iam_permission p ON p.code IN
('project.read','bid.application.read','bid.application.create','approval.task.read','approval.task.process','approval.instance.withdraw','approval.instance.submit','deposit.create','deposit.event.create','message.read')
WHERE r.code='BID_STAFF';

INSERT IGNORE INTO iam_role_permission(role_id,permission_id)
SELECT r.id,p.id FROM iam_role r JOIN iam_permission p ON p.code IN
('crm.counterparty.read','lead.read','project.read','bid.application.read','contract.read','contract.create','contract.change.create','contract.milestone.create','approval.task.read','approval.task.process','approval.instance.withdraw','approval.instance.submit','finance.read','invoice.application.create','receipt.create','sales.invoice.create','receipt.invoice.allocate','reimbursement.create','payment.application.create','payment.detail.create','partner.settlement.create','settlement.read','deposit.create','deposit.event.create','report.financial.read','project.export','message.read')
WHERE r.code='FINANCE';

INSERT IGNORE INTO iam_role_permission(role_id,permission_id)
SELECT r.id,p.id FROM iam_role r JOIN iam_permission p ON p.code IN
('project.read','approval.task.read','approval.instance.withdraw','approval.instance.submit','project.close.openItem.complete','reimbursement.create','message.read') WHERE r.code='EMPLOYEE';

INSERT IGNORE INTO iam_role_data_scope(role_id,scope_type,scope_value)
SELECT id,'ALL','' FROM iam_role WHERE code IN('ADMIN','COMPANY_PRINCIPAL','FINANCE');
INSERT IGNORE INTO iam_role_data_scope(role_id,scope_type,scope_value)
SELECT id,'OWNER','' FROM iam_role WHERE code IN('MARKET_BUSINESS','PROJECT_MANAGER','BID_STAFF');
INSERT IGNORE INTO iam_role_data_scope(role_id,scope_type,scope_value)
SELECT id,'CREATOR','' FROM iam_role WHERE code IN('MARKET_BUSINESS','PROJECT_MANAGER','PROJECT_MEMBER','BID_STAFF','EMPLOYEE');
INSERT IGNORE INTO iam_role_data_scope(role_id,scope_type,scope_value)
SELECT id,'PARTICIPANT','' FROM iam_role WHERE code IN('PROJECT_MANAGER','PROJECT_MEMBER');

INSERT IGNORE INTO iam_sensitive_field_grant(role_id,field_code,access_level,explicit_deny)
SELECT r.id,f.field_code,'FULL',0 FROM iam_role r JOIN (
  SELECT 'bank_account' field_code UNION ALL SELECT 'profit' UNION ALL SELECT 'partner_settlement'
) f WHERE r.code IN('ADMIN','COMPANY_PRINCIPAL','FINANCE');
INSERT IGNORE INTO iam_sensitive_field_grant(role_id,field_code,access_level,explicit_deny)
SELECT r.id,f.field_code,'FULL',0 FROM iam_role r JOIN (
  SELECT 'profit' field_code UNION ALL SELECT 'partner_settlement'
) f WHERE r.code='PROJECT_MANAGER';
INSERT IGNORE INTO iam_sensitive_field_grant(role_id,field_code,access_level,explicit_deny)
SELECT id,'bank_account','MASKED',0 FROM iam_role WHERE code IN('PROJECT_MANAGER','MARKET_BUSINESS');
