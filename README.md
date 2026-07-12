# 众肯科技项目全过程管理系统

当前开发基线为《需求说明书 V2.2（CloudBase 部署版）》。V2.1 和《众肯管理系统需求模块》仅用于历史追溯。

## 工程结构

- `apps/web`：Vue 3 + TypeScript 前端。
- `apps/api`：Node.js + TypeScript 云函数 API 基础模块。
- `packages/shared`：前后端共享的权限、用户和 API 类型。
- `database/migrations`：按顺序执行的 MySQL 迁移脚本。
- `docs`：开发、部署和架构约定。

## 本地启动

1. 复制 `.env.example` 为 `.env.local`，只填写浏览器可公开的 CloudBase 配置。
2. 执行 `npm install`。
3. 执行 `npm run dev` 启动前端。
4. 执行 `npm run build && npm test` 完成基础验证。

任何数据库密码、SecretKey、API Key 均不得写入源码、文档示例或前端构建变量。
