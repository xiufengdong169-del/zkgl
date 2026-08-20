# 本地用户测试交付说明

本文档用于在暂不部署远程服务器的情况下，把当前开发成果交给用户在本地电脑先行查看和走流程。

## 当前可交付结论

- 本地用户测试可以先从演示模式开始。
- 默认访问地址为 `http://127.0.0.1:4173/`。
- 启动命令为 `npm run demo:local`。
- 访问校验命令为 `node scripts/verify-public-demo.mjs http://127.0.0.1:4173/`。
- 停止命令为 `Stop-Process -Id (Get-Content .tmp\local-demo-server.pid)`。

## 演示模式边界

本地演示模式只用于快速查看系统界面、菜单、样例数据和主要业务流程，不连接生产 MySQL，不访问远程服务器，也不作为正式上线口径。

演示模式适合先确认：

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
5. 浏览器端 `VITE_API_BASE_URL` 指向本机 API，例如 `http://127.0.0.1:3000/api`。
6. 认证适配或本地受控测试身份方案。

当前仓库的正式上线口径仍以腾讯云轻量应用服务器、Nginx、systemd、MySQL 8.0、HTTPS 和真实认证 verifier 为准；本地完整联调只作为正式上线前的补充验证环境。
