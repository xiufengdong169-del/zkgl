# V2.2 验收追踪表

本文档用于把《需求评审修订基线 V2.2》的关键验收项映射到当前实现与自动化测试，便于最终验收时快速复核。

最后复核日期：2026-07-17。

## 自动化与现场验收覆盖

| 验收项 | 验收重点 | 主要自动化覆盖 |
| --- | --- | --- |
| AC-01 | 累计开票不能超过合同金额 | `apps/api/src/finance.test.ts` |
| AC-02 | 收款与发票支持多对多核销 | `apps/api/src/finance.test.ts` |
| AC-03 | 核销不能超过收款或发票余额 | `apps/api/src/finance.test.ts` |
| AC-04 | 合作方结算按实际收款比例扣除历史结算 | `apps/api/src/settlements.test.ts` |
| AC-05 | 付款不能重复增加已确认成本 | `apps/api/src/finance.test.ts` |
| AC-06 | 保证金支付退回不计入项目成本 | `apps/api/src/settlements.test.ts` |
| AC-07 | 保证金没收审批通过后才计入成本 | `apps/api/src/settlements.test.ts` |
| AC-08 | 报销总额只能由明细汇总生成 | `apps/api/src/finance.test.ts` |
| AC-09 | 立项驳回后按同一申请重提，通过后只生成一个正式项目编号 | `apps/api/src/project-applications.test.ts` |
| AC-10 | 无正式合同不能正常启动项目；提前启动走单独规则 | `apps/api/src/delivery.test.ts` |
| AC-11 | 历史结算快照不受后续方案修改影响 | `apps/api/src/settlements.test.ts` |
| AC-12 | 无关项目详情、导出和附件地址均按数据范围拒绝并审计 | `apps/api/src/handler.test.ts` |
| AC-13 | 暂定金额经金额变更审批后转为已确认 | `apps/api/src/contracts.test.ts` |
| AC-14 | 30 用户在基准数据量下混合查询、保存和审批，95% 请求满足 V2.2 性能阈值且无重复审批或越权 | `docs/operations-acceptance.md` 现场负载验收 |
| AC-15 | 存在未收款、未退保证金和未关闭问题时普通结项被阻止；带遗留事项必须完整登记且最终特批人为公司负责人 | `apps/api/src/settlements.test.ts` |

## 交付前必跑命令

推荐直接执行总验证命令：

```powershell
npm run verify
```

该命令会顺序执行以下检查：

```powershell
npm run typecheck
npm run test
npm run build
node scripts/verify-source-secret-hygiene.mjs
node scripts/verify-web-dist-security.mjs
npm run build:function
node scripts/verify-cloudbase-function-packages.mjs
```

最近一次完整验证结果：

- `npm run verify`：通过。
- `npm run typecheck`：通过。
- `npm run test`：API 49 个测试文件 / 195 条测试通过；Web 7 个测试文件 / 25 条测试通过。
- `npm run build`：通过。
- `node scripts/verify-source-secret-hygiene.mjs`：源码与交付脚本未包含非空数据库密码、Secret、私钥或带凭证的 MySQL URL。
- `node scripts/verify-web-dist-security.mjs`：前端构建产物未包含后端数据库变量、SecretKey、API Secret 或私钥标记。
- `npm run build:function`：`zkgl-api`、`zkgl-reminder`、`zkgl-export-worker` 打包通过。
- `node scripts/verify-cloudbase-function-packages.mjs`：三套 CloudBase 函数包入口、依赖清单、无 workspace 内部包运行时引用，且 `cloudbaserc.json` 部署配置校验通过。

## 接口定义一致性检查

动作定义位于 `apps/api/src/actions.ts`，持久化实现位于 `apps/api/src/persistence.ts`。交付前应确认：

- 动作定义数量等于持久化 `case` 实现数量。
- 不存在已定义但未实现的动作。
- 不存在持久化层额外暴露、但未在动作定义中授权校验的动作。

当前基线已执行该类检查；如后续新增动作，应同步补充动作定义、持久化实现、权限种子和测试。
