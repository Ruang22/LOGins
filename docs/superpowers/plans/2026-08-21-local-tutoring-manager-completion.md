# 本机补习班管理版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前移动端排课演示升级为本机可日常使用的补习班管理版，完成学生、课程、订单、单孩子家长端和本地身份选择。

**Architecture:** 保持 Vue 单页客户端、Express REST API、Prisma/PostgreSQL。领域服务负责事务、余额和权限；路由只做输入校验和 HTTP 映射；客户端以教师壳和家长壳的专用面板承接真实写入。每项写能力从失败测试开始，再接入页面。

**Tech Stack:** Vue 3、Vite、Express 5、Prisma 6、PostgreSQL 16、Zod、Vitest、Node test、Playwright。

**Spec:** `docs/superpowers/specs/2026-08-21-local-tutoring-manager-completion-design.md`

## Global Constraints

- 支付只允许 `simulation` 和 `manual_qr` 本地记录；不接微信支付或任何外部收款服务。
- 所有可见文案使用中文，支付区域明确标注“模拟支付”或“扫码登记（模拟）”。
- 家长仅能读取一个绑定孩子；教师拥有学生、课程与订单管理权限。
- 手动排课精确到分钟、默认 60 分钟，仅允许同年级组课，并在服务端事务内校验冲突及课时。
- 课程取消、完成、编辑和订单付款必须保证课时余额一致且不能重复确认。
- 维持移动优先、44px 触控、键盘焦点、Escape/焦点恢复和减少动态效果；不恢复卡片墙。
- 每项实现必须先观察对应测试 RED，最终运行客户端、服务端、真实 PostgreSQL Playwright E2E 全套测试。

---

### Task 1: 学生生命周期与教师学生 API

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_student_lifecycle/migration.sql`
- Create: `server/src/services/student-service.js`
- Create: `server/src/schemas/student-schema.js`
- Modify: `server/src/routes/teacher-routes.js`
- Modify: `server/test/teacher-routes.test.js`
- Create: `server/test/student-service.test.js`

**Interfaces:**
- `createStudent(input, teacher)` returns a student with `{ id, name, grade, parent, totalCredits, attendedCredits, reservedCredits, isActive }`.
- `updateStudent({ studentId, input }, teacher)` validates non-negative credits and refuses totals below `attendedCredits + reservedCredits`.
- `archiveStudent({ studentId }, teacher)` sets `isActive: false`; it never deletes history.
- API: `POST /api/teacher/students`, `PATCH /api/teacher/students/:id`, `DELETE /api/teacher/students/:id`.

- [ ] **Step 1: Write the failing service and route tests**

```js
test('teacher creates an active grade-8 student with a local parent account', async () => {
  const created = await createStudent({ name: '陈晨', grade: 8, parentName: '陈家长', parentEmail: 'chen@example.test', totalCredits: 12 }, teacher);
  assert.equal(created.isActive, true);
  assert.equal(created.totalCredits, 12);
});

test('teacher cannot reduce total credits below reserved and attended credits', async () => {
  await assert.rejects(() => updateStudent({ studentId, input: { totalCredits: 2 } }, teacher), { code: 'CREDIT_TOTAL_TOO_LOW' });
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `npm.cmd --workspace server test -- student-service.test.js teacher-routes.test.js`

Expected: FAIL because the lifecycle fields, service and routes do not exist.

- [ ] **Step 3: Implement schema, migration, Zod schema and service**

```js
export const studentInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  grade: z.number().int().min(7).max(12),
  parentName: z.string().trim().min(1).max(40),
  parentEmail: z.string().trim().email(),
  totalCredits: z.number().int().min(0),
}).strict();
```

Add `isActive Boolean @default(true)` to `Student`; look up or create a parent user by normalized email; return only the select shape specified above. Archive only after verifying the teacher role.

- [ ] **Step 4: Add route handlers and verify GREEN**

Map domain codes to `400`, unknown students to `404`, and use `requireRole('teacher')`. Run the focused tests until they pass.

- [ ] **Step 5: Run server suite and commit**

Run: `npm.cmd run test:server`

Commit:

```bash
git add server/prisma server/src server/test
git commit -m "feat: add teacher student lifecycle management"
```

### Task 2: 分钟级手动排课与课程编辑服务

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_lesson_notes/migration.sql`
- Modify: `server/src/services/scheduling-service.js`
- Modify: `server/src/routes/teacher-routes.js`
- Modify: `server/test/scheduling-service.test.js`
- Modify: `server/test/teacher-routes.test.js`

**Interfaces:**
- `createReservation({ studentIds, startAt, durationMinutes: 60, note }, actor)` creates a lesson with note.
- `editReservation({ lessonId, studentIds, startAt, durationMinutes, note }, actor)` revalidates exactly one credit reservation per participant and returns the edited lesson.
- API `PATCH /api/teacher/lessons/:id` uses `{ action: 'complete'|'cancel' }` for transitions and `{ studentIds, startAt, durationMinutes, note }` for edits; reject ambiguous bodies with `INVALID_LESSON_UPDATE`.

- [ ] **Step 1: Write failing scheduling tests**

```js
test('creates a 60-minute manual lesson at 18:05 with a note', async () => {
  const lesson = await createReservation({ studentIds: [student.id], startAt: '2032-03-01T18:05:00+08:00', durationMinutes: 60, note: '语法复习' }, teacher);
  assert.equal(lesson.note, '语法复习');
});

test('editing a reservation rejects a new teacher time conflict without changing balances', async () => {
  await assert.rejects(() => editReservation(conflictingUpdate, teacher), { code: 'TIME_CONFLICT' });
  assert.deepEqual(await balances(student.id), before);
});
```

- [ ] **Step 2: Run focused service tests and verify RED**

Run: `npm.cmd --workspace server test -- scheduling-service.test.js`

Expected: FAIL because lesson notes and edit reservations do not exist.

- [ ] **Step 3: Implement strict update parsing and serializable edit transaction**

```js
export async function editReservation({ lessonId, studentIds, startAt, durationMinutes = 60, note = '' }, actor) {
  // Lock the lesson, its old/new students and teacher; validate active same-grade students,
  // conflict excluding this lesson, then update participants and balances in one transaction.
}
```

Keep the fixed one-hour duration, explicit ISO minute parsing and `scheduled`-only editing. Release credits for removed students and reserve credits for added students only after all checks pass.

- [ ] **Step 4: Add route tests and verify GREEN**

Verify manual creation, edit, cross-grade rejection, inactive-student rejection, conflict preservation and no duplicate reservation. Run focused service and route tests.

- [ ] **Step 5: Run server suite and commit**

Run: `npm.cmd run test:server`

Commit:

```bash
git add server/prisma server/src server/test
git commit -m "feat: support manual scheduling and lesson edits"
```

### Task 3: 教师订单登记与订单历史

**Files:**
- Modify: `server/src/services/order-service.js`
- Modify: `server/src/routes/order-routes.js`
- Modify: `server/src/routes/teacher-routes.js`
- Modify: `server/src/schemas/order-schema.js`
- Modify: `server/test/order-service.test.js`
- Modify: `server/test/order-routes.test.js`

**Interfaces:**
- `createTeacherManualOrder({ studentId, packageId?, packageName?, creditQuantity?, amountCents?, paymentMode }, teacher)` creates a pending order.
- `confirmTeacherManualOrder({ orderId }, teacher)` credits once and records `paidAt`; only accepts `paymentMode: 'manual_qr'`.
- API: `POST /api/teacher/orders/manual`, `PATCH /api/teacher/orders/:id/confirm-manual`; existing teacher order list remains read-compatible.

- [ ] **Step 1: Write failing transaction tests**

```js
test('teacher confirms a manual-qr order exactly once and adds its registered credits', async () => {
  const paid = await confirmTeacherManualOrder({ orderId }, teacher);
  assert.equal(paid.paymentMode, 'manual_qr');
  await assert.rejects(() => confirmTeacherManualOrder({ orderId }, teacher), { code: 'ORDER_ALREADY_PAID' });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd --workspace server test -- order-service.test.js order-routes.test.js`

Expected: FAIL because manual QR order methods and routes do not exist.

- [ ] **Step 3: Implement teacher-owned manual order flow**

Use existing advisory order lock and serializable transaction. For catalog package IDs use server catalog facts; for manual QR require `packageName`, positive integer `creditQuantity` and non-negative integer `amountCents`. Reject confirming another teacher’s order or any non-manual payment mode.

- [ ] **Step 4: Add API tests and verify GREEN**

Cover successful one-time confirmation, duplicate rejection, server-authoritative catalog values and teacher/parent separation.

- [ ] **Step 5: Run server suite and commit**

Run: `npm.cmd run test:server`

Commit:

```bash
git add server/src server/test
git commit -m "feat: add teacher manual payment registration"
```

### Task 4: 本地账户选择与家长单孩子数据契约

**Files:**
- Modify: `server/src/middleware/demo-auth.js`
- Create: `server/src/routes/account-routes.js`
- Modify: `server/src/app.js`
- Modify: `server/src/routes/parent-routes.js`
- Modify: `server/test/parent-routes.test.js`
- Create: `server/test/account-routes.test.js`
- Modify: `client/src/api.js`
- Modify: `client/src/state/role-session.js`
- Modify: `client/src/App.test.js`

**Interfaces:**
- `GET /api/accounts?role=teacher|parent` returns `{ id, name, email, role }[]` without sensitive fields.
- Client `createRoleSession()` persists `{ role, accountId }` in `sessionStorage`; `select({ role, accountId })` validates the pair.
- API requests send `x-demo-user: accountId`; parent dashboard always applies `take: 1` to active students ordered by creation time.

- [ ] **Step 1: Write failing account and parent-isolation tests**

```js
test('account list exposes local parent choices without unrelated roles', async () => {
  const response = await request(app).get('/api/accounts?role=parent');
  assert.equal(response.body.every((account) => account.role === 'parent'), true);
});

test('parent dashboard returns exactly one active student even if more records exist', async () => {
  const response = await parentDashboard(parent);
  assert.equal(response.body.students.length, 1);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd --workspace server test -- account-routes.test.js parent-routes.test.js`

Expected: FAIL because accounts route and one-active-child query do not exist.

- [ ] **Step 3: Implement account route and active child restriction**

```js
router.get('/accounts', async (req, res) => {
  const role = req.query.role;
  const accounts = await prisma.user.findMany({ where: role ? { role } : undefined, select: { id: true, name: true, email: true, role: true } });
  res.json(accounts);
});
```

Validate `x-demo-user` against persisted local account IDs while retaining documented aliases for deterministic test fixtures. Parent dashboard must use `where: { parentId, isActive: true }, take: 1`.

- [ ] **Step 4: Add client session tests and verify GREEN**

Test account-based role selection persists the selected account and reset clears it. Run `npm.cmd --workspace client test -- App.test.js role-session.test.js`.

- [ ] **Step 5: Run client/server suites and commit**

Run: `npm.cmd --workspace client test` and `npm.cmd run test:server`

Commit:

```bash
git add server/src server/test client/src
git commit -m "feat: add local account selection and single-child parent data"
```

### Task 5: 教师端学生、手动排课和订单表单

**Files:**
- Create: `client/src/components/StudentManager.vue`
- Create: `client/src/components/StudentManager.test.js`
- Create: `client/src/components/ManualScheduleSheet.vue`
- Create: `client/src/components/ManualScheduleSheet.test.js`
- Create: `client/src/components/TeacherOrderSheet.vue`
- Create: `client/src/components/TeacherOrderSheet.test.js`
- Modify: `client/src/components/TeacherShell.vue`
- Modify: `client/src/App.vue`
- Modify: `client/src/api.js`
- Modify: `client/src/styles.css`

**Interfaces:**
- `StudentManager` accepts `students`, emits `create`, `update`, `archive`; it never calculates authoritative balances.
- `ManualScheduleSheet` accepts active `students` and optional `lesson`, emits `{ studentIds, startAt, durationMinutes: 60, note }` on save.
- `TeacherOrderSheet` emits either a catalog `packageId` or manual QR `{ packageName, creditQuantity, amountCents, paymentMode: 'manual_qr' }`.

- [ ] **Step 1: Write failing component tests**

```js
it('submits a 18:05 manual course with only same-grade selected students', async () => {
  const wrapper = mount(ManualScheduleSheet, { props: { students: gradeEightStudents } });
  await wrapper.get('[name="startTime"]').setValue('18:05');
  await wrapper.get('[data-testid="student-a"]').setValue(true);
  await wrapper.get('[data-testid="student-b"]').setValue(true);
  await wrapper.get('form').trigger('submit');
  expect(wrapper.emitted('save')[0][0].startAt).toMatch(/T18:05:00/);
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm.cmd --workspace client test -- StudentManager.test.js ManualScheduleSheet.test.js TeacherOrderSheet.test.js`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement accessible full-screen sheets and manager**

Use native `<dialog>` or an accessible `role="dialog"` with close focus restoration. Student manager supplies create/edit/archive forms; manual scheduling groups grade choices and disables cross-grade selections; order sheet visibly labels `扫码登记（模拟）` and `模拟支付`.

- [ ] **Step 4: Wire App API calls and verify GREEN**

Add API methods `teacher.createStudent`, `updateStudent`, `archiveStudent`, `editLesson`, `createManualOrder`, `confirmManualOrder`. On successful writes refresh teacher data and focus the initiating action.

- [ ] **Step 5: Run client suite/build and commit**

Run: `npm.cmd --workspace client test` and `npm.cmd --workspace client run build`

Commit:

```bash
git add client/src
git commit -m "feat: add teacher management workflows"
```

### Task 6: 家长订单历史与模拟扫码展示

**Files:**
- Modify: `server/src/routes/parent-routes.js`
- Modify: `server/test/parent-routes.test.js`
- Modify: `client/src/components/ParentShell.vue`
- Modify: `client/src/components/ParentShell.test.js`
- Modify: `client/src/styles.css`

**Interfaces:**
- Parent dashboard returns `orders` scoped to the one visible active student with `{ id, packageName, creditQuantity, amountCents, paymentMode, status, createdAt, paidAt }`.
- ParentShell renders a local “扫码登记（模拟）” block and order history; it never renders teacher confirmation actions.

- [ ] **Step 1: Write failing route and component tests**

```js
test('parent dashboard includes only the current child order history', async () => {
  const dashboard = await parentDashboard(parent);
  assert.equal(dashboard.body.orders.every((order) => order.studentId === dashboard.body.students[0].id), true);
});

it('renders simulated QR registration and hides teacher order confirmation', () => {
  const wrapper = mount(ParentShell, { props: { dashboard, pendingOrder: null } });
  expect(wrapper.text()).toContain('扫码登记（模拟）');
  expect(wrapper.text()).not.toContain('确认收款');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd --workspace server test -- parent-routes.test.js` then `npm.cmd --workspace client test -- ParentShell.test.js`

Expected: FAIL because dashboard orders and the QR registration block do not exist.

- [ ] **Step 3: Implement scoped order history and parent presentation**

Query orders by the selected visible child only, order newest first, and return payment fields. Parent UI uses readable continuous history and a non-interactive QR placeholder carrying the explicit simulation label.

- [ ] **Step 4: Verify GREEN and build**

Run: `npm.cmd --workspace server test -- parent-routes.test.js`; `npm.cmd --workspace client test -- ParentShell.test.js`; `npm.cmd --workspace client run build`.

- [ ] **Step 5: Commit**

```bash
git add server/src server/test client/src
git commit -m "feat: add parent order history and qr simulation"
```

### Task 7: 全流程浏览器验收与最终回归

**Files:**
- Modify: `e2e/scheduling.spec.js`
- Modify: `e2e/orders.spec.js`
- Create: `e2e/student-management.spec.js`
- Modify: `e2e/release.spec.js`
- Modify: `client/src/styles.css` only if a tested mobile defect is found.

**Interfaces:**
- Real-stack flows use teacher and parent account selection before protected UI interactions.
- Every manual write path uses the Express API and disposable `schedule_assistant_e2e` PostgreSQL database.

- [ ] **Step 1: Write failing browser scenarios**

```js
test('teacher creates, edits, archives a student and cannot schedule an archived student', async ({ page }) => {
  await page.goto('/');
  await chooseTeacherAccount(page);
  await page.getByRole('button', { name: '学员' }).click();
  await page.getByRole('button', { name: '新增学员' }).click();
  // Fill real form, archive record, and assert manual scheduling refuses it.
});

test('teacher manually schedules 18:05 and parent sees only one child order history', async ({ page }) => {
  // Use both account paths against real API and assert minute time plus simulation labels.
});
```

- [ ] **Step 2: Run the new browser file and verify RED**

Run: `npm.cmd run test:e2e -- e2e/student-management.spec.js`

Expected: FAIL because management flows and locators do not exist.

- [ ] **Step 3: Add only stable test ids and responsive fixes required by tests**

Verify 390px and 1280px screenshots; assert document width does not overflow, major controls are 44px or higher, dialogs trap focus and all simulation labels are visible.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm.cmd --workspace client test
npm.cmd --workspace client run build
npm.cmd run test:server
npm.cmd run test:e2e
```

Expected: all four commands pass.

- [ ] **Step 5: Commit**

```bash
git add e2e client/src/styles.css
git commit -m "test: cover local tutoring manager workflows"
```
