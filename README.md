# 众肯科技项目全过程管理系统

当前开发与验收基线为《需求评审修订基线 V2.2》。本项目是完整新建系统：前端、Node.js API、数据库初始化脚本、权限体系、审批流、报表、文件与定时任务均从零开发，不包含历史系统改造、旧程序复用、旧接口兼容或历史数据迁移。

## 工程结构

- `apps/web`：Vue 3 + TypeScript 前端。
- `apps/api`：Node.js + TypeScript API、认证适配、定时提醒与导出 worker。
- `packages/shared`：前后端共享的用户、权限与类型定义。
- `database/init/schema.sql`：空库一次性初始化脚本。
- `docs`：架构、部署、操作与验收说明。

## 本地开发

1. 执行 `npm install` 安装依赖。
2. 复制 `.env.example` 为 `.env.local`，只填写浏览器可公开的登录配置与 API 地址。
3. 执行 `npm run dev` 启动前端开发服务。
4. 提交前至少执行：

```powershell
npm run verify:acceptance
```

该命令会先执行 `npm run verify`，再执行 `npm audit --omit=dev`。完整命令顺序为：

```powershell
npm run typecheck
npm run test
npm run build
node scripts/verify-source-secret-hygiene.mjs
npm run verify:requirements
node scripts/verify-web-dist-security.mjs
npm run verify:deployment-config
npm run verify:performance-acceptance
node scripts/verify-server-deployment-assets.mjs
node scripts/verify-backup-assets.mjs
npm run verify:object-restore
npm run verify:initialization-data
node scripts/verify-server-preflight.mjs
npm run verify:local-demo
npm audit --omit=dev
```

历史函数包已不属于当前主部署口径。如需单独复核历史/回退资产，可执行：

```powershell
npm run verify:legacy-cloudbase
```

`verify:local-demo` 已纳入主验收链路。如需在没有服务器 SSH 权限时单独验证可视化演示包，也可执行：

```powershell
npm run verify:local-demo
```

该命令会以 `VITE_DEMO_MODE=true` 构建到 `.tmp/zkgl-local-demo`，启动临时本地 HTTP 服务，并从 `apps/web/src/routes.ts` 自动读取全部前端 SPA 路由，验证前端壳、入口 JS 模块、CSS 样式资源和全部构建静态资源均可访问。

如果需要在本地电脑持续打开可视化演示界面，执行：

```bash
npm run demo:local
```

默认优先访问地址为 `http://127.0.0.1:4173/`；如果 4173 已被本机其他演示进程占用，脚本会自动切换到一个可用的本地端口并在终端输出实际链接。该模式只使用演示样例数据，不连接生产 MySQL，也不会访问远程服务器。

打开后建议优先进入 `http://127.0.0.1:4173/demo` 或点击左侧“演示测试中心”，按客户线索、立项审批、投标合同、项目实施、财务结算、文件报表的顺序查看主体流程。

如浏览器无法访问 `127.0.0.1` 或 `localhost`，可改用文件版演示包：

```powershell
npm run demo:file
```

随后双击打开 `C:\Users\27787\Desktop\zkgl\.tmp\zkgl-file-demo\index.html`，或在浏览器地址栏输入 `file:///C:/Users/27787/Desktop/zkgl/.tmp/zkgl-file-demo/index.html#/demo`。文件版演示使用 hash 路由和相对静态资源，不依赖本地 HTTP 端口。

如需切换到本地完整 API + MySQL 联调，先按 `docs/local-user-testing.md` 准备 MySQL 8.0、空库初始化、服务端环境变量、本机认证适配器和本机认证代理，然后执行：

```powershell
npm run create:local-fullstack-env
node scripts/generate-initialization-sql.mjs docs/initialization-data.example.json > .tmp\initialization-data.sql
npm run start:local-fullstack
npm run check:local-fullstack
```

## 数据库初始化原则

本项目不存在数据库迁移。开发、测试和首次上线环境均从空 MySQL 数据库执行 `database/init/schema.sql` 完成初始化。正式投产后的结构变更机制另行评审，不在当前新开发阶段引入迁移表或迁移执行器。

## 交付与验收入口

- `需求评审修订基线_V2.2.md`：当前唯一 Markdown 需求基线。
- `众肯科技项目全过程管理系统需求说明书_V2.2_腾讯云轻量服务器版.docx`：当前 Word 版需求说明书，部署口径已同步为腾讯云轻量应用服务器。
- `众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx`：历史 Word 版原件，仅供追溯旧部署口径。
- `docs/architecture.md`：系统架构、安全边界、事务与审计原则。
- `docs/deployment.md`：腾讯云轻量应用服务器部署、空库初始化、账号开通、上线初始化资料清单和服务器部署说明。
- `docs/local-user-testing.md`：本地用户测试交付说明，记录 `npm run demo:local`、`npm run demo:file` 演示入口、访问校验、停止方式、演示边界和切换到本地完整联调的前置条件。
- `docs/user-demo-and-test-summary.md`：用户演示与测试交付总结，记录本地演示入口、演示测试中心、主体流程测试顺序、自动化复核口径和仍需真实环境完成的事项。
- `docs/operations-acceptance.md`：操作手册、主流程验收、现场性能验收和备份恢复验收清单。
- `docs/performance-acceptance-template.md`：AC-14 现场性能验收记录模板，用于归档 30 用户压测结果。
- `docs/backup-recovery-acceptance-template.md`：备份恢复验收记录模板，用于归档数据库、附件和后台导出恢复演练结果。
- `docs/object-restore-manifest.example.json`：附件与后台导出文件恢复清单示例，配合 `npm run verify:object-restore` 校验恢复演练证据格式。
- `docs/initialization-data.example.json`：上线初始化资料清单示例，配合 `npm run verify:initialization-data` 校验组织、账号、角色、审批岗位、编号规则和系统参数准备情况。
- `docs/acceptance-traceability.md`：V2.2 结果型验收用例、自动化测试映射和交付前必跑命令。
- `docs/local-development-completion-report.md`：本地开发测试完成报告，记录本地自动化验收结果、已完成范围和仍需真实环境完成的事项。
- `scripts/verify-requirement-baseline.mjs`：校验 Markdown 基线、当前轻量服务器版 Word 需求说明书、验收追踪和交付入口保持一致。
- `scripts/verify-performance-acceptance-assets.mjs`：校验 AC-14 现场性能验收口径、基准数据量、P95 阈值和归档材料要求保持一致。
- `scripts/verify-object-restore-manifest.mjs`：校验备份恢复演练中的项目附件、后台导出文件、HTTPS 下载抽查、敏感附件拒绝和过期导出拒绝证据清单。
- `scripts/verify-initialization-data.mjs`：校验上线初始化资料清单字段、唯一性和必备岗位/角色/演示账号覆盖。
- `docs/final-acceptance-checklist.md`：最终交付验收总清单，用于上线前逐项签核。

## 安全原则

- 浏览器只允许使用身份认证所需的公开配置、Publishable Key 和正式 HTTPS API 访问地址。
- MySQL 密码、SecretKey、服务端 API Key 等敏感值只能放在本地 `.env` 或服务器 `/etc/zkgl/zkgl-api.env`，禁止写入源码、文档示例或前端构建变量。
- 所有业务请求必须经过登录身份、内部账号状态、功能权限、数据范围和敏感字段授权校验；运行环境入口由轻量服务器上的 Nginx、认证适配服务和 API 服务共同完成。

## GitHub 版本管理

本地目录 `C:\Users\27787\Desktop\zkgl` 已关联 GitHub 仓库：

```text
https://github.com/xiufengdong169-del/zkgl
```

每个可验证改动应在通过测试与构建后提交并推送到 `main`。

仓库包含 GitHub Actions 工作流 `.github/workflows/verify.yml`，会在 push 和 pull request 时执行 `npm ci` 与 `npm run verify:acceptance`，用于持续校验类型检查、测试、构建、需求基线一致性、敏感信息扫描、轻量服务器部署资产和生产依赖审计。

## GitHub sync verification

After pushing delivery changes, run:

```powershell
npm run verify:github-sync
```

This verifies that the current branch is `main`, `origin` points to `https://github.com/xiufengdong169-del/zkgl`, the working tree is clean, and local `main` matches the latest `origin/main`.

To check the GitHub Actions acceptance result for the current `main` commit, run:

```powershell
npm run verify:github-actions
```

This command queries GitHub for the latest `Acceptance verification` check on the current commit. If GitHub rate limits anonymous API calls, set `GITHUB_TOKEN` with repository read access and rerun it.

If Windows can open GitHub in the browser but `git push` times out with `Failed to connect to github.com port 443`, check the user proxy first:

```powershell
Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable,ProxyServer,AutoConfigURL
```

When a local proxy is enabled, keep the repository configuration unchanged and use a one-off push through that proxy, for example:

```powershell
git -c http.proxy=http://127.0.0.1:7078 -c https.proxy=http://127.0.0.1:7078 push origin main
```

## 2026-08-02 deployment target update

Current production target is Tencent Cloud Lighthouse standalone server:

- Server: `193.112.79.220`, Guangzhou, 4C4G.
- OS: Ubuntu 24.04.
- Database: MySQL 8.0 already installed on the server.
- API: Node.js standalone service, `npm run start -w @zkgl/api`, managed by systemd on `127.0.0.1:3000`.
- API readiness: `/healthz` checks the process, `/readyz` checks MySQL connectivity before production deployment is considered healthy.
- Web: `apps/web/dist` served by Nginx over HTTPS.
- Auth adapter: `deploy/systemd/zkgl-auth-adapter.service` listens on `127.0.0.1:3010`; production must configure `AUTH_TOKEN_VERIFIER_MODULE` before enabling `AUTH_TRUSTED_PROXY=true`.
- AC-14 onsite performance acceptance assets are verified by `npm run verify:performance-acceptance`.
- Deployment assets: `deploy/systemd/zkgl-api.service`, `deploy/systemd/zkgl-auth-adapter.service`, `deploy/systemd/zkgl-reminder.service`, `deploy/systemd/zkgl-reminder.timer`, `deploy/systemd/zkgl-export-worker.service`, `deploy/systemd/zkgl-export-worker.timer`, `deploy/systemd/zkgl-mysql-backup.service`, `deploy/systemd/zkgl-mysql-backup.timer`, and `deploy/nginx/zkgl.conf`, verified by `node scripts/verify-server-deployment-assets.mjs`, `node scripts/verify-backup-assets.mjs`, and `node scripts/verify-server-preflight.mjs`.
- Backup and restore drills use `scripts/create-mysql-backup.mjs` and `scripts/restore-mysql-backup.mjs`; restore drills must target a non-production database. Attachment/export restore evidence is recorded with the `docs/object-restore-manifest.example.json` format and verified by `npm run verify:object-restore`.
- Database initialization remains empty-database initialization through `database/init/schema.sql`; there is still no database migration.

See `docs/deployment.md` for the authoritative server deployment checklist. The CloudBase function package scripts remain in the repository as historical delivery artifacts and fallback adapters, not as the current primary deployment target.
