# CloudBase 部署说明

## 前置条件

1. CloudBase 环境：`cloudbase-d7gc2b32cd4196059`，地域为广州南沙。
2. 在 CloudBase 控制台开启用户名密码登录，并配置 Web 安全域名。
3. 登录安全策略必须设置为：首次登录强制修改初始密码；连续失败 5 次后锁定 15 分钟。
4. 邮箱验证码找回密码默认关闭，本期不暴露找回密码业务接口；如后续启用，必须先补充验证码频控、审计日志、安全评审和自动化测试后再部署。
5. 在云函数环境变量中配置 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`、`CLOUDBASE_ENV_ID`。这些值不得提交到 Git。
6. 从空 MySQL 数据库执行 `database/init/schema.sql`，再按项目方名单维护部门、人员、内部用户、角色和授权。
7. 当前新开发阶段不存在数据库迁移步骤，也不执行历史数据导入或旧系统兼容脚本。
8. 部署机器已安装 CloudBase CLI，且执行 `tcb --version` 能正常输出版本号；如命令不可用，应先完成 CLI 安装、登录和权限授权后再执行部署命令。

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

函数包生成在：

- `functions/zkgl-api`
- `functions/zkgl-reminder`
- `functions/zkgl-export-worker`

上述目录是构建产物，不纳入版本管理。

`npm run verify:deployment-config` 会校验 CloudBase 环境 ID、地域、前后端环境变量、函数部署配置和 GitHub Actions Node 版本一致性。
`node scripts/verify-cloudbase-function-packages.mjs` 会同时校验三套函数包和 `cloudbaserc.json` 中的函数名、目录、`index.main` handler、Nodejs18.15 runtime、超时时间、内存规格、依赖安装开关和定时触发器配置。

## 云函数部署

```powershell
tcb --version
tcb login
tcb fn deploy zkgl-api --yes
tcb fn deploy zkgl-reminder --yes
tcb fn deploy zkgl-export-worker --yes
```

只为 `zkgl-api` 配置客户端 HTTP 访问路径，并将完整 HTTPS 地址写入前端构建变量 `VITE_API_BASE_URL`。不要为 `zkgl-reminder` 和 `zkgl-export-worker` 配置客户端 HTTP 访问路径。

## 前端发布

前端必须在 `zkgl-api` HTTPS 访问地址确认后重新构建，避免浏览器产物中缺少 API 地址或使用不受信任协议。

```powershell
$env:VITE_CLOUDBASE_ENV_ID="cloudbase-d7gc2b32cd4196059"
$env:VITE_CLOUDBASE_REGION="ap-guangzhou"
$env:VITE_API_BASE_URL="https://<zkgl-api-http-url>"
npm run build -w @zkgl/web
node scripts/verify-web-dist-security.mjs
tcb hosting deploy apps/web/dist / --yes
```

发布后应在 CloudBase 静态网站托管控制台核对访问域名、HTTPS 状态、Web 安全域名、首页加载、登录跳转和 API 请求地址。若 API 地址调整，必须重新设置 `VITE_API_BASE_URL` 并重新构建前端。

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
5. `zkgl-reminder` 能生成合同、投标、保证金、先开工待签约、先开工签约逾期异常、结项未清事项和风险提醒。
6. `zkgl-export-worker` 能处理后台导出任务并生成私有文件。
7. `node scripts/verify-web-dist-security.mjs` 通过，前端构建产物不包含数据库变量、SecretKey、API Secret 或私钥标记。
8. 浏览器访问前端域名后，登录、工作台加载和一次 `session.get` API 请求均成功。

## 2026-08-02 部署环境变更：腾讯云轻量服务器

正式部署目标已从 CloudBase 主部署调整为独立服务器部署：

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
4. 在项目根目录执行：

```bash
npm ci
npm run verify:acceptance
npm run build -w @zkgl/api
npm run build -w @zkgl/web
node scripts/verify-web-dist-security.mjs
node scripts/verify-server-deployment-assets.mjs
```

5. 创建服务端环境文件 `/etc/zkgl/zkgl-api.env`，只在服务器保存真实密钥：

```ini
DEPLOY_TARGET_HOST=193.112.79.220
DEPLOY_TARGET_REGION=guangzhou
DEPLOY_TARGET_OS=Ubuntu 24.04
DEPLOY_TARGET_MYSQL=8.0
API_HOST=127.0.0.1
API_PORT=3000
API_ALLOWED_ORIGINS=https://正式域名
AUTH_TRUSTED_PROXY=false
BACKUP_MYSQL_DIR=/var/backups/zkgl/mysql
BACKUP_RETENTION_DAYS=30
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=zkgl
DB_USER=zkgl_app
DB_PASSWORD （在服务器本地填写，不写入文档）
CLOUDBASE_ENV_ID=cloudbase-d7gc2b32cd4196059
```

`DB_PASSWORD` 必须在服务器环境文件中填写，禁止写入 Git 仓库、前端构建变量或文档示例。

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
sudo systemctl enable --now zkgl-api
sudo systemctl enable --now zkgl-reminder.timer
sudo systemctl enable --now zkgl-export-worker.timer
sudo systemctl enable --now zkgl-mysql-backup.timer
sudo systemctl status zkgl-api
systemctl list-timers 'zkgl-*'
curl http://127.0.0.1:3000/healthz
```

### MySQL 备份

服务器本地备份脚本为 `scripts/create-mysql-backup.mjs`，默认输出目录为 `/var/backups/zkgl/mysql`，默认保留 30 天。脚本读取 `/etc/zkgl/zkgl-api.env` 中的数据库连接变量，通过 `mysqldump --single-transaction --routines --triggers --events` 生成一致性备份文件；真实数据库密码不得写入命令行、Git 仓库或文档示例。

手工发布前备份命令：

```bash
node scripts/create-mysql-backup.mjs
node scripts/verify-backup-assets.mjs
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
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-ZKGL-CloudBase-UID "";
  proxy_pass http://127.0.0.1:3000/api;
}

location / {
  root /opt/zkgl/current/apps/web/dist;
  try_files $uri $uri/ /index.html;
}
```

注意：独立服务器没有 CloudBase 云函数 context，API 不得信任浏览器传来的 UID。`AUTH_TRUSTED_PROXY` 默认必须为 `false`；上线前必须接入受信任认证适配层，校验前端 `Authorization: Bearer ...` 后再向本机 API 注入 `X-ZKGL-CloudBase-UID`，并且只有完成这项适配后才能将 `AUTH_TRUSTED_PROXY=true` 写入服务器本地环境文件。未完成该适配前，`/api` 只能在内网自测，不得直接开放给公网用户。
