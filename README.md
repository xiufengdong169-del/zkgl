# 众肯科技项目全过程管理系统

当前开发与验收基线为《需求评审修订基线 V2.2》。本项目是完整新建系统：前端、云函数 API、数据库初始化脚本、权限体系、审批流、报表、文件与定时任务均从零开发，不包含历史系统改造、旧程序复用、旧接口兼容或历史数据迁移。

## 工程结构

- `apps/web`：Vue 3 + TypeScript 前端。
- `apps/api`：Node.js + TypeScript CloudBase 云函数 API、定时提醒与导出 worker。
- `packages/shared`：前后端共享的用户、权限与类型定义。
- `database/init/schema.sql`：空库一次性初始化脚本。
- `docs`：架构、部署、操作与验收说明。

## 本地开发

1. 执行 `npm install` 安装依赖。
2. 复制 `.env.example` 为 `.env.local`，只填写浏览器可公开的 CloudBase 配置与 API 地址。
3. 执行 `npm run dev` 启动前端开发服务。
4. 提交前至少执行：

```powershell
npm run verify
```

该命令会顺序执行：

```powershell
npm run typecheck
npm run test
npm run build
node scripts/verify-source-secret-hygiene.mjs
node scripts/verify-web-dist-security.mjs
npm run build:function
node scripts/verify-cloudbase-function-packages.mjs
```

## 数据库初始化原则

本项目不存在数据库迁移。开发、测试和首次上线环境均从空 MySQL 数据库执行 `database/init/schema.sql` 完成初始化。正式投产后的结构变更机制另行评审，不在当前新开发阶段引入迁移表或迁移执行器。

## 交付与验收入口

- `需求评审修订基线_V2.2.md`：当前唯一 Markdown 需求基线。
- `众肯科技项目全过程管理系统需求说明书_V2.2_CloudBase部署版.docx`：当前 Word 版需求说明书。
- `docs/architecture.md`：系统架构、安全边界、事务与审计原则。
- `docs/deployment.md`：CloudBase 部署、空库初始化、账号开通、上线初始化资料清单和云函数部署说明。
- `docs/operations-acceptance.md`：操作手册、主流程验收、现场性能验收和备份恢复验收清单。
- `docs/acceptance-traceability.md`：V2.2 结果型验收用例、自动化测试映射和交付前必跑命令。
- `docs/final-acceptance-checklist.md`：最终交付验收总清单，用于上线前逐项签核。

## 安全原则

- 浏览器只允许使用 CloudBase 环境 ID、地域、Publishable Key 和已部署的 API 访问地址。
- MySQL 密码、SecretKey、服务端 API Key 等敏感值只能放在本地 `.env` 或 CloudBase 环境变量中，禁止写入源码、文档示例或前端构建变量。
- 所有业务请求必须经过 CloudBase 身份、内部账号状态、功能权限、数据范围和敏感字段授权校验。

## GitHub 版本管理

本地目录 `C:\Users\27787\Desktop\zkgl` 已关联 GitHub 仓库：

```text
https://github.com/xiufengdong169-del/zkgl
```

每个可验证改动应在通过测试与构建后提交并推送到 `main`。
