<script setup>
import { computed } from 'vue';

const props = defineProps({ suggestion: { type: Object, default: null }, students: { type: Array, default: () => [] }, loading: Boolean });
const emit = defineEmits(['confirm', 'dismiss']);
const selectedStudents = computed(() => props.suggestion ? props.students.filter((student) => props.suggestion.studentNames.includes(student.name)) : []);
const hasBalances = computed(() => selectedStudents.value.length === props.suggestion?.studentNames?.length);
const available = (student) => student.totalCredits - student.attendedCredits - student.reservedCredits;
</script>

<template>
  <aside class="ai-panel" aria-label="AI schedule preview">
    <div class="panel-heading"><h2>Schedule with AI</h2><span class="ai-badge">Review first</span></div>
    <p class="panel-copy">Turn a note into a draft. Nothing is added until you confirm it.</p>
    <template v-if="suggestion">
      <div class="preview-stamp">Unscheduled draft</div><h3>{{ suggestion.courseName }}</h3>
      <p class="preview-time">{{ new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(suggestion.startAt)) }} · 60 min</p>
      <ul class="balance-list" aria-label="Student balances"><li v-for="student in selectedStudents" :key="student.id"><span>{{ student.name }} <small>Grade {{ student.grade }}</small></span><strong :class="{ 'low-balance': available(student) < 1 }">{{ available(student) }} available</strong></li></ul>
      <p v-if="!hasBalances" class="validation-message">One or more suggested students could not be matched. Edit the request and retry.</p>
      <div class="preview-actions"><button class="button secondary" type="button" @click="emit('dismiss')">Discard</button><button class="button confirm" type="button" :disabled="loading || !hasBalances" @click="emit('confirm', suggestion)">{{ loading ? 'Saving…' : 'Confirm reservation' }}</button></div>
    </template>
    <p v-else class="empty-preview">Your parsed lesson will appear here as a dashed preview card.</p>
  </aside>
</template>
