<script setup>
import { ref } from 'vue';
import AiSchedulePreview from './AiSchedulePreview.vue';
import ScheduleBoard from './ScheduleBoard.vue';

const props = defineProps({
  lessons: { type: Array, default: () => [] },
  students: { type: Array, default: () => [] },
  orders: { type: Array, default: () => [] },
  loading: Boolean,
  error: { type: String, default: '' },
  notice: { type: String, default: '' },
  suggestion: { type: Object, default: null },
  draft: { type: String, default: '' },
  scheduleDate: { type: [String, Date], default: null },
});

const emit = defineEmits([
  'refresh',
  'open-lesson',
  'open-manual-schedule',
  'open-ai',
  'switch-role',
  'update:draft',
  'parse-ai',
  'confirm-ai',
  'dismiss-ai',
  'update:schedule-date',
]);

const title = ref(null);
const activeView = ref('today');
const aiOpen = ref(false);
const available = (student) => student.totalCredits - student.attendedCredits - student.reservedCredits;
const money = (cents) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
const orderStatus = (status) => ({ pending: '待支付', paid: '已支付' }[status] ?? '状态待确认');
const paymentMode = (mode) => ({ simulation: '模拟支付', simulated: '模拟支付' }[mode] ?? '模拟支付');

function focus() {
  title.value?.focus();
}

function openAi() {
  aiOpen.value = !aiOpen.value;
  emit('open-ai');
}

defineExpose({ focus });
</script>

<template>
  <section class="teacher-shell" data-testid="teacher-shell">
    <header class="teacher-shell__masthead">
      <p class="teacher-shell__wordmark"><span aria-hidden="true">课</span> 课堂时刻牌</p>
      <div class="teacher-shell__session">
        <span>合成演示数据</span>
        <button type="button" @click="emit('switch-role')">切换身份</button>
      </div>
    </header>

    <div class="teacher-shell__content">
      <div class="teacher-shell__heading">
        <div>
          <p>教师工作台 · {{ activeView === 'today' ? '今日' : activeView === 'schedule' ? '课表' : activeView === 'students' ? '学员' : '订单' }}</p>
          <h1 ref="title" tabindex="-1" data-testid="workbench-destination">
            {{ activeView === 'today' ? '今天，按分钟上课' : activeView === 'schedule' ? '逐日查看课表' : activeView === 'students' ? '学员课时名单' : '模拟订单记录' }}
          </h1>
        </div>
        <button class="teacher-refresh" type="button" :disabled="loading" @click="emit('refresh')">
          {{ loading ? '正在刷新…' : '刷新' }}
        </button>
      </div>

      <p v-if="error" class="teacher-message teacher-message--error" role="alert">{{ error }}</p>
      <p v-if="notice" class="teacher-message teacher-message--notice" role="status">{{ notice }}</p>

      <template v-if="activeView === 'today' || activeView === 'schedule'">
        <div class="teacher-shell__schedule-actions">
          <p>每行是一节课。轻触课程可查看、完成或取消。</p>
          <button type="button" :aria-expanded="aiOpen" aria-controls="teacher-ai-panel" @click="openAi">AI 排课草稿</button>
        </div>

        <ScheduleBoard
          :lessons="lessons"
          :selected-date="scheduleDate"
          @select-lesson="(...args) => emit('open-lesson', ...args)"
          @update:selected-date="emit('update:schedule-date', $event)"
        />

        <section v-if="aiOpen" id="teacher-ai-panel" class="teacher-ai-workbench" aria-label="AI 排课草稿">
          <div class="teacher-ai-workbench__composer">
            <h2>用一句话准备草稿</h2>
            <p>AI 只生成待确认内容，不会直接改动课表。</p>
            <label for="teacher-schedule-note">课程描述</label>
            <textarea
              id="teacher-schedule-note"
              :value="draft"
              placeholder="例如：八年级林一和周然，周三 18:05 上英语课"
              :disabled="loading"
              @input="emit('update:draft', $event.target.value)"
            />
            <button class="button primary" type="button" :disabled="loading || !draft.trim()" @click="emit('parse-ai')">
              {{ loading ? '处理中…' : '生成待确认草稿' }}
            </button>
          </div>
          <AiSchedulePreview
            :suggestion="suggestion"
            :students="students"
            :loading="loading"
            @confirm="emit('confirm-ai', $event)"
            @dismiss="emit('dismiss-ai')"
          />
        </section>
      </template>

      <section v-else-if="activeView === 'students'" class="teacher-list" aria-labelledby="student-list-title">
        <div class="teacher-list__heading"><h2 id="student-list-title">学员课时</h2><span>{{ students.length }} 名学员</span></div>
        <div class="teacher-list__labels" aria-hidden="true"><span>姓名</span><span>年级</span><span>可用</span><span>已预约</span><span>已上课</span></div>
        <div v-for="student in students" :key="student.id" class="teacher-list__row">
          <strong>{{ student.name }}</strong><span>{{ student.grade }} 年级</span><span :class="{ danger: available(student) < 1 }">{{ available(student) }} 节</span><span>{{ student.reservedCredits }} 节</span><span>{{ student.attendedCredits }} 节</span>
        </div>
        <p v-if="!students.length" class="teacher-list__empty">暂时没有学员记录。</p>
      </section>

      <section v-else class="teacher-list" aria-labelledby="order-list-title">
        <div class="teacher-list__heading">
          <div><h2 id="order-list-title">模拟订单</h2><p>教师只能查看，不能确认付款或增加课时。</p></div>
          <span>{{ orders.length }} 条记录</span>
        </div>
        <div class="teacher-list__labels teacher-list__labels--orders" aria-hidden="true"><span>学生</span><span>套餐</span><span>金额</span><span>状态</span><span>付款时间</span></div>
        <div v-for="order in orders" :key="order.id" class="teacher-list__row teacher-list__row--orders">
          <strong>{{ order.student.name }}</strong><span>{{ order.packageName }} · {{ paymentMode(order.paymentMode) }}</span><span>{{ money(order.amountCents) }}</span><span>{{ orderStatus(order.status) }}</span><span>{{ order.paidAt ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(order.paidAt)) : '未付款' }}</span>
        </div>
        <p v-if="!orders.length" class="teacher-list__empty">尚未创建模拟订单。</p>
      </section>
    </div>

    <nav class="teacher-nav" aria-label="教师工作区">
      <button type="button" :class="{ 'is-active': activeView === 'today' }" @click="activeView = 'today'"><span>今日</span><small>当前</small></button>
      <button type="button" :class="{ 'is-active': activeView === 'schedule' }" @click="activeView = 'schedule'"><span>课表</span><small>逐日</small></button>
      <button type="button" :class="{ 'is-active': activeView === 'students' }" @click="activeView = 'students'"><span>学员</span><small>{{ students.length }} 名</small></button>
      <button type="button" :class="{ 'is-active': activeView === 'orders' }" @click="activeView = 'orders'"><span>订单</span><small>{{ orders.length }} 条</small></button>
    </nav>

    <button class="teacher-manual-action" type="button" @click="emit('open-manual-schedule')">手动排课</button>
  </section>
</template>
