<script setup>
import { onMounted, reactive, ref } from 'vue';

const props = defineProps({ students: { type: Array, default: () => [] }, loading: Boolean });
const emit = defineEmits(['create', 'update', 'archive', 'close']);
const emptyForm = () => ({ name: '', grade: 7, parentName: '', parentEmail: '', totalCredits: 0 });
const dialog = ref(null);
const closeButton = ref(null);
const editingId = ref(null);
const form = reactive(emptyForm());

function resetForm() {
  editingId.value = null;
  Object.assign(form, emptyForm());
}

function edit(student) {
  editingId.value = student.id;
  Object.assign(form, {
    name: student.name,
    grade: student.grade,
    parentName: student.parent?.name ?? '',
    parentEmail: student.parent?.email ?? '',
    totalCredits: student.totalCredits,
  });
}

function payload() {
  return {
    name: form.name.trim(),
    grade: Number(form.grade),
    parentName: form.parentName.trim(),
    parentEmail: form.parentEmail.trim(),
    totalCredits: Number(form.totalCredits),
  };
}

function submit() {
  if (editingId.value) emit('update', { id: editingId.value, input: payload() });
  else emit('create', payload());
}

function archive(student) {
  if (window.confirm(`确认停用${student.name}？历史课程和订单仍会保留。`)) emit('archive', student.id);
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
    <section ref="dialog" class="workflow-sheet workflow-sheet--wide" role="dialog" aria-modal="true" aria-labelledby="student-manager-title" @keydown="trapFocus">
      <header class="workflow-sheet__header">
        <div><p>教师学员名单</p><h2 id="student-manager-title">学员管理</h2></div>
        <button ref="closeButton" data-testid="sheet-close" type="button" aria-label="关闭学员管理" @click="emit('close')">×</button>
      </header>

      <div class="workflow-manager">
        <section class="workflow-manager__list" aria-labelledby="managed-students-title">
          <h3 id="managed-students-title">现有学员</h3>
          <div v-for="student in students" :key="student.id" class="workflow-manager__row">
            <div><strong>{{ student.name }}</strong><small>{{ student.grade }} 年级 · {{ student.parent?.name }} · {{ student.isActive === false ? '已停用' : '使用中' }}</small></div>
            <div class="workflow-manager__row-actions">
              <button type="button" :data-testid="`edit-${student.id}`" :disabled="loading || student.isActive === false" @click="edit(student)">编辑</button>
              <button type="button" :data-testid="`archive-${student.id}`" :disabled="loading || student.isActive === false" @click="archive(student)">停用</button>
            </div>
          </div>
          <p v-if="!students.length">还没有学员。</p>
        </section>

        <form class="workflow-form" @submit.prevent="submit">
          <div class="workflow-form__title">
            <h3>{{ editingId ? '编辑学员' : '新增学员' }}</h3>
            <button v-if="editingId" type="button" @click="resetForm">改为新增</button>
          </div>
          <label>姓名<input v-model="form.name" name="name" required maxlength="40"></label>
          <label>年级<input v-model="form.grade" name="grade" type="number" min="7" max="12" step="1" required></label>
          <label>家长姓名<input v-model="form.parentName" name="parentName" required maxlength="40"></label>
          <label>家长邮箱<input v-model="form.parentEmail" name="parentEmail" type="email" required></label>
          <label>总课时<input v-model="form.totalCredits" name="totalCredits" type="number" min="0" step="1" required></label>
          <button class="confirm" type="submit" :disabled="loading">{{ loading ? '正在保存…' : editingId ? '保存修改' : '新增学员' }}</button>
        </form>
      </div>
    </section>
  </div>
</template>
