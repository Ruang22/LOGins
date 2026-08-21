import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';
import App from './App.vue';

afterEach(() => vi.restoreAllMocks());

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

  it.each([
    ['教师', 'choose-teacher', 'teacher-shell'],
    ['家长', 'choose-parent', 'parent-shell'],
  ])('%s切换身份后将焦点移回身份选择的第一个入口', async (_label, choice, shell) => {
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { stubs: { RoleGate: false } },
    });

    await wrapper.get(`[data-testid="${choice}"]`).trigger('click');
    await flushPromises();
    const switchRole = wrapper.findAll(`[data-testid="${shell}"] button`)
      .find((button) => button.text() === '切换身份');
    await switchRole.trigger('click');
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.get('[data-testid="choose-teacher"]').element);
    wrapper.unmount();
  });

  it('家长工作台只保留 App 拥有的一个 main landmark', async () => {
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-parent"]').trigger('click');

    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.find('main main').exists()).toBe(false);
  });

  it('确认 AI 草稿后将课表导航到新课程日期', async () => {
    const existingLesson = {
      id: 'lesson-existing',
      startsAt: '2031-01-02T18:05:00',
      durationMinutes: 60,
      status: 'scheduled',
      participants: [{ student: { name: '林一', grade: 7 } }],
    };
    const confirmedLesson = {
      id: 'lesson-confirmed',
      startsAt: '2031-01-06T09:30:00',
      durationMinutes: 60,
      status: 'scheduled',
      participants: [{ student: { name: '林一', grade: 7 } }],
    };
    const suggestion = {
      courseName: '英语课',
      startAt: confirmedLesson.startsAt,
      studentNames: ['林一'],
    };
    const students = [{
      id: 'student-1',
      name: '林一',
      grade: 7,
      totalCredits: 8,
      attendedCredits: 1,
      reservedCredits: 1,
    }];
    vi.spyOn(api.teacher, 'schedule')
      .mockResolvedValueOnce([existingLesson])
      .mockResolvedValue([existingLesson, confirmedLesson]);
    vi.spyOn(api.teacher, 'students').mockResolvedValue(students);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([]);
    vi.spyOn(api.teacher, 'parseSchedule').mockResolvedValue({ suggestion });
    vi.spyOn(api.teacher, 'createLesson').mockResolvedValue(confirmedLesson);
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('button[aria-controls="teacher-ai-panel"]').trigger('click');
    await wrapper.get('#teacher-schedule-note').setValue('下周一 09:30 林一上英语课');
    await wrapper.get('.teacher-ai-workbench__composer .primary').trigger('click');
    await flushPromises();
    await wrapper.get('.ai-panel .confirm').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="schedule-time"]').map((node) => node.text())).toEqual(['09:30']);
  });
});
