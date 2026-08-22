<script setup>
import { computed, ref } from 'vue';
import AiSchedulePreview from './AiSchedulePreview.vue';
import ScheduleBoard from './ScheduleBoard.vue';

const props = defineProps({
  accountId: { type: String, default: '' },
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
  'open-student-manager',
  'open-teacher-order',
  'confirm-manual-order',
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
const activeStudents = computed(() => props.students.filter(({ isActive }) => isActive !== false));
const available = (student) => student.totalCredits - student.attendedCredits - student.reservedCredits;
const money = (cents) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
const orderStatus = (status) => ({ pending: '待确认', paid: '已确认' }[status] ?? '状态待确认');
const paymentMode = (mode) => ({ manual_qr: '扫码登记（模拟）', simulation: '模拟支付', simulated: '模拟支付' }[mode] ?? '模拟支付');
const shortDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '未确认';
const canConfirm = (order) => order.paymentMode === 'manual_qr' && order.status === 'pending' && order.teacherId === props.accountId;

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
        <div class="teacher-list__heading">
          <div><h2 id="student-list-title">学员课时</h2><p>停用会保留历史课程与订单。</p></div>
          <div class="teacher-list__heading-actions"><span>{{ activeStudents.length }} 名在用</span><button data-testid="manage-students" type="button" @click="emit('open-student-manager', $event)">管理学员</button></div>
        </div>
        <div class="teacher-list__labels" aria-hidden="true"><span>姓名</span><span>年级</span><span>可用</span><span>已预约</span><span>已上课</span></div>
        <div v-for="student in activeStudents" :key="student.id" class="teacher-list__row">
          <strong>{{ student.name }}</strong><span>{{ student.grade }} 年级</span><span :class="{ danger: available(student) < 1 }">{{ available(student) }} 节</span><span>{{ student.reservedCredits }} 节</span><span>{{ student.attendedCredits }} 节</span>
        </div>
        <p v-if="!activeStudents.length" class="teacher-list__empty">暂时没有使用中的学员记录。</p>
      </section>

      <section v-else class="teacher-list" aria-labelledby="order-list-title">
        <div class="teacher-list__heading">
          <div><h2 id="order-list-title">本地订单</h2><p>模拟支付由家长确认；扫码登记（模拟）由登记教师确认一次。</p></div>
          <div class="teacher-list__heading-actions"><span>{{ orders.length }} 条记录</span><button data-testid="open-teacher-order" type="button" @click="emit('open-teacher-order', $event)">登记订单</button></div>
        </div>
        <div class="teacher-list__labels teacher-list__labels--orders" aria-hidden="true"><span>学生</span><span>套餐 / 方式</span><span>金额</span><span>状态</span><span>登记 / 付款</span></div>
        <div v-for="order in orders" :key="order.id" class="teacher-list__row teacher-list__row--orders">
          <strong>{{ order.student.name }}</strong>
          <span>{{ order.packageName }} · {{ order.creditQuantity }} 节 · {{ paymentMode(order.paymentMode) }}</span>
          <span>{{ money(order.amountCents) }}</span>
          <span>{{ orderStatus(order.status) }}</span>
          <span class="teacher-order-action">
            <small>{{ shortDate(order.createdAt) }} / {{ shortDate(order.paidAt) }}</small>
            <button v-if="canConfirm(order)" type="button" :data-testid="`confirm-${order.id}`" :disabled="loading" @click="emit('confirm-manual-order', order.id, $event)">确认到账（模拟）</button>
          </span>
        </div>
        <p v-if="!orders.length" class="teacher-list__empty">尚未创建模拟订单。</p>
      </section>
    </div>

    <nav class="teacher-nav" aria-label="教师工作区">
      <button type="button" :class="{ 'is-active': activeView === 'today' }" @click="activeView = 'today'"><span>今日</span><small>当前</small></button>
      <button type="button" :class="{ 'is-active': activeView === 'schedule' }" @click="activeView = 'schedule'"><span>课表</span><small>逐日</small></button>
      <button type="button" :class="{ 'is-active': activeView === 'students' }" @click="activeView = 'students'"><span>学员</span><small>{{ activeStudents.length }} 名</small></button>
      <button type="button" :class="{ 'is-active': activeView === 'orders' }" @click="activeView = 'orders'"><span>订单</span><small>{{ orders.length }} 条</small></button>
    </nav>

    <button class="teacher-manual-action" data-testid="open-manual-schedule" type="button" @click="emit('open-manual-schedule', $event)">手动排课</button>
  </section>
</template>
