<script setup>
import { computed, onMounted, ref } from 'vue';
import { businessDateTimeParts } from '../business-time.js';

const props = defineProps({
  students: { type: Array, default: () => [] },
  lesson: { type: Object, default: null },
  loading: Boolean,
  error: { type: String, default: '' },
});
const emit = defineEmits(['save', 'close']);

const localParts = (value) => {
  if (!value) return null;
  const { year, month, day, hour, minute } = businessDateTimeParts(value);
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
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
const selectedStudents = computed(() => activeStudents.value.filter(({ id }) => selectedIds.value.includes(id)));
const canSave = computed(() => selectedIds.value.length > 0 && startDate.value && startTime.value);

function availableCredits(student) {
  return Math.max(0, (student.totalCredits ?? 0) - (student.attendedCredits ?? 0) - (student.reservedCredits ?? 0));
}

function isDisabled(student) {
  return selectedGrade.value !== null && student.grade !== selectedGrade.value;
}

function startAtWithOffset() {
  return `${startDate.value}T${startTime.value}:00+08:00`;
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
    <section ref="dialog" class="workflow-sheet workflow-sheet--manual" role="dialog" aria-modal="true" aria-labelledby="manual-schedule-title" @keydown="trapFocus">
      <header class="manual-schedule-header">
        <div>
          <h2 id="manual-schedule-title">{{ lesson ? '编辑课程' : '手动排课' }}</h2>
          <p>选择学员后，课程只会安排给同年级的学生。</p>
        </div>
        <div class="manual-schedule-header__tools">
          <span aria-label="固定课时 60 分钟，支持分钟级开始时间">60 分钟 · 分钟级</span>
          <button ref="closeButton" data-testid="sheet-close" type="button" aria-label="关闭手动排课" @click="emit('close')">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        </div>
      </header>

      <p v-if="error" class="workflow-form__error" role="alert">{{ error }}</p>

      <form class="workflow-form" @submit.prevent="submit">
        <div class="manual-schedule-layout">
          <fieldset class="manual-schedule-students">
            <div class="manual-schedule-section-head">
              <legend>选择学员</legend>
              <p data-testid="selected-student-summary" aria-live="polite">
                <template v-if="selectedStudents.length">已选 {{ selectedStudents.length }} 人 · {{ selectedGrade }} 年级</template>
                <template v-else>可选择同年级学员一起上课</template>
              </p>
            </div>
            <div v-if="activeStudents.length" class="manual-schedule-student-list">
              <label
                v-for="student in activeStudents"
                :key="student.id"
                :class="{ 'is-disabled': isDisabled(student), 'is-selected': selectedIds.includes(student.id) }"
              >
                <input
                  v-model="selectedIds"
                  type="checkbox"
                  :value="student.id"
                  :disabled="isDisabled(student)"
                  :data-testid="`student-${student.id}`"
                >
                <span class="manual-schedule-student__name">{{ student.name }}</span>
                <span class="manual-schedule-student__facts">
                  <small>{{ student.grade }} 年级</small>
                  <small :data-testid="`student-balance-${student.id}`">可用 {{ availableCredits(student) }} 节</small>
                </span>
                <small v-if="isDisabled(student)" class="manual-schedule-student__reason">不同年级不可同课</small>
              </label>
            </div>
            <p v-else class="manual-schedule-empty">没有可排课的活跃学生。</p>
          </fieldset>

          <section class="manual-schedule-details" aria-label="课程时间与备注">
            <div class="manual-schedule-section-head">
              <h3>安排时间</h3>
              <p>请精确选择到分钟</p>
            </div>
            <div class="manual-schedule-time-grid">
              <label>日期<input v-model="startDate" name="startDate" type="date" required></label>
              <label>开始时间<input v-model="startTime" name="startTime" type="time" step="60" required></label>
              <div class="manual-schedule-duration" aria-label="课程时长固定 60 分钟">
                <span>课程时长</span>
                <strong>60 分钟</strong>
                <small>固定时长</small>
              </div>
            </div>
            <label class="manual-schedule-note">课程备注<textarea v-model="note" name="note" maxlength="500" placeholder="例如：考前复习"></textarea></label>
          </section>
        </div>
        <footer class="workflow-sheet__actions">
          <button class="secondary" type="button" @click="emit('close')">取消</button>
          <button class="confirm" type="submit" :disabled="loading || !canSave">{{ loading ? '正在保存…' : '保存课程' }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>
