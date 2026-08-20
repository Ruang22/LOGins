# 移动端双角色设计原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可运行、移动优先的中文设计原型：身份选择后进入教师“课堂时刻牌”或家长单孩子页面，并保留现有演示数据读取能力。

**Architecture:** 保持 Vue 单页应用和既有 API，不改变后端数据契约。将角色入口、教师工作台与家长工作台拆为独立组件；`App.vue` 只负责角色状态、加载和 API 数据。第一阶段只重构界面结构和真实数据的展示，不在此阶段增加学生和课程写接口。

**Tech Stack:** Vue 3、Vite、Vitest、Vue Test Utils、现有 Express REST API、纯 CSS。

**Spec:** `docs/superpowers/specs/2026-08-21-mobile-dual-role-workbench-design.md`

## Global Constraints

- 全部可见文案使用中文；合成演示数据和模拟支付必须持续标示。
- 手机基准宽度为 390px；同时保证 1280px 宽屏可用。
- 不使用卡片墙、渐变标题、玻璃拟态或通用仪表盘结构。
- 教师端以时间行和分钟列为主；家长端只显示一个孩子。
- 现有 AI 草稿、模拟支付、课程确认、取消与完成行为不得被破坏。
- 所有新交互必须支持键盘焦点和减少动态效果。

---

### Task 1: 角色入口状态与根组件测试

**Files:**
- Create: `client/src/App.test.js`
- Create: `client/src/state/role-session.js`
- Modify: `client/src/App.vue`

**Interfaces:**
- Produces `createRoleSession()` with `{ role: null|'teacher'|'parent', select(role), reset() }`.
- `App.vue` consumes `createRoleSession()` and renders `RoleGate` before either工作台。

- [ ] **Step 1: Write the failing test**

```js
it('先展示身份选择，选择教师后只展示教师工作台', async () => {
  const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });
  expect(wrapper.get('[data-testid="role-gate"]').text()).toContain('我是教师');
  await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
  expect(wrapper.get('[data-testid="teacher-shell"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="parent-shell"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd --workspace client test -- App.test.js`

Expected: FAIL because `RoleGate` and the role state do not exist.

- [ ] **Step 3: Write minimal implementation**

```js
import { ref } from 'vue';

export function createRoleSession() {
  const role = ref(null);
  return { role, select: (next) => { role.value = next; }, reset: () => { role.value = null; } };
}
```

Render `RoleGate` while `role` is null; render exactly one role shell otherwise.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd --workspace client test -- App.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.vue client/src/App.test.js client/src/state/role-session.js
git commit -m "feat: add role-based application entry"
```

### Task 2: 身份选择页

**Files:**
- Create: `client/src/components/RoleGate.vue`
- Create: `client/src/components/RoleGate.test.js`
- Modify: `client/src/styles.css`

**Interfaces:**
- `RoleGate` accepts no props and emits `select` with `'teacher'` or `'parent'`.
- Buttons carry `data-testid="choose-teacher"` and `data-testid="choose-parent"`.

- [ ] **Step 1: Write the failing test**

```js
it('选择家长时只发出 parent 身份', async () => {
  const wrapper = mount(RoleGate);
  await wrapper.get('[data-testid="choose-parent"]').trigger('click');
  expect(wrapper.emitted('select')).toEqual([['parent']]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd --workspace client test -- RoleGate.test.js`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Write minimal implementation**

Create a full-viewport two-choice gate. The teacher choice contains a compact minute row (`09:30 英语课`); the parent choice contains one child and remaining lessons. Use a CSS `steps()` flip only after a choice is activated, and disable it under `prefers-reduced-motion`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd --workspace client test -- RoleGate.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/RoleGate.vue client/src/components/RoleGate.test.js client/src/styles.css
git commit -m "feat: add mobile role selection gate"
```

### Task 3: 教师课堂时刻牌界面

**Files:**
- Create: `client/src/components/TeacherShell.vue`
- Create: `client/src/components/TeacherShell.test.js`
- Create: `client/src/components/ScheduleBoard.vue`
- Modify: `client/src/App.vue`
- Modify: `client/src/styles.css`

**Interfaces:**
- `TeacherShell` receives `{ lessons, students, orders, loading, error, notice }` and emits `refresh`, `open-lesson`, `open-manual-schedule`, `open-ai`, `switch-role`.
- `ScheduleBoard` receives `lessons` and emits `select-lesson` with a lesson id.
- Rows use a `HH:mm` start column, participant names, grade label and Chinese status.

- [ ] **Step 1: Write the failing test**

```js
it('按开始时间排序课程，并将 09:30 保持为分钟级文本', () => {
  const wrapper = mount(ScheduleBoard, { props: { lessons: [lateLesson, earlyLesson] } });
  expect(wrapper.getAll('[data-testid="schedule-time"]').map((node) => node.text())).toEqual(['09:30', '18:05']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd --workspace client test -- TeacherShell.test.js`

Expected: FAIL because `ScheduleBoard` does not exist.

- [ ] **Step 3: Write minimal implementation**

Replace the old teacher heading, weekly table and side grid with a mobile shell: an ink-dark schedule board, one course per structured row, a date strip, and a fixed 44px “手动排课” action. Preserve the existing AI panel behind a named secondary action and preserve the existing `LessonDrawer` trigger path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd --workspace client test -- TeacherShell.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.vue client/src/components/TeacherShell.vue client/src/components/TeacherShell.test.js client/src/components/ScheduleBoard.vue client/src/styles.css
git commit -m "feat: redesign teacher schedule as timetable board"
```

### Task 4: 家长单孩子课程轨迹

**Files:**
- Create: `client/src/components/ParentShell.vue`
- Create: `client/src/components/ParentShell.test.js`
- Modify: `client/src/App.vue`
- Modify: `client/src/styles.css`

**Interfaces:**
- `ParentShell` receives `{ dashboard, pendingOrder, loading }` and emits `refresh`, `purchase`, `simulate-payment`, `switch-role`.
- It reads only `dashboard.students[0]`; no child switcher is rendered.

- [ ] **Step 1: Write the failing test**

```js
it('只显示第一个孩子及其课程轨迹', () => {
  const wrapper = mount(ParentShell, { props: { dashboard: { students: [firstChild, secondChild], packages: [] }, pendingOrder: null, loading: false } });
  expect(wrapper.text()).toContain(firstChild.name);
  expect(wrapper.text()).not.toContain(secondChild.name);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd --workspace client test -- ParentShell.test.js`

Expected: FAIL because `ParentShell` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create a parent shell with one next-lesson rail, course-history trail, lesson balance, and a clearly labeled simulated-payment path. Do not use a statistics-card grid. The purchase control must continue to emit the unchanged catalog package object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd --workspace client test -- ParentShell.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.vue client/src/components/ParentShell.vue client/src/components/ParentShell.test.js client/src/styles.css
git commit -m "feat: add parent lesson trail experience"
```

### Task 5: 视觉验收与回归

**Files:**
- Modify: `client/src/styles.css`
- Modify: `e2e/teacher-schedule.spec.js`
- Modify: `e2e/parent-orders.spec.js`

**Interfaces:**
- Existing end-to-end paths remain valid after role selection by selecting the teacher or parent identity before assertions.

- [ ] **Step 1: Write the failing browser assertions**

```js
await page.getByTestId('choose-teacher').click();
await expect(page.getByTestId('teacher-shell')).toBeVisible();
await expect(page.getByRole('button', { name: '手动排课' })).toBeVisible();
```

- [ ] **Step 2: Run the affected test to verify it fails**

Run: `npm.cmd run test:e2e -- --grep "teacher"

Expected: FAIL because the role gate has not yet been accounted for in browser flows.

- [ ] **Step 3: Implement only required selector and responsive fixes**

Add stable test ids, ensure 390px has no horizontal page overflow, preserve 44px touch controls, and retain visible focus states. Do not add new product behavior in this task.

- [ ] **Step 4: Run all verification commands**

Run:

```bash
npm.cmd --workspace client test
npm.cmd --workspace client run build
npm.cmd run test:server
npm.cmd run test:e2e
```

Expected: all commands pass.

- [ ] **Step 5: Capture and inspect the two target widths**

Capture teacher and parent screens at 390px and 1280px. Verify that role separation is obvious, schedule times are readable, no card wall or horizontal page overflow remains, and simulated-payment labeling is present.

- [ ] **Step 6: Commit**

```bash
git add client/src/styles.css e2e/teacher-schedule.spec.js e2e/parent-orders.spec.js
git commit -m "test: cover mobile dual-role workbench"
```
