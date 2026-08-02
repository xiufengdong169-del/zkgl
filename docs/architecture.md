# 架构基线

## 新建系统原则

众肯科技项目全过程管理系统全部为新开发程序。前端、云函数 API、数据库结构、权限体系、审批模型、文件管理、报表、提醒与导出任务均从零建设；不接续旧系统，不复用旧程序，不兼容旧接口，也不迁移历史数据库或存量数据。

## 总体组成

- 前端：Vue 3、TypeScript、Vite，部署为浏览器应用。
- API：CloudBase 云函数承载统一业务入口，使用 Node.js + TypeScript。
- 数据库：CloudBase MySQL，首次上线从空库执行 `database/init/schema.sql`。
- 文件：CloudBase 存储保存附件和后台导出文件，业务侧保存文件对象、版本和访问记录。
- 定时任务：`zkgl-reminder` 生成临期与异常提醒，`zkgl-export-worker` 处理后台导出任务。

## 安全边界

浏览器仅使用 CloudBase 环境 ID、地域、Publishable Key 和 API 访问地址完成登录与请求。浏览器不得接触 MySQL 密码、SecretKey、服务端 API Key 或任何数据库连接参数。

账号登录统一交由 CloudBase 身份服务完成，业务系统不接收、不保存、不打印用户密码。邮箱验证码找回密码默认关闭，本期不暴露找回密码业务接口；若未来确需启用，必须先完成独立安全评审、验证码频控、审计日志和自动化回归测试。

云函数 API 负责二次校验：

1. CloudBase 会话有效。
2. `cloudbase_uid` 唯一映射到启用状态的内部用户。
3. 用户具备操作所需功能权限码。
4. 业务数据满足 ALL、部门、项目、本人或临时项目授权之一。
5. 敏感字段和附件访问执行独立授权与审计。

任一校验失败均拒绝请求，并写入不包含密码、令牌或密钥的审计日志。

## 事务与审计

业务写操作、状态流转、审批任务、文件元数据和审计日志应在同一数据库事务中提交。审批通过后的业务状态回写由 API 统一执行，避免前端自行拼接状态。

## 数据初始化

当前阶段不维护数据库迁移。开发、测试和首次上线环境均从空库执行 `database/init/schema.sql`。正式投产后如需结构变更，应先评审变更影响，再建立生产变更机制。

## 2026-08-02 部署架构调整

当前正式部署目标调整为 Tencent Cloud Lighthouse 独立服务器：`193.112.79.220`，广州，4 核 4G，Ubuntu 24.04，服务器本机 MySQL 8.0。

调整后的运行形态：

- 前端仍为 Vue 3 + TypeScript + Vite，构建产物 `apps/web/dist` 由 Nginx HTTPS 静态托管。
- API 新增独立服务器入口 `apps/api/src/server.ts`，构建后通过 `npm run start -w @zkgl/api` 启动，由 systemd 托管并监听 `127.0.0.1:3000`。
- Nginx 将 `/api` 反向代理到本机 API；公网只暴露 HTTPS。
- MySQL 仍使用 `database/init/schema.sql` 做空库初始化，不引入数据库迁移。
- 独立服务器没有 CloudBase 云函数 context，API 不得信任浏览器传入的 UID；`AUTH_TRUSTED_PROXY` 默认关闭。上线前必须由受信任认证适配层校验 `Authorization: Bearer ...` 后注入 `X-ZKGL-CloudBase-UID`，完成该适配后才允许在服务器本地环境文件启用 `AUTH_TRUSTED_PROXY=true`。

CloudBase 函数配置和函数包脚本保留为历史交付包与可回退适配；当前上线验收口径以独立服务器部署为准。
