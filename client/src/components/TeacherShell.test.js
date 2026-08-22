import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScheduleBoard from './ScheduleBoard.vue';
import TeacherShell from './TeacherShell.vue';

const earlyLesson = {
  id: 'lesson-early',
  startsAt: '2031-01-02T09:30:00',
  status: 'scheduled',
  participants: [{ student: { name: '林一', grade: 7 } }],
};

const lateLesson = {
  id: 'lesson-late',
  startsAt: '2031-01-02T18:05:00',
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
});

afterEach(() => vi.useRealTimers());
