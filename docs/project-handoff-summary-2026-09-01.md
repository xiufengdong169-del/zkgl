# 众肯科技项目全过程管理系统交接总结

更新时间：2026-09-01  
适用对象：新接手智能体、新入场开发人员、实施/测试协同人员

## 1. 项目定位与最新需求说明

本项目是“众肯科技项目全过程管理系统”，不是旧系统改造，而是从零开发的新系统。目标是覆盖从往来单位、客户拜访、项目线索、立项申请、审批、正式项目、投标、合同、实施交付、发票收款、费用付款、合作方结算、保证金、文件、报表、系统管理到审计日志的全过程管理。

当前需求基线以《需求评审修订基线 V2.2》为正式基础，但最近两个月又基于用户现场试用反馈做了大量体验和业务规则微调。新接手者必须同时参考：

- `需求评审修订基线_V2.2.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/acceptance-traceability.md`
- 本文档“最新需求说明”
- 当前代码实现与测试

### 1.1 用户近期确认的业务与界面需求

1. 项目管理页面
   - 页面要更友好，顶部使用亮蓝风格，但空间占位要小。
   - 项目管理首页中的“正式项目”和“立项申请”列表都要分页。
   - 已通过的立项申请不再重复显示在立项申请待处理列表中，而是进入正式项目。
   - 正式项目列表可查看详情。
   - 项目详情要显示立项来源，可点击进入立项申请、来源线索。
   - 项目详情中“立项申请填写信息”要尽量显示当时立项申请录入的全量字段，而不是只显示少数摘要字段。
   - 项目详情顶部摘要行只显示“项目编号 · 客户 · 项目状态”，不显示语义不清的负责人姓名。
   - 项目详情中“拟任项目负责人”应与立项申请一致，显示在明确字段里。
   - 项目详情下方操作日志、审批记录、时间线等行距要紧凑，不要大面积空白。

2. 立项申请
   - 独立“发起立项申请”表单必须包含“拟任项目负责人”字段。
   - 项目线索生成立项申请时，项目名称要能修改；默认可带入线索项目名称。
   - 项目线索本身已有项目名称字段，不能把拜访目的长期当作唯一项目名称来源。
   - 立项申请必填项后面显示红色 `*`，星号必须放在字段名后面，不能另起一行。
   - 立项申请必填字段：项目名称、客户、客户项目牵头部门、客户对接联系人、项目类型、预计收入、预计开始时间、招标/投标方式、项目地址、项目投资规模（万元）。
   - 立项申请详情与项目详情中的立项申请信息展示口径要一致。
   - 投标方式不应写死，应可通过系统字典维护。

3. 市场线索
   - 线索多时界面不能撑乱，要分页显示。
   - 已转换为项目的线索默认归档，不占用当前跟进列表。
   - 页面上应有“查看已转换项目线索”的入口。
   - 已转换线索仍可追溯，但不要干扰当前市场跟进。
   - 线索修改必须能正常保存。
   - 从拜访记录首次生成线索时，默认项目名称来源曾使用“拜访目的”；拜访表单字段名要显示为“拜访目的（潜在项目）”。
   - 拜访记录若已经生成过线索，再把“是否生成线索”改为“否”保存时，要给出提示，保存不成功，避免切断线索来源关系。
   - 拜访记录需要支持查看、修改、删除；修改时可维护“是否生成线索”，但必须受上条约束。

4. 往来单位管理
   - 原“客户管理”改名为“往来单位管理”，覆盖客户、供应商、合作伙伴等。
   - 录入往来单位时，单位名称、单位类型、所属行业、地址不能为空。
   - 增加发票信息和银行信息：发票抬头、发票税号、开户银行、银行账号、银行行号等。
   - 原程序已有电话和备注，新增过程中重复出现的联系电话、开票备注应删除。
   - 合作状态如果需要手工维护但业务定义不清，暂时隐藏，不放在前台让用户误操作。

5. 联系人
   - 增加联系人时，姓名、部门不能为空。
   - 联系人属于往来单位详情的一部分。

6. 人员与组织
   - 人员信息增加个人收款开户银行、个人收款银行账号，用于工资发放等。
   - 同一账号支持多个角色。
   - 当前不实现同一账号归属多个部门；规范做法是一个主部门，多角色，多岗位任职，必要时通过数据范围或项目成员授权实现跨部门业务查看。
   - 近期已讨论但暂不改：人员多岗位、跨部门数据范围增强模型。
   - 新增人员/角色维护要有保存反馈；角色应中文显示，不要把内部代码如 `HR_ADMINISTRATION` 直接显示给普通用户。
   - “人事行政”角色需要支持创建和中文显示。

7. 审批岗位与审批人员
   - 审批模板配置的是“审批岗位”，不是固定人员。
   - 审批人员应根据“审批岗位任职”配置解析，不能简单显示角色名。
   - 审批岗位任职需要能新增、修改、停用/启用、删除；若配置错人员，不应只能删除重建。
   - 审批岗位下拉、任职人员下拉文字不能太小。
   - 修改审批岗位任职后，待审批/未到达节点中相关审批任务要同步到最新任职人员。
   - 审批详情应显示审批岗位、审批人员、当前节点，避免“岗位对、人不对”的情况。

8. 系统管理与字典
   - 系统退出按钮位置要靠近“系统管理”，不要放在侧边栏底部过远导致难发现。
   - 数据字典增加删除功能。
   - 数据字典页面不能产生左右横向滚动，要一页内显示。
   - 投标方式已纳入字典：`PROJECT_BIDDING_METHOD`，默认项为公开投标、商务洽谈、无需投标。

9. 表单必填与视觉规范
   - 所有用户明确要求的非空字段都要后端校验，也要前端 `required` 标识。
   - 红色星号必须跟在字段名称后面，不能落到下一行。
   - 行高、卡片间距、表格密度要偏业务系统风格，显示更多信息，避免大面积空白。

## 2. 软件架构与模块说明

### 2.1 技术架构

项目采用 npm workspaces 的单仓多包结构：

- 前端：Vue 3 + TypeScript + Vite，位于 `apps/web`
- 后端：Node.js + TypeScript + MySQL，位于 `apps/api`
- 共享类型：`packages/shared`
- 数据库初始化：`database/init/schema.sql`
- 部署和运维脚本：`deploy`、`scripts`
- 文档：`docs`

运行形态：

1. 浏览器访问 Vue SPA。
2. 前端通过统一 `callApi(action, payload)` 调用后端。
3. 后端所有业务入口都集中在 action 机制中。
4. 后端完成认证、权限、数据范围、状态机、事务和审计。
5. MySQL 存储全部核心业务数据。
6. 生产目标为腾讯云轻量应用服务器：Nginx 托管前端静态资源并反向代理 API；Node API、认证适配器、提醒任务、导出任务由 systemd 管理。

### 2.2 前端模块

主要页面位于 `apps/web/src/views`：

- `HomeView.vue`：工作台、摘要、待办、提醒。
- `CustomersView.vue`：往来单位、联系人、拜访记录。
- `LeadsView.vue`：项目线索、跟进记录、报备审批、线索转立项。
- `ProjectsView.vue`：项目管理、立项申请、正式项目、项目详情、立项来源、审批记录、时间线。
- `ApprovalsView.vue`：审批待办、审批动作。
- `BidsView.vue`：投标申请、任务、检查、结果、友商配合。
- `ContractsView.vue`：合同登记、合同变更、合同摘要。
- `DeliveryView.vue`：项目启动、阶段、进展、问题风险、成果、验收、变更。
- `FinanceView.vue`：开票、收款、报销、付款、日常采购。
- `SettlementsView.vue`：合作方案、合作方结算、保证金。
- `FilesView.vue`：项目文件、版本、下载。
- `ReportsView.vue`：统计报表。
- `AdminView.vue`：组织、人员、账号、角色、权限、数据范围、敏感字段、审批岗位、编号、参数、字典、日志。

前端通用文件：

- `apps/web/src/api.ts`：统一 API 调用。
- `apps/web/src/router.ts`、`routes.ts`：路由定义。
- `apps/web/src/navigation.ts`：左侧菜单和菜单权限。
- `apps/web/src/stores/auth.ts`：登录态、当前用户、权限、角色。
- `apps/web/src/styles.css`：全局样式。
- `apps/web/src/demo.ts`：演示数据。

### 2.3 后端模块

后端主要文件位于 `apps/api/src`：

- `actions.ts`：所有 action 的权限和输入 schema 注册入口。
- `persistence.ts`：主要业务持久化实现，包含大量 SQL、事务、状态流转、审批回写。
- `handler.ts`、`index.ts`、`cloud-function.ts`：统一 action 执行入口和兼容入口。
- `server.ts`：独立 Node API 服务。
- `server-auth.ts`：服务端认证处理。
- `database.ts`：MySQL 连接、用户会话、权限加载。
- `rbac.ts`：功能权限和数据范围校验基础逻辑。
- `approval.ts`：审批状态机核心逻辑。
- `crm.ts`：往来单位、联系人、拜访记录输入模型。
- `leads.ts`：线索、跟进输入模型。
- `project-applications.ts`：立项申请输入模型。
- `bids.ts`、`contracts.ts`、`delivery.ts`、`finance.ts`、`settlements.ts`：各业务域输入模型和业务规则。
- `files.ts`：文件上传、版本、下载输入模型。
- `audit.ts`：审计日志。
- `reminders.ts`、`scheduled-reminder*.ts`：提醒任务。
- `export-tasks.ts`、`scheduled-export*.ts`：后台导出任务。

### 2.4 权限与审批架构

权限体系分为：

- 功能权限：如 `project.read`、`project.application.create`、`system.admin`
- 数据范围：ALL、SELF、OWNER、CREATOR、PARTICIPANT、DEPARTMENT、PROJECT
- 敏感字段授权：银行账号、金额、利润、合作分成等敏感字段必须后端控制
- 角色：同一账号可多角色，权限取并集
- 人员：一个人员主部门，不做多部门归属
- 审批岗位：审批模板配置岗位；具体审批人由岗位任职解析

审批链路：

1. 业务单据草稿创建。
2. 提交审批生成 `wf_instance`。
3. 根据 `wf_template_node` 生成 `wf_task`。
4. 审批岗位解析具体任职人员。
5. 审批动作写入 `wf_action_history`。
6. 审批通过后由后端统一回写业务状态，例如立项申请通过后自动生成正式项目。

## 3. 数据库说明

### 3.1 初始化原则

当前阶段没有数据库迁移机制。开发、测试、首次上线均从空 MySQL 数据库执行：

```text
database/init/schema.sql
```

正式投产后的结构变更需要另行评审，不应随意直接改生产表结构。

### 3.2 数据库主要业务域

1. 组织与权限
   - `org_department`：部门。
   - `org_employee`：人员档案，含主部门、岗位、联系方式、个人收款银行信息。
   - `iam_user`：登录账号与 CloudBase UID/本地 UID 映射。
   - `iam_role`、`iam_permission`、`iam_user_role`、`iam_role_permission`：角色权限。
   - `iam_role_data_scope`：角色数据范围。
   - `iam_sensitive_field_grant`：敏感字段授权。
   - `iam_project_grant`：指定项目临时授权。

2. 往来单位与市场
   - `crm_counterparty`：往来单位，含单位名称、类型、行业、地址、发票、银行等信息。
   - `crm_contact`：联系人，姓名和部门为关键必填。
   - `crm_visit`：拜访记录，含拜访目的、沟通内容、是否生成线索、来源线索约束。
   - `crm_visit_participant`：拜访参与人。
   - `mkt_lead`：项目线索，含项目名称、客户、项目类型、预计金额、客户牵头部门、联系人、项目地址等。
   - `mkt_lead_follow_up`：线索跟进记录。
   - `mkt_lead_collaborator`：线索协同人员。

3. 立项与项目
   - `prj_project_application`：立项申请，含项目名称、客户、来源线索、客户牵头部门、客户联系人、项目地址、项目类型、项目投资规模、预计收入/成本/利润、预计起止、拟任项目负责人、投标方式、风险、必要性。
   - `prj_application_member_suggestion`：立项时建议成员。
   - `prj_project`：正式项目。审批通过后从立项申请生成，项目编号与立项申请编号分离。
   - `prj_project_member`：项目成员。
   - `prj_start`、`prj_stage`、`prj_progress`、`prj_risk_issue`、`prj_change`、`prj_deliverable`、`prj_acceptance`：项目实施全过程。
   - `prj_close_application`、`prj_close_open_item`：结项与遗留事项。

4. 审批
   - `org_position`：审批岗位。
   - `org_position_assignment`：审批岗位任职人员，支持启停、代理、起止日期。
   - `wf_template`：审批模板。
   - `wf_template_node`：审批节点，配置岗位、顺序、金额阈值、抄送。
   - `wf_instance`：审批实例，含配置快照。
   - `wf_task`：审批任务，落到具体审批人员。
   - `wf_action_history`：审批动作历史。
   - `wf_cc_recipient`：抄送记录。

5. 投标、合同、财务与结算
   - `bid_application`、`bid_task`、`bid_check`、`bid_result`、`bid_partner_cooperation`
   - `con_contract`、`con_contract_change`、`con_contract_milestone`
   - `fin_invoice_application`、`fin_sales_invoice`
   - `fin_receipt`、`fin_receipt_invoice_allocation`
   - `fin_reimbursement`、`fin_reimbursement_detail`
   - `fin_payment_application`、`fin_payment_detail`
   - `partner_plan`、`partner_plan_version`、`partner_settlement`
   - `fin_deposit`、`fin_deposit_event`
   - `fin_daily_purchase`

6. 系统支撑
   - `sys_dictionary_type`、`sys_dictionary_item`：数据字典。
   - `sys_number_rule`：编号规则。
   - `sys_parameter`：系统参数。
   - `sys_status_history`：状态历史。
   - `sys_audit_log`：操作审计日志。
   - `sys_message`：系统消息。
   - `file_object`、`file_version`、`file_access_log`：文件、版本、访问日志。
   - `sys_export_task`：后台导出任务。

### 3.3 数据库设计要点

- 主键普遍采用 `BIGINT UNSIGNED AUTO_INCREMENT`。
- 金额统一使用 `DECIMAL(18,2)`，不要用浮点型。
- 业务编号有唯一索引，如项目编号、立项申请编号、线索编号。
- 大多数业务表包含：`status`、`created_by`、`created_at`、`updated_by`、`updated_at`、`is_deleted`、`version`。
- `version` 用于乐观锁，更新时要校验版本，防止覆盖别人修改。
- 软删除为主，除少量字典项等特殊对象可以物理删除。
- 所有权限、数据范围和敏感字段控制必须在后端 SQL/业务逻辑中完成，不能只靠前端隐藏。

## 4. 源代码存放说明

仓库本地路径：

```text
C:\Users\27787\Desktop\zkgl
```

GitHub 仓库：

```text
https://github.com/xiufengdong169-del/zkgl
```

目录说明：

```text
apps/web                 前端 Vue 应用
apps/api                 后端 Node/TypeScript API
packages/shared          前后端共享类型和权限相关类型
database/init/schema.sql 数据库空库初始化脚本
docs                     架构、部署、验收、交接文档
scripts                  本地启动、初始化、校验、备份、部署辅助脚本
deploy/nginx             Nginx 配置
deploy/systemd           systemd 服务与定时任务
deploy/auth              认证适配器示例
```

常用命令：

```powershell
npm install
npm run typecheck
npm run test
npm run build
npm run verify
npm run verify:acceptance
npm run bootstrap:local-mysql
npm run start:local-fullstack -- --skip-build
npm run check:local-fullstack
```

本地完整联调默认入口：

- 前端：`http://127.0.0.1:5173/`
- API：`http://127.0.0.1:3000/`
- 本地 API 代理：`http://127.0.0.1:4180/api`
- 认证适配器：`http://127.0.0.1:3010/`
- MySQL：本机 `127.0.0.1:3307`

注意：不要把 `.env.local.fullstack`、服务器环境变量、数据库密码、CloudBase SecretKey、API Key、token 等内容写入文档、代码、提交记录或聊天回复。

## 5. 新智能体/新人对接指南

### 5.1 接手第一小时必做

1. 先看当前工作区状态：

```powershell
git status --short
git log --oneline -5
```

如果有未提交修改，先判断是用户已有改动还是自己刚做的改动。不要随意覆盖、回滚、清理。

2. 阅读以下文件：

```text
README.md
docs/architecture.md
docs/deployment.md
docs/acceptance-traceability.md
docs/local-user-testing.md
database/init/schema.sql
apps/api/src/actions.ts
apps/api/src/persistence.ts
apps/web/src/routes.ts
apps/web/src/navigation.ts
```

3. 启动前确认端口：

```powershell
Get-NetTCPConnection -LocalPort 5173,3000,4180 -State Listen -ErrorAction SilentlyContinue
```

4. 本地服务启动：

```powershell
npm run start:local-fullstack -- --skip-build
```

如果 API 或数据库异常，优先检查本机 MySQL 3307，必要时运行：

```powershell
npm run bootstrap:local-mysql
```

5. 每次改动后至少跑：

```powershell
npm run typecheck
npm run build
```

重要业务逻辑改动还要跑：

```powershell
npm test
```

交付级改动跑：

```powershell
npm run verify:acceptance
```

### 5.2 开发红线

以下事项严禁擅自操作：

1. 不要执行 `git reset --hard`、`git checkout -- .`、批量删除文件等破坏性命令，除非用户明确要求。
2. 不要覆盖用户未提交改动。先看 `git status`，再局部修改。
3. 不要把任何密码、密钥、token、数据库连接串写入源码、文档、测试输出或回复。
4. 不要让前端直接连接数据库。
5. 不要只在前端隐藏敏感字段；权限和敏感字段过滤必须在后端做。
6. 不要把审批人硬编码在代码中。审批模板只配置岗位，具体人员由 `org_position_assignment` 解析。
7. 不要把业务状态交给前端随意传值更新。状态流转必须走后端状态机/审批回写。
8. 不要用浮点数存金额，数据库金额使用 `DECIMAL(18,2)`。
9. 不要绕过 `actions.ts` 新增裸接口。新增业务动作必须注册 action、权限和输入 schema。
10. 不要随意引入数据库迁移机制。当前阶段正式口径是空库初始化 `schema.sql`。
11. 不要在生产或真实数据环境执行测试插入、清空、重置操作。
12. 不要把“同一账号归属多个部门”当作默认方案。当前规范是一个主部门，多角色，必要时用数据范围、岗位任职、项目成员、临时项目授权解决。

### 5.3 典型开发流程

新增或修改一个业务字段时：

1. 修改输入 schema，如 `crm.ts`、`leads.ts`、`project-applications.ts` 等。
2. 修改数据库初始化 `database/init/schema.sql`。
3. 修改 `persistence.ts` 的 insert/update/select。
4. 修改前端表单、详情、列表展示。
5. 修改 demo 数据或测试数据。
6. 补或更新测试，尤其是 schema 测试、写入权限测试、详情展示相关测试。
7. 运行 typecheck/test/build。
8. 重启本地服务验证页面。

新增一个下拉选项时：

1. 优先考虑是否应进入 `sys_dictionary_type/sys_dictionary_item`。
2. 字典类型、字典项由系统管理页维护。
3. 前端保留合理 fallback，防止初始化数据缺失导致页面空白。
4. 当前“投标方式”字典类型为 `PROJECT_BIDDING_METHOD`。

处理审批问题时：

1. 先确认业务类型和审批实例：`wf_instance.business_type/business_id`。
2. 查当前节点：`wf_instance.current_node_order`。
3. 查任务：`wf_task`。
4. 查模板节点岗位：`wf_template_node.position_code`。
5. 查岗位任职：`org_position_assignment`。
6. 修改任职后要同步待办任务，不能只改显示。

处理权限问题时：

1. 查登录账号 `iam_user`。
2. 查角色 `iam_user_role`、`iam_role`。
3. 查权限 `iam_role_permission`、`iam_permission`。
4. 查数据范围 `iam_role_data_scope` 和项目授权 `iam_project_grant`。
5. 判断是否还有敏感字段授权限制。

## 6. 前期开发总结与经验说明

### 6.1 已形成的稳定经验

1. 用户更重视业务可理解性，而不仅是功能存在。
   - 例如“董秀峰”出现在项目摘要行，技术上是负责人，但用户看不出含义，因此应去掉或放入明确字段。

2. 列表和详情必须区分清楚。
   - 列表要密度高、占位小、分页。
   - 详情要全量、可追溯、来源可点击。

3. 通过审批转正的数据要避免重复出现。
   - 已通过立项申请进入正式项目后，不应继续占用立项申请待处理列表。
   - 已转换线索应默认归档，不干扰当前线索。

4. 来源链路非常重要。
   - 拜访记录 → 项目线索 → 立项申请 → 正式项目必须可追溯。
   - 但来源不能阻断业务修改，例如线索转立项时项目名称可以修改，同时保留来源线索。

5. 字典优于硬编码。
   - 往来单位类型、行业、投标方式等应进入数据字典。
   - 用户明确提出“不需要的可以删除”，所以字典项维护要支持删除。

6. 审批岗位与审批人员要分开。
   - 模板配置岗位。
   - 岗位任职配置人。
   - 待办任务展示具体审批人。
   - 修改任职后要同步未处理任务。

7. 表单必填必须前后端一致。
   - 用户会直接看红色星号位置。
   - 星号必须跟在字段名后面，不能因为 CSS 或换行导致跑到下一行。

8. 保存操作必须有反馈。
   - 新增人员、账号角色保存、字典维护、岗位任职等后台维护操作，都应给成功/失败提示。

9. 中文显示要彻底。
   - 不要把内部代码直接显示给最终用户，如 `BID_STAFF`、`HR_ADMINISTRATION`。
   - 如果必须临时 fallback，至少要有中文映射。

10. 每次后端 action 或 SQL 改动后，必须重启本地全栈服务。
    - Vite 前端 HMR 能热更新前端，但后端 dist 需要 build + restart。

### 6.2 当前应继续关注的风险点

1. `persistence.ts` 业务较集中，文件很大，新人改动时容易影响无关模块。建议小步修改、小步验证。
2. 部分文档和终端输出在 Windows PowerShell 中可能出现中文显示乱码，但文件本身多为 UTF-8。不要因为终端乱码误判源文件内容。
3. 本地数据库可能已有手工补数据，重新初始化会丢失这些数据；交接时要确认是测试库还是真实试用库。
4. 字典、角色、审批岗位等基础数据既存在初始化 SQL，又可能在当前数据库中被用户维护；改初始化 SQL 不等于自动改现有库，现有库需要单独补数据或通过页面维护。
5. 审批任务一旦生成，就有历史快照。修改模板/岗位任职对历史记录和未处理任务的影响要区分清楚。
6. 金额、银行账号、利润、合作结算属于敏感数据，任何导出、详情、报表都要复核权限。
7. 当前用户连续做现场体验反馈，很多改动是 UX 微调，但背后常带业务规则；不要只改样式不改逻辑。

### 6.3 建议后续工作

1. 把近期用户反馈形成一个“V2.3 现场优化清单”，和 V2.2 基线分开管理。
2. 为近期新增字段补充更完整的后端单元测试和前端行为测试。
3. 将超大的 `persistence.ts` 按业务域逐步拆分，降低维护风险。
4. 对系统管理页继续做密度和可用性优化，特别是字典、角色、审批岗位任职。
5. 为生产上线前准备一份正式初始化数据清单：部门、人员、账号、角色、岗位任职、审批模板、字典、编号规则、系统参数。
6. 建议每次用户确认一批功能后提交 Git，并推送 GitHub，避免本地大量未提交修改堆积。

## 7. 当前接手提醒

截至本文生成时，工作区存在多处未提交修改。新接手者第一步必须执行：

```powershell
git status --short
```

不要擅自还原。应先理解这些修改大多来自近期现场反馈，包括：

- 往来单位字段和字典维护
- 人员银行信息
- 项目线索和立项申请字段
- 拟任项目负责人
- 投标方式字典化
- 审批岗位任职维护
- 角色中文显示和多角色
- 页面布局、分页、详情展示、来源追溯

如果需要提交，建议先运行：

```powershell
npm run typecheck
npm run test
npm run build
```

再按一个清晰主题提交，例如：

```text
feat: improve project application and approval administration
```

