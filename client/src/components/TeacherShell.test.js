import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScheduleBoard from './ScheduleBoard.vue';
import TeacherShell from './TeacherShell.vue';

const earlyLesson = {
  id: 'lesson-early',
  startsAt: '2031-01-02T09:30:00+08:00',
  status: 'scheduled',
  participants: [{ student: { name: '林一', grade: 7 } }],
};

const lateLesson = {
  id: 'lesson-late',
  startsAt: '2031-01-02T18:05:00+08:00',
  status: 'completed',
  participants: [{ student: { name: '周然', grade: 8 } }],
};

describe('ScheduleBoard', () => {
  it('按开始时间排序课程，并将 09:30 保持为分钟级文本', () => {
    const wrapper = mount(ScheduleBoard, {
      props: { lessons: [lateLesson, earlyLesson], selectedDate: earlyLesson.startsAt },
    });

    expect(wrapper.findAll('[data-testid="schedule-time"]').map((node) => node.text())).toEqual([
      '09:30',
      '18:05',
    ]);
  });

  it('在 UTC 设备时区仍按北京时间显示 18:05 的教师课表与订单时间', async () => {
    const lesson = {
      ...earlyLesson,
      id: 'lesson-business-time',
      startsAt: '2032-03-01T10:05:00.000Z',
    };
    const wrapper = mount(TeacherShell, {
      props: {
        accountId: 'teacher-local-id',
        lessons: [lesson],
        scheduleDate: lesson.startsAt,
        orders: [{
          id: 'order-business-time',
          teacherId: 'teacher-local-id',
          student: { name: '林一' },
          packageName: '时区课程包',
          creditQuantity: 6,
          amountCents: 128000,
          status: 'pending',
          paymentMode: 'manual_qr',
          createdAt: lesson.startsAt,
          paidAt: null,
        }],
      },
    });

    expect(wrapper.get('[data-testid="schedule-time"]').text()).toBe('18:05');
    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('订单')).trigger('click');
    expect(wrapper.get('.teacher-order-action small').text()).toContain('18:05');
  });

  it('异步历史课程首次到达时仍停留在本地日历今天', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-01-03T12:00:00'));
    const wrapper = mount(TeacherShell, {
      props: { lessons: [], students: [], orders: [] },
    });

    await wrapper.setProps({ lessons: [lateLesson, earlyLesson] });

    expect(wrapper.get('.timetable-board__date-rail [aria-pressed="true"]').text()).toContain('3');
    expect(wrapper.find('[data-testid="schedule-time"]').exists()).toBe(false);
  });

  it('异步课程到达时不覆盖教师手动选择的日期', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-01-03T12:00:00'));
    const wrapper = mount(TeacherShell, {
      props: { lessons: [], students: [], orders: [] },
    });

    const nextDay = wrapper.findAll('.timetable-board__date-rail button')
      .find((button) => button.text().includes('4'));
    await nextDay.trigger('click');
    await wrapper.setProps({
      lessons: [{ ...earlyLesson, id: 'lesson-new', startsAt: '2031-01-05T11:45:00' }],
    });

    expect(wrapper.get('.timetable-board__date-rail [aria-pressed="true"]').text()).toContain('4');
    expect(wrapper.find('[data-testid="schedule-time"]').exists()).toBe(false);
  });

  it('从学员与订单名单发出管理操作，并区分两种模拟付款方式', async () => {
    const wrapper = mount(TeacherShell, {
      props: {
        accountId: 'teacher-local-id',
        students: [{ id: 'student-a', name: '林一', grade: 8, totalCredits: 8, attendedCredits: 1, reservedCredits: 1, isActive: true }],
        orders: [{
          id: 'order-a',
          teacherId: 'teacher-local-id',
          student: { name: '林一' },
          packageName: '冲刺课时包',
          creditQuantity: 6,
          amountCents: 128050,
          status: 'pending',
          paymentMode: 'manual_qr',
          createdAt: '2032-03-01T10:00:00Z',
          paidAt: null,
        }],
      },
    });

    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('学员')).trigger('click');
    await wrapper.get('[data-testid="manage-students"]').trigger('click');
    expect(wrapper.emitted('open-student-manager')).toHaveLength(1);

    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('订单')).trigger('click');
    expect(wrapper.text()).toContain('扫码登记（模拟）');
    expect(wrapper.text()).toContain('模拟支付');
    await wrapper.get('[data-testid="open-teacher-order"]').trigger('click');
    await wrapper.get('[data-testid="confirm-order-a"]').trigger('click');

    expect(wrapper.emitted('open-teacher-order')).toHaveLength(1);
    expect(wrapper.emitted('confirm-manual-order')[0][0]).toBe('order-a');
  });

  it('在连续导航轨道中移动激活指示，并保留当前页面语义', async () => {
    const wrapper = mount(TeacherShell, {
      props: {
        students: [{ id: 'student-a', name: '林一', grade: 8, totalCredits: 8, attendedCredits: 1, reservedCredits: 1, isActive: true }],
        orders: [{ id: 'order-a', student: { name: '林一' }, packageName: '冲刺课时包', creditQuantity: 6, amountCents: 128000, status: 'pending', paymentMode: 'manual_qr' }],
      },
    });

    const navigation = wrapper.get('.teacher-nav');
    expect(wrapper.find('[data-testid="teacher-nav-indicator"]').exists()).toBe(true);
    expect(navigation.attributes('data-active-view')).toBe('today');
    expect(navigation.attributes('style')).toContain('--teacher-nav-index: 0');

    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('学员')).trigger('click');

    expect(navigation.attributes('data-active-view')).toBe('students');
    expect(navigation.attributes('style')).toContain('--teacher-nav-index: 2');
    expect(wrapper.get('h1').text()).toContain('学员课时名单');
  });

  it('切换到订单时让教师端滑动指示跟随到第四个位置', async () => {
    const wrapper = mount(TeacherShell, { props: { students: [], orders: [] } });

    await wrapper.findAll('.teacher-nav button').find((button) => button.text().includes('订单')).trigger('click');

    expect(wrapper.get('.teacher-nav').attributes('style')).toContain('--teacher-nav-index: 3');
    expect(wrapper.get('[data-testid="teacher-nav-indicator"]').attributes('aria-hidden')).toBe('true');
  });
});

afterEach(() => vi.useRealTimers());
