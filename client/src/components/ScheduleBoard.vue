<script setup>
import { computed, ref, watch } from 'vue';
import { businessDateKey, businessTimeLabel } from '../business-time.js';

const props = defineProps({
  lessons: { type: Array, default: () => [] },
  selectedDate: { type: [String, Date], default: null },
});

const emit = defineEmits(['select-lesson', 'update:selected-date']);

const dateKey = (value) => businessDateKey(value);
const timeLabel = (value) => businessTimeLabel(value);
const startOfWeek = (value) => {
  const date = new Date(`${dateKey(value)}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
};
const addDays = (value, count) => {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + count);
  return date;
};

const sortedLessons = computed(() => [...props.lessons].sort(
  (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
));
const initialDay = props.selectedDate ?? new Date();
const selectedDay = ref(dateKey(initialDay));
const weekAnchor = ref(startOfWeek(initialDay));
const weekDays = computed(() => Array.from({ length: 7 }, (_, index) => addDays(weekAnchor.value, index)));
const selectedLessons = computed(() => sortedLessons.value.filter(
  (lesson) => dateKey(lesson.startsAt) === selectedDay.value,
));
const selectedDate = computed(() => new Date(`${selectedDay.value}T12:00:00.000Z`));
const selectedDayLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
  timeZone: 'UTC',
}).format(selectedDate.value));

const statusLabel = (status) => ({
  scheduled: '已排课',
  completed: '已完成',
  cancelled: '已取消',
}[status] ?? '状态待确认');
const studentNames = (lesson) => lesson.participants?.map(({ student }) => student?.name).filter(Boolean).join('、') || '待分配学生';
const gradeLabel = (lesson) => {
  const grades = [...new Set(lesson.participants?.map(({ student }) => student?.grade).filter((grade) => grade !== undefined) ?? [])];
  return grades.length ? `${grades.join('、')} 年级` : '年级待确认';
};
const courseLabel = (lesson) => lesson.courseName || '英语课';

function moveToDay(day) {
  selectedDay.value = dateKey(day);
  weekAnchor.value = startOfWeek(day);
}

function selectDay(day) {
  moveToDay(day);
  emit('update:selected-date', selectedDay.value);
}

function changeWeek(offset) {
  selectDay(addDays(weekAnchor.value, offset * 7));
}

function selectLesson(lesson, event) {
  emit('select-lesson', lesson.id, event);
}

watch(() => props.selectedDate, (value) => {
  if (value) moveToDay(value);
});
</script>

<template>
  <section class="timetable-board" aria-labelledby="schedule-day-heading">
    <div class="timetable-board__week-controls">
      <button type="button" aria-label="上一周" @click="changeWeek(-1)">←</button>
      <p><span>本周课表</span><strong>{{ selectedDayLabel }}</strong></p>
      <button type="button" aria-label="下一周" @click="changeWeek(1)">→</button>
    </div>

    <div class="timetable-board__date-rail" aria-label="选择上课日期">
      <button
        v-for="day in weekDays"
        :key="dateKey(day)"
        type="button"
        :class="{ 'is-selected': dateKey(day) === selectedDay }"
        :aria-pressed="dateKey(day) === selectedDay"
        @click="selectDay(day)"
      >
        <span>{{ new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' }).format(day) }}</span>
        <strong>{{ day.getUTCDate() }}</strong>
      </button>
    </div>

    <h2 id="schedule-day-heading" class="visually-hidden">{{ selectedDayLabel }}课程</h2>
    <div class="timetable-board__labels" aria-hidden="true">
      <span>时间</span><span>学生与课程</span><span>年级</span><span>状态</span>
    </div>

    <div v-if="selectedLessons.length" class="timetable-board__rows">
      <button
        v-for="lesson in selectedLessons"
        :key="lesson.id"
        type="button"
        class="schedule-line"
        data-testid="schedule-row"
        :class="`schedule-line--${lesson.status}`"
        @click="selectLesson(lesson, $event)"
      >
        <time :datetime="lesson.startsAt" data-testid="schedule-time">{{ timeLabel(lesson.startsAt) }}</time>
        <span class="schedule-line__lesson">
          <strong>{{ studentNames(lesson) }}</strong>
          <small>{{ courseLabel(lesson) }} · {{ lesson.durationMinutes ?? 60 }} 分钟</small>
        </span>
        <span class="schedule-line__grade">{{ gradeLabel(lesson) }}</span>
        <span class="schedule-line__status">{{ statusLabel(lesson.status) }}</span>
      </button>
    </div>
    <p v-else class="timetable-board__empty">这一天还没有课程。选择“手动排课”可准备一节新课。</p>
  </section>
</template>
