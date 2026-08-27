<script setup>
import { computed } from 'vue';
import { formatBusinessDate } from '../business-time.js';

const props = defineProps({ suggestion: { type: Object, default: null }, students: { type: Array, default: () => [] }, loading: Boolean });
const emit = defineEmits(['confirm', 'dismiss']);
const selectedStudents = computed(() => props.suggestion ? props.students.filter((student) => props.suggestion.studentNames.includes(student.name)) : []);
const hasBalances = computed(() => selectedStudents.value.length === props.suggestion?.studentNames?.length);
const available = (student) => student.totalCredits - student.attendedCredits - student.reservedCredits;
const formatSuggestionTime = (value) => formatBusinessDate(value, {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  month: 'numeric',
  day: 'numeric',
  hourCycle: 'h23',
});
</script>

<template>
  <aside class="ai-panel" aria-label="AI 排课预览">
    <div class="panel-heading"><h2>使用 AI 排课</h2><span class="ai-badge">先审核</span></div>
    <p class="panel-copy">将描述转换为草稿。确认前不会添加任何课程。</p>
    <template v-if="suggestion">
      <div class="preview-stamp">未排课草稿</div><h3>{{ suggestion.courseName }}</h3>
      <p class="preview-time">{{ formatSuggestionTime(suggestion.startAt) }} · 60 分钟</p>
      <ul class="balance-list" aria-label="学生课时余额"><li v-for="student in selectedStudents" :key="student.id"><span>{{ student.name }} <small>{{ student.grade }} 年级</small></span><strong :class="{ 'low-balance': available(student) < 1 }">可用 {{ available(student) }} 节</strong></li></ul>
      <p v-if="!hasBalances" class="validation-message">无法匹配一个或多个建议学生。请修改描述后重试。</p>
      <div class="preview-actions"><button class="button secondary" type="button" @click="emit('dismiss')">丢弃</button><button class="button confirm" type="button" :disabled="loading || !hasBalances" @click="emit('confirm', suggestion)">{{ loading ? '正在保存…' : '确认预约' }}</button></div>
    </template>
    <p v-else class="empty-preview">解析后的课程会以虚线预览卡片显示在这里。</p>
  </aside>
</template>
