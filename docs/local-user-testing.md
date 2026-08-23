# 本地用户测试交付说明

本文档用于在暂不部署远程服务器的情况下，把当前开发成果交给用户在本地电脑先行查看和走流程。

## 当前可交付结论

- 本地用户测试可以先从演示模式开始。
- 默认访问地址为 `http://127.0.0.1:4173/`。
- 演示测试中心地址为 `http://127.0.0.1:4173/demo`，用于按主体流程引导业务用户查看。
- 启动命令为 `npm run demo:local`。
- 如果浏览器访问不了 `127.0.0.1` 或 `localhost`，可执行 `npm run demo:file` 生成文件版演示包，然后双击打开 `C:\Users\27787\Desktop\zkgl\.tmp\zkgl-file-demo\index.html`。
- 访问校验命令为 `node scripts/verify-public-demo.mjs http://127.0.0.1:4173/`。
- 停止命令为 `Stop-Process -Id (Get-Content .tmp\local-demo-server.pid)`。

## 演示模式边界

本地演示模式只用于快速查看系统界面、菜单、样例数据和主要业务流程，不连接生产 MySQL，不访问远程服务器，也不作为正式上线口径。

演示模式适合先确认：

- 演示测试中心是否能清楚说明当前可演示范围、测试口径和未完成真实环境事项。
- 工作台、客户、线索、项目、投标、合同、交付、验收、财务、结算、文件、审批、报表、系统管理等页面是否能正常打开。
- 菜单结构、字段布局、流程入口和页面交互是否符合用户理解。
- 样例数据是否能支撑演示说明和用户初步试用。

演示模式不用于确认：

- 真实账号登录。
- 真实 MySQL 数据写入。
- 正式权限账号分配。
- 生产 HTTPS、Nginx、systemd 和备份定时任务。
- 30 用户现场性能压测。
- 生产数据库备份恢复演练。

## 本地启动步骤

在项目根目录执行：

```powershell
npm install
npm run demo:local
```

终端出现类似以下内容后，即可打开浏览器访问：

```text
Local demo ready: http://127.0.0.1:4173/
```

如果 `4173` 端口已被占用，脚本会自动切换到其他本地端口，应以终端输出的实际地址为准。

## 文件版演示兜底

如果当前浏览器无法访问本机 `127.0.0.1` 或 `localhost`，可不启动 HTTP 服务，改为生成可双击打开的文件版演示包：

```powershell
npm run demo:file
```

生成完成后打开：

```text
C:\Users\27787\Desktop\zkgl\.tmp\zkgl-file-demo\index.html
```

或在浏览器地址栏输入：

```text
file:///C:/Users/27787/Desktop/zkgl/.tmp/zkgl-file-demo/index.html#/demo
```

文件版演示使用 hash 路由和相对静态资源，仍然只使用演示样例数据，不连接生产 MySQL，不访问远程服务器。

## 本地访问校验

如需确认页面和静态资源确实可访问，执行：

```powershell
node scripts/verify-public-demo.mjs http://127.0.0.1:4173/
```

通过时会输出：

```text
Public demo verified: http://127.0.0.1:4173/
```

## 停止本地演示服务

如果本地演示是由后台进程启动，并且 `.tmp\local-demo-server.pid` 文件存在，可执行：

```powershell
Stop-Process -Id (Get-Content .tmp\local-demo-server.pid)
```

如果是直接在前台终端运行 `npm run demo:local`，在该终端按 `Ctrl+C` 即可停止。

## 切换到本地完整联调的前置条件

若后续要在本地电脑运行真实 API 和 MySQL 写入版，需要先准备：

1. 本地 MySQL 8.0 服务和 `mysql` 命令。
2. 空数据库，例如 `zkgl`。
3. 按 `database/init/schema.sql` 初始化空库。
4. 本地服务端环境变量：`DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`、`API_HOST`、`API_PORT`。
5. 浏览器端 `VITE_API_BASE_URL` 指向本机认证代理，例如 `http://127.0.0.1:4180/api`，不要直接指向原始 API `http://127.0.0.1:3000/api`。
6. 浏览器端如使用本机 HTTP API，必须显式设置 `VITE_ALLOW_LOCAL_HTTP_API=true`；该开关只允许 `127.0.0.1`、`localhost` 或 `::1`，不能放行外部 HTTP 地址。
7. API `/healthz` 和 `/readyz` 均可访问，其中 `/readyz` 必须能通过 MySQL `SELECT 1` 检查。
8. 认证适配或本地受控测试身份方案。

本地完整联调建议启动四个本机进程：

可以先生成本地环境文件模板，该文件被 `.gitignore` 忽略，不会提交到 Git：

```powershell
npm run create:local-fullstack-env
```

随后在 `.env.local.fullstack` 里只在本机填写数据库密码。准备好 MySQL、空库和初始化资料后，可执行：

```powershell
npm run start:local-fullstack
```

下面是各进程的等价手工启动方式，便于排查问题：

```powershell
# 1. API：只监听本机，由本地代理注入可信 UID
$env:API_HOST="127.0.0.1"
$env:API_PORT="3000"
$env:AUTH_TRUSTED_PROXY="true"
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_NAME="zkgl"
$env:DB_USER="zkgl_app"
# 在本机终端临时设置 DB_PASSWORD，真实值不要写入 Git 仓库或文档。
npm run build -w @zkgl/api
npm run start -w @zkgl/api

# 2. 认证适配器：本地示例 token 只允许本地测试
$env:AUTH_ADAPTER_HOST="127.0.0.1"
$env:AUTH_ADAPTER_PORT="3010"
$env:AUTH_TOKEN_VERIFIER_MODULE="deploy/auth/local-token-verifier.example.mjs"
$env:LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS="true"
node apps/api/dist/auth-adapter-cli.js

# 3. 本机认证代理：替代正式 Nginx auth_request 链路
$env:LOCAL_AUTH_ADAPTER_URL="http://127.0.0.1:3010/verify"
$env:LOCAL_API_TARGET_URL="http://127.0.0.1:3000/api"
npm run serve:local-api-proxy

# 4. 前端：显式使用本地 HTTP API 与本地测试 token
$env:VITE_API_BASE_URL="http://127.0.0.1:4180/api"
$env:VITE_ALLOW_LOCAL_HTTP_API="true"
$env:VITE_LOCAL_AUTH_MODE="true"
$env:VITE_LOCAL_AUTH_TOKEN="local-admin-token-0001"
npm run dev -w @zkgl/web
```

本地示例 token 与初始化资料中的 CloudBase UID 对应关系保存在 `deploy/auth/local-token-verifier.example.mjs`，仅用于本机联调，不得用于生产环境。正式上线仍必须使用真实 CloudBase access token verifier。

项目方初始化资料可先生成 SQL，确认后再导入空库：

```powershell
node scripts/generate-initialization-sql.mjs docs/initialization-data.example.json > .tmp\initialization-data.sql
mysql -h 127.0.0.1 -P 3306 -u zkgl_app -p zkgl < .tmp\initialization-data.sql
```

如只在终端预览生成内容，也可以执行 `npm run generate:initialization-sql -- docs/initialization-data.example.json`。

生成脚本只写入部门、人员、CloudBase UID 到内部账号映射、角色分配、审批岗位任职、审批金额阈值、编号规则和系统参数；不会生成或保存初始密码。

准备完成后可执行本地完整联调预检：

```powershell
npm run check:local-fullstack
```

如果环境变量保存在本地文件，例如 `.env.local.fullstack`，可执行：

```powershell
node scripts/check-local-fullstack-readiness.mjs --env-file .env.local.fullstack
```

该命令会检查 MySQL 命令、数据库连接变量、`VITE_API_BASE_URL`、`VITE_ALLOW_LOCAL_HTTP_API=true`、`VITE_LOCAL_AUTH_MODE=true`、`VITE_LOCAL_AUTH_TOKEN`、API `/healthz`、API `/readyz` 和本机认证代理 `/healthz`。它不会输出数据库密码。

当前仓库的正式上线口径仍以腾讯云轻量应用服务器、Nginx、systemd、MySQL 8.0、HTTPS 和真实认证 verifier 为准；本地完整联调只作为正式上线前的补充验证环境。
