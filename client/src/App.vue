<script setup>
import { computed, nextTick, ref } from 'vue';
import { api } from './api.js';
import LessonDrawer from './components/LessonDrawer.vue';
import RoleGate from './components/RoleGate.vue';
import TeacherShell from './components/TeacherShell.vue';
import { createRoleSession } from './state/role-session.js';

const { role, select: selectRole, reset: resetRole } = createRoleSession();
const loading = ref(false); const error = ref(''); const notice = ref('');
const teacher = ref({ lessons: [], students: [], orders: [], suggestion: null, draft: '' });
const parent = ref({ data: null, order: null }); const selectedLesson = ref(null); const lessonTrigger = ref(null);
const workbenchDestination = ref(null);
const available = (s) => s.totalCredits - s.attendedCredits - s.reservedCredits;
const formatDate = (v) => new Intl.DateTimeFormat('zh-CN', { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(v));
const money = (c) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(c / 100);
const participants = (lesson) => lesson.participants?.map(({ student }) => student.name).join('、') ?? '学生课程';
const lessonStatus = (status) => ({ scheduled: '已排课', completed: '已完成', cancelled: '已取消' }[status] ?? status);
const orderStatus = (status) => ({ pending: '待支付', paid: '已支付' }[status] ?? status);
const paymentMode = (mode) => ({ simulation: '模拟支付', simulated: '模拟支付' }[mode] ?? mode);
const child = computed(() => parent.value.data?.students?.[0]);
const packages = computed(() => parent.value.data?.packages ?? []);
async function loadTeacher() { const [lessons, students, orders] = await Promise.all([api.teacher.schedule(), api.teacher.students(), api.teacher.orders()]); teacher.value = { ...teacher.value, lessons, students, orders }; }
async function loadParent() { parent.value = { ...parent.value, data: await api.parent.dashboard() }; }
async function load() { loading.value = true; error.value = ''; try { role.value === 'teacher' ? await loadTeacher() : await loadParent(); } catch (e) { error.value = `无法加载此演示内容（${e.message}）。请启动 API 后重试。`; } finally { loading.value = false; } }
async function parse() { if (!teacher.value.draft.trim()) return; loading.value = true; error.value = ''; try { teacher.value.suggestion = (await api.teacher.parseSchedule(teacher.value.draft)).suggestion; } catch (e) { error.value = e.message === 'INVALID_AI_OUTPUT' ? 'AI 草稿需要修正。请换一种表述后重试。' : `AI 预览暂不可用（${e.message}）。您的描述已保留，可稍后重试。`; } finally { loading.value = false; } }
async function confirm(suggestion) { loading.value = true; error.value = ''; try { const studentIds = teacher.value.students.filter((s) => suggestion.studentNames.includes(s.name)).map((s) => s.id); await api.teacher.createLesson({ studentIds, startAt: suggestion.startAt }); teacher.value.suggestion = null; teacher.value.draft = ''; notice.value = '预约已确认，并已加入课表。'; await loadTeacher(); } catch (e) { error.value = `预约未保存（${e.message}）。请检查可用课时后重试。`; } finally { loading.value = false; } }
function openLesson(lessonId, event) { lessonTrigger.value = event?.currentTarget ?? event ?? document.activeElement; selectedLesson.value = teacher.value.lessons.find((lesson) => lesson.id === lessonId) ?? null; }
function closeDrawer() {
  const trigger = lessonTrigger.value;
  selectedLesson.value = null;
  nextTick(() => requestAnimationFrame(() => trigger?.focus()));
}
async function transition(action) { if (!selectedLesson.value) return; loading.value = true; try { await api.teacher.updateLesson(selectedLesson.value.id, action); closeDrawer(); notice.value = `课程已${action === 'complete' ? '完成' : '取消'}。`; await loadTeacher(); } catch (e) { error.value = `无法${action === 'complete' ? '完成' : '取消'}课程（${e.message}）。`; } finally { loading.value = false; } }
async function purchase(option) { if (!child.value) return; loading.value = true; try { parent.value.order = await api.parent.createOrder({ studentId: child.value.id, packageId: option.packageId }); } catch (e) { error.value = `无法创建演示订单（${e.message}）。`; } finally { loading.value = false; } }
async function simulatePayment() { loading.value = true; try { parent.value.order = await api.parent.simulatePayment(parent.value.order.id); notice.value = '模拟付款已完成，演示课时余额已刷新。'; await loadParent(); } catch (e) { error.value = `无法完成模拟付款（${e.message}）。`; } finally { loading.value = false; } }
async function select(next) { selectRole(next); notice.value = ''; error.value = ''; await nextTick(); workbenchDestination.value?.focus(); load(); }
function changeRole() { resetRole(); notice.value = ''; error.value = ''; }
function openManualSchedule() { notice.value = '手动排课仍在原型阶段，当前不会向服务器写入课程。'; }
function openAi() { notice.value = 'AI 只生成待确认草稿；确认前不会更改课表或课时。'; }
</script>

<template>
  <Transition name="role-depart">
    <RoleGate v-if="!role" @select="select" />
  </Transition>
  <main v-if="role" class="app-shell" :class="{ 'app-shell--teacher': role === 'teacher' }" :inert="selectedLesson ? '' : undefined" :aria-hidden="selectedLesson ? 'true' : undefined">
    <header v-if="role === 'parent'" class="topbar"><a class="wordmark" href="#" @click.prevent="changeRole">Lessonline<span>AI</span></a><nav aria-label="工作区"><button :class="{ active: role === 'teacher' }" @click="select('teacher')">教师工作台</button><button :class="{ active: role === 'parent' }" @click="select('parent')">家长中心</button><button @click="changeRole">切换身份</button></nav><span class="demo-label">合成演示数据</span></header>
    <p v-if="role === 'parent' && error" class="status error" role="alert">{{ error }}</p><p v-if="role === 'parent' && notice" class="status notice" role="status">{{ notice }}</p>
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
      @refresh="loadTeacher"
      @open-lesson="openLesson"
      @open-manual-schedule="openManualSchedule"
      @open-ai="openAi"
      @switch-role="changeRole"
      @update:draft="teacher.draft = $event"
      @parse-ai="parse"
      @confirm-ai="confirm"
      @dismiss-ai="teacher.suggestion = null"
    />
    <section v-else class="parent-dashboard" data-testid="parent-shell"><div class="workbench-heading"><div><h1 ref="workbenchDestination" tabindex="-1" data-testid="workbench-destination">家庭课程中心</h1><p>这里仅显示属于此演示家长账户的学生。</p></div><button class="button quiet" :disabled="loading" @click="loadParent">刷新</button></div><div v-if="child" class="parent-grid"><section class="child-summary"><p class="student-name">{{ child.name }}</p><h2>{{ child.grade }} 年级英语</h2><div class="credit-balance"><strong>{{ available(child) }}</strong><span>节可用课程</span></div><dl><div><dt>已购</dt><dd>{{ child.totalCredits }}</dd></div><div><dt>已预约</dt><dd>{{ child.reservedCredits }}</dd></div><div><dt>已上课</dt><dd>{{ child.attendedCredits }}</dd></div></dl></section><section class="parent-lessons"><h2>本周与历史课程</h2><ul v-if="child.lessons.length"><li v-for="lesson in child.lessons" :key="lesson.id"><strong>{{ formatDate(lesson.startsAt) }}</strong><span>{{ lessonStatus(lesson.status) }}</span></li></ul><p v-else class="empty-preview">暂时没有课程记录。</p></section><section class="purchase-panel"><h2>添加课程套餐</h2><p>仅供演示使用，不会使用真实付款方式。</p><div v-for="option in packages" :key="option.packageId" class="package-option"><div><strong>{{ option.packageName }}</strong><span>{{ option.creditQuantity }} 节课 · {{ money(option.amountCents) }}</span></div><button class="button primary" :disabled="loading" @click="purchase(option)">选择</button></div><div v-if="parent.order" class="payment-demo"><strong>{{ parent.order.status === 'paid' ? '模拟付款已完成' : '演示订单已创建' }}</strong><p>{{ parent.order.packageName }} · {{ paymentMode(parent.order.paymentMode) }}</p><p v-if="parent.order.paidAt">付款时间：{{ formatDate(parent.order.paidAt) }}</p><button v-if="parent.order.status === 'pending'" class="button confirm" :disabled="loading" @click="simulatePayment">完成模拟付款</button></div></section></div><p v-else class="empty-preview">正在加载家长中心…</p></section>
  </main>
  <LessonDrawer v-if="selectedLesson" :lesson="selectedLesson" :participants="participants" :format-date="formatDate" :loading="loading" @close="closeDrawer" @cancel="transition('cancel')" @complete="transition('complete')" />
</template>
