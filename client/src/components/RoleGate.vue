<script setup>
import { ref } from 'vue';

const emit = defineEmits(['select']);
const activatedRole = ref(null);
const firstRoleChoice = ref(null);

function choose(role, event) {
  activatedRole.value = role;
  event.currentTarget.classList.add('is-active');
  event.currentTarget.closest('.role-board')?.classList.add('is-choosing');
  emit('select', role);
}

function focus() {
  firstRoleChoice.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <section class="role-gate" data-testid="role-gate" aria-labelledby="role-gate-title">
    <header class="role-gate__masthead">
      <p class="role-gate__wordmark"><span aria-hidden="true">课</span> 课堂时刻牌</p>
      <p class="role-gate__session">合成演示 · 本次会话</p>
    </header>

    <div class="role-gate__content">
      <div class="role-gate__intro">
        <p>课堂时刻牌</p>
        <h1 id="role-gate-title">请选择您的身份</h1>
        <p>同一堂课，两种清晰的工作视角。</p>
      </div>

      <div
        class="role-board"
        :class="{ 'is-choosing': activatedRole }"
        aria-label="教师或家长身份"
      >
        <div class="role-board__rail" aria-hidden="true">
          <span>身份</span><span>今日入口</span><span>进入</span>
        </div>

        <button
          ref="firstRoleChoice"
          class="role-choice role-choice--teacher"
          :class="{ 'is-active': activatedRole === 'teacher' }"
          type="button"
          data-testid="choose-teacher"
          @click="choose('teacher', $event)"
        >
          <span class="role-choice__face">
            <span class="role-choice__index" aria-hidden="true">师</span>
            <span class="role-choice__body">
              <span class="role-choice__eyebrow">教师工作台</span>
              <span class="role-choice__title">我是教师</span>
              <span class="role-choice__minute"><time datetime="09:30">09:30</time> 英语课</span>
            </span>
            <span class="role-choice__arrow" aria-hidden="true">→</span>
          </span>
        </button>

        <button
          class="role-choice role-choice--parent"
          :class="{ 'is-active': activatedRole === 'parent' }"
          type="button"
          data-testid="choose-parent"
          @click="choose('parent', $event)"
        >
          <span class="role-choice__face">
            <span class="role-choice__index" aria-hidden="true">家</span>
            <span class="role-choice__body">
              <span class="role-choice__eyebrow">家庭课程中心</span>
              <span class="role-choice__title">我是家长</span>
              <span class="role-choice__minute role-choice__minute--parent">
                <span>1 名孩子</span><span>剩余 8 节课</span>
              </span>
            </span>
            <span class="role-choice__arrow" aria-hidden="true">→</span>
          </span>
        </button>
      </div>
    </div>

    <p class="role-gate__note">轻触一面进入 · 可随时切换身份</p>
  </section>
</template>
