# CloudBase 部署说明

## 前置条件

1. CloudBase 环境：`cloudbase-d7gc2b32cd4196059`，地域为广州南沙。
2. 在 CloudBase 控制台开启用户名密码登录，并配置 Web 安全域名。
3. 登录安全策略必须设置为：首次登录强制修改初始密码；连续失败 5 次后锁定 15 分钟。
4. 在云函数环境变量中配置 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`、`CLOUDBASE_ENV_ID`。这些值不得提交到 Git。
5. 从空 MySQL 数据库执行 `database/init/schema.sql`，再按项目方名单维护部门、人员、内部用户、角色和授权。
6. 当前新开发阶段不存在数据库迁移步骤，也不执行历史数据导入或旧系统兼容脚本。

## 上线初始化资料清单

执行空库初始化后，正式联调或验收演示前需要准备以下项目方资料：

1. 部门清单：部门编码、部门名称、启用状态。
2. 人员清单：员工编号、姓名、员工类型、所属部门、岗位名称、直属上级、账号启停状态。
3. CloudBase 身份清单：用户名、CloudBase UID、对应员工、初始密码交付方式；密码只在 CloudBase 身份服务中设置，不写入业务数据库。
4. 角色分配：至少准备系统管理员、公司负责人、市场商务、项目经理、项目成员、投标人员、财务资金、普通员工等角色对应人员。
5. 审批岗位任职：经营负责人、公司负责人、财务复核人、项目经理等岗位的任职人员及生效时间。
6. 审批金额阈值：合同、合同变更、开票、付款、合作方结算、保证金、项目启动、项目变更、项目验收和项目结项等模板的金额阈值。
7. 编号规则确认：线索、项目、合同、投标、付款、结算、保证金、结项和导出任务等编号前缀、年度规则和起始流水号。
8. 系统参数确认：提醒提前天数、导出文件保留天数、同步导出阈值等参数。
9. 验收演示账号：至少准备管理员、公司负责人、项目经理、财务、普通项目成员和无权访问用户各 1 个，用于验证菜单权限、审批、数据范围和旧会话停用。

## 账号开通与停用

1. 管理员先在 CloudBase 身份管理创建用户名账号并取得 UID。
2. 在系统管理页选择人员，填写同一用户名和 CloudBase UID，分配角色。
3. 一个员工和一个 CloudBase UID 均只能关联一个内部账号。
4. 初始密码只通过 CloudBase 身份服务设置和传递；业务系统不接收、不记录、不打印密码。
5. 停用账号时，先在系统管理页停用内部账号，使旧会话访问业务 API 立即失败；再在 CloudBase 身份管理停用对应身份账号。启用时按相反顺序处理。

## 构建与验证

上线前执行：

```powershell
npm install
npm run verify
```

函数包生成在：

- `functions/zkgl-api`
- `functions/zkgl-reminder`
- `functions/zkgl-export-worker`

上述目录是构建产物，不纳入版本管理。

`node scripts/verify-cloudbase-function-packages.mjs` 会同时校验三套函数包和 `cloudbaserc.json` 中的函数名、目录、`index.main` handler、Nodejs18.15 runtime、超时时间、内存规格、依赖安装开关和定时触发器配置。

## 云函数部署

```powershell
tcb login
tcb fn deploy zkgl-api --yes
tcb fn deploy zkgl-reminder --yes
tcb fn deploy zkgl-export-worker --yes
```

只为 `zkgl-api` 配置 HTTP 访问路径，并将完整地址写入前端构建变量 `VITE_API_BASE_URL`。不要为 `zkgl-reminder` 和 `zkgl-export-worker` 配置客户端 HTTP 访问路径。

## 定时触发器

- `zkgl-reminder`：触发器名称必须为 `zkglDailyReminder`，建议每日 08:00 执行，CloudBase 七段 Cron 示例：`0 0 8 * * * *`。
- `zkgl-export-worker`：触发器名称必须为 `zkglExportWorker`，建议每 5 分钟执行一次，七段 Cron 示例：`0 */5 * * * * *`。

部署后应在控制台核对触发器名称、时区、最近执行日志和函数权限控制。

## 上线验收检查

上线验收至少验证：

1. 首次登录强制修改初始密码。
2. 连续 5 次失败后锁定 15 分钟。
3. 内部账号停用后，旧会话无法访问业务 API。
4. CloudBase 身份账号停用后，无法建立新会话。
5. `zkgl-reminder` 能生成合同、投标、保证金、先开工、结项未清事项和风险提醒。
6. `zkgl-export-worker` 能处理后台导出任务并生成私有文件。
7. `node scripts/verify-web-dist-security.mjs` 通过，前端构建产物不包含数据库变量、SecretKey、API Secret 或私钥标记。
