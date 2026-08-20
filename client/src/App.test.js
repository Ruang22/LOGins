import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import App from './App.vue';

describe('App', () => {
  it('先展示身份选择，选择教师后只展示教师工作台', async () => {
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    expect(wrapper.get('[data-testid="role-gate"]').text()).toContain('我是教师');

    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');

    expect(wrapper.get('[data-testid="teacher-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="parent-shell"]').exists()).toBe(false);
  });

  it('选择家长后只展示家长工作台', async () => {
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-parent"]').trigger('click');

    expect(wrapper.get('[data-testid="parent-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="teacher-shell"]').exists()).toBe(false);
  });

  it('选择身份后将焦点移至工作台标题', async () => {
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { stubs: { RoleGate: false } },
    });
    const trigger = wrapper.get('[data-testid="choose-teacher"]');

    trigger.element.focus();
    await trigger.trigger('click');

    expect(document.activeElement).toBe(wrapper.get('[data-testid="workbench-destination"]').element);
    wrapper.unmount();
  });
});
