# CloudBase 部署说明

## 前置条件

1. CloudBase 环境：`cloudbase-d7gc2b32cd4196059`，广州地域。
2. 在 CloudBase 控制台开启用户名密码登录，并配置 Web 安全域名。
3. 在云函数环境变量中配置 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`。不得把这些值提交到 Git。
4. 从空库执行 `database/init/schema.sql`，再按项目方提供的名单创建部门、人员、内部用户和角色关联。

## 构建与部署

```powershell
npm install
npm run typecheck
npm test
npm run build
npm run build:function
tcb login
tcb fn deploy zkgl-api --yes
tcb fn deploy zkgl-reminder --yes
tcb fn trigger create -e cloudbase-d7gc2b32cd4196059
```

函数包生成在 `functions/zkgl-api` 与 `functions/zkgl-reminder`，均为构建产物且不纳入版本管理。上述命令部署的是事件函数，不要添加 `--httpFn`；前端使用时需在 CloudBase 控制台仅为 `zkgl-api` 配置 HTTP 访问服务路径，并将完整访问地址写入 `VITE_API_BASE_URL`。

`zkgl-reminder` 使用 CloudBase 七段 Cron `0 0 8 * * * *` 每日触发。部署后在控制台核对触发器时区和最近执行日志，并在云函数权限控制中禁止客户端调用 `zkgl-reminder`；CloudBase 定时触发器不受客户端安全规则影响，仍可正常执行。`cloudbaserc.json` 不包含数据库密码或 API Key。

前端构建前设置浏览器可公开变量：`VITE_CLOUDBASE_ENV_ID`、`VITE_CLOUDBASE_REGION`、真实 Publishable Key 和部署后的 `VITE_API_BASE_URL`。API Key、SecretKey 和数据库密码禁止使用 `VITE_` 前缀。
