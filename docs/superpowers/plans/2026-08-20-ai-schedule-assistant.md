# AI Schedule Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-layer tutoring scheduler with teacher scheduling, parent views, simulated orders, and reviewable AI schedule parsing.

**Architecture:** `client/` is a Vue 3 application; `server/` is an Express REST API that owns every business mutation; `database/` holds PostgreSQL setup and migrations. The client never accesses PostgreSQL or secrets. Prisma transactions atomically mutate lesson credits and order status.

**Tech Stack:** Vue 3, Vite, JavaScript, Pinia, Node.js, Express, Prisma, PostgreSQL, Docker Compose, Vitest, Supertest, Playwright, Zod.

**Spec:** `docs/superpowers/specs/2026-08-20-ai-schedule-assistant-design.md`

## Global Constraints

- Use synthetic demonstration data only and label it in the UI.
- Every lesson is 60 minutes; `startAt` is ISO 8601 with minute precision.
- Only the server changes credits, lessons, orders, or role-scoped data.
- Model and database secrets live in server environment variables and are Git-ignored.
- Simulated payment is visibly labeled; it does not claim real payment acceptance.

---

### Task 1: Scaffold independent client, server, and database layers

**Files:**
- Create: `package.json`, `docker-compose.yml`, `.gitignore`, `.env.example`
- Create: `client/package.json`, `client/vite.config.js`, `client/src/main.js`
- Create: `server/package.json`, `server/src/app.js`, `server/test/health.test.js`
- Create: `database/README.md`

**Interfaces:** Produces `GET /health` returning `{ status: 'ok' }`.

- [ ] **Step 1: Write the failing health test**

```js
import request from 'supertest';
import { createApp } from '../src/app.js';
test('health returns ok', async () => {
  await request(createApp()).get('/health').expect(200, { status: 'ok' });
});
```

- [ ] **Step 2: Run it**

Run: `cd server && npm test -- health.test.js`
Expected: FAIL because `createApp` is missing.

- [ ] **Step 3: Implement and verify**

```js
export function createApp() {
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
```

Run: `cd server && npm test -- health.test.js && cd .. && docker compose up -d db`
Expected: test PASS and PostgreSQL starts.

- [ ] **Step 4: Commit**

Run: `git add . && git commit -m "chore: scaffold separated application layers"`

### Task 2: Define PostgreSQL data and seed synthetic accounts

**Files:**
- Create: `server/prisma/schema.prisma`, `server/prisma/seed.js`, `server/src/db/client.js`
- Create: `server/test/seed.test.js`
- Modify: `database/README.md`

**Interfaces:** Creates `User`, `Student`, `Lesson`, `LessonParticipant`, and `Order` records. `LessonParticipant` uses `{ lessonId, studentId }` as its composite key.

- [ ] **Step 1: Write the failing seed test**

```js
test('seed creates teacher, parent, and student records', async () => {
  await seedDatabase(prisma);
  expect(await prisma.user.count({ where: { role: 'teacher' } })).toBe(1);
  expect(await prisma.student.count()).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run it**

Run: `cd server && npm test -- seed.test.js`
Expected: FAIL because schema and `seedDatabase` are missing.

- [ ] **Step 3: Implement the relation that enables group lessons**

```prisma
model LessonParticipant {
  lessonId String
  studentId String
  lesson Lesson @relation(fields: [lessonId], references: [id])
  student Student @relation(fields: [studentId], references: [id])
  @@id([lessonId, studentId])
}
```

- [ ] **Step 4: Migrate, seed, and verify**

Run: `cd server && npx prisma migrate dev --name initial_schema && npx prisma db seed && npm test -- seed.test.js`
Expected: migration, seed, and test PASS.

- [ ] **Step 5: Commit**

Run: `git add server/prisma server/src/db database server/test/seed.test.js && git commit -m "feat: add tutoring database schema"`

### Task 3: Implement transactional scheduling rules

**Files:**
- Create: `server/src/services/scheduling-service.js`, `server/test/scheduling-service.test.js`

**Interfaces:** `createReservation({ studentIds, startAt }, actor)` and `transitionLesson({ lessonId, action }, actor)`. Errors expose `GRADE_MISMATCH`, `NO_CREDITS`, `TIME_CONFLICT`, or `INVALID_TIME`.

- [ ] **Step 1: Write failing business-rule tests**

```js
test('rejects mixed-grade groups', async () => {
  await expect(createReservation({ studentIds: ['g7', 'g8'], startAt: '2026-09-03T18:30:00+08:00' }, teacher))
    .rejects.toMatchObject({ code: 'GRADE_MISMATCH' });
});
test('completion transfers one reserved credit to attended', async () => {
  const lesson = await createReservation({ studentIds: ['g7a'], startAt }, teacher);
  await transitionLesson({ lessonId: lesson.id, action: 'complete' }, teacher);
  expect(await credits('g7a')).toEqual({ total: 10, reserved: 0, attended: 1 });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npm test -- scheduling-service.test.js`
Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement one database transaction per mutation**

```js
return prisma.$transaction(async (tx) => {
  // validate one grade, available credits, and teacher time conflict
  // create the lesson and participants; increment every reservedCredits value
});
```

- [ ] **Step 4: Verify all transitions**

Run: `cd server && npm test -- scheduling-service.test.js`
Expected: PASS for individual lesson, group lesson, insufficient balance, conflict, completion, and cancellation.

- [ ] **Step 5: Commit**

Run: `git add server/src/services server/test/scheduling-service.test.js && git commit -m "feat: enforce lesson scheduling rules"`

### Task 4: Add role-scoped teacher and parent APIs

**Files:**
- Create: `server/src/middleware/demo-auth.js`, `server/src/routes/teacher-routes.js`, `server/src/routes/parent-routes.js`
- Create: `server/test/teacher-routes.test.js`, `server/test/parent-routes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Teacher: `GET /api/teacher/schedule`, `GET /api/teacher/students`, `POST /api/teacher/lessons`, `PATCH /api/teacher/lessons/:id`.
- Parent: `GET /api/parent/dashboard`.

- [ ] **Step 1: Write failing authorization tests**

```js
test('a parent cannot call teacher schedule', async () => {
  await request(app).get('/api/teacher/schedule').set('x-demo-user', 'parent-demo').expect(403, { code: 'FORBIDDEN' });
});
test('parent dashboard contains only the parent student', async () => {
  const response = await request(app).get('/api/parent/dashboard').set('x-demo-user', 'parent-demo').expect(200);
  expect(response.body.students).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npm test -- teacher-routes.test.js parent-routes.test.js`
Expected: FAIL with 404.

- [ ] **Step 3: Implement server role filtering**

```js
export const requireRole = (role) => (req, res, next) =>
  req.demoUser?.role === role ? next() : res.status(403).json({ code: 'FORBIDDEN' });
```

- [ ] **Step 4: Verify server suite**

Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add server/src server/test && git commit -m "feat: add role-scoped scheduling APIs"`

### Task 5: Add simulated package orders with idempotent crediting

**Files:**
- Create: `server/src/services/order-service.js`, `server/src/routes/order-routes.js`, `server/test/order-service.test.js`
- Modify: `server/src/app.js`

**Interfaces:** `createOrder(input, parent)`, `confirmSimulationOrder(orderId, actor)`, `POST /api/parent/orders`, and `POST /api/parent/orders/:id/simulate-payment`.

- [ ] **Step 1: Write the failing idempotency test**

```js
test('a simulation order can add credits only once', async () => {
  const order = await createOrder(input, parent);
  await confirmSimulationOrder(order.id, parent);
  await expect(confirmSimulationOrder(order.id, parent)).rejects.toMatchObject({ code: 'ORDER_NOT_PENDING' });
});
```

- [ ] **Step 2: Run it**

Run: `cd server && npm test -- order-service.test.js`
Expected: FAIL because order service is missing.

- [ ] **Step 3: Implement atomic confirmation**

```js
return prisma.$transaction(async (tx) => {
  const order = await tx.order.update({ where: { id: orderId, status: 'pending' }, data: { status: 'paid', paidAt: new Date() } });
  return tx.student.update({ where: { id: order.studentId }, data: { totalCredits: { increment: order.credits } } });
});
```

- [ ] **Step 4: Verify order tests**

Run: `cd server && npm test -- order-service.test.js`
Expected: PASS for pending, paid, duplicate confirmation, and incorrect-parent cases.

- [ ] **Step 5: Commit**

Run: `git add server/src/services server/src/routes server/test/order-service.test.js && git commit -m "feat: add simulated lesson package orders"`

### Task 6: Add validated AI schedule parsing

**Files:**
- Create: `server/src/schemas/schedule-schema.js`, `server/src/services/ai-provider.js`, `server/src/routes/ai-routes.js`, `server/test/ai-routes.test.js`
- Modify: `server/src/app.js`, `.env.example`

**Interfaces:** `POST /api/ai/parse-schedule` receives `{ text }` and returns an unsaved `suggestion`.

- [ ] **Step 1: Write the failing malformed-output test**

```js
test('invalid AI output creates no lesson', async () => {
  provider.reply = '{"startAt":"invalid"}';
  await request(app).post('/api/ai/parse-schedule').send({ text: '周三排课' }).expect(422, { code: 'INVALID_AI_OUTPUT' });
  expect(await prisma.lesson.count()).toBe(0);
});
```

- [ ] **Step 2: Run it**

Run: `cd server && npm test -- ai-routes.test.js`
Expected: FAIL because endpoint is missing.

- [ ] **Step 3: Validate structured output with Zod**

```js
export const scheduleSchema = z.object({
  courseName: z.string().min(1),
  startAt: z.string().datetime({ offset: true }),
  studentNames: z.array(z.string().min(1)).min(1),
});
```

- [ ] **Step 4: Verify AI tests**

Run: `cd server && npm test -- ai-routes.test.js`
Expected: PASS for valid response, malformed response, timeout, and zero mutation.

- [ ] **Step 5: Commit**

Run: `git add server/src .env.example server/test/ai-routes.test.js && git commit -m "feat: add reviewable AI schedule parsing"`

### Task 7: Build the teacher and parent interfaces

**Files:**
- Create: `client/src/api/http.js`, `client/src/stores/session-store.js`, `client/src/stores/teacher-store.js`, `client/src/stores/parent-store.js`
- Create: `client/src/components/WeekSchedule.vue`, `StudentLedger.vue`, `AiSchedulePanel.vue`, `LessonDrawer.vue`, `ParentDashboard.vue`, `PackageOrder.vue`
- Create: `client/src/styles/tokens.css`, `client/src/styles/app.css`, `client/src/components/AiSchedulePanel.test.js`

**Interfaces:** `AiSchedulePanel` emits `confirm({ studentIds, startAt })` only after an explicit confirmation click.

- [ ] **Step 1: Write the failing confirmation test**

```js
test('does not save an AI suggestion before confirmation', async () => {
  const view = render(AiSchedulePanel, { props: { suggestion } });
  expect(view.emitted('confirm')).toBeUndefined();
  await fireEvent.click(screen.getByText('确认添加'));
  expect(view.emitted('confirm')).toHaveLength(1);
});
```

- [ ] **Step 2: Run it**

Run: `cd client && npm test -- AiSchedulePanel.test.js`
Expected: FAIL because component is missing.

- [ ] **Step 3: Implement the approved Operate-mode UI**

```vue
<WeekSchedule :lessons="teacher.lessons" @select="teacher.selectLesson" />
<AiSchedulePanel @confirm="teacher.createLesson" />
<StudentLedger :students="teacher.students" />
```

- [ ] **Step 4: Verify client tests and production build**

Run: `cd client && npm test && npm run build`
Expected: PASS; UI labels payment and records as synthetic demonstration data.

- [ ] **Step 5: Commit**

Run: `git add client && git commit -m "feat: add teacher and parent workspaces"`

### Task 8: Run end-to-end, accessibility, and release checks

**Files:**
- Create: `e2e/scheduling.spec.js`, `e2e/orders.spec.js`
- Modify: `README.md`

**Interfaces:** End-to-end suite covers one student reservation, same-grade group reservation, conflict rejection, insufficient credits, completion, simulated payment, and parent isolation.

- [ ] **Step 1: Write the group reservation scenario**

```js
test('teacher schedules same-grade group after AI preview confirmation', async ({ page }) => {
  await page.getByLabel('排课描述').fill('给初二王小明和李小雨周三 18:30 排英语课');
  await page.getByRole('button', { name: '确认添加' }).click();
  await expect(page.getByText('初二 · 2 人')).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx playwright test e2e/scheduling.spec.js`
Expected: FAIL before E2E configuration and UI implementation.

- [ ] **Step 3: Add Playwright configuration, scenarios, and runbook**

```md
## Demo accounts
Teacher: `teacher-demo`
Parent: `parent-demo`
All displayed records and payment results are synthetic.
```

- [ ] **Step 4: Run complete verification**

Run: `cd server && npm test`; `cd ../client && npm test && npm run build`; `cd .. && npx playwright test`
Expected: all commands PASS.

- [ ] **Step 5: Commit**

Run: `git add e2e README.md && git commit -m "test: cover tutoring workflow end to end"`
