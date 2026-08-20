import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AiSchedulePreview from './AiSchedulePreview.vue';

describe('AiSchedulePreview', () => {
  it('emits confirmation only after the teacher clicks confirm', async () => {
    const suggestion = { courseName: 'English', startAt: '2031-01-02T10:00:00.000Z', studentNames: ['Avery'] };
    const wrapper = mount(AiSchedulePreview, { props: { suggestion, students: [{ id: 'student-1', name: 'Avery', grade: 8, totalCredits: 3, attendedCredits: 0, reservedCredits: 0 }] } });
    expect(wrapper.get('button.confirm').text()).toBe('确认预约');
    expect(wrapper.emitted('confirm')).toBeUndefined();
    await wrapper.get('button.confirm').trigger('click');
    expect(wrapper.emitted('confirm')).toEqual([[suggestion]]);
  });
});
