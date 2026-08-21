<script setup>
import { computed, ref, toRaw } from 'vue';

const props = defineProps({
  dashboard: { type: Object, default: null },
  pendingOrder: { type: Object, default: null },
  loading: Boolean,
});

const emit = defineEmits(['refresh', 'purchase', 'simulate-payment', 'switch-role']);
const title = ref(null);
const child = computed(() => props.dashboard?.students?.[0] ?? null);
const packages = computed(() => props.dashboard?.packages ?? []);
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

const formatDay = (value) => new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
}).format(new Date(value));
const formatTime = (value) => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(new Date(value));
const formatDateTime = (value) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(new Date(value));
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

    <main class="parent-shell__content">
      <div class="parent-shell__heading">
        <div>
          <p>家长端 · 单孩子视图</p>
          <h1 ref="title" tabindex="-1" data-testid="workbench-destination">
            {{ child ? `${child.name}的课程轨迹` : '孩子的课程轨迹' }}
          </h1>
          <span v-if="child">{{ child.grade }} 年级 · 只显示当前家长账户的第一位孩子</span>
        </div>
        <button class="parent-refresh" type="button" :disabled="loading" @click="emit('refresh')">
          {{ loading ? '正在刷新…' : '刷新轨迹' }}
        </button>
      </div>

      <slot />

      <div v-if="child" class="parent-route">
        <section class="parent-next" aria-labelledby="parent-next-title">
          <div class="parent-route__label">
            <span aria-hidden="true">起点</span>
            <h2 id="parent-next-title">下一节课</h2>
          </div>
          <div v-if="nextLesson" class="parent-next__bar">
            <time :datetime="nextLesson.startsAt">
              <small>{{ formatDay(nextLesson.startsAt) }}</small>
              <strong>{{ formatTime(nextLesson.startsAt) }}</strong>
            </time>
            <div>
              <p>下一段学习时间已经排好</p>
              <span>一节 {{ nextLesson.durationMinutes ?? 60 }} 分钟课程 · {{ lessonStatus(nextLesson.status) }}</span>
            </div>
            <b>准时见</b>
          </div>
          <div v-else class="parent-next__empty" data-testid="next-lesson-empty">
            <strong>还没有安排下一节课</strong>
            <p>课程确定后，会在这里显示连续的上课时间。</p>
          </div>
        </section>

        <section class="parent-history" aria-labelledby="parent-history-title">
          <div class="parent-route__label">
            <span aria-hidden="true">沿途</span>
            <h2 id="parent-history-title">课程历史</h2>
          </div>
          <ol v-if="historyLessons.length" class="lesson-trail" data-testid="lesson-trail">
            <li v-for="lesson in historyLessons" :key="lesson.id">
              <span class="lesson-trail__node" aria-hidden="true"></span>
              <time :datetime="lesson.startsAt">{{ formatDateTime(lesson.startsAt) }}</time>
              <strong>家庭课程</strong>
              <em :class="`is-${lesson.status}`">{{ lessonStatus(lesson.status) }}</em>
            </li>
          </ol>
          <p v-else class="parent-route__empty">还没有历史课程，完成第一节课后会从这里开始记录。</p>
        </section>

        <section class="parent-balance" aria-labelledby="parent-balance-title">
          <div class="parent-route__label">
            <span aria-hidden="true">余量</span>
            <h2 id="parent-balance-title">剩余课时</h2>
          </div>
          <div class="parent-balance__line">
            <p><strong>{{ availableCredits }} 节</strong><span>可继续预约</span></p>
            <dl>
              <div><dt>已购课时</dt><dd>{{ child.totalCredits }}</dd></div>
              <div><dt>已预约</dt><dd>{{ child.reservedCredits }}</dd></div>
              <div><dt>已完成</dt><dd>{{ child.attendedCredits }}</dd></div>
            </dl>
          </div>
        </section>

        <section class="parent-purchase" aria-labelledby="parent-purchase-title">
          <div class="parent-route__label">
            <span aria-hidden="true">续程</span>
            <h2 id="parent-purchase-title">添加课时</h2>
          </div>
          <div class="parent-purchase__notice">
            <strong>模拟支付 · 演示数据</strong>
            <p>以下操作只更新演示账户，不会连接真实支付方式。</p>
          </div>
          <ul v-if="packages.length" class="package-track">
            <li v-for="option in packages" :key="option.packageId">
              <div>
                <strong>{{ option.creditQuantity }} 节课程包</strong>
                <span>{{ money(option.amountCents) }} · 演示套餐</span>
              </div>
              <button
                type="button"
                :data-testid="`package-${option.packageId}`"
                :disabled="loading"
                @click="emit('purchase', toRaw(option))"
              >选择此套餐</button>
            </li>
          </ul>
          <p v-else class="parent-route__empty">当前没有可选的演示课程包。</p>

          <div v-if="pendingOrder" class="payment-route" aria-live="polite">
            <div>
              <span>演示订单</span>
              <strong>{{ pendingOrder.status === 'paid' ? '模拟支付已完成' : '等待模拟支付' }}</strong>
              <p>该订单仅用于演示，不会产生真实扣款。</p>
            </div>
            <button
              v-if="pendingOrder.status === 'pending'"
              type="button"
              data-testid="simulate-payment"
              :disabled="loading"
              @click="emit('simulate-payment')"
            >继续模拟支付</button>
          </div>
        </section>
      </div>

      <p v-else class="parent-loading" role="status">
        {{ loading ? '正在读取演示课程轨迹…' : '暂时没有可显示的孩子课程数据。' }}
      </p>
    </main>
  </section>
</template>
