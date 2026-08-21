<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { api } from './api.js';
import LessonDrawer from './components/LessonDrawer.vue';
import ParentShell from './components/ParentShell.vue';
import RoleGate from './components/RoleGate.vue';
import TeacherShell from './components/TeacherShell.vue';
import { createRoleSession } from './state/role-session.js';

const { role, accountId, select: selectRole, reset: resetRole } = createRoleSession();
const loading = ref(false); const error = ref(''); const notice = ref('');
const pendingRole = ref(null); const accountChoices = ref([]); const accountLoading = ref(false); const accountError = ref('');
const teacher = ref({ lessons: [], students: [], orders: [], suggestion: null, draft: '' });
const parent = ref({ data: null, order: null }); const selectedLesson = ref(null); const lessonTrigger = ref(null);
const workbenchDestination = ref(null);
const roleGateDestination = ref(null);
const teacherScheduleDate = ref(null);
const formatDate = (v) => new Intl.DateTimeFormat('zh-CN', { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(v));
const participants = (lesson) => lesson.participants?.map(({ student }) => student.name).join('、') ?? '学生课程';
const child = computed(() => parent.value.data?.students?.[0]);
async function loadTeacher() { const [lessons, students, orders] = await Promise.all([api.teacher.schedule(accountId.value), api.teacher.students(accountId.value), api.teacher.orders(accountId.value)]); teacher.value = { ...teacher.value, lessons, students, orders }; }
async function loadParent() { parent.value = { ...parent.value, data: await api.parent.dashboard(accountId.value) }; }
async function load() { loading.value = true; error.value = ''; try { role.value === 'teacher' ? await loadTeacher() : await loadParent(); } catch (e) { error.value = `无法加载此演示内容（${e.message}）。请启动 API 后重试。`; } finally { loading.value = false; } }
async function parse() { if (!teacher.value.draft.trim()) return; loading.value = true; error.value = ''; try { teacher.value.suggestion = (await api.teacher.parseSchedule(teacher.value.draft, accountId.value)).suggestion; } catch (e) { error.value = e.message === 'INVALID_AI_OUTPUT' ? 'AI 草稿需要修正。请换一种表述后重试。' : `AI 预览暂不可用（${e.message}）。您的描述已保留，可稍后重试。`; } finally { loading.value = false; } }
async function confirm(suggestion) { loading.value = true; error.value = ''; try { const studentIds = teacher.value.students.filter((s) => suggestion.studentNames.includes(s.name)).map((s) => s.id); await api.teacher.createLesson({ studentIds, startAt: suggestion.startAt }, accountId.value); teacherScheduleDate.value = suggestion.startAt; teacher.value.suggestion = null; teacher.value.draft = ''; notice.value = '预约已确认，并已加入课表。'; await loadTeacher(); } catch (e) { error.value = `预约未保存（${e.message}）。请检查可用课时后重试。`; } finally { loading.value = false; } }
function openLesson(lessonId, event) { lessonTrigger.value = event?.currentTarget ?? event ?? document.activeElement; selectedLesson.value = teacher.value.lessons.find((lesson) => lesson.id === lessonId) ?? null; }
function closeDrawer() {
  const trigger = lessonTrigger.value;
  selectedLesson.value = null;
  nextTick(() => requestAnimationFrame(() => trigger?.focus()));
}
async function transition(action) { if (!selectedLesson.value) return; loading.value = true; try { await api.teacher.updateLesson(selectedLesson.value.id, action, accountId.value); closeDrawer(); notice.value = `课程已${action === 'complete' ? '完成' : '取消'}。`; await loadTeacher(); } catch (e) { error.value = `无法${action === 'complete' ? '完成' : '取消'}课程（${e.message}）。`; } finally { loading.value = false; } }
async function purchase(option) { if (!child.value) return; loading.value = true; try { parent.value.order = await api.parent.createOrder({ studentId: child.value.id, packageId: option.packageId }, accountId.value); } catch (e) { error.value = `无法创建演示订单（${e.message}）。`; } finally { loading.value = false; } }
async function simulatePayment() { loading.value = true; try { parent.value.order = await api.parent.simulatePayment(parent.value.order.id, accountId.value); notice.value = '模拟付款已完成，演示课时余额已刷新。'; await loadParent(); } catch (e) { error.value = `无法完成模拟付款（${e.message}）。`; } finally { loading.value = false; } }
async function enterAccount(account) {
  if (!pendingRole.value || account.role !== pendingRole.value) return;
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
async function changeRole() { resetRole(); pendingRole.value = null; accountChoices.value = []; notice.value = ''; error.value = ''; await nextTick(); roleGateDestination.value?.focus(); }
function openManualSchedule() { notice.value = '手动排课仍在原型阶段，当前不会向服务器写入课程。'; }
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
  <main v-if="role" class="app-shell" :class="{ 'app-shell--teacher': role === 'teacher', 'app-shell--parent': role === 'parent' }" :inert="selectedLesson ? '' : undefined" :aria-hidden="selectedLesson ? 'true' : undefined">
    <TeacherShell
      v-if="role === 'teacher'"
      ref="workbenchDestination"
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
  <LessonDrawer v-if="selectedLesson" :lesson="selectedLesson" :participants="participants" :format-date="formatDate" :loading="loading" @close="closeDrawer" @cancel="transition('cancel')" @complete="transition('complete')" />
</template>
