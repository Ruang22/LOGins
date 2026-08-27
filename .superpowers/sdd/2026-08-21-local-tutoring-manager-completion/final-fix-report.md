# 最终审查修复报告

日期：2026-08-27
基线提交：`d3b4ae0dec58514578a0e749d0b60ae0f07a697b`

## 结果

最终整分支审查列出的六项 Important 问题均已修复。实现继续使用真实 Express + PostgreSQL 路径；支付仍为明确的 simulation / manual QR 模拟流程，AI 未引入成功替身。

## 修复内容

1. **账户切换数据隔离**
   - 每次切换角色或具体账户时，先递增账户 epoch，并清空教师课表、学员、订单、AI draft/suggestion、家长 dashboard/待处理订单、全局提示与错误、课程抽屉和所有打开的工作流。
   - 教师、家长加载以及所有异步读写流程均捕获账户 epoch；旧账户晚返回的成功、失败、刷新结果、通知和 loading 状态不能写入新会话。
   - 覆盖教师→教师、家长→家长、教师↔家长、加载失败、AI 晚失败和写入后晚刷新竞态。

2. **订单的首位启用孩子、停用与改绑边界**
   - 家长创建和确认 simulation 订单时，在 Serializable 事务中取得与排课/学员服务一致的 `student:<id>` advisory lock，并重新验证学生仍启用、仍归属当前家长、且仍是 dashboard 首位启用孩子。
   - 教师创建 manual QR 订单时锁定并重查学生启用状态；确认时同时锁订单和学生，并重查启用状态及订单记录的家长归属。
   - 服务层、路由和真实 API E2E 覆盖第二孩子、停用学生、创建后改绑、manual QR 创建与确认。

3. **年级变更保护既有组合课**
   - 年级更新在 Serializable 事务中发现相关 scheduled 组合课、按稳定顺序锁定参与学生并重新检查课程参与者年级。
   - 若新年级会使任一尚未完成/取消的组合课跨年级，则返回 `GRADE_CHANGE_CONFLICT`；姓名、家长、课时等同次修改全部回滚。
   - 已完成课程不阻止后续年级变更。

4. **北京时间统一**
   - 新增集中式业务时间工具，所有业务日期/时间明确使用 `Asia/Shanghai`。
   - 教师课表和课程抽屉、AI 预览、手动排课编辑、家长课程轨迹与订单、教师订单均不再依赖设备时区。
   - 客户端完整测试在 `TZ=UTC` 下通过；Playwright 用 UTC 浏览器验证 18:05 在课表、抽屉和家长轨迹中保持不变。

5. **课程抽屉错误与动作合法性**
   - 抽屉拥有独立错误状态，写入失败在对话框内以 `role="alert"` 展示，抽屉保持打开，动作恢复可用以便重试；inert 背景不承载该错误。
   - completed / cancelled 课程不再显示编辑、取消或完成动作。
   - E2E 通过真实 API 先改变服务器状态，再从陈旧抽屉触发真实 `INVALID_TRANSITION`，验证可访问错误和重试状态。

6. **390px 教师管理布局**
   - 480px 以下学员与订单列表切换为两列信息卡；名称/状态、关键课时、套餐/金额/支付状态及操作无需内部横向滚动即可读取和触达。
   - 桌面仍保留密集表格布局。
   - 390×844 E2E 验证卡片内容、编辑/停用/确认/登记动作在视口内，列表与页面均无横向溢出。

## 测试驱动记录

每项修复均先添加失败覆盖，再实现最小修复并跑回归。重点 RED 证据包括：账户切换仍显示旧数据、旧账户异步失败/刷新污染新会话、订单第二孩子/停用/改绑仍可进入确认、年级更新破坏 scheduled 组合课、抽屉错误落到背景及非法动作仍可见，以及 390px 列表 `scrollWidth` 大于 `clientWidth`。移动布局的初始失败实测为列表宽度 650px、可视宽度 366px；改为卡片后断言通过。

## 最终验证

| 命令 | 结果 |
|---|---|
| `npm.cmd --workspace client test` | 通过：11 files，59 tests |
| `npm.cmd --workspace client run build` | 通过：Vite build，22 modules transformed |
| `npm.cmd run test:server` | 通过：66 tests；真实 PostgreSQL `schedule_assistant_test` |
| `npm.cmd run test:e2e` | 通过：Chromium 20 tests；真实 PostgreSQL E2E 数据库 |
| `TZ=UTC; npm.cmd --workspace client test` | 通过：11 files，59 tests |

服务端全量回归前重置了专用 `schedule_assistant_test` 数据库，以清除先前中断的 RED 测试留下的数据；未触碰开发或生产数据库。

## 剩余风险与约束

- 并发保护依赖 PostgreSQL Serializable 事务与 transaction-scoped advisory locks；测试和 E2E 必须继续使用 PostgreSQL，不能以不支持这些语义的内存数据库替代。
- dashboard 的产品契约仍是按 `createdAt`、`id` 排序后的首位启用孩子；订单权限校验现与该契约一致。
- 业务时区现固定为 `Asia/Shanghai`。若产品未来支持多地区，需要把时区升级为明确的租户配置，而不是恢复设备本地时区。
- 支付路径仍只是演示模拟，不接真实支付；AI 无配置时继续真实失败，不提供伪成功响应。
- 测试输出仅保留非阻塞警告：Prisma `package.json#prisma` 配置将在 Prisma 7 弃用，以及 Playwright WebServer 的 `NO_COLOR` / `FORCE_COLOR` 提示。
