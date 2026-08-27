import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RoleGate from './RoleGate.vue';

describe('RoleGate', () => {
  it('展示两个中文身份入口和完整教师时刻提示', () => {
    const wrapper = mount(RoleGate);
    const teacher = wrapper.get('[data-testid="choose-teacher"]');
    const parent = wrapper.get('[data-testid="choose-parent"]');

    expect(teacher.attributes('type')).toBe('button');
    expect(parent.attributes('type')).toBe('button');
    expect(teacher.text()).toContain('我是教师');
    expect(parent.text()).toContain('我是家长');
    expect.soft(teacher.element.textContent).toContain('09:30 英语课');
    expect.soft(wrapper.text()).not.toMatch(/[A-Za-z]/);
  });

  it('选择家长时只发出 parent 身份', async () => {
    const wrapper = mount(RoleGate);

    await wrapper.get('[data-testid="choose-parent"]').trigger('click');

    expect(wrapper.emitted('select')).toEqual([['parent']]);
  });
});
