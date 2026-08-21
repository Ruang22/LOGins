import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
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
      props: { lessons: [lateLesson, earlyLesson] },
    });

    expect(wrapper.findAll('[data-testid="schedule-time"]').map((node) => node.text())).toEqual([
      '09:30',
      '18:05',
    ]);
  });

  it('异步课程首次到达时选中课程日期，但不覆盖之后的手动选日', async () => {
    const wrapper = mount(TeacherShell, {
      props: { lessons: [], students: [], orders: [] },
    });

    await wrapper.setProps({ lessons: [lateLesson, earlyLesson] });

    expect(wrapper.findAll('[data-testid="schedule-time"]').map((node) => node.text())).toEqual([
      '09:30',
      '18:05',
    ]);

    const nextDay = wrapper.findAll('.timetable-board__date-rail button')
      .find((button) => button.text().includes('3'));
    await nextDay.trigger('click');
    await wrapper.setProps({
      lessons: [{ ...earlyLesson, id: 'lesson-new', startsAt: '2031-01-04T11:45:00' }],
    });

    expect(wrapper.get('.timetable-board__date-rail [aria-pressed="true"]').text()).toContain('3');
    expect(wrapper.find('[data-testid="schedule-time"]').exists()).toBe(false);
  });
});
