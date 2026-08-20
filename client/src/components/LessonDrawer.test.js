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
});
