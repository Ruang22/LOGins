<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { api } from './api.js';
import { formatBusinessDate } from './business-time.js';
import LessonDrawer from './components/LessonDrawer.vue';
import ManualScheduleSheet from './components/ManualScheduleSheet.vue';
import ParentShell from './components/ParentShell.vue';
import RoleGate from './components/RoleGate.vue';
import StudentManager from './components/StudentManager.vue';
import TeacherOrderSheet from './components/TeacherOrderSheet.vue';
import TeacherShell from './components/TeacherShell.vue';
import { createRoleSession } from './state/role-session.js';

const { role, accountId, select: selectRole, reset: resetRole } = createRoleSession();
const loading = ref(false); const error = ref(''); const notice = ref('');
const pendingRole = ref(null); const accountChoices = ref([]); const accountLoading = ref(false); const accountError = ref('');
const emptyTeacher = () => ({ lessons: [], students: [], orders: [], suggestion: null, draft: '' });
const emptyParent = () => ({ data: null, order: null });
const teacher = ref(emptyTeacher());
const parent = ref(emptyParent()); const selectedLesson = ref(null); const lessonTrigger = ref(null);
const drawerError = ref('');
const workflow = ref(null); const workflowLesson = ref(null); const workflowTrigger = ref(null);
const workbenchDestination = ref(null);
const roleGateDestination = ref(null);
const teacherScheduleDate = ref(null);
const formatDate = (v) => formatBusinessDate(v, { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const participants = (lesson) => lesson.participants?.map(({ student }) => student.name).join('、') ?? '学生课程';
const child = computed(() => parent.value.data?.students?.[0]);
const activeStudents = computed(() => teacher.value.students.filter(({ isActive }) => isActive !== false));
let accountEpoch = 0;
function clearAccountState() {
  accountEpoch += 1;
  teacher.value = emptyTeacher();
  parent.value = emptyParent();
  selectedLesson.value = null;
  lessonTrigger.value = null;
  drawerError.value = '';
  workflow.value = null;
  workflowLesson.value = null;
  workflowTrigger.value = null;
  teacherScheduleDate.value = null;
  error.value = '';
  notice.value = '';
  loading.value = false;
}
function isCurrentAccount(epoch, expectedRole, expectedAccountId) {
  return epoch === accountEpoch && role.value === expectedRole && accountId.value === expectedAccountId;
}
function isCurrentEpoch(epoch) {
  return epoch === accountEpoch;
}
async function loadTeacher(epoch = accountEpoch, expectedAccountId = accountId.value) {
  const [lessons, students, orders] = await Promise.all([
    api.teacher.schedule(expectedAccountId),
    api.teacher.students(expectedAccountId),
    api.teacher.orders(expectedAccountId),
  ]);
  if (isCurrentAccount(epoch, 'teacher', expectedAccountId)) teacher.value = { ...teacher.value, lessons, students, orders };
}
async function loadParent(epoch = accountEpoch, expectedAccountId = accountId.value) {
  const data = await api.parent.dashboard(expectedAccountId);
  if (isCurrentAccount(epoch, 'parent', expectedAccountId)) parent.value = { ...parent.value, data };
}
async function load() {
  const epoch = accountEpoch;
  const expectedRole = role.value;
  const expectedAccountId = accountId.value;
  loading.value = true;
  error.value = '';
  try {
    expectedRole === 'teacher'
      ? await loadTeacher(epoch, expectedAccountId)
      : await loadParent(epoch, expectedAccountId);
  } catch (e) {
    if (isCurrentAccount(epoch, expectedRole, expectedAccountId)) error.value = `无法加载此演示内容（${e.message}）。请启动 API 后重试。`;
  } finally {
    if (isCurrentAccount(epoch, expectedRole, expectedAccountId)) loading.value = false;
  }
}
async function parse() {
  if (!teacher.value.draft.trim()) return;
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  const draft = teacher.value.draft;
  loading.value = true;
  error.value = '';
  try {
    const result = await api.teacher.parseSchedule(draft, expectedAccountId);
    if (isCurrentEpoch(epoch)) teacher.value.suggestion = result.suggestion;
  } catch (e) {
    if (isCurrentEpoch(epoch)) error.value = e.message === 'INVALID_AI_OUTPUT' ? 'AI 草稿需要修正。请换一种表述后重试。' : `AI 预览暂不可用（${e.message}）。您的描述已保留，可稍后重试。`;
  } finally {
    if (isCurrentEpoch(epoch)) loading.value = false;
  }
}
async function confirm(suggestion) {
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  loading.value = true;
  error.value = '';
  try {
    const studentIds = teacher.value.students.filter((s) => suggestion.studentNames.includes(s.name)).map((s) => s.id);
    await api.teacher.createLesson({ studentIds, startAt: suggestion.startAt }, expectedAccountId);
    if (!isCurrentEpoch(epoch)) return;
    teacherScheduleDate.value = suggestion.startAt;
    teacher.value.suggestion = null;
    teacher.value.draft = '';
    notice.value = '预约已确认，并已加入课表。';
    await loadTeacher(epoch, expectedAccountId);
  } catch (e) {
    if (isCurrentEpoch(epoch)) error.value = `预约未保存（${e.message}）。请检查可用课时后重试。`;
  } finally {
    if (isCurrentEpoch(epoch)) loading.value = false;
  }
}
function openLesson(lessonId, event) { error.value = ''; drawerError.value = ''; lessonTrigger.value = event?.currentTarget ?? event ?? document.activeElement; selectedLesson.value = teacher.value.lessons.find((lesson) => lesson.id === lessonId) ?? null; }
function closeDrawer() {
  const trigger = lessonTrigger.value;
  selectedLesson.value = null;
  drawerError.value = '';
  nextTick(() => requestAnimationFrame(() => trigger?.focus()));
}
function openWorkflow(name, event, lesson = null) {
  error.value = '';
  workflowTrigger.value = event?.currentTarget ?? event ?? document.activeElement;
  workflowLesson.value = lesson;
  workflow.value = name;
}
function closeWorkflow() {
  const trigger = workflowTrigger.value;
  workflow.value = null;
  workflowLesson.value = null;
  workflowTrigger.value = null;
  nextTick(() => requestAnimationFrame(() => trigger?.focus()));
}
function openManualSchedule(event) { openWorkflow('schedule', event); }
function openStudentManager(event) { openWorkflow('students', event); }
function openTeacherOrder(event) { openWorkflow('order', event); }
function editSelectedLesson() {
  const lesson = selectedLesson.value;
  const trigger = lessonTrigger.value;
  selectedLesson.value = null;
  drawerError.value = '';
  lessonTrigger.value = null;
  openWorkflow('schedule', trigger, lesson);
}
async function saveManualLesson(payload) {
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  loading.value = true; error.value = '';
  try {
    const editingLesson = workflowLesson.value;
    if (editingLesson) await api.teacher.editLesson(editingLesson.id, payload, expectedAccountId);
    else await api.teacher.createLesson(payload, expectedAccountId);
    if (!isCurrentEpoch(epoch)) return;
    teacherScheduleDate.value = payload.startAt;
    await loadTeacher(epoch, expectedAccountId);
    if (!isCurrentEpoch(epoch)) return;
    notice.value = editingLesson ? '课程修改已保存。' : '手动排课已保存。';
    closeWorkflow();
  } catch (e) {
    if (isCurrentEpoch(epoch)) error.value = `无法保存课程（${e.message}）。请检查年级、课时与时间冲突。`;
  } finally { if (isCurrentEpoch(epoch)) loading.value = false; }
}
async function createStudent(payload) {
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  loading.value = true; error.value = '';
  try { await api.teacher.createStudent(payload, expectedAccountId); if (!isCurrentEpoch(epoch)) return; await loadTeacher(epoch, expectedAccountId); if (!isCurrentEpoch(epoch)) return; notice.value = '学员已新增。'; closeWorkflow(); }
  catch (e) { if (isCurrentEpoch(epoch)) error.value = `无法新增学员（${e.message}）。`; }
  finally { if (isCurrentEpoch(epoch)) loading.value = false; }
}
async function updateStudent({ id, input }) {
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  loading.value = true; error.value = '';
  try { await api.teacher.updateStudent(id, input, expectedAccountId); if (!isCurrentEpoch(epoch)) return; await loadTeacher(epoch, expectedAccountId); if (!isCurrentEpoch(epoch)) return; notice.value = '学员资料已更新。'; closeWorkflow(); }
  catch (e) { if (isCurrentEpoch(epoch)) error.value = `无法更新学员（${e.message}）。`; }
  finally { if (isCurrentEpoch(epoch)) loading.value = false; }
}
async function archiveStudent(id) {
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  loading.value = true; error.value = '';
  try { await api.teacher.archiveStudent(id, expectedAccountId); if (!isCurrentEpoch(epoch)) return; await loadTeacher(epoch, expectedAccountId); if (!isCurrentEpoch(epoch)) return; notice.value = '学员已停用，历史记录仍保留。'; closeWorkflow(); }
  catch (e) { if (isCurrentEpoch(epoch)) error.value = `无法停用学员（${e.message}）。`; }
  finally { if (isCurrentEpoch(epoch)) loading.value = false; }
}
async function createManualOrder(payload) {
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  loading.value = true; error.value = '';
  try { await api.teacher.createManualOrder(payload, expectedAccountId); if (!isCurrentEpoch(epoch)) return; await loadTeacher(epoch, expectedAccountId); if (!isCurrentEpoch(epoch)) return; notice.value = '扫码登记（模拟）订单已创建，等待明确确认。'; closeWorkflow(); }
  catch (e) { if (isCurrentEpoch(epoch)) error.value = `无法登记订单（${e.message}）。`; }
  finally { if (isCurrentEpoch(epoch)) loading.value = false; }
}
async function confirmManualOrder(id, event) {
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  const trigger = event?.currentTarget ?? event;
  loading.value = true; error.value = '';
  try {
    await api.teacher.confirmManualOrder(id, expectedAccountId);
    if (!isCurrentEpoch(epoch)) return;
    await loadTeacher(epoch, expectedAccountId);
    if (!isCurrentEpoch(epoch)) return;
    notice.value = '扫码登记（模拟）已确认，服务器课时余额已刷新。';
    await nextTick();
    requestAnimationFrame(() => trigger?.focus());
  } catch (e) { if (isCurrentEpoch(epoch)) error.value = `无法确认订单（${e.message}）。`; }
  finally { if (isCurrentEpoch(epoch)) loading.value = false; }
}
async function transition(action) {
  if (!selectedLesson.value) return;
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  const lessonId = selectedLesson.value.id;
  loading.value = true;
  drawerError.value = '';
  try {
    try {
      await api.teacher.updateLesson(lessonId, action, expectedAccountId);
    } catch (e) {
      if (isCurrentEpoch(epoch)) drawerError.value = `无法${action === 'complete' ? '完成' : '取消'}课程（${e.message}）。`;
      return;
    }
    if (!isCurrentEpoch(epoch)) return;
    const savedStatus = action === 'complete' ? 'completed' : 'cancelled';
    teacher.value.lessons = teacher.value.lessons.map((lesson) => (
      lesson.id === lessonId ? { ...lesson, status: savedStatus } : lesson
    ));
    selectedLesson.value = { ...selectedLesson.value, status: savedStatus };
    try {
      await loadTeacher(epoch, expectedAccountId);
    } catch (e) {
      if (isCurrentEpoch(epoch)) {
        drawerError.value = `课程状态已保存，但课表刷新失败（${e.message}）。请关闭详情后使用“刷新”重试。`;
      }
      return;
    }
    if (!isCurrentEpoch(epoch)) return;
    closeDrawer();
    notice.value = `课程已${action === 'complete' ? '完成' : '取消'}。`;
  } finally {
    if (isCurrentEpoch(epoch)) loading.value = false;
  }
}
async function purchase(option) {
  if (!child.value) return;
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  const studentId = child.value.id;
  loading.value = true;
  try {
    const order = await api.parent.createOrder({ studentId, packageId: option.packageId }, expectedAccountId);
    if (isCurrentEpoch(epoch)) parent.value.order = order;
  } catch (e) {
    if (isCurrentEpoch(epoch)) error.value = `无法创建演示订单（${e.message}）。`;
  } finally {
    if (isCurrentEpoch(epoch)) loading.value = false;
  }
}
async function simulatePayment() {
  const epoch = accountEpoch;
  const expectedAccountId = accountId.value;
  const orderId = parent.value.order.id;
  loading.value = true;
  try {
    const order = await api.parent.simulatePayment(orderId, expectedAccountId);
    if (!isCurrentEpoch(epoch)) return;
    parent.value.order = order;
    notice.value = '模拟付款已完成，演示课时余额已刷新。';
    await loadParent(epoch, expectedAccountId);
  } catch (e) {
    if (isCurrentEpoch(epoch)) error.value = `无法完成模拟付款（${e.message}）。`;
  } finally {
    if (isCurrentEpoch(epoch)) loading.value = false;
  }
}
async function enterAccount(account) {
  if (!pendingRole.value || account.role !== pendingRole.value) return;
  clearAccountState();
  selectRole({ role: pendingRole.value, accountId: account.id });
  pendingRole.value = null;
  accountChoices.value = [];
  notice.value = '';
  error.value = '';
  await nextTick();
  workbenchDestination.value?.focus();
  await load();
}
async function select(next) {
  pendingRole.value = next;
  accountChoices.value = [];
  accountError.value = '';
  accountLoading.value = true;
  try {
    accountChoices.value = await api.accounts(next);
    if (accountChoices.value.length === 1) await enterAccount(accountChoices.value[0]);
    else if (accountChoices.value.length === 0) accountError.value = '没有可用的本地账户。';
  } catch (e) {
    accountError.value = `无法加载本地账户（${e.message}）。`;
  } finally {
    accountLoading.value = false;
  }
}
async function cancelAccountChoice() {
  pendingRole.value = null;
  accountChoices.value = [];
  accountError.value = '';
  await nextTick();
  roleGateDestination.value?.focus();
}
async function changeRole() { clearAccountState(); resetRole(); pendingRole.value = null; accountChoices.value = []; await nextTick(); roleGateDestination.value?.focus(); }
function openAi() { notice.value = 'AI 只生成待确认草稿；确认前不会更改课表或课时。'; }
onMounted(() => {
  if (role.value && accountId.value) load();
});
</script>

<template>
  <Transition name="role-depart">
    <RoleGate v-if="!role && !pendingRole" ref="roleGateDestination" @select="select" />
  </Transition>
  <section v-if="!role && pendingRole" class="role-gate" data-testid="account-gate" aria-labelledby="account-gate-title">
    <div class="role-gate__content">
      <div class="role-gate__intro">
        <p>本地账户</p>
        <h1 id="account-gate-title">选择{{ pendingRole === 'teacher' ? '教师' : '家长' }}账户</h1>
        <p>选择后仅显示该账户可访问的数据。</p>
      </div>
      <p v-if="accountLoading" role="status">正在加载账户…</p>
      <p v-else-if="accountError" role="alert">{{ accountError }}</p>
      <div v-else class="role-board" aria-label="本地账户列表">
        <button
          v-for="account in accountChoices"
          :key="account.id"
          class="role-choice"
          type="button"
          :data-account-id="account.id"
          @click="enterAccount(account)"
        >
          <span class="role-choice__face">
            <span class="role-choice__body">
              <span class="role-choice__title">{{ account.name }}</span>
              <span class="role-choice__minute">{{ account.email }}</span>
            </span>
            <span class="role-choice__arrow" aria-hidden="true">→</span>
          </span>
        </button>
      </div>
      <button class="secondary" type="button" @click="cancelAccountChoice">返回身份选择</button>
    </div>
  </section>
  <main v-if="role" class="app-shell" :class="{ 'app-shell--teacher': role === 'teacher', 'app-shell--parent': role === 'parent' }" :inert="selectedLesson || workflow ? '' : undefined" :aria-hidden="selectedLesson || workflow ? 'true' : undefined">
    <TeacherShell
      v-if="role === 'teacher'"
      ref="workbenchDestination"
      :account-id="accountId"
      :lessons="teacher.lessons"
      :students="teacher.students"
      :orders="teacher.orders"
      :loading="loading"
      :error="error"
      :notice="notice"
      :suggestion="teacher.suggestion"
      :draft="teacher.draft"
      :schedule-date="teacherScheduleDate"
      @refresh="loadTeacher"
      @open-lesson="openLesson"
      @open-manual-schedule="openManualSchedule"
      @open-student-manager="openStudentManager"
      @open-teacher-order="openTeacherOrder"
      @confirm-manual-order="confirmManualOrder"
      @open-ai="openAi"
      @switch-role="changeRole"
      @update:draft="teacher.draft = $event"
      @parse-ai="parse"
      @confirm-ai="confirm"
      @dismiss-ai="teacher.suggestion = null"
      @update:schedule-date="teacherScheduleDate = $event"
    />
    <ParentShell
      v-else
      ref="workbenchDestination"
      :dashboard="parent.data"
      :pending-order="parent.order"
      :loading="loading"
      @refresh="loadParent"
      @purchase="purchase"
      @simulate-payment="simulatePayment"
      @switch-role="changeRole"
    >
      <p v-if="error" class="parent-message parent-message--error" role="alert">{{ error }}</p>
      <p v-if="notice" class="parent-message parent-message--notice" role="status">{{ notice }}</p>
    </ParentShell>
  </main>
  <LessonDrawer v-if="selectedLesson" :lesson="selectedLesson" :participants="participants" :format-date="formatDate" :loading="loading" :error="drawerError" @close="closeDrawer" @edit="editSelectedLesson" @cancel="transition('cancel')" @complete="transition('complete')" />
  <StudentManager
    v-if="workflow === 'students'"
    :students="teacher.students"
    :loading="loading"
    :error="error"
    @create="createStudent"
    @update="updateStudent"
    @archive="archiveStudent"
    @close="closeWorkflow"
  />
  <ManualScheduleSheet
    v-if="workflow === 'schedule'"
    :students="activeStudents"
    :lesson="workflowLesson"
    :loading="loading"
    :error="error"
    @save="saveManualLesson"
    @close="closeWorkflow"
  />
  <TeacherOrderSheet
    v-if="workflow === 'order'"
    :students="activeStudents"
    :loading="loading"
    :error="error"
    @save="createManualOrder"
    @close="closeWorkflow"
  />
</template>
