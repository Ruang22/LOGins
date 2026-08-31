<script setup>
import { computed, nextTick, ref, toRaw } from 'vue';
import { formatBusinessDate } from '../business-time.js';

const props = defineProps({
  dashboard: { type: Object, default: null },
  loading: Boolean,
});

const emit = defineEmits(['refresh', 'purchase', 'simulate-payment', 'switch-role']);
const title = ref(null);
const activePage = ref('schedule');
const activeNavIndex = computed(() => ({ schedule: 0, message: 1, packages: 2 }[activePage.value] ?? 0));
const child = computed(() => props.dashboard?.students?.[0] ?? null);
const packages = computed(() => props.dashboard?.packages ?? []);
const orders = computed(() => [...(props.dashboard?.orders ?? [])]
  .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)));
const pendingSimulationOrders = computed(() => orders.value.filter((order) => (
  order.paymentMode === 'simulation' && order.status === 'pending'
)));
const lessons = computed(() => [...(child.value?.lessons ?? [])]
  .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt)));
const nextLesson = computed(() => lessons.value.find((lesson) => (
  lesson.status === 'scheduled' && new Date(lesson.startsAt).getTime() >= Date.now()
)) ?? null);
const historyLessons = computed(() => lessons.value
  .filter((lesson) => lesson.status !== 'scheduled' || new Date(lesson.startsAt).getTime() < Date.now())
  .reverse());
const availableCredits = computed(() => {
  if (!child.value) return 0;
  return Math.max(0, child.value.totalCredits - child.value.attendedCredits - child.value.reservedCredits);
});

const formatDay = (value) => formatBusinessDate(value, {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});
const formatTime = (value) => formatBusinessDate(value, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const formatDateTime = (value) => formatBusinessDate(value, {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const money = (cents) => new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
}).format(cents / 100);
const lessonStatus = (status) => ({
  scheduled: '已排课',
  completed: '已完成',
  cancelled: '已取消',
}[status] ?? '状态待确认');
const orderStatus = (status) => ({
  pending: '待登记',
  paid: '已到账',
  cancelled: '已取消',
}[status] ?? '状态待确认');
const paymentMode = (mode) => ({
  simulation: '模拟支付',
  manual_qr: '扫码登记（模拟）',
}[mode] ?? '模拟支付');

function requestSimulationPayment(orderId) {
  emit('simulate-payment', orderId);
}

function selectPage(page) {
  activePage.value = page;
  nextTick(() => title.value?.focus());
}

function focus() {
  title.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <section class="parent-shell" data-testid="parent-shell">
    <header class="parent-shell__masthead">
      <p class="parent-shell__wordmark"><span aria-hidden="true">课</span> 家庭课程线</p>
      <div class="parent-shell__session">
        <strong>演示数据</strong>
        <button type="button" @click="emit('switch-role')">切换身份</button>
      </div>
    </header>

    <section class="parent-shell__content" aria-labelledby="parent-workbench-title">
      <div class="parent-shell__heading">
        <div>
          <h1 id="parent-workbench-title" ref="title" tabindex="-1" data-testid="workbench-destination">
            {{ child ? `${child.name}的${({ schedule: '排课', message: '老师寄语', packages: '教育套餐' }[activePage])}` : '孩子的课程' }}
          </h1>
          <span v-if="child">{{ child.grade }} 年级 · 仅展示当前账户绑定的孩子</span>
        </div>
        <button class="parent-refresh" type="button" :disabled="loading" @click="emit('refresh')">
          {{ loading ? '正在刷新…' : '刷新轨迹' }}
        </button>
      </div>

      <slot />

      <div v-if="child" class="parent-three-pages">
        <section v-show="activePage === 'message'" class="parent-message-section parent-page" :class="{ 'is-active': activePage === 'message' }" data-testid="parent-message-page" aria-labelledby="parent-message-title">
          <div class="parent-section-heading">
            <h2 id="parent-message-title">老师寄语</h2>
            <span>演示寄语</span>
          </div>
          <p>这一周先把课堂节奏稳定下来。上课前准备好错题本，课后用十分钟整理当天的新词和句型。</p>
          <small>当前为演示内容，真实寄语将在教师端发布后同步。</small>
        </section>

        <section v-show="activePage === 'packages'" class="parent-packages-section parent-page" :class="{ 'is-active': activePage === 'packages' }" data-testid="parent-packages-page" aria-labelledby="parent-packages-title">
          <div class="parent-section-heading parent-section-heading--split">
            <div><h2 id="parent-packages-title">教育套餐</h2><p>模拟支付 · 演示数据；购买与支付均为本地模拟流程。</p></div>
            <span>当前可用 {{ availableCredits }} 节</span>
          </div>
          <ul v-if="packages.length" class="package-track">
            <li v-for="option in packages" :key="option.packageId">
              <div><strong>{{ option.creditQuantity }} 节课程包</strong><span>{{ money(option.amountCents) }} · 演示套餐</span></div>
              <button type="button" :data-testid="`package-${option.packageId}`" :disabled="loading" @click="emit('purchase', toRaw(option))">选择此套餐</button>
            </li>
          </ul>
          <p v-else class="parent-route__empty">当前没有可选的演示课程包。</p>

          <div v-if="pendingSimulationOrders.length" class="parent-pending-payments" aria-live="polite">
            <div v-for="order in pendingSimulationOrders" :key="order.id" class="parent-pending-payment">
              <div><strong>{{ order.packageName }}</strong><span>{{ order.creditQuantity }} 节 · {{ money(order.amountCents) }} · 等待模拟支付</span></div>
              <button type="button" :data-testid="`simulate-payment-${order.id}`" :disabled="loading" @click="requestSimulationPayment(order.id)">继续模拟支付</button>
            </div>
          </div>

          <ol v-if="orders.length" class="order-trail" data-testid="order-trail">
            <li v-for="order in orders" :key="order.id">
              <span class="order-trail__node" aria-hidden="true"></span>
              <time :datetime="order.createdAt">{{ formatDateTime(order.createdAt) }}</time>
              <div><strong>{{ order.packageName }}</strong><span>{{ order.creditQuantity }} 节 · {{ money(order.amountCents) }} · {{ paymentMode(order.paymentMode) }}</span></div>
              <em :class="`is-${order.status}`">{{ orderStatus(order.status) }}</em>
            </li>
          </ol>
          <p v-else class="parent-route__empty">还没有课程包订单，添加课时后会在这里留下记录。</p>
          <div class="parent-qr-simulation" data-testid="simulated-qr-registration" aria-label="扫码登记（模拟）"><div class="parent-qr-simulation__placeholder" aria-hidden="true">收款码<br>占位</div><div><span>扫码登记（模拟）</span><strong>收款信息由教师线下登记</strong><p>这是演示占位区，不连接真实支付，也不会生成二维码请求。</p></div></div>
        </section>

        <section v-show="activePage === 'schedule'" class="parent-schedule-section parent-page" :class="{ 'is-active': activePage === 'schedule' }" data-testid="parent-schedule-page" aria-labelledby="parent-schedule-title">
          <div class="parent-section-heading parent-section-heading--split"><div><h2 id="parent-schedule-title">排课信息</h2><p>课程状态与剩余课时以服务器记录为准。</p></div><strong data-testid="available-credits">{{ availableCredits }} 节</strong></div>
          <dl class="parent-schedule-balance"><div><dt>已购课时</dt><dd data-testid="purchased-credits">{{ child.totalCredits }}</dd></div><div><dt>已预约</dt><dd>{{ child.reservedCredits }}</dd></div><div><dt>已完成</dt><dd>{{ child.attendedCredits }}</dd></div></dl>
          <div class="parent-next-slot"><h3>下一节课</h3><div v-if="nextLesson" class="parent-next__bar"><time :datetime="nextLesson.startsAt"><small>{{ formatDay(nextLesson.startsAt) }}</small><strong data-testid="next-lesson-time">{{ formatTime(nextLesson.startsAt) }}</strong></time><div><p>下一节英语课已经排好</p><span>一节 {{ nextLesson.durationMinutes ?? 60 }} 分钟课程 · {{ lessonStatus(nextLesson.status) }}</span></div><b>准时见</b></div><div v-else class="parent-next__empty" data-testid="next-lesson-empty"><strong>还没有安排下一节课</strong><p>课程确定后，会在这里显示上课时间。</p></div></div>
          <div class="parent-history-inline"><h3>课程历史</h3><ol v-if="historyLessons.length" class="lesson-trail" data-testid="lesson-trail"><li v-for="lesson in historyLessons" :key="lesson.id"><span class="lesson-trail__node" aria-hidden="true"></span><time :datetime="lesson.startsAt">{{ formatDateTime(lesson.startsAt) }}</time><strong>家庭课程</strong><em :class="`is-${lesson.status}`">{{ lessonStatus(lesson.status) }}</em></li></ol><p v-else class="parent-route__empty">还没有历史课程，完成第一节课后会从这里开始记录。</p></div>
        </section>

        <nav class="parent-bottom-navigation" data-testid="parent-bottom-navigation" aria-label="家长端导航" :data-active-page="activePage" :style="{ '--parent-nav-index': activeNavIndex, '--parent-nav-offset': `${activeNavIndex * 100}%` }">
          <span class="parent-nav-indicator" data-testid="parent-nav-indicator" aria-hidden="true"></span>
          <button type="button" class="parent-nav-item" data-testid="parent-tab-schedule" :class="{ 'is-active': activePage === 'schedule' }" :aria-current="activePage === 'schedule' ? 'page' : undefined" @click="selectPage('schedule')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5zM8 2.5v4M16 2.5v4M5 9h14M8 13h3M8 16.5h6" /></svg><span>排课</span>
          </button>
          <button type="button" class="parent-nav-item" data-testid="parent-tab-message" :class="{ 'is-active': activePage === 'message' }" :aria-current="activePage === 'message' ? 'page' : undefined" @click="selectPage('message')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3zM8.5 10.5h7M8.5 13h4" /></svg><span>寄语</span>
          </button>
          <button type="button" class="parent-nav-item" data-testid="parent-tab-packages" :class="{ 'is-active': activePage === 'packages' }" :aria-current="activePage === 'packages' ? 'page' : undefined" @click="selectPage('packages')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7.5h15v12h-15zM4.5 11.5h15M8 15.5h3.5M16 15.5h.01" /></svg><span>套餐</span>
          </button>
        </nav>
      </div>

      <p v-else class="parent-loading" role="status">
        {{ loading ? '正在读取演示课程轨迹…' : '暂时没有可显示的孩子课程数据。' }}
      </p>
    </section>
  </section>
</template>
