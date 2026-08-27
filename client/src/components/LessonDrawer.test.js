import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LessonDrawer from './LessonDrawer.vue';

const props = { lesson: { startsAt: '2031-01-02T10:00:00.000Z', durationMinutes: 60 }, participants: () => 'Avery', formatDate: () => 'Thu, Jan 2, 10:00 AM' };

describe('LessonDrawer', () => {
  it('focuses its close control and closes on Escape', async () => {
    const wrapper = mount(LessonDrawer, { attachTo: document.body, props });
    expect(wrapper.get('.drawer-close').attributes('aria-label')).toBe('关闭课程详情');
    expect(document.activeElement).toBe(wrapper.get('.drawer-close').element);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('为尚未结束的课程发出编辑请求', async () => {
    const wrapper = mount(LessonDrawer, {
      props: { ...props, lesson: { ...props.lesson, status: 'scheduled' } },
    });

    await wrapper.get('[data-testid="edit-lesson"]').trigger('click');

    expect(wrapper.emitted('edit')).toHaveLength(1);
  });

  it.each(['completed', 'cancelled'])('%s 课程不展示编辑、完成或取消动作', (status) => {
    const wrapper = mount(LessonDrawer, {
      props: { ...props, lesson: { ...props.lesson, status } },
    });

    expect(wrapper.get('.preview-actions').text()).not.toContain('编辑课程');
    expect(wrapper.get('.preview-actions').text()).not.toContain('取消预约');
    expect(wrapper.get('.preview-actions').text()).not.toContain('标记为已完成');
  });

  it('在抽屉内以 alert 显示写入错误并保留合法动作供重试', () => {
    const wrapper = mount(LessonDrawer, {
      props: {
        ...props,
        lesson: { ...props.lesson, status: 'scheduled' },
        error: '无法完成课程（WRITE_FAILED）。',
      },
    });

    expect(wrapper.get('[role="alert"]').text()).toContain('WRITE_FAILED');
    const actions = wrapper.get('.preview-actions').findAll('button');
    expect(actions.find((button) => button.text() === '标记为已完成').attributes('disabled')).toBeUndefined();
    expect(actions.find((button) => button.text() === '取消预约').attributes('disabled')).toBeUndefined();
  });
});
