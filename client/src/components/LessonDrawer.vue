<script setup>
import { computed, onMounted, ref } from 'vue';

const props = defineProps({ lesson: { type: Object, required: true }, participants: { type: Function, required: true }, formatDate: { type: Function, required: true }, loading: Boolean, error: { type: String, default: '' } });
const emit = defineEmits(['close', 'complete', 'cancel', 'edit']);
const dialog = ref(null); const closeButton = ref(null);
const statusLabel = computed(() => ({
  scheduled: '已排课程',
  completed: '已完成课程',
  cancelled: '已取消课程',
}[props.lesson.status] ?? '课程'));

function trapFocus(event) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return; }
  if (event.key !== 'Tab') return;
  const controls = [...dialog.value.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  const first = controls[0]; const last = controls.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

onMounted(() => closeButton.value?.focus());
</script>

<template>
  <div class="drawer-backdrop" @mousedown.self="emit('close')">
    <section ref="dialog" class="lesson-drawer" role="dialog" aria-modal="true" aria-labelledby="lesson-dialog-title" @keydown="trapFocus">
      <button ref="closeButton" class="drawer-close" aria-label="关闭课程详情" @click="emit('close')">×</button>
      <p class="preview-stamp">{{ statusLabel }}</p><h2 id="lesson-dialog-title">{{ participants(lesson) }}</h2>
      <p>{{ formatDate(lesson.startsAt) }} · {{ lesson.durationMinutes }} 分钟</p>
      <p v-if="error" class="drawer-error" role="alert">{{ error }}</p>
      <div class="preview-actions">
        <button v-if="lesson.status === 'scheduled'" class="button secondary" data-testid="edit-lesson" :disabled="loading" @click="emit('edit')">编辑课程</button>
        <button v-if="lesson.status === 'scheduled'" class="button secondary" :disabled="loading" @click="emit('cancel')">取消预约</button>
        <button v-if="lesson.status === 'scheduled'" class="button confirm" :disabled="loading" @click="emit('complete')">标记为已完成</button>
      </div>
    </section>
  </div>
</template>
