import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScheduleBoard from './ScheduleBoard.vue';

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
});
