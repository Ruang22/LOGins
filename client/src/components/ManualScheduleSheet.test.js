import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ManualScheduleSheet from './ManualScheduleSheet.vue';

const students = [
  { id: 'student-a', name: '林一', grade: 8, totalCredits: 12, attendedCredits: 2, reservedCredits: 1, isActive: true },
  { id: 'student-b', name: '周然', grade: 8, totalCredits: 8, attendedCredits: 0, reservedCredits: 0, isActive: true },
  { id: 'student-c', name: '赵宁', grade: 9, totalCredits: 6, attendedCredits: 1, reservedCredits: 0, isActive: true },
];

describe('ManualScheduleSheet', () => {
  it('提交 18:05 的 60 分钟课程，并且只包含同年级学生', async () => {
    const wrapper = mount(ManualScheduleSheet, { props: { students } });

    await wrapper.get('[name="startDate"]').setValue('2032-03-01');
    await wrapper.get('[name="startTime"]').setValue('18:05');
    await wrapper.get('[data-testid="student-student-a"]').setValue(true);
    await wrapper.get('[data-testid="student-student-b"]').setValue(true);
    await wrapper.get('[name="note"]').setValue('考前复习');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('save')).toEqual([[
      expect.objectContaining({
        studentIds: ['student-a', 'student-b'],
        durationMinutes: 60,
        note: '考前复习',
      }),
    ]]);
    expect(wrapper.emitted('save')[0][0].startAt).toMatch(/^2032-03-01T18:05:00(?:Z|[+-]\d{2}:\d{2})$/);
  });

  it('选择一个学生后禁用其他年级，同时保留同年级选择', async () => {
    const wrapper = mount(ManualScheduleSheet, { props: { students } });

    await wrapper.get('[data-testid="student-student-a"]').setValue(true);

    expect(wrapper.get('[data-testid="student-student-b"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[data-testid="student-student-c"]').attributes('disabled')).toBeDefined();
  });

  it('将已选学员、年级和可用课时直接呈现在选择区域', async () => {
    const wrapper = mount(ManualScheduleSheet, { props: { students } });

    await wrapper.get('[data-testid="student-student-a"]').setValue(true);

    expect(wrapper.get('[data-testid="selected-student-summary"]').text()).toContain('已选 1 人');
    expect(wrapper.get('[data-testid="selected-student-summary"]').text()).toContain('8 年级');
    expect(wrapper.get('[data-testid="student-balance-student-a"]').text()).toBe('可用 9 节');
    expect(wrapper.get('[data-testid="student-student-c"]').element.closest('label')?.textContent).toContain('不同年级不可同课');
  });

  it('编辑时复用表单并关闭于 Escape', async () => {
    const lesson = {
      id: 'lesson-1',
      startsAt: '2032-03-01T18:05:00+08:00',
      durationMinutes: 60,
      note: '原备注',
      participants: [{ studentId: 'student-a', student: students[0] }],
    };
    const wrapper = mount(ManualScheduleSheet, {
      attachTo: document.body,
      props: { students, lesson },
    });

    expect(wrapper.get('[name="startTime"]').element.value).toBe('18:05');
    expect(document.activeElement).toBe(wrapper.get('[data-testid="sheet-close"]').element);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(wrapper.get('button[type="submit"]').element);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(wrapper.get('[data-testid="sheet-close"]').element);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('用固定 +08:00 业务时区编辑跨 offset 课程，并在弹层内报告错误', async () => {
    const lesson = {
      id: 'lesson-offset',
      startsAt: '2032-03-01T04:05:00-06:00',
      durationMinutes: 60,
      note: '',
      participants: [{ studentId: 'student-a', student: students[0] }],
    };
    const wrapper = mount(ManualScheduleSheet, {
      props: { students, lesson, error: '时间冲突，请修改后重试。' },
    });

    expect(wrapper.get('[name="startDate"]').element.value).toBe('2032-03-01');
    expect(wrapper.get('[name="startTime"]').element.value).toBe('18:05');
    expect(wrapper.get('[role="alert"]').text()).toBe('时间冲突，请修改后重试。');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('save')[0][0].startAt).toBe('2032-03-01T18:05:00+08:00');
  });
});
