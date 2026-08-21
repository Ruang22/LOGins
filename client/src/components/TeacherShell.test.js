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
});

afterEach(() => vi.useRealTimers());
