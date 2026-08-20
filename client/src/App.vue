<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { api } from './api.js';
import AiSchedulePreview from './components/AiSchedulePreview.vue';
import LessonDrawer from './components/LessonDrawer.vue';

const view = ref('teacher'); const loading = ref(false); const error = ref(''); const notice = ref('');
const teacher = ref({ lessons: [], students: [], orders: [], suggestion: null, draft: '' });
const parent = ref({ data: null, order: null }); const selectedLesson = ref(null); const lessonTrigger = ref(null);
const available = (s) => s.totalCredits - s.attendedCredits - s.reservedCredits;
const formatDate = (v) => new Intl.DateTimeFormat('zh-CN', { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(v));
const money = (c) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(c / 100);
const participants = (lesson) => lesson.participants?.map(({ student }) => student.name).join('、') ?? '学生课程';
const lessonStatus = (status) => ({ scheduled: '已排课', completed: '已完成', cancelled: '已取消' }[status] ?? status);
const orderStatus = (status) => ({ pending: '待支付', paid: '已支付' }[status] ?? status);
const paymentMode = (mode) => ({ simulation: '模拟支付', simulated: '模拟支付' }[mode] ?? mode);
function startOfWeek(value) { const date = new Date(value); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date; }
function addDays(date, count) { const result = new Date(date); result.setDate(result.getDate() + count); return result; }
function dateKey(value) { const date = new Date(value); return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function timeKey(value) { const date = new Date(value); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
const weekStart = ref(startOfWeek(new Date()));
const weekDates = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)));
const scheduled = computed(() => teacher.value.lessons.filter((lesson) => lesson.status === 'scheduled'));
const scheduleItems = computed(() => {
  const starts = weekStart.value.getTime(); const ends = addDays(weekStart.value, 7).getTime();
  const lessons = scheduled.value.filter((lesson) => { const start = new Date(lesson.startsAt).getTime(); return start >= starts && start < ends; }).map((lesson) => ({ ...lesson, key: lesson.id, label: participants(lesson), draft: false }));
  const draft = teacher.value.suggestion; const draftStart = draft && new Date(draft.startAt).getTime();
  return draft && draftStart >= starts && draftStart < ends ? [...lessons, { ...draft, key: 'ai-preview', label: draft.courseName, draft: true }] : lessons;
});
const timeSlots = computed(() => [...new Set(scheduleItems.value.map((item) => timeKey(item.startsAt)))].sort().map((key) => ({ key, label: key })));
const weekLabel = computed(() => `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(weekDates.value[0])} – ${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(weekDates.value.at(-1))}`);
const child = computed(() => parent.value.data?.students?.[0]);
const packages = computed(() => parent.value.data?.packages ?? []);
async function loadTeacher() { const [lessons, students, orders] = await Promise.all([api.teacher.schedule(), api.teacher.students(), api.teacher.orders()]); teacher.value = { ...teacher.value, lessons, students, orders }; }
async function loadParent() { parent.value = { ...parent.value, data: await api.parent.dashboard() }; }
async function load() { loading.value = true; error.value = ''; try { view.value === 'teacher' ? await loadTeacher() : await loadParent(); } catch (e) { error.value = `无法加载此演示内容（${e.message}）。请启动 API 后重试。`; } finally { loading.value = false; } }
async function parse() { if (!teacher.value.draft.trim()) return; loading.value = true; error.value = ''; try { teacher.value.suggestion = (await api.teacher.parseSchedule(teacher.value.draft)).suggestion; } catch (e) { error.value = e.message === 'INVALID_AI_OUTPUT' ? 'AI 草稿需要修正。请换一种表述后重试。' : `AI 预览暂不可用（${e.message}）。您的描述已保留，可稍后重试。`; } finally { loading.value = false; } }
async function confirm(suggestion) { loading.value = true; error.value = ''; try { const studentIds = teacher.value.students.filter((s) => suggestion.studentNames.includes(s.name)).map((s) => s.id); await api.teacher.createLesson({ studentIds, startAt: suggestion.startAt }); weekStart.value = startOfWeek(suggestion.startAt); teacher.value.suggestion = null; teacher.value.draft = ''; notice.value = '预约已确认，并已加入每周课表。'; await loadTeacher(); } catch (e) { error.value = `预约未保存（${e.message}）。请检查可用课时后重试。`; } finally { loading.value = false; } }
function openLesson(lesson, event) { lessonTrigger.value = event.currentTarget; selectedLesson.value = lesson; }
function closeDrawer() {
  const trigger = lessonTrigger.value;
  selectedLesson.value = null;
  nextTick(() => requestAnimationFrame(() => trigger?.focus()));
}
async function transition(action) { if (!selectedLesson.value) return; loading.value = true; try { await api.teacher.updateLesson(selectedLesson.value.id, action); closeDrawer(); notice.value = `课程已${action === 'complete' ? '完成' : '取消'}。`; await loadTeacher(); } catch (e) { error.value = `无法${action === 'complete' ? '完成' : '取消'}课程（${e.message}）。`; } finally { loading.value = false; } }
async function purchase(option) { if (!child.value) return; loading.value = true; try { parent.value.order = await api.parent.createOrder({ studentId: child.value.id, packageId: option.packageId }); } catch (e) { error.value = `无法创建演示订单（${e.message}）。`; } finally { loading.value = false; } }
async function simulatePayment() { loading.value = true; try { parent.value.order = await api.parent.simulatePayment(parent.value.order.id); notice.value = '模拟付款已完成，演示课时余额已刷新。'; await loadParent(); } catch (e) { error.value = `无法完成模拟付款（${e.message}）。`; } finally { loading.value = false; } }
function select(next) { view.value = next; notice.value = ''; error.value = ''; load(); }
onMounted(load);
</script>

<template>
  <main class="app-shell" :inert="selectedLesson ? '' : undefined" :aria-hidden="selectedLesson ? 'true' : undefined">
    <header class="topbar"><a class="wordmark" href="#" @click.prevent="select('teacher')">Lessonline<span>AI</span></a><nav aria-label="工作区"><button :class="{ active: view === 'teacher' }" @click="select('teacher')">教师工作台</button><button :class="{ active: view === 'parent' }" @click="select('parent')">家长中心</button></nav><span class="demo-label">合成演示数据</span></header>
    <p v-if="error" class="status error" role="alert">{{ error }}</p><p v-if="notice" class="status notice" role="status">{{ notice }}</p>
    <section v-if="view === 'teacher'" class="teacher-workbench"><div class="workbench-heading"><div><h1>每周授课节奏</h1><p>AI 草稿只有在您审核确认后，才会更改学生的课程安排或课时余额。</p></div><button class="button quiet" :disabled="loading" @click="loadTeacher">刷新课表</button></div>
      <div class="teacher-grid"><section class="schedule-board" aria-label="每周课程表"><div class="schedule-tools"><button class="week-button" aria-label="上一周" @click="weekStart = addDays(weekStart, -7)">←</button><strong>{{ weekLabel }}</strong><button class="week-button" aria-label="下一周" @click="weekStart = addDays(weekStart, 7)">→</button><button class="today-button" @click="weekStart = startOfWeek(new Date())">今天</button></div><div class="schedule-head"><span>时间</span><span v-for="date in weekDates" :key="date.toISOString()">{{ new Intl.DateTimeFormat('zh-CN', { weekday: 'short', day: 'numeric' }).format(date) }}</span></div><div v-if="!timeSlots.length" class="schedule-empty">本周没有已排课程。确认后的 AI 课程会自动在对应的日期和时间显示。</div><div v-for="slot in timeSlots" :key="slot.key" class="time-row"><time>{{ slot.label }}</time><div v-for="date in weekDates" :key="`${slot.key}-${dateKey(date)}`" class="schedule-cell"><button v-for="item in scheduleItems.filter((entry) => dateKey(entry.startsAt) === dateKey(date) && timeKey(entry.startsAt) === slot.key && !entry.draft)" :key="item.key" class="lesson-chip" @click="openLesson(item, $event)"><strong>{{ item.label }}</strong><span>{{ slot.label }}</span></button><div v-for="item in scheduleItems.filter((entry) => dateKey(entry.startsAt) === dateKey(date) && timeKey(entry.startsAt) === slot.key && entry.draft)" :key="item.key" class="draft-chip"><strong>{{ item.label }}</strong><span>AI 预览</span></div></div></div></section>
        <div class="teacher-side"><section class="prompt-panel"><h2>创建排课草稿</h2><label for="schedule-note">描述课程</label><textarea id="schedule-note" v-model="teacher.draft" placeholder="例如：八年级 Avery 和 Rowan，周三 18:30 上英语课" :disabled="loading"></textarea><button class="button primary" :disabled="loading || !teacher.draft.trim()" @click="parse">{{ loading ? '处理中…' : '创建 AI 预览' }}</button></section><AiSchedulePreview :suggestion="teacher.suggestion" :students="teacher.students" :loading="loading" @confirm="confirm" @dismiss="teacher.suggestion = null" /></div></div>
      <section class="ledger"><div class="section-heading"><div><h2>学生课时台账</h2><p>可用课时 = 已购课时 − 已上课时 − 已预约课时。</p></div><span>{{ teacher.students.length }} 名合成演示学生</span></div><div class="ledger-table" role="table" aria-label="学生课时台账"><div class="ledger-row ledger-label" role="row"><span>学生</span><span>年级</span><span>可用</span><span>已预约</span><span>已上课</span></div><div v-for="s in teacher.students" :key="s.id" class="ledger-row" role="row"><strong>{{ s.name }}</strong><span>{{ s.grade }} 年级</span><span :class="{ danger: available(s) < 1 }">{{ available(s) }}</span><span>{{ s.reservedCredits }}</span><span>{{ s.attendedCredits }}</span></div></div></section>
      <section class="ledger order-review"><div class="section-heading"><div><h2>订单查看</h2><p>仅显示模拟记录。教师可以查看状态，但不能确认订单或增加课时。</p></div><span>{{ teacher.orders.length }} 条订单记录</span></div><div class="ledger-table" role="table" aria-label="订单查看"><div class="ledger-row ledger-label" role="row"><span>学生</span><span>套餐</span><span>金额</span><span>状态</span><span>付款时间</span></div><div v-for="order in teacher.orders" :key="order.id" class="ledger-row" role="row"><strong>{{ order.student.name }}</strong><span>{{ order.packageName }} · {{ paymentMode(order.paymentMode) }}</span><span>{{ money(order.amountCents) }}</span><span>{{ orderStatus(order.status) }}</span><span>{{ order.paidAt ? formatDate(order.paidAt) : '未付款' }}</span></div><p v-if="!teacher.orders.length" class="empty-preview">尚未创建合成演示订单。</p></div></section>
    </section>
    <section v-else class="parent-dashboard"><div class="workbench-heading"><div><h1>家庭课程中心</h1><p>这里仅显示属于此演示家长账户的学生。</p></div><button class="button quiet" :disabled="loading" @click="loadParent">刷新</button></div><div v-if="child" class="parent-grid"><section class="child-summary"><p class="student-name">{{ child.name }}</p><h2>{{ child.grade }} 年级英语</h2><div class="credit-balance"><strong>{{ available(child) }}</strong><span>节可用课程</span></div><dl><div><dt>已购</dt><dd>{{ child.totalCredits }}</dd></div><div><dt>已预约</dt><dd>{{ child.reservedCredits }}</dd></div><div><dt>已上课</dt><dd>{{ child.attendedCredits }}</dd></div></dl></section><section class="parent-lessons"><h2>本周与历史课程</h2><ul v-if="child.lessons.length"><li v-for="lesson in child.lessons" :key="lesson.id"><strong>{{ formatDate(lesson.startsAt) }}</strong><span>{{ lessonStatus(lesson.status) }}</span></li></ul><p v-else class="empty-preview">暂时没有课程记录。</p></section><section class="purchase-panel"><h2>添加课程套餐</h2><p>仅供演示使用，不会使用真实付款方式。</p><div v-for="option in packages" :key="option.packageId" class="package-option"><div><strong>{{ option.packageName }}</strong><span>{{ option.creditQuantity }} 节课 · {{ money(option.amountCents) }}</span></div><button class="button primary" :disabled="loading" @click="purchase(option)">选择</button></div><div v-if="parent.order" class="payment-demo"><strong>{{ parent.order.status === 'paid' ? '模拟付款已完成' : '演示订单已创建' }}</strong><p>{{ parent.order.packageName }} · {{ paymentMode(parent.order.paymentMode) }}</p><p v-if="parent.order.paidAt">付款时间：{{ formatDate(parent.order.paidAt) }}</p><button v-if="parent.order.status === 'pending'" class="button confirm" :disabled="loading" @click="simulatePayment">完成模拟付款</button></div></section></div><p v-else class="empty-preview">正在加载家长中心…</p></section>
  </main>
  <LessonDrawer v-if="selectedLesson" :lesson="selectedLesson" :participants="participants" :format-date="formatDate" :loading="loading" @close="closeDrawer" @cancel="transition('cancel')" @complete="transition('complete')" />
</template>
