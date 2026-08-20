# AI 排课助手 - 设计规格

## 目标

构建一个面向补习班教师的 Web 作品：教师用自然语言创建英语课预约，系统校验教师时间、同年级合班和学生课时余额；家长通过演示账号查看自己孩子的课表、课时和订单。

## 系统架构

采用标准三层分离开发：

- `client/`：Vue 3 + JavaScript 单页应用，负责教师端和家长端界面、输入校验与调用 API；不直接访问数据库。
- `server/`：Node.js + Express REST API，负责演示账号的角色识别、AI 请求、业务校验、订单状态与课时状态流转；是业务规则的唯一执行者。
- `database/`：PostgreSQL 关系型数据库及迁移脚本，保存用户、学生、课程、课程参与者、订单和课时数据。

前端可做即时提示，但所有冲突检查、同年级合班、余额、订单确认与数据过滤必须由后端再次校验。涉及订单确认、加课时、预约、完成或取消课程的操作必须在数据库事务中执行。

## 已确认范围

- 教师负责初一至高三学生的英语课排课。
- 每节课固定 60 分钟，开始时间精确到分钟。
- 同年级学生可以合班；每位参与学生各占用 1 个预约课时。
- 可用课时 = 总课时 - 已上课时 - 已预约课时。
- 新预约先增加已预约课时；教师标记课程完成后，将该课时转为已上课；取消预约时释放课时。
- AI 只解析文本为结构化课程建议，教师确认后才创建预约。
- 家长端使用演示账号，仅显示自己的孩子。
- 第一版使用模拟支付订单；支付确认后增加学生总课时。后续二维码收款由教师人工确认到账，不自动入账。

## 角色与界面

### 教师端

- 周视图日历：显示个人课与同年级合班课。
- AI 排课输入：例如“给初二王小明和李小雨周三 18:30 排英语课”。
- 解析预览：课程时间、学生、年级、每位学生的余额和校验结果。
- 学生课时看板：可排课、余额不足、已预约，支持年级筛选。
- 课程详情：标记已完成或取消预约。
- 订单审核：模拟订单确认；未来二维码订单的人工到账确认。

### 家长端

- 孩子概览：年级、总课时、已上、已预约与剩余课时。
- 本周课表与历史上课记录。
- 课时包与订单：创建订单并使用明确标记为“模拟支付”的流程。

## 数据模型

- `User`: id, displayName, role (`teacher`, `parent`), demo account identifier.
- `Student`: id, name, grade, parentUserId, totalCredits, attendedCredits, reservedCredits.
- `Lesson`: id, subject, startAt, endAt, status (`reserved`, `completed`, `cancelled`).
- `LessonParticipant`: lessonId, studentId. A group lesson has multiple rows; the server requires every participant to be in the same grade.
- `Order`: id, studentId, packageName, credits, amount, status (`pending`, `paid`, `cancelled`), paymentMode (`simulation`, `manual_qr`), paidAt.

## 校验与错误处理

- 学生不存在、合班学生年级不一致、任何学生余额不足、教师时间冲突、时间格式无效，均拒绝创建课程。
- 模型返回字段不完整或不合法时，仅显示修正提示，不保存课程。
- 模型请求失败时保留原输入并允许重试。
- 订单只能从待支付转为已支付一次；确认后一次性增加对应学生总课时。
- 后端以数据库事务和状态前置条件防止重复确认订单、重复扣课时或并发导致的余额错误。

## API 边界

- `POST /api/ai/parse-schedule`：将教师文本解析为未保存的课程建议。
- `GET /api/teacher/schedule`、`POST /api/teacher/lessons`、`PATCH /api/teacher/lessons/:id`：教师排课、完成和取消。
- `GET /api/teacher/students`：学生与课时看板。
- `GET /api/teacher/orders`、`PATCH /api/teacher/orders/:id/confirm`：订单审核与模拟付款确认。
- `GET /api/parent/dashboard`、`POST /api/parent/orders`、`POST /api/parent/orders/:id/simulate-payment`：家长数据与模拟支付。

上述接口使用演示账号识别角色。正式认证、真实微信支付和二维码收款核销为后续阶段，不能由前端绕过 API 直接改变数据库。

## 视觉与交互方向

Operate 模式的教师工作台。使用“课程表 + 站台时刻牌”作为信息组织隐喻：左侧时间轨道和周视图为主，右侧为 AI 解析与确认面板；AI 新建议以半透明虚线课程卡预览，确认后变为实色课程卡。已确认视觉令牌：纸白 `#F6F4EE`、深蓝墨 `#132238`、课程蓝 `#2D6CDF`、确认绿 `#2FA36B`、冲突橙 `#E56B3F`、浅灰线 `#D8D9D2`。

## 安全与真实性

- 模型 API Key 只放在服务端 `.env`；不进入前端、截图或版本库。
- 当前父母登录和支付都只用于演示，界面不得声称其具有生产级认证或真实支付能力。
- 所有学生、订单、课程和金额均为合成演示数据，并在界面中说明。
- PostgreSQL 连接串、模型 API Key 与任何未来支付密钥均使用服务端环境变量，并排除在版本控制之外。

## 测试与验收

- 自动测试：课时计算、同年级合班、时间冲突、预约/完成/取消状态转换、订单幂等确认和家长数据过滤。
- 手动演示：单人排课、合班排课、余额不足、冲突排课、完成课程、模拟支付增加课时。
- 桌面与移动端检查键盘操作、焦点可见、颜色对比和布局适配。

## 开放决策

- 选择具体的大模型供应商和创建 API Key 的时机。
- 真实支付、收款码上传及生产身份验证不属于第一版实现范围。
