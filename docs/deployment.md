# 腾讯云轻量应用服务器部署说明

## 前置条件

1. 正式运行环境为腾讯云轻量应用服务器：公网 IP `193.112.79.220`，广州，4 核 4G，Ubuntu 24.04。
2. 服务器已安装 MySQL 8.0；首次上线从空 MySQL 数据库执行 `database/init/schema.sql`。
3. 当前新开发阶段不存在数据库迁移步骤，也不执行历史数据导入或旧系统兼容脚本。
4. API、认证适配、提醒、导出和备份均由 systemd 托管；Nginx 对外提供 HTTPS、静态前端和 `/api` 反向代理。
5. 服务器本地环境文件 `/etc/zkgl/zkgl-api.env` 保存真实数据库密码、认证 verifier 路径和服务端变量，不得提交到 Git。
6. CloudBase 仅作为现阶段身份认证来源和 UID 映射来源；不得再作为生产主部署平台描述。
7. 登录安全策略必须设置为：首次登录强制修改初始密码；连续失败 5 次后锁定 15 分钟。
8. 邮箱验证码找回密码默认关闭，本期不暴露找回密码业务接口；如后续启用，必须先补充验证码频控、审计日志、安全评审和自动化测试后再部署。

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
5. 邮箱验证码找回密码默认关闭，本期不暴露找回密码业务接口；验收时如发现前端入口或后端动作，应视为安全缺陷。
6. 停用账号时，先在系统管理页停用内部账号，使旧会话访问业务 API 立即失败；再在 CloudBase 身份管理停用对应身份账号。启用时按相反顺序处理。

## 构建与验证

上线前执行：

```powershell
npm install
npm run verify:acceptance
```

`npm run verify:deployment-config` 会校验腾讯云轻量服务器参数、前后端环境变量、历史资产配置和 GitHub Actions Node 版本一致性。

当前主线验收命令不再构建或部署历史函数包。历史函数包如需单独复核，可运行：

```powershell
npm run verify:legacy-cloudbase
```

该命令内部执行 `npm run build:function` 和 `node scripts/verify-cloudbase-function-packages.mjs`。生成的 `functions/zkgl-api`、`functions/zkgl-reminder`、`functions/zkgl-export-worker` 是历史/回退资产构建产物，不纳入版本管理，也不作为当前轻量服务器上线步骤。

## 历史 CloudBase 函数包（非主部署）

正式上线不再部署到 CloudBase。下列命令仅用于隔离环境回看历史交付包和回退适配资产，不能作为当前生产发布流程：

```powershell
tcb --version
tcb login
tcb fn deploy zkgl-api --yes
tcb fn deploy zkgl-reminder --yes
tcb fn deploy zkgl-export-worker --yes
```

如确需验证历史函数包，只能在隔离环境中执行；当前生产验收以腾讯云轻量应用服务器、systemd、Nginx 和 MySQL 8.0 为准。

## 前端发布

前端必须在正式域名和 `/api` 反向代理地址确认后重新构建，避免浏览器产物中缺少 API 地址或使用不受信任协议。

```powershell
$env:VITE_CLOUDBASE_ENV_ID="cloudbase-d7gc2b32cd4196059"
$env:VITE_CLOUDBASE_REGION="ap-guangzhou"
$env:VITE_API_BASE_URL="https://正式域名/api"
npm run build -w @zkgl/web
node scripts/verify-web-dist-security.mjs
```

构建后的 `apps/web/dist` 由 Nginx 静态站点托管。发布后应核对访问域名、HTTPS 状态、首页加载、登录跳转和 `session.get` API 请求地址。若 API 地址调整，必须重新设置 `VITE_API_BASE_URL` 并重新构建前端。

## 临时可视化演示发布

如尚未完成正式域名、HTTPS 证书、数据库账号和认证 verifier 配置，但需要先通过公网查看界面成果，可在腾讯云轻量应用服务器上执行演示脚本：

```bash
sudo bash scripts/deploy-lighthouse-demo.sh
```

如果服务器上还没有仓库代码，可在腾讯云轻量应用服务器的 SSH/VNC 终端直接执行一条命令：

```bash
curl -fsSL https://raw.githubusercontent.com/xiufengdong169-del/zkgl/main/scripts/bootstrap-lighthouse-demo.sh | sudo bash
```

该脚本会从 GitHub 拉取 `main`，以 `VITE_DEMO_MODE=true` 构建前端，并使用 `deploy/nginx/zkgl-demo-http.conf` 通过 HTTP 80 发布静态演示页。演示模式不连接生产 MySQL，不启用 `AUTH_TRUSTED_PROXY=true`，也不通过 Nginx 代理 `/api` 到业务服务；它只用于快速查看菜单、页面和样例数据。正式上线仍必须使用 HTTPS、`deploy/nginx/zkgl.conf`、`deploy/systemd/zkgl-api.service`、`deploy/systemd/zkgl-auth-adapter.service` 和服务器本地 `/etc/zkgl/zkgl-api.env`。

演示脚本执行成功后，在本地或服务器上运行：

```bash
npm run verify:public-demo
```

该命令会访问 `http://193.112.79.220/`、`/projects`、`/contracts`、`/finance`、`/admin`，确认它们返回的是“众肯项目管理系统”前端壳，而不是服务器旧页面。若演示地址不是默认 IP，可设置 `ZKGL_PUBLIC_DEMO_URL=http://实际地址/` 后再执行。

`npm run verify:local-demo` 已纳入 `npm run verify:acceptance`。如果暂时没有服务器 SSH/VNC 操作权限，但需要先单独证明演示包本身可打开，也可在本地执行：

```bash
npm run verify:local-demo
```

该命令会以 `VITE_DEMO_MODE=true` 构建到 `.tmp/zkgl-local-demo`，启动临时本地 HTTP 服务，并复用同一套路由检查确认 `/`、`/projects`、`/contracts`、`/finance` 和 `/admin` 都能返回众肯系统前端壳，且前端入口 JS 模块和 CSS 样式资源可访问；它不连接生产 MySQL，也不会覆盖正式 `apps/web/dist`。

## 计划任务

- `zkgl-reminder.timer`：每日 08:00 执行提醒刷新，历史 CloudBase 触发器名称为 `zkglDailyReminder`。
- `zkgl-export-worker.timer`：每 5 分钟执行后台导出 worker，历史 CloudBase 触发器名称为 `zkglExportWorker`。
- `zkgl-mysql-backup.timer`：每日 02:30 执行 MySQL 备份。

部署后应通过 `systemctl list-timers 'zkgl-*'`、`journalctl` 和业务日志核对最近执行状态。

## 上线验收检查

上线验收至少验证：

1. 首次登录强制修改初始密码。
2. 连续 5 次失败后锁定 15 分钟。
3. 内部账号停用后，旧会话无法访问业务 API。
4. CloudBase 身份账号停用后，无法建立新会话。
5. `zkgl-reminder` 能生成合同、投标、保证金、先开工待签约、先开工签约逾期异常、结项未清事项和风险提醒。
6. `zkgl-export-worker` 能处理后台导出任务并生成私有文件。
7. `node scripts/verify-web-dist-security.mjs` 通过，前端构建产物不包含数据库变量、SecretKey、API Secret 或私钥标记。
8. 浏览器访问前端域名后，登录、工作台加载和一次 `session.get` API 请求均成功。

## 2026-08-02 部署环境变更：腾讯云轻量服务器

正式部署目标已调整为独立服务器部署：

- 云资源：Tencent Cloud Lighthouse，4 核 4G，广州。
- 公网 IP：`193.112.79.220`。
- 操作系统：Ubuntu 24.04。
- 数据库：服务器已安装 MySQL 8.0。
- API 运行方式：Node.js 进程监听 `127.0.0.1:3000`，由 systemd 托管。
- 入口代理：Nginx 对外提供 HTTPS，并将 `/api` 反向代理到本机 API。
- 前端发布：`apps/web/dist` 由 Nginx 静态站点托管；`VITE_API_BASE_URL` 必须配置为正式 HTTPS API 地址。

CloudBase 不再作为主部署平台。现有 `cloudbaserc.json`、`functions/zkgl-api`、`functions/zkgl-reminder`、`functions/zkgl-export-worker` 仅作为历史 CloudBase 交付包和可回退适配保留；后续正式上线验收以本节轻量服务器部署为准。

### Ubuntu 24.04 初始化步骤

1. 使用非 root 运维账号登录服务器，并确认安全组仅开放 `22`、`80`、`443`。
2. 安装 Node.js 22.12.0 或更高版本、Nginx、Git、PM2 可选工具；生产托管以 systemd 为准。
3. 拉取 GitHub 仓库 `https://github.com/xiufengdong169-del/zkgl.git` 到 `/opt/zkgl/current`。
4. 若服务器环境文件、HTTPS 证书和认证 verifier 已准备好，可执行正式部署脚本：

```bash
sudo bash scripts/deploy-lighthouse-production.sh
```

该脚本会拉取 GitHub `main`、安装依赖、执行 `npm run verify:acceptance`、构建 API 与前端、安装 systemd/Nginx 配置、启用 `zkgl-auth-adapter`、`zkgl-api`、提醒 timer、导出 timer 和 MySQL 备份 timer，并执行本机 health check。脚本会在 `DB_PASSWORD`、`AUTH_TOKEN_VERIFIER_MODULE`、`AUTH_TRUSTED_PROXY`、`API_ALLOWED_ORIGINS` 或 HTTPS 证书未达到正式上线条件时退出，避免把未完成认证边界的 API 暴露到公网。前端构建会显式写入 `VITE_API_BASE_URL`，默认值为 `https://193.112.79.220/api`；若使用正式域名，应在执行前设置 `ZKGL_PUBLIC_HOST`、`ZKGL_PUBLIC_ORIGIN`、`ZKGL_API_BASE_URL`、`ZKGL_TLS_CERT` 和 `ZKGL_TLS_KEY`。

5. 如需手工执行，在项目根目录运行：

```bash
npm ci
npm run verify:acceptance
npm run build -w @zkgl/api
npm run build -w @zkgl/web
node scripts/verify-web-dist-security.mjs
node scripts/verify-server-deployment-assets.mjs
node scripts/verify-server-preflight.mjs
sudo bash scripts/deploy-lighthouse-demo.sh
```

6. 创建服务端环境文件 `/etc/zkgl/zkgl-api.env`，只在服务器保存真实密钥：

```ini
DEPLOY_TARGET_HOST=193.112.79.220
DEPLOY_TARGET_REGION=guangzhou
DEPLOY_TARGET_OS=Ubuntu 24.04
DEPLOY_TARGET_MYSQL=8.0
API_HOST=127.0.0.1
API_PORT=3000
API_ALLOWED_ORIGINS=https://正式域名
AUTH_ADAPTER_HOST=127.0.0.1
AUTH_ADAPTER_PORT=3010
AUTH_TOKEN_VERIFIER_MODULE=
AUTH_TRUSTED_PROXY=false
BACKUP_MYSQL_DIR=/var/backups/zkgl/mysql
BACKUP_RETENTION_DAYS=30
RESTORE_BACKUP_FILE=
RESTORE_DB_NAME=
RESTORE_CONFIRM=
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=zkgl
DB_USER=zkgl_app
DB_PASSWORD （在服务器本地填写，不写入文档）
CLOUDBASE_ENV_ID=cloudbase-d7gc2b32cd4196059
```

`DB_PASSWORD` 必须在服务器环境文件中填写，禁止写入 Git 仓库、前端构建变量或文档示例。

为避免 Windows 工作区把 Ubuntu 部署脚本改成 CRLF，仓库 `.gitattributes` 已强制 `*.sh`、`*.service`、`*.timer` 和 `*.conf` 使用 LF 换行；`node scripts/verify-server-deployment-assets.mjs` 会校验该约束。

认证 verifier 可参考仓库模板 `deploy/auth/cloudbase-token-verifier.example.mjs`。上线时应复制到服务器本地路径，例如 `/etc/zkgl/cloudbase-token-verifier.mjs`，在服务器上补入真实 CloudBase access token 校验逻辑，然后把 `/etc/zkgl/zkgl-api.env` 中的 `AUTH_TOKEN_VERIFIER_MODULE` 指向该服务器本地文件。示例文件本身会 fail-closed，正式部署脚本也会拒绝把 `.example.` 文件作为生产 verifier 使用。

正式部署前可单独运行服务器环境文件预检；命令入口为 `scripts/verify-server-env.mjs`：

```bash
npm run verify:server-env -- /etc/zkgl/zkgl-api.env
```

该命令会检查必填服务端变量、`API_ALLOWED_ORIGINS` 占位、`AUTH_TRUSTED_PROXY`、`AUTH_TOKEN_VERIFIER_MODULE` 真实文件、example verifier 禁用和 HTTPS 证书文件。

### MySQL 8.0 空库初始化

本项目是全新开发程序，不存在数据库迁移步骤。首次上线使用空库初始化：

```bash
mysql -u root -p -e "CREATE DATABASE zkgl CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -u root -p -e "CREATE USER 'zkgl_app'@'127.0.0.1' IDENTIFIED BY '请在服务器本地设置强密码';"
mysql -u root -p -e "GRANT SELECT,INSERT,UPDATE,DELETE,EXECUTE ON zkgl.* TO 'zkgl_app'@'127.0.0.1'; FLUSH PRIVILEGES;"
mysql -u root -p zkgl < database/init/schema.sql
```

初始化后必须完成上线初始化资料清单，包括部门清单、人员清单、CloudBase 身份清单、CloudBase UID、角色分配、系统管理员、公司负责人、项目经理、财务资金、审批岗位任职、审批金额阈值、编号规则确认、系统参数确认、验收演示账号和无权访问用户。

### systemd 服务

推荐以仓库模板创建 systemd 服务和定时器：

- `deploy/systemd/zkgl-api.service`：API 常驻服务。
- `deploy/systemd/zkgl-auth-adapter.service`：受信任认证适配服务，监听 `127.0.0.1:3010`，由 Nginx `auth_request` 内部调用。
- `deploy/systemd/zkgl-reminder.service`：提醒刷新一次性任务。
- `deploy/systemd/zkgl-reminder.timer`：每日 08:00 触发提醒刷新。
- `deploy/systemd/zkgl-export-worker.service`：后台导出一次性任务。
- `deploy/systemd/zkgl-export-worker.timer`：每 5 分钟触发后台导出 worker。
- `deploy/systemd/zkgl-mysql-backup.service`：MySQL 8.0 备份一次性任务，执行 `scripts/create-mysql-backup.mjs`。
- `deploy/systemd/zkgl-mysql-backup.timer`：每日 02:30 触发 MySQL 备份，保留天数由 `BACKUP_RETENTION_DAYS` 控制。

API 常驻服务模板如下：

```ini
[Unit]
Description=ZKGL API
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/zkgl/current
EnvironmentFile=/etc/zkgl/zkgl-api.env
ExecStart=/usr/bin/npm run start -w @zkgl/api
Restart=always
RestartSec=5
User=zkgl
Group=zkgl

[Install]
WantedBy=multi-user.target
```

启停命令：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zkgl-auth-adapter
sudo systemctl enable --now zkgl-api
sudo systemctl enable --now zkgl-reminder.timer
sudo systemctl enable --now zkgl-export-worker.timer
sudo systemctl enable --now zkgl-mysql-backup.timer
sudo systemctl status zkgl-api
sudo systemctl status zkgl-auth-adapter
systemctl list-timers 'zkgl-*'
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/readyz
curl http://127.0.0.1:3010/healthz
```

### 受信任认证适配服务

独立服务器上的公网请求不得直接向业务 API 注入 `X-ZKGL-CloudBase-UID`。正式上线时必须启用 `deploy/systemd/zkgl-auth-adapter.service`，并在 `/etc/zkgl/zkgl-api.env` 中配置 `AUTH_TOKEN_VERIFIER_MODULE` 指向服务器本地的 CloudBase access token 校验模块，例如 `/etc/zkgl/cloudbase-token-verifier.mjs`。该模块必须导出 `verifyAccessToken(accessToken)`，返回 `{ uid: "CloudBase UID" }` 或 UID 字符串。未配置 verifier 时认证适配器启动失败；token 校验失败时 `/verify` 返回 401，不会向 Nginx 返回受信任 UID。仓库仅提供 `deploy/auth/cloudbase-token-verifier.example.mjs` fail-closed 模板，不保存生产密钥或真实 verifier。

认证适配完成且联调通过后，才允许把服务器本地环境文件中的 `AUTH_TRUSTED_PROXY` 改为 `true`。Nginx 模板 `deploy/nginx/zkgl.conf` 会先把浏览器传入的 `Authorization: Bearer ...` 转给 `127.0.0.1:3010/verify`，再把适配器返回的 `X-ZKGL-CloudBase-UID` 注入到 `127.0.0.1:3000/api`；同时清除外部伪造的同名 UID 头和转发给业务 API 的 Authorization。

### MySQL 备份

服务器本地备份脚本为 `scripts/create-mysql-backup.mjs`，默认输出目录为 `/var/backups/zkgl/mysql`，默认保留 30 天。脚本读取 `/etc/zkgl/zkgl-api.env` 中的数据库连接变量，通过 `mysqldump --single-transaction --routines --triggers --events` 生成一致性备份文件；真实数据库密码不得写入命令行、Git 仓库或文档示例。

手工发布前备份命令：

```bash
node scripts/create-mysql-backup.mjs
node scripts/verify-backup-assets.mjs
```

恢复演练必须恢复到独立验证库，`RESTORE_DB_NAME` 不得等于生产 `DB_NAME`。演练时在服务器本地临时设置：

```bash
RESTORE_BACKUP_FILE=/var/backups/zkgl/mysql/某次备份.sql
RESTORE_DB_NAME=zkgl_restore_verify
RESTORE_CONFIRM=I_UNDERSTAND_THIS_IS_NOT_PRODUCTION
node scripts/restore-mysql-backup.mjs
```

### Nginx HTTPS 反向代理

推荐以仓库模板 `deploy/nginx/zkgl.conf` 创建站点配置。Nginx 必须：

- 只通过 HTTPS 暴露业务站点；
- 将 `/api` 代理到 `http://127.0.0.1:3000/api`；
- 对外部请求清除 `X-ZKGL-CloudBase-UID`，该头只能由受信任认证适配层注入；
- 设置静态资源缓存，但不得缓存 `/api` 响应；
- 生产域名确定后，将前端 `VITE_API_BASE_URL` 设置为 `https://正式域名/api` 后重新构建。

示例片段：

```nginx
location /api {
  auth_request /_zkgl_auth;
  auth_request_set $zkgl_cloudbase_uid $upstream_http_x_zkgl_cloudbase_uid;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-ZKGL-CloudBase-UID $zkgl_cloudbase_uid;
  proxy_set_header Authorization "";
  proxy_pass http://127.0.0.1:3000/api;
}

location / {
  root /opt/zkgl/current/apps/web/dist;
  try_files $uri $uri/ /index.html;
}
```

注意：独立服务器没有 CloudBase 云函数 context，API 不得信任浏览器传来的 UID。`AUTH_TRUSTED_PROXY` 默认必须为 `false`；上线前必须接入受信任认证适配层，校验前端 `Authorization: Bearer ...` 后再向本机 API 注入 `X-ZKGL-CloudBase-UID`，并且只有完成这项适配后才能将 `AUTH_TRUSTED_PROXY=true` 写入服务器本地环境文件。未完成该适配前，`/api` 只能在内网自测，不得直接开放给公网用户。
