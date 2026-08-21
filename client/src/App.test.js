import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';
import App from './App.vue';
import { createRoleSession } from './state/role-session.js';

const accounts = {
  teacher: [{ id: 'teacher-local-id', name: '陈老师', email: 'teacher@example.test', role: 'teacher' }],
  parent: [{ id: 'parent-local-id', name: '林家长', email: 'parent@example.test', role: 'parent' }],
};

async function chooseRole(wrapper, role) {
  vi.spyOn(api, 'accounts').mockResolvedValueOnce(accounts[role]);
  await wrapper.get(`[data-testid="choose-${role}"]`).trigger('click');
  await flushPromises();
}

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('先展示身份选择，选择教师后只展示教师工作台', async () => {
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    expect(wrapper.get('[data-testid="role-gate"]').text()).toContain('我是教师');

    await chooseRole(wrapper, 'teacher');

    expect(wrapper.get('[data-testid="teacher-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="parent-shell"]').exists()).toBe(false);
  });

  it('选择家长后只展示家长工作台', async () => {
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await chooseRole(wrapper, 'parent');

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
    vi.spyOn(api, 'accounts').mockResolvedValueOnce(accounts.teacher);
    await trigger.trigger('click');
    await flushPromises();

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

    await chooseRole(wrapper, choice === 'choose-teacher' ? 'teacher' : 'parent');
    const switchRole = wrapper.findAll(`[data-testid="${shell}"] button`)
      .find((button) => button.text() === '切换身份');
    await switchRole.trigger('click');
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.get('[data-testid="choose-teacher"]').element);
    wrapper.unmount();
  });

  it('家长工作台只保留 App 拥有的一个 main landmark', async () => {
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await chooseRole(wrapper, 'parent');

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

    await chooseRole(wrapper, 'teacher');
    await wrapper.get('button[aria-controls="teacher-ai-panel"]').trigger('click');
    await wrapper.get('#teacher-schedule-note').setValue('下周一 09:30 林一上英语课');
    await wrapper.get('.teacher-ai-workbench__composer .primary').trigger('click');
    await flushPromises();
    await wrapper.get('.ai-panel .confirm').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="schedule-time"]').map((node) => node.text())).toEqual(['09:30']);
  });

  it('有多个家长账户时等待明确选择并用选中账户加载数据', async () => {
    const parentAccounts = [
      accounts.parent[0],
      { id: 'parent-second-id', name: '周家长', email: 'zhou@example.test', role: 'parent' },
    ];
    vi.spyOn(api, 'accounts').mockResolvedValue(parentAccounts);
    const dashboard = vi.spyOn(api.parent, 'dashboard').mockResolvedValue({ students: [], packages: [] });
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-parent"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="parent-shell"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="account-gate"]').text()).toContain('周家长');

    await wrapper.get('[data-account-id="parent-second-id"]').trigger('click');
    await flushPromises();

    expect(dashboard).toHaveBeenCalledWith('parent-second-id');
    expect(wrapper.get('[data-testid="parent-shell"]').exists()).toBe(true);
  });

  it('刷新后恢复会话中的账户并直接加载对应工作台', async () => {
    createRoleSession().select({ role: 'parent', accountId: 'parent-restored-id' });
    const dashboard = vi.spyOn(api.parent, 'dashboard').mockResolvedValue({ students: [], packages: [] });

    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });
    await flushPromises();

    expect(dashboard).toHaveBeenCalledWith('parent-restored-id');
    expect(wrapper.get('[data-testid="parent-shell"]').exists()).toBe(true);
  });
});
