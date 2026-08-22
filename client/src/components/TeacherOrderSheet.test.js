import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TeacherOrderSheet from './TeacherOrderSheet.vue';

const students = [{ id: 'student-a', name: '林一', grade: 8, isActive: true }];

describe('TeacherOrderSheet', () => {
  it('手填扫码登记发出 manual_qr 分单位 payload', async () => {
    const wrapper = mount(TeacherOrderSheet, { props: { students } });

    await wrapper.get('[name="studentId"]').setValue('student-a');
    await wrapper.get('[value="manual"]').setValue();
    await wrapper.get('[name="packageName"]').setValue('冲刺课时包');
    await wrapper.get('[name="creditQuantity"]').setValue('6');
    await wrapper.get('[name="amountYuan"]').setValue('1280.50');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('save')).toEqual([[
      {
        studentId: 'student-a',
        packageName: '冲刺课时包',
        creditQuantity: 6,
        amountCents: 128050,
        paymentMode: 'manual_qr',
      },
    ]]);
    expect(wrapper.text()).toContain('扫码登记（模拟）');
    expect(wrapper.text()).toContain('模拟支付');
  });

  it('关闭按钮获得初始焦点并可用 Escape 关闭', async () => {
    const wrapper = mount(TeacherOrderSheet, { attachTo: document.body, props: { students } });

    expect(document.activeElement).toBe(wrapper.get('[data-testid="sheet-close"]').element);
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
