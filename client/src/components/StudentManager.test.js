import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudentManager from './StudentManager.vue';

const student = {
  id: 'student-a',
  name: '林一',
  grade: 8,
  parent: { name: '林家长', email: 'lin@example.test' },
  totalCredits: 12,
  attendedCredits: 2,
  reservedCredits: 1,
  isActive: true,
};

afterEach(() => vi.restoreAllMocks());

describe('StudentManager', () => {
  it('从完整资料表单发出 create', async () => {
    const wrapper = mount(StudentManager, { props: { students: [] } });

    await wrapper.get('[name="name"]').setValue('周然');
    await wrapper.get('[name="grade"]').setValue('8');
    await wrapper.get('[name="parentName"]').setValue('周家长');
    await wrapper.get('[name="parentEmail"]').setValue('zhou@example.test');
    await wrapper.get('[name="totalCredits"]').setValue('10');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('create')).toEqual([[
      {
        name: '周然',
        grade: 8,
        parentName: '周家长',
        parentEmail: 'zhou@example.test',
        totalCredits: 10,
      },
    ]]);
  });

  it('编辑学生时发出 update', async () => {
    const wrapper = mount(StudentManager, { props: { students: [student] } });

    await wrapper.get('[data-testid="edit-student-a"]').trigger('click');
    await wrapper.get('[name="totalCredits"]').setValue('14');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('update')).toEqual([[
      {
        id: 'student-a',
        input: expect.objectContaining({ totalCredits: 14, parentEmail: 'lin@example.test' }),
      },
    ]]);
  });

  it('停用前要求确认，确认后发出 archive', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(StudentManager, { props: { students: [student] } });

    await wrapper.get('[data-testid="archive-student-a"]').trigger('click');

    expect(confirm).toHaveBeenCalledWith('确认停用林一？历史课程和订单仍会保留。');
    expect(wrapper.emitted('archive')).toEqual([['student-a']]);
  });

  it('在弹层内报告错误并将键盘焦点环回', async () => {
    const wrapper = mount(StudentManager, {
      attachTo: document.body,
      props: { students: [], error: '家长邮箱已被其他角色使用。' },
    });

    expect(wrapper.get('[role="alert"]').text()).toBe('家长邮箱已被其他角色使用。');
    expect(document.activeElement).toBe(wrapper.get('[data-testid="sheet-close"]').element);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(wrapper.get('button[type="submit"]').element);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
