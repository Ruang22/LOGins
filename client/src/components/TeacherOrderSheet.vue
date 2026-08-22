<script setup>
import { computed, onMounted, ref } from 'vue';

const props = defineProps({
  students: { type: Array, default: () => [] },
  packages: {
    type: Array,
    default: () => [
      { packageId: 'demo-10', label: '10 节内置套餐' },
      { packageId: 'demo-20', label: '20 节内置套餐' },
    ],
  },
  loading: Boolean,
  error: { type: String, default: '' },
});
const emit = defineEmits(['save', 'close']);
const dialog = ref(null);
const closeButton = ref(null);
const mode = ref('catalog');
const studentId = ref('');
const packageId = ref(props.packages[0]?.packageId ?? '');
const packageName = ref('');
const creditQuantity = ref(1);
const amountYuan = ref('');
const activeStudents = computed(() => props.students.filter(({ isActive }) => isActive !== false));
const canSave = computed(() => studentId.value && (
  mode.value === 'catalog'
    ? packageId.value
    : packageName.value.trim() && Number.isInteger(Number(creditQuantity.value)) && Number(creditQuantity.value) > 0 && amountYuan.value !== '' && Number(amountYuan.value) >= 0
));

function submit() {
  if (!canSave.value) return;
  if (mode.value === 'catalog') {
    emit('save', { studentId: studentId.value, packageId: packageId.value, paymentMode: 'manual_qr' });
    return;
  }
  emit('save', {
    studentId: studentId.value,
    packageName: packageName.value.trim(),
    creditQuantity: Number(creditQuantity.value),
    amountCents: Math.round(Number(amountYuan.value) * 100),
    paymentMode: 'manual_qr',
  });
}

function trapFocus(event) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return; }
  if (event.key !== 'Tab') return;
  const controls = [...dialog.value.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

onMounted(() => closeButton.value?.focus());
</script>

<template>
  <div class="workflow-sheet-backdrop" @mousedown.self="emit('close')">
    <section ref="dialog" class="workflow-sheet" role="dialog" aria-modal="true" aria-labelledby="teacher-order-title" @keydown="trapFocus">
      <header class="workflow-sheet__header">
        <div><p>本地记录，不发起真实收款</p><h2 id="teacher-order-title">登记订单</h2></div>
        <button ref="closeButton" data-testid="sheet-close" type="button" aria-label="关闭订单登记" @click="emit('close')">×</button>
      </header>

      <p v-if="error" class="workflow-form__error" role="alert">{{ error }}</p>

      <form class="workflow-form" @submit.prevent="submit">
        <p class="workflow-form__notice">教师端登记统一标为“扫码登记（模拟）”；家长端套餐支付统一标为“模拟支付”。两者都不会发起真实收款。</p>
        <label>学员
          <select v-model="studentId" name="studentId" required>
            <option value="" disabled>请选择学员</option>
            <option v-for="student in activeStudents" :key="student.id" :value="student.id">{{ student.name }} · {{ student.grade }} 年级</option>
          </select>
        </label>
        <fieldset class="workflow-form__modes">
          <legend>登记方式</legend>
          <label><input v-model="mode" type="radio" value="catalog">内置套餐 · 扫码登记（模拟）</label>
          <label><input v-model="mode" type="radio" value="manual">扫码登记（模拟）</label>
        </fieldset>

        <label v-if="mode === 'catalog'">内置套餐
          <select v-model="packageId" name="packageId" required>
            <option v-for="option in packages" :key="option.packageId" :value="option.packageId">{{ option.label ?? option.packageName }}</option>
          </select>
        </label>
        <template v-else>
          <p class="workflow-form__notice">扫码登记（模拟）：这里只记录教师线下确认的信息，不生成二维码，也不发起真实支付。</p>
          <label>套餐名称<input v-model="packageName" name="packageName" required maxlength="80"></label>
          <label>登记课时<input v-model="creditQuantity" name="creditQuantity" type="number" min="1" step="1" required></label>
          <label>金额（元）<input v-model="amountYuan" name="amountYuan" type="number" min="0" step="0.01" required></label>
        </template>
        <footer class="workflow-sheet__actions">
          <button class="secondary" type="button" @click="emit('close')">取消</button>
          <button class="confirm" type="submit" :disabled="loading || !canSave">{{ loading ? '正在登记…' : '创建待确认订单' }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>
