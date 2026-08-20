import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RoleGate from './RoleGate.vue';

describe('RoleGate', () => {
  it('选择家长时只发出 parent 身份', async () => {
    const wrapper = mount(RoleGate);

    await wrapper.get('[data-testid="choose-parent"]').trigger('click');

    expect(wrapper.emitted('select')).toEqual([['parent']]);
  });
});
