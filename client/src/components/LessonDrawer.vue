<script setup>
import { onMounted, ref } from 'vue';

const props = defineProps({ lesson: { type: Object, required: true }, participants: { type: Function, required: true }, formatDate: { type: Function, required: true }, loading: Boolean });
const emit = defineEmits(['close', 'complete', 'cancel']);
const dialog = ref(null); const closeButton = ref(null);

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
      <p class="preview-stamp">已排课程</p><h2 id="lesson-dialog-title">{{ participants(lesson) }}</h2>
      <p>{{ formatDate(lesson.startsAt) }} · {{ lesson.durationMinutes }} 分钟</p>
      <div class="preview-actions"><button class="button secondary" :disabled="loading" @click="emit('cancel')">取消预约</button><button class="button confirm" :disabled="loading" @click="emit('complete')">标记为已完成</button></div>
    </section>
  </div>
</template>
