import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';
import App from './App.vue';
import { createRoleSession } from './state/role-session.js';

const accounts = {
  teacher: [{ id: 'teacher-local-id', name: '陈老师', email: 'teacher@example.test', role: 'teacher' }],
  parent: [{ id: 'parent-local-id', name: '林家长', email: 'parent@example.test', role: 'parent' }],
};

const managedStudent = {
  id: 'student-a',
  name: '林一',
  grade: 8,
  parent: { name: '林家长', email: 'lin@example.test' },
  totalCredits: 12,
  attendedCredits: 2,
  reservedCredits: 1,
  isActive: true,
};

async function nextFrame() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function chooseRole(wrapper, role) {
  vi.spyOn(api, 'accounts').mockResolvedValueOnce(accounts[role]);
  await wrapper.get(`[data-testid="choose-${role}"]`).trigger('click');
  await flushPromises();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
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
      startsAt: '2031-01-02T18:05:00+08:00',
      durationMinutes: 60,
      status: 'scheduled',
      participants: [{ student: { name: '林一', grade: 7 } }],
    };
    const confirmedLesson = {
      id: 'lesson-confirmed',
      startsAt: '2031-01-06T09:30:00+08:00',
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

  it('手动排课写入服务器，刷新后关闭并恢复触发按钮焦点', async () => {
    vi.spyOn(api.teacher, 'schedule').mockResolvedValue([]);
    vi.spyOn(api.teacher, 'students').mockResolvedValue([managedStudent]);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([]);
    const createLesson = vi.spyOn(api.teacher, 'createLesson')
      .mockRejectedValueOnce(new Error('TIME_CONFLICT'))
      .mockResolvedValue({ id: 'lesson-a' });
    const wrapper = mount(App, { attachTo: document.body, global: { stubs: { RoleGate: false } } });

    await chooseRole(wrapper, 'teacher');
    const trigger = wrapper.get('[data-testid="open-manual-schedule"]');
    await trigger.trigger('click');
    await wrapper.get('[name="startDate"]').setValue('2032-03-01');
    await wrapper.get('[name="startTime"]').setValue('18:05');
    await wrapper.get('[data-testid="student-student-a"]').setValue(true);
    await wrapper.get('[role="dialog"] form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="dialog"] [role="alert"]').text()).toContain('TIME_CONFLICT');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await wrapper.get('[role="dialog"] form').trigger('submit');
    await flushPromises();
    await nextFrame();

    expect(createLesson).toHaveBeenCalledWith(expect.objectContaining({
      studentIds: ['student-a'],
      startAt: expect.stringMatching(/^2032-03-01T18:05:00/),
      durationMinutes: 60,
    }), 'teacher-local-id');
    expect(createLesson).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it('接通学生新增与停用写接口', async () => {
    vi.spyOn(api.teacher, 'schedule').mockResolvedValue([]);
    vi.spyOn(api.teacher, 'students').mockResolvedValue([managedStudent]);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([]);
    const createStudent = vi.spyOn(api.teacher, 'createStudent')
      .mockRejectedValueOnce(new Error('INVALID_STUDENT'))
      .mockResolvedValue(managedStudent);
    const archiveStudent = vi.spyOn(api.teacher, 'archiveStudent').mockResolvedValue({ ...managedStudent, isActive: false });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await chooseRole(wrapper, 'teacher');
    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('学员')).trigger('click');
    await wrapper.get('[data-testid="manage-students"]').trigger('click');
    await wrapper.get('[name="name"]').setValue('周然');
    await wrapper.get('[name="grade"]').setValue('8');
    await wrapper.get('[name="parentName"]').setValue('周家长');
    await wrapper.get('[name="parentEmail"]').setValue('zhou@example.test');
    await wrapper.get('[name="totalCredits"]').setValue('10');
    await wrapper.get('[role="dialog"] form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="dialog"] [role="alert"]').text()).toContain('INVALID_STUDENT');
    await wrapper.get('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(createStudent).toHaveBeenCalledWith(expect.objectContaining({ name: '周然', totalCredits: 10 }), 'teacher-local-id');
    expect(createStudent).toHaveBeenCalledTimes(2);

    await wrapper.get('[data-testid="manage-students"]').trigger('click');
    await wrapper.get('[data-testid="archive-student-a"]').trigger('click');
    await flushPromises();

    expect(archiveStudent).toHaveBeenCalledWith('student-a', 'teacher-local-id');
  });

  it('接通扫码登记与教师确认，并始终使用 manual_qr', async () => {
    const pendingOrder = {
      id: 'order-a',
      teacherId: 'teacher-local-id',
      student: { name: '林一' },
      packageName: '冲刺课时包',
      creditQuantity: 6,
      amountCents: 128050,
      paymentMode: 'manual_qr',
      status: 'pending',
      createdAt: '2032-03-01T10:00:00Z',
      paidAt: null,
    };
    vi.spyOn(api.teacher, 'schedule').mockResolvedValue([]);
    vi.spyOn(api.teacher, 'students').mockResolvedValue([managedStudent]);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([pendingOrder]);
    const createManualOrder = vi.spyOn(api.teacher, 'createManualOrder')
      .mockRejectedValueOnce(new Error('INVALID_ORDER'))
      .mockResolvedValue(pendingOrder);
    const confirmManualOrder = vi.spyOn(api.teacher, 'confirmManualOrder').mockResolvedValue({ ...pendingOrder, status: 'paid' });
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await chooseRole(wrapper, 'teacher');
    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('订单')).trigger('click');
    await wrapper.get('[data-testid="open-teacher-order"]').trigger('click');
    await wrapper.get('[name="studentId"]').setValue('student-a');
    await wrapper.get('[value="manual"]').setValue();
    await wrapper.get('[name="packageName"]').setValue('冲刺课时包');
    await wrapper.get('[name="creditQuantity"]').setValue('6');
    await wrapper.get('[name="amountYuan"]').setValue('1280.50');
    await wrapper.get('[role="dialog"] form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="dialog"] [role="alert"]').text()).toContain('INVALID_ORDER');
    await wrapper.get('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(createManualOrder).toHaveBeenCalledWith(expect.objectContaining({ paymentMode: 'manual_qr', amountCents: 128050 }), 'teacher-local-id');
    expect(createManualOrder).toHaveBeenCalledTimes(2);
    await wrapper.get('[data-testid="confirm-order-a"]').trigger('click');
    await flushPromises();
    expect(confirmManualOrder).toHaveBeenCalledWith('order-a', 'teacher-local-id');
  });

  it('教师切换到另一教师时在新加载完成前清空旧教师数据，失败留在新账户工作台报告', async () => {
    const teacherAccounts = [
      accounts.teacher[0],
      { id: 'teacher-second-id', name: '周老师', email: 'zhou.teacher@example.test', role: 'teacher' },
    ];
    const secondSchedule = deferred();
    const secondStudents = deferred();
    const secondOrders = deferred();
    vi.spyOn(api, 'accounts').mockResolvedValue(teacherAccounts);
    vi.spyOn(api.teacher, 'schedule')
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(secondSchedule.promise);
    vi.spyOn(api.teacher, 'students')
      .mockResolvedValueOnce([{ ...managedStudent, name: '旧教师学员' }])
      .mockReturnValueOnce(secondStudents.promise);
    vi.spyOn(api.teacher, 'orders')
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(secondOrders.promise);
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-account-id="teacher-local-id"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('学员')).trigger('click');
    expect(wrapper.text()).toContain('旧教师学员');

    await wrapper.findAll('[data-testid="teacher-shell"] button').find((button) => button.text() === '切换身份').trigger('click');
    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-account-id="teacher-second-id"]').trigger('click');
    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('学员')).trigger('click');

    expect(wrapper.text()).not.toContain('旧教师学员');
    expect(wrapper.get('.teacher-refresh').text()).toContain('正在刷新');

    secondSchedule.reject(new Error('SECOND_TEACHER_UNAVAILABLE'));
    secondStudents.resolve([]);
    secondOrders.resolve([]);
    await flushPromises();
    expect(wrapper.get('[data-testid="teacher-shell"] [role="alert"]').text()).toContain('SECOND_TEACHER_UNAVAILABLE');
    expect(wrapper.text()).not.toContain('旧教师学员');
  });

  it('家长切换到另一家长时不在加载中或失败后显示旧孩子与旧订单', async () => {
    const parentAccounts = [
      accounts.parent[0],
      { id: 'parent-second-id', name: '周家长', email: 'zhou.parent@example.test', role: 'parent' },
    ];
    const secondDashboard = deferred();
    vi.spyOn(api, 'accounts').mockResolvedValue(parentAccounts);
    vi.spyOn(api.parent, 'dashboard')
      .mockResolvedValueOnce({
        students: [{ ...managedStudent, name: '旧账户孩子', lessons: [] }],
        orders: [{ id: 'old-order', packageName: '旧账户订单', createdAt: '2032-01-01T10:00:00Z' }],
        packages: [],
      })
      .mockReturnValueOnce(secondDashboard.promise);
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-parent"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-account-id="parent-local-id"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('旧账户孩子');
    expect(wrapper.text()).toContain('旧账户订单');

    await wrapper.findAll('[data-testid="parent-shell"] button').find((button) => button.text() === '切换身份').trigger('click');
    await wrapper.get('[data-testid="choose-parent"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-account-id="parent-second-id"]').trigger('click');

    expect(wrapper.text()).not.toContain('旧账户孩子');
    expect(wrapper.text()).not.toContain('旧账户订单');
    expect(wrapper.text()).toContain('正在读取演示课程轨迹');

    secondDashboard.reject(new Error('SECOND_PARENT_UNAVAILABLE'));
    await flushPromises();
    expect(wrapper.get('[data-testid="parent-shell"] [role="alert"]').text()).toContain('SECOND_PARENT_UNAVAILABLE');
    expect(wrapper.text()).not.toContain('旧账户孩子');
    expect(wrapper.text()).not.toContain('旧账户订单');
  });

  it('教师与家长之间切换时清除 AI 草稿、suggestion、订单、错误和打开的工作流', async () => {
    const suggestion = {
      courseName: '英语课',
      startAt: '2032-03-01T18:05:00+08:00',
      studentNames: ['林一'],
    };
    vi.spyOn(api, 'accounts').mockImplementation(async (role) => accounts[role]);
    vi.spyOn(api.teacher, 'schedule').mockResolvedValue([]);
    vi.spyOn(api.teacher, 'students').mockResolvedValue([managedStudent]);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([]);
    vi.spyOn(api.teacher, 'parseSchedule').mockResolvedValue({ suggestion });
    vi.spyOn(api.parent, 'dashboard').mockResolvedValue({ students: [], orders: [], packages: [] });
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('button[aria-controls="teacher-ai-panel"]').trigger('click');
    await wrapper.get('#teacher-schedule-note').setValue('必须清除的旧草稿');
    await wrapper.get('.teacher-ai-workbench__composer .primary').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="open-manual-schedule"]').trigger('click');
    expect(wrapper.get('[role="dialog"]').exists()).toBe(true);

    await wrapper.findAll('[data-testid="teacher-shell"] button').find((button) => button.text() === '切换身份').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await wrapper.get('[data-testid="choose-parent"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('[data-testid="parent-shell"] button').find((button) => button.text() === '切换身份').trigger('click');
    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('button[aria-controls="teacher-ai-panel"]').trigger('click');

    expect(wrapper.get('#teacher-schedule-note').element.value).toBe('');
    expect(wrapper.text()).not.toContain('必须清除的旧草稿');
    expect(wrapper.find('.ai-panel .preview-stamp').exists()).toBe(false);
  });

  it('切换账户后忽略旧账户晚返回的 AI 失败与加载状态', async () => {
    const oldParse = deferred();
    const teacherAccounts = [
      accounts.teacher[0],
      { id: 'teacher-second-id', name: '周老师', email: 'zhou.teacher@example.test', role: 'teacher' },
    ];
    vi.spyOn(api, 'accounts').mockResolvedValue(teacherAccounts);
    vi.spyOn(api.teacher, 'schedule').mockResolvedValue([]);
    vi.spyOn(api.teacher, 'students').mockResolvedValue([managedStudent]);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([]);
    const parseSchedule = vi.spyOn(api.teacher, 'parseSchedule').mockReturnValue(oldParse.promise);
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-account-id="teacher-local-id"]').trigger('click');
    await flushPromises();
    await wrapper.get('button[aria-controls="teacher-ai-panel"]').trigger('click');
    await wrapper.get('#teacher-schedule-note').setValue('旧账户进行中的草稿');
    await wrapper.get('.teacher-ai-workbench__composer .primary').trigger('click');
    expect(parseSchedule).toHaveBeenCalledTimes(1);
    await wrapper.findAll('[data-testid="teacher-shell"] button').find((button) => button.text() === '切换身份').trigger('click');
    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-account-id="teacher-second-id"]').trigger('click');
    await flushPromises();

    oldParse.reject(new Error('OLD_ACCOUNT_FAILURE'));
    await flushPromises();
    await wrapper.get('button[aria-controls="teacher-ai-panel"]').trigger('click');

    expect(wrapper.get('#teacher-schedule-note').element.value).toBe('');
    expect(wrapper.find('[data-testid="teacher-shell"] [role="alert"]').exists()).toBe(false);
    expect(wrapper.get('.teacher-refresh').text()).toBe('刷新');
  });

  it('切换账户后旧写入的延迟刷新不能在新教师会话发布通知', async () => {
    const teacherAccounts = [
      accounts.teacher[0],
      { id: 'teacher-second-id', name: '周老师', email: 'zhou.teacher@example.test', role: 'teacher' },
    ];
    const oldScheduleRefresh = deferred();
    const oldStudentRefresh = deferred();
    const oldOrderRefresh = deferred();
    vi.spyOn(api, 'accounts').mockResolvedValue(teacherAccounts);
    vi.spyOn(api.teacher, 'schedule')
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(oldScheduleRefresh.promise)
      .mockResolvedValueOnce([]);
    vi.spyOn(api.teacher, 'students')
      .mockResolvedValueOnce([managedStudent])
      .mockReturnValueOnce(oldStudentRefresh.promise)
      .mockResolvedValueOnce([]);
    vi.spyOn(api.teacher, 'orders')
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(oldOrderRefresh.promise)
      .mockResolvedValueOnce([]);
    vi.spyOn(api.teacher, 'createStudent').mockResolvedValue(managedStudent);
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-account-id="teacher-local-id"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('学员')).trigger('click');
    await wrapper.get('[data-testid="manage-students"]').trigger('click');
    await wrapper.get('[name="name"]').setValue('延迟写入学员');
    await wrapper.get('[name="grade"]').setValue('8');
    await wrapper.get('[name="parentName"]').setValue('延迟家长');
    await wrapper.get('[name="parentEmail"]').setValue('delayed@example.test');
    await wrapper.get('[name="totalCredits"]').setValue('2');
    await wrapper.get('[role="dialog"] form').trigger('submit');
    await flushPromises();

    await wrapper.findAll('[data-testid="teacher-shell"] button').find((button) => button.text() === '切换身份').trigger('click');
    await wrapper.get('[data-testid="choose-teacher"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-account-id="teacher-second-id"]').trigger('click');
    await flushPromises();

    oldScheduleRefresh.resolve([]);
    oldStudentRefresh.resolve([managedStudent]);
    oldOrderRefresh.resolve([]);
    await flushPromises();

    expect(wrapper.find('[data-testid="teacher-shell"] [role="status"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('学员已新增');
  });

  it('在非 +08 设备时区仍在课程抽屉显示北京时间 18:05', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2032-03-01T12:00:00.000Z'));
    const lesson = {
      id: 'lesson-drawer-timezone',
      startsAt: '2032-03-01T10:05:00.000Z',
      durationMinutes: 60,
      status: 'scheduled',
      participants: [{ student: { name: '林一', grade: 8 } }],
    };
    vi.spyOn(api.teacher, 'schedule').mockResolvedValue([lesson]);
    vi.spyOn(api.teacher, 'students').mockResolvedValue([managedStudent]);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([]);
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await chooseRole(wrapper, 'teacher');
    await wrapper.get('[data-testid="schedule-row"]').trigger('click');

    expect(wrapper.get('[role="dialog"]').text()).toContain('18:05');
  });

  it('课程抽屉写入失败时在抽屉内报告错误并保留重试动作', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2032-03-01T12:00:00.000Z'));
    const lesson = {
      id: 'lesson-transition-retry',
      startsAt: '2032-03-01T10:05:00.000Z',
      durationMinutes: 60,
      status: 'scheduled',
      participants: [{ student: { name: '林一', grade: 8 } }],
    };
    vi.spyOn(api.teacher, 'schedule').mockResolvedValue([lesson]);
    vi.spyOn(api.teacher, 'students').mockResolvedValue([managedStudent]);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([]);
    const updateLesson = vi.spyOn(api.teacher, 'updateLesson')
      .mockRejectedValueOnce(new Error('WRITE_FAILED'))
      .mockResolvedValueOnce({ ...lesson, status: 'completed' });
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await chooseRole(wrapper, 'teacher');
    await wrapper.get('[data-testid="schedule-row"]').trigger('click');
    const completeAction = () => wrapper.get('[role="dialog"]').findAll('button')
      .find((button) => button.text() === '标记为已完成');
    await completeAction().trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="dialog"] [role="alert"]').text()).toContain('WRITE_FAILED');
    expect(wrapper.find('main [role="alert"]').exists()).toBe(false);
    expect(completeAction().attributes('disabled')).toBeUndefined();

    await completeAction().trigger('click');
    await flushPromises();
    expect(updateLesson).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('课程状态写入成功但课表刷新失败时保留可见恢复状态且不发布成功通知', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2032-03-01T12:00:00.000Z'));
    const lesson = {
      id: 'lesson-refresh-failure',
      startsAt: '2032-03-01T10:05:00.000Z',
      durationMinutes: 60,
      status: 'scheduled',
      participants: [{ student: { name: '林一', grade: 8 } }],
    };
    vi.spyOn(api.teacher, 'schedule')
      .mockResolvedValueOnce([lesson])
      .mockRejectedValueOnce(new Error('REFRESH_FAILED'));
    vi.spyOn(api.teacher, 'students').mockResolvedValue([managedStudent]);
    vi.spyOn(api.teacher, 'orders').mockResolvedValue([]);
    vi.spyOn(api.teacher, 'updateLesson').mockResolvedValue({ ...lesson, status: 'completed' });
    const wrapper = mount(App, { global: { stubs: { RoleGate: false } } });

    await chooseRole(wrapper, 'teacher');
    await wrapper.get('[data-testid="schedule-row"]').trigger('click');
    await wrapper.get('[role="dialog"]').findAll('button')
      .find((button) => button.text() === '标记为已完成')
      .trigger('click');
    await flushPromises();

    const drawer = wrapper.get('[role="dialog"]');
    expect(drawer.get('[role="alert"]').text()).toContain('REFRESH_FAILED');
    expect(drawer.text()).toContain('已完成');
    expect(drawer.findAll('button').some((button) => button.text() === '标记为已完成')).toBe(false);
    expect(wrapper.find('[data-testid="teacher-shell"] [role="status"]').exists()).toBe(false);
  });
});
