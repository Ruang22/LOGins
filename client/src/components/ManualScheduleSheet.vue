<script setup>
import { computed, onMounted, ref } from 'vue';

const props = defineProps({
  students: { type: Array, default: () => [] },
  lesson: { type: Object, default: null },
  loading: Boolean,
});
const emit = defineEmits(['save', 'close']);

const pad = (value) => String(value).padStart(2, '0');
const localParts = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
};
const existing = localParts(props.lesson?.startsAt);
const dialog = ref(null);
const closeButton = ref(null);
const startDate = ref(existing?.date ?? '');
const startTime = ref(existing?.time ?? '');
const note = ref(props.lesson?.note ?? '');
const selectedIds = ref(props.lesson?.participants?.map(({ studentId, student }) => studentId ?? student?.id).filter(Boolean) ?? []);
const activeStudents = computed(() => props.students.filter(({ isActive }) => isActive !== false));
const selectedGrade = computed(() => activeStudents.value.find(({ id }) => selectedIds.value.includes(id))?.grade ?? null);
const canSave = computed(() => selectedIds.value.length > 0 && startDate.value && startTime.value);

function isDisabled(student) {
  return selectedGrade.value !== null && student.grade !== selectedGrade.value;
}

function startAtWithOffset() {
  const local = new Date(`${startDate.value}T${startTime.value}:00`);
  const offsetMinutes = -local.getTimezoneOffset();
  if (offsetMinutes === 0) return `${startDate.value}T${startTime.value}:00Z`;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return `${startDate.value}T${startTime.value}:00${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

function submit() {
  if (!canSave.value) return;
  emit('save', {
    studentIds: [...selectedIds.value],
    startAt: startAtWithOffset(),
    durationMinutes: 60,
    note: note.value.trim(),
  });
}

function trapFocus(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
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
    <section ref="dialog" class="workflow-sheet" role="dialog" aria-modal="true" aria-labelledby="manual-schedule-title" @keydown="trapFocus">
      <header class="workflow-sheet__header">
        <div>
          <p>固定 60 分钟 · 精确到分钟</p>
          <h2 id="manual-schedule-title">{{ lesson ? '编辑课程' : '手动排课' }}</h2>
        </div>
        <button ref="closeButton" data-testid="sheet-close" type="button" aria-label="关闭手动排课" @click="emit('close')">×</button>
      </header>

      <form class="workflow-form" @submit.prevent="submit">
        <fieldset class="workflow-form__students">
          <legend>选择同年级学生</legend>
          <label v-for="student in activeStudents" :key="student.id" :class="{ 'is-disabled': isDisabled(student) }">
            <input
              v-model="selectedIds"
              type="checkbox"
              :value="student.id"
              :disabled="isDisabled(student)"
              :data-testid="`student-${student.id}`"
            >
            <span>{{ student.name }}</span>
            <small>{{ student.grade }} 年级</small>
          </label>
          <p v-if="!activeStudents.length">没有可排课的活跃学生。</p>
        </fieldset>

        <div class="workflow-form__columns">
          <label>日期<input v-model="startDate" name="startDate" type="date" required></label>
          <label>开始时间<input v-model="startTime" name="startTime" type="time" step="60" required></label>
          <label>时长<input value="60 分钟" type="text" disabled></label>
        </div>
        <label>课程备注<textarea v-model="note" name="note" maxlength="500" placeholder="例如：考前复习"></textarea></label>
        <footer class="workflow-sheet__actions">
          <button class="secondary" type="button" @click="emit('close')">取消</button>
          <button class="confirm" type="submit" :disabled="loading || !canSave">{{ loading ? '正在保存…' : '保存课程' }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>
