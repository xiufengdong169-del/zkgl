# 操作手册与验收清单

## 登录与工作台

1. 使用管理员分配的 CloudBase 用户名和密码登录。
2. 登录后进入工作台，查看经营摘要、我的待办、我的项目、导出任务和消息提醒。
3. 消息提醒显示业务来源，未读消息可标记为已读。

验收点：

- 无权限用户不能进入对应菜单。
- 停用内部账号后，已有会话访问 API 被拒绝。
- 工作台项目、待办和消息均按当前用户权限范围显示。

## 项目全过程

建议按以下顺序验收主流程：

1. 创建客户、联系人和拜访记录。
2. 创建线索并跟进。
3. 创建立项申请，提交审批，通过后生成项目。
4. 创建投标申请、投标任务、检查项和投标结果。
5. 创建合同，维护合同变更和履约节点。
6. 发起项目启动；无正式合同时使用提前启动并生成补签提醒。
7. 维护阶段、进展、风险、变更、成果和验收。
8. 处理开票、收款、报销、付款、合作方结算和保证金。
9. 发起项目结项，存在未清事项时记录责任人和期限。
10. 在项目详情页查看成员、合同、阶段风险、审批记录、操作日志和项目文件入口。

验收点：

- 项目主状态与投标、合同、开票、收款状态独立。
- 提前启动必须记录依据、预计签约日和风险，并持续生成补签提醒。
- 结项前校验验收、应收、应付、保证金、成果归档和未关闭问题。
- 项目详情能形成全景视图。

## 审批

1. 发起业务申请后提交审批。
2. 审批人进入“审批与待办”，对待办执行通过、退回或驳回。
3. 发起人可查看本人发起事项，并在允许状态撤回。

验收点：

- 审批任务只分配给配置岗位人员。
- 退回、驳回、撤回会同步回写业务状态。
- 审批记录能在项目详情或审批页追溯。

## 权限与数据范围

系统同时校验功能权限和数据范围。项目相关数据支持：

- 全部数据范围。
- 项目经理。
- 项目成员。
- 指定项目范围。
- 部门范围。
- 临时项目授权。
- 业务本人可见规则。

验收点：

- 项目、投标、合同、财务、交付、结算、文件和报表的项目范围口径一致。
- 临时项目授权在授权期内生效，到期后失效。
- 敏感字段按授权级别脱敏或隐藏。

## 文件与导出

1. 在文件中心或项目详情入口上传项目文件。
2. 下载文件时系统生成临时访问地址并记录访问日志。
3. 经营数据导出在数据量较小时同步下载；数据量较大时进入后台导出任务。

验收点：

- 导出 CSV 防公式注入。
- 附件默认只允许 PDF、Office 文档、CSV、常见图片和 ZIP，并同时校验扩展名与 MIME 类型；EXE、DLL、BAT、CMD、PS1、JS、SH 等可执行或脚本文件必须拒绝。
- 后台导出文件为私有文件，过期时间受 `export.retention_days` 参数控制。
- 文件下载成功和拒绝均有访问日志；前端仅打开 HTTPS 临时下载地址，并使用 `noopener,noreferrer` 隔离新窗口。

## 定时提醒

定时提醒由 `zkgl-reminder` 生成，覆盖：

- 合同即将到期。
- 投标即将截止。
- 保证金退回逾期。
- 保证金付款逾期。
- 先开工项目待签约。
- 先开工项目超过预计签约日后标记异常并持续提醒补签或风险处置。
- 结项未清事项逾期。
- 风险问题待处理。

验收点：

- 合同到期和投标截止提前量读取系统参数。
- 重复执行提醒函数不会在短时间内重复生成同类消息。

## 性能与容量现场验收

AC-14 需要在腾讯云轻量应用服务器生产环境、正常企业网络和基准数据量下现场执行，不以本地单元测试替代。验收前先准备或导入以下基准数据：

- 不少于 3000 个项目，覆盖项目经理、项目成员、部门范围和临时授权等数据范围。
- 不少于 10000 份合同，覆盖履约、变更、开票、收款、保证金和结算关联数据。
- 不少于 50000 条阶段、进展、问题风险、审批、财务明细、文件日志和消息提醒等业务明细。

现场压测要求：

1. 使用 30 用户并发登录系统，混合执行项目列表查询、项目详情查询、合同与财务查询、保存业务单据、提交审批和审批通过/退回。
2. 记录每类请求的成功率、P95 响应时间、错误明细、重复提交/重复审批情况和越权访问结果。
3. 普通查询请求 P95 响应时间必须 ≤3 秒，普通保存、提交和审批请求 P95 响应时间必须 ≤5 秒。
4. 并发审批不得产生重复审批记录；越权查询、越权保存和越权审批必须被拒绝并留下审计日志。

通过标准：

- 30 用户混合场景完成后，95% 请求满足 V2.2 性能阈值。
- 业务数据无重复审批、无重复写入、无权限绕过。
- 压测记录、异常截图、Nginx 访问日志、systemd/journal 日志和 MySQL 慢查询记录归档到验收材料。

## 备份恢复验收

正式承载合同、付款、成果和合作结算数据前，必须完成备份恢复确认，不以本地自动化测试替代。
恢复演练记录建议使用 `docs/backup-recovery-acceptance-template.md` 填写并归档。

验收前配置：

1. 腾讯云轻量服务器 MySQL 8.0 启用 `deploy/systemd/zkgl-mysql-backup.service` 与 `deploy/systemd/zkgl-mysql-backup.timer` 每日自动备份，备份至少保留 30 天，保留天数由 `BACKUP_RETENTION_DAYS` 控制。
2. 每次关键发布、初始化脚本重建或生产配置变更前，先执行一次 `scripts/create-mysql-backup.mjs` 手工备份，并执行 `node scripts/verify-backup-assets.mjs` 复核备份资产。
3. 项目附件启用平台保护能力或定期备份，数据库恢复点与附件恢复点需要能对应到同一业务时间窗口。
4. 明确备份责任人、恢复责任人、备份保留策略、恢复目标环境和恢复演练记录保存位置。

上线前恢复演练：

1. 选择最近一次数据库备份，通过 `scripts/restore-mysql-backup.mjs` 恢复到独立验证环境；`RESTORE_DB_NAME` 不得等于生产 `DB_NAME`，并必须设置 `RESTORE_CONFIRM=I_UNDERSTAND_THIS_IS_NOT_PRODUCTION`，不得覆盖生产环境。
2. 抽查项目、合同、开票、收款、付款、合作方结算、保证金、文件元数据和审计日志是否可读取。
3. 抽查至少 3 个项目附件或后台导出文件，确认对象存储文件与数据库文件记录能够对应。
4. 记录恢复开始时间、完成时间、恢复人、验证人、异常项、处理结论和截图。

持续要求：

- 上线后至少每半年执行一次数据库和附件恢复验证。
- 备份、恢复和演练记录应归档到验收材料或运维台账。
- 不得为节省免费额度而关闭安全、审计日志或备份恢复能力。

## 必跑验证命令

每次交付前执行总验证命令：

```powershell
npm run verify:acceptance
```

该命令会先执行 `npm run verify`，再执行 `npm audit --omit=dev`。完整命令顺序为：

```powershell
npm run typecheck
npm run test
npm run build
node scripts/verify-source-secret-hygiene.mjs
node scripts/verify-web-dist-security.mjs
npm run verify:deployment-config
node scripts/verify-server-deployment-assets.mjs
node scripts/verify-backup-assets.mjs
node scripts/verify-server-preflight.mjs
npm run build:function
node scripts/verify-cloudbase-function-packages.mjs
npm audit --omit=dev
```

以下检查已纳入自动化测试和 `npm run verify:acceptance`：

- 动作定义与持久层实现一致。
- 可提交审批业务均配置审批模板和审批结果回写。
- 源码和交付脚本不包含非空数据库密码、Secret、私钥或带凭证的 MySQL URL。
- 前端构建产物不包含后端数据库变量、SecretKey、API Secret 或私钥标记。
- 三套 CloudBase 函数包入口、依赖清单、无 workspace 内部包运行时引用，且 `cloudbaserc.json` 部署配置正确。
- 生产依赖审计 `npm audit --omit=dev` 无已知漏洞。
## 2026-08-02 独立服务器运维补充

当前正式部署目标为 Tencent Cloud Lighthouse 独立服务器：`193.112.79.220`，广州，4 核 4G，Ubuntu 24.04，MySQL 8.0。现场运维验收除原业务流程外，还必须确认：

1. `zkgl-api` 与 `zkgl-auth-adapter` systemd 服务已启用，`curl http://127.0.0.1:3000/healthz` 和 `curl http://127.0.0.1:3010/healthz` 返回健康状态。
2. Nginx 已通过 HTTPS 托管前端，并将 `/api` 反向代理到本机 API。
3. 前端生产包使用正式 HTTPS `VITE_API_BASE_URL` 重新构建。
4. 服务器环境文件仅保存在 `/etc/zkgl/zkgl-api.env`，真实数据库密码不进入 Git、文档示例或浏览器构建产物。
5. MySQL 8.0 以空库执行 `database/init/schema.sql` 初始化；本项目仍不存在数据库迁移。
6. 上线前必须启用 `deploy/systemd/zkgl-auth-adapter.service` 并配置 `AUTH_TOKEN_VERIFIER_MODULE`；可参考 `deploy/auth/cloudbase-token-verifier.example.mjs` 创建服务器本地真实 verifier，并用 `scripts/verify-server-env.mjs` 预检服务器环境文件，但不得直接把 example 文件作为生产 verifier；受信任认证适配层校验 `Authorization: Bearer ...` 后再向本机 API 注入 `X-ZKGL-CloudBase-UID`；`AUTH_TRUSTED_PROXY` 默认保持 `false`，认证适配层、Nginx 清除外部伪造头和联调验证完成后才允许改为 `true`。
