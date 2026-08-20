# 最终交付验收总清单

本文档用于项目最终交付前逐项复核。除现场性能、生产部署、备份恢复演练等必须在真实环境完成的事项外，其余项目应先在本地执行 `npm run verify:acceptance` 并确认通过。

## 1. 需求与交付材料

- [ ] Markdown 需求基线为 `需求评审修订基线_V2.2.md`，且作为当前唯一 Markdown 开发与验收基线。
- [ ] Word 版需求说明书为 `众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx`，并与 Markdown 基线保持“全新开发、无数据库迁移、空库初始化、当前模块前缀、腾讯云轻量服务器部署口径”一致；`众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx` 仅作为历史原件追溯。
- [ ] 架构、安全边界、事务与审计原则见 `docs/architecture.md`。
- [ ] 腾讯云轻量应用服务器部署、空库初始化、账号开通和上线初始化资料清单见 `docs/deployment.md`。
- [ ] 操作手册、主流程验收、现场性能验收和备份恢复验收见 `docs/operations-acceptance.md`。
- [ ] AC-14 现场性能验收记录模板见 `docs/performance-acceptance-template.md`。
- [ ] 备份恢复验收记录模板见 `docs/backup-recovery-acceptance-template.md`。
- [ ] V2.2 结果型验收用例与自动化测试映射见 `docs/acceptance-traceability.md`。
- [ ] 本地开发测试完成情况见 `docs/local-development-completion-report.md`，并确认本地自动化验收与仍需真实环境完成的事项边界清晰。

## 2. 代码与自动化验证

- [ ] 执行 `npm run verify:acceptance` 并通过。
- [ ] API 测试通过，当前基线为 89 个测试文件 / 478 条测试。
- [ ] Web 测试通过，当前基线为 10 个测试文件 / 63 条测试。
- [ ] TypeScript 类型检查通过。
- [ ] 前端生产构建通过。
- [ ] 源码与交付脚本不包含非空数据库密码、Secret、私钥或带凭证的 MySQL URL。
- [ ] 前端构建产物不包含后端数据库变量、SecretKey、API Secret 或私钥标记。
- [ ] `npm run verify:deployment-config` 通过，腾讯云轻量服务器、前后端环境变量、历史资产配置和 CI Node 版本一致性校验通过。
- [ ] `npm run verify:performance-acceptance` 通过，AC-14 现场性能验收资产、基准数据量、P95 阈值、并发与越权校验和归档材料要求一致。
- [ ] `node scripts/verify-server-deployment-assets.mjs` 通过，API 服务、提醒 timer、导出 worker timer 和 Nginx 模板与独立服务器上线要求一致。
- [ ] `node scripts/verify-backup-assets.mjs` 通过，MySQL 8.0 备份脚本、备份 timer、对象恢复清单校验器、备份保留策略和验收文档一致。
- [ ] `npm run verify:object-restore` 通过（脚本路径 `scripts/verify-object-restore-manifest.mjs`），项目附件与后台导出文件恢复清单示例覆盖 `private/files`、`private/exports`、同一业务时间窗口、HTTPS 下载抽查、敏感附件拒绝和过期导出拒绝证据。
- [ ] `npm run verify:initialization-data` 通过（脚本路径 `scripts/verify-initialization-data.mjs`），上线初始化资料清单示例覆盖部门、人员、CloudBase UID、角色分配、审批岗位、审批金额阈值、编号规则、系统参数和演示账号。
- [ ] `node scripts/verify-server-preflight.mjs` 通过：Tencent Cloud Lighthouse 独立服务器上线预检资产一致。
- [ ] `npm run verify:local-demo` 通过：demo 模式前端包可在临时 HTTP 服务下打开，`apps/web/src/routes.ts` 中全部声明的前端 SPA 路由均返回众肯系统前端壳，且前端入口 JS 模块、CSS 样式资源和全部构建静态资源可访问。
- [ ] 当前主部署验收不依赖历史函数包；如需回看历史/回退资产，单独执行 `npm run verify:legacy-cloudbase`，不得作为轻量服务器上线步骤。
- [ ] `npm audit --omit=dev` 无生产依赖漏洞。
- [ ] `docs/local-development-completion-report.md` 已记录最近一次本地 `npm run verify:acceptance` 通过结果、测试基线和后续真实环境验收事项。

## 3. GitHub 版本管理

- [ ] 本地分支为 `main`。
- [ ] `git status --short --branch` 显示本地与 `origin/main` 一致，且工作区干净。
- [ ] 每个交付改动均已提交并推送到 `https://github.com/xiufengdong169-del/zkgl`。
- [ ] GitHub Actions 工作流 `.github/workflows/verify.yml` 已在 push 或 pull request 上执行 `npm run verify:acceptance` 并通过。
- [ ] 如需本地复核 GitHub Actions 结果，执行 `npm run verify:github-actions`；若 GitHub 匿名 API 限流，设置具备仓库只读权限的 `GITHUB_TOKEN` 后重试。
- [ ] 如 Windows 浏览器可访问 GitHub 但 `git push` 直连 `github.com:443` 超时，先检查用户代理；如启用本机代理，可使用一次性 `git -c http.proxy=... -c https.proxy=... push origin main` 完成同步，不把个人代理写入仓库配置。

## 4. 数据库与初始化

- [ ] 首次上线从空 MySQL 数据库执行 `database/init/schema.sql`。
- [ ] 当前新开发阶段不存在数据库迁移目录、迁移表或迁移执行器。
- [ ] `database/init/schema.sql` 不包含 `DROP`、`TRUNCATE`、`ALTER TABLE`、`CREATE DATABASE` 或 `USE` 等破坏性、迁移式或绑定具体库名的语句。
- [ ] 基础角色、权限、审批模板、岗位、编号规则、系统参数和敏感字段授权已由初始化脚本提供。
- [ ] 上线初始化资料清单已按 `docs/initialization-data.example.json` 格式准备并通过 `npm run verify:initialization-data -- 正式初始化资料.json`：部门、人员、CloudBase UID、角色分配、审批岗位任职、审批金额阈值、编号规则、系统参数和验收演示账号均齐备，角色/审批模板/编号规则/系统参数代码与 `database/init/schema.sql` 空库种子一致，且不包含明文密码。

## 5. 腾讯云轻量应用服务器部署

- [ ] 服务器为腾讯云轻量应用服务器，公网 IP `193.112.79.220`，广州，4 核 4G，Ubuntu 24.04。
- [ ] MySQL 8.0 已安装，首次上线从空库执行 `database/init/schema.sql`，不存在数据库迁移。
- [ ] API 由 `deploy/systemd/zkgl-api.service` 托管，监听 `127.0.0.1:3000`，`curl http://127.0.0.1:3000/healthz` 正常，且 `curl http://127.0.0.1:3000/readyz` 能通过 MySQL 就绪检查。
- [ ] 认证适配由 `deploy/systemd/zkgl-auth-adapter.service` 托管，监听 `127.0.0.1:3010`，`AUTH_TOKEN_VERIFIER_MODULE` 已指向服务器本地真实 verifier，不能使用 `deploy/auth/cloudbase-token-verifier.example.mjs`，`curl http://127.0.0.1:3010/healthz` 正常。
- [ ] 正式部署前执行 `npm run verify:server-env -- /etc/zkgl/zkgl-api.env`（脚本路径 `scripts/verify-server-env.mjs`），确认服务端变量、认证 verifier、`AUTH_TRUSTED_PROXY` 和 HTTPS 证书均满足上线条件。
- [ ] `/etc/zkgl` 目录权限为 `root:zkgl 0750`，`/etc/zkgl/zkgl-api.env` 权限为 `root:zkgl 0640`，避免数据库密码和认证配置被其他本机用户读取。
- [ ] Nginx 使用 `deploy/nginx/zkgl.conf` 托管 `apps/web/dist`，通过 HTTPS 暴露站点，并通过 `auth_request` 调用本机认证适配服务。
- [ ] 正式部署可使用 `scripts/deploy-lighthouse-production.sh` 执行；脚本必须在服务器环境文件、HTTPS 证书、`VITE_API_BASE_URL` 和认证 verifier 就绪后运行，并先执行 `npm run verify:acceptance`。
- [ ] 如需先看公网界面演示，可在服务器执行 `scripts/deploy-lighthouse-demo.sh`，或直接执行 `curl -fsSL https://raw.githubusercontent.com/xiufengdong169-del/zkgl/main/scripts/bootstrap-lighthouse-demo.sh | sudo bash`；演示使用 `deploy/nginx/zkgl-demo-http.conf` 发布 HTTP 静态演示页，不代理 `/api`，不启用 `AUTH_TRUSTED_PROXY=true`，不作为正式上线口径；发布后执行 `node scripts/verify-public-demo.mjs http://193.112.79.220/` 确认公网地址已返回众肯系统前端壳。未显式传入 URL 的 `npm run verify:public-demo` 默认只校验本机 `http://127.0.0.1:4173/`，避免本地演示阶段误访问远程服务器。
- [ ] 如服务器登录权限暂不可用，可先执行 `npm run verify:local-demo`，确认 demo 模式前端包在本地临时 HTTP 服务下可打开，且 `apps/web/src/routes.ts` 中全部声明的前端 SPA 路由均返回众肯系统前端壳，前端入口 JS 模块、CSS 样式资源和全部构建静态资源可访问。
- [ ] 如需在本地电脑持续查看可视化界面，执行 `npm run demo:local`，优先打开 `http://127.0.0.1:4173/`；若 4173 已被占用，以终端输出的实际本地链接为准，确认页面使用样例数据展示且不连接生产 MySQL、不访问远程服务器。
- [ ] `/api` 仅由 Nginx 反向代理到 `127.0.0.1:3000/api`；外部伪造的 `X-ZKGL-CloudBase-UID` 被清除，业务 API 不接收浏览器直传 UID。
- [ ] `deploy/systemd/zkgl-reminder.timer` 每日 08:00 执行提醒刷新；历史触发器名称为 `zkglDailyReminder`。
- [ ] `deploy/systemd/zkgl-export-worker.timer` 每 5 分钟执行导出 worker；历史触发器名称为 `zkglExportWorker`。
- [ ] `deploy/systemd/zkgl-mysql-backup.timer` 每日 02:30 执行 MySQL 备份。
- [ ] 前端在正式 HTTPS `/api` `VITE_API_BASE_URL` 下重新构建，`apps/web/dist` 已由 Nginx 发布，且登录跳转和 `session.get` API 请求验证成功。

## 6. 账号、权限与审计

- [ ] CloudBase UID 与内部账号一对一映射。
- [ ] 业务系统不接收、不保存、不打印用户密码。
- [ ] 邮箱验证码找回密码默认关闭，本期不暴露找回密码业务接口，前端无入口、后端无找回密码动作。
- [ ] 内部账号停用后，旧会话访问业务 API 被拒绝。
- [ ] 无权限用户不能进入对应菜单，后端也拒绝对应业务动作。
- [ ] 项目、投标、合同、财务、交付、结算、文件和报表按统一数据范围校验。
- [ ] 敏感字段按授权级别脱敏或隐藏。
- [ ] 附件上传默认校验扩展名与 MIME 类型，并拒绝 EXE、DLL、BAT、CMD、PS1、JS、SH 等可执行或脚本文件；上传完成时严格匹配后端预分配的 `private/files/...` 私有存储路径，路径存在额外前缀、环境段异常或 hash/版本不一致时不得激活文件版本。
- [ ] 附件和后台导出下载由后端强制校验 HTTPS 临时地址，前端仅打开 HTTPS 临时地址，并使用 `noopener,noreferrer` 隔离新窗口。
- [ ] 拒绝访问、文件下载和关键业务动作均有审计或访问日志。

## 7. 业务主流程验收

- [ ] 客户、联系人、拜访、线索和跟进可完整流转。
- [ ] 立项申请驳回后可按同一申请重提，通过后仅生成一个正式项目编号。
- [ ] 投标申请、投标任务、检查项、投标结果和友商配合可维护。
- [ ] 合同、合同变更、履约节点、暂定金额确认和合同状态可维护。
- [ ] 无正式合同不能正常启动项目；提前启动必须审批并持续生成补签提醒，超过预计签约日后将 `current_contract_status` 标记为 `SIGNING_OVERDUE` 并持续生成异常提醒。
- [ ] 项目阶段、进展、风险、变更、成果和验收可维护。
- [ ] 开票、销项发票、收款、核销、报销、付款、合作方结算、保证金和日常采购可完整处理。
- [ ] 普通结项校验验收、应收、应付、保证金、成果归档和未关闭问题；带遗留事项结项仅公司负责人可最终特批，遗留事项完成时记录 `completed_by` 并递增版本便于追溯。

## 8. 结果型验收用例

- [ ] AC-01 至 AC-15 均按 `docs/acceptance-traceability.md` 完成自动化或现场验收。
- [ ] AC-14 现场性能验收在腾讯云轻量应用服务器生产环境、正常企业网络和基准数据量下执行。
- [ ] 30 用户混合查询、保存、提交和审批后，95% 请求满足 V2.2 性能阈值。
- [ ] `docs/performance-acceptance-template.md` 已填写并归档压测原始记录、P95 统计、错误明细、Nginx 访问日志、systemd/journal 日志和 MySQL 慢查询记录。
- [ ] 并发审批无重复审批记录，越权查询、保存和审批被拒绝并留下审计日志。

## 9. 备份恢复与运维

- [ ] 腾讯云轻量服务器 MySQL 8.0 通过 `deploy/systemd/zkgl-mysql-backup.timer` 每日自动备份，计划时间为 02:30，至少保留 30 天，保留天数由 `BACKUP_RETENTION_DAYS` 控制；备份文件不得写出 `BACKUP_MYSQL_DIR`。
- [ ] 关键发布、初始化脚本重建或生产配置变更前执行 `scripts/create-mysql-backup.mjs` 手工备份，并运行 `node scripts/verify-backup-assets.mjs`。
- [ ] 项目附件和后台导出文件启用平台保护能力或定期备份；恢复清单按 `docs/object-restore-manifest.example.json` 格式填写，并通过 `npm run verify:object-restore -- 正式清单.json`。
- [ ] 上线前完成一次数据库、项目附件和后台导出文件恢复演练，并按 `docs/backup-recovery-acceptance-template.md` 归档恢复记录。
- [ ] 数据库恢复演练使用 `scripts/restore-mysql-backup.mjs` 恢复 `.sql` 备份到独立验证库，`RESTORE_DB_NAME` 不等于生产 `DB_NAME`，且设置 `RESTORE_CONFIRM=I_UNDERSTAND_THIS_IS_NOT_PRODUCTION`。
- [ ] 上线后至少每半年执行一次恢复验证。
- [ ] 不为节省免费额度而关闭安全、审计日志或备份恢复能力。

## 10. 上线判定

仅当以上检查均完成，且现场性能、生产部署、备份恢复演练和验收材料归档均有明确记录后，方可判定系统具备正式上线验收条件。

## GitHub sync verification

- [ ] After pushing delivery changes, run `npm run verify:github-sync` and confirm local `main` matches `origin/main`.

## 2026-08-02 部署目标变更确认

- [ ] 正式部署目标已调整为 Tencent Cloud Lighthouse 独立服务器，公网 IP `193.112.79.220`，广州，4 核 4G。
- [ ] 操作系统为 Ubuntu 24.04，数据库为服务器本机 MySQL 8.0。
- [ ] API 使用 `npm run start -w @zkgl/api` 启动，由 systemd 托管，监听 `127.0.0.1:3000`。
- [ ] Nginx 提供 HTTPS、静态前端托管和 `/api` 反向代理。
- [ ] systemd 和 Nginx 使用仓库模板 `deploy/systemd/zkgl-api.service`、`deploy/systemd/zkgl-auth-adapter.service`、`deploy/systemd/zkgl-reminder.service`、`deploy/systemd/zkgl-reminder.timer`、`deploy/systemd/zkgl-export-worker.service`、`deploy/systemd/zkgl-export-worker.timer`、`deploy/systemd/zkgl-mysql-backup.service`、`deploy/systemd/zkgl-mysql-backup.timer`、`deploy/nginx/zkgl.conf` 和正式部署脚本 `scripts/deploy-lighthouse-production.sh` 作为上线基线；`.gitattributes` 强制 Ubuntu 部署脚本和 Nginx/systemd 模板使用 LF 换行。
- [ ] `VITE_API_BASE_URL` 已配置为生产 HTTPS `/api` 地址后重新构建前端，且不包含账号密码、查询参数或片段。
- [ ] `/etc/zkgl/zkgl-api.env` 仅保存在服务器，包含真实 `DB_PASSWORD`，未写入 Git 仓库，且保持 `root:zkgl 0640` 权限。
- [ ] 上线前已启用 `deploy/systemd/zkgl-auth-adapter.service`，并配置 `AUTH_TOKEN_VERIFIER_MODULE` 指向服务器本地真实 verifier；认证适配层校验 `Authorization: Bearer ...` 后才向本机 API 注入 `X-ZKGL-CloudBase-UID`；`AUTH_TRUSTED_PROXY` 默认保持 `false`，只有认证适配层完成并由 Nginx 清除外部伪造头后，才允许在服务器本地环境文件改为 `true`。
- [ ] CloudBase 函数包仅作为历史交付包和可回退适配保留，不再作为主部署验收口径。

