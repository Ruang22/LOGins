import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ParentShell from './ParentShell.vue';

const firstChild = {
  id: 'student-1',
  name: '林一',
  grade: 7,
  totalCredits: 12,
  attendedCredits: 4,
  reservedCredits: 2,
  lessons: [
    { id: 'lesson-past', startsAt: '2020-01-02T10:00:00.000Z', status: 'completed' },
    { id: 'lesson-next', startsAt: '2099-01-03T09:30:00.000Z', status: 'scheduled' },
  ],
};

const secondChild = {
  id: 'student-2',
  name: '周然',
  grade: 5,
  totalCredits: 20,
  attendedCredits: 1,
  reservedCredits: 1,
  lessons: [{ id: 'lesson-hidden', startsAt: '2099-01-04T11:00:00.000Z', status: 'scheduled' }],
};

function dashboard(overrides = {}) {
  return {
    students: [firstChild, secondChild],
    packages: [],
    ...overrides,
  };
}

describe('ParentShell', () => {
  it('只沿第一位孩子的下一课、历史和剩余课时绘制课程轨迹', () => {
    const wrapper = mount(ParentShell, { props: { dashboard: dashboard() } });

    expect(wrapper.text()).toContain('林一');
    expect(wrapper.text()).toContain('下一节课');
    expect(wrapper.text()).toContain('课程历史');
    expect(wrapper.text()).toContain('6 节');
    expect(wrapper.get('[data-testid="lesson-trail"]').text()).toContain('已完成');
    expect(wrapper.text()).not.toContain('周然');
  });

  it('点击课程包时发出未经改写的原对象', async () => {
    const packageOption = {
      packageId: 'package-basic',
      packageName: '进阶课程包',
      creditQuantity: 8,
      amountCents: 128000,
    };
    const wrapper = mount(ParentShell, {
      props: { dashboard: dashboard({ students: [firstChild], packages: [packageOption] }) },
    });

    await wrapper.get('[data-testid="package-package-basic"]').trigger('click');

    expect(wrapper.emitted('purchase')).toHaveLength(1);
    expect(wrapper.emitted('purchase')[0][0]).toBe(packageOption);
  });

  it('有待支付订单时可继续模拟支付', async () => {
    const pendingOrder = {
      id: 'order-1',
      status: 'pending',
      packageName: '进阶课程包',
      paymentMode: 'simulation',
    };
    const wrapper = mount(ParentShell, {
      props: { dashboard: dashboard({ students: [firstChild] }), pendingOrder },
    });

    await wrapper.get('[data-testid="simulate-payment"]').trigger('click');

    expect(wrapper.emitted('simulate-payment')).toHaveLength(1);
  });

  it('沿课程轨迹展示订单历史和不可交互的扫码登记模拟区', () => {
    const wrapper = mount(ParentShell, {
      props: {
        dashboard: dashboard({
          students: [firstChild],
          orders: [{
            id: 'order-1',
            packageName: '进阶课程包',
            creditQuantity: 8,
            amountCents: 128000,
            paymentMode: 'simulation',
            status: 'paid',
            createdAt: '2026-08-20T09:00:00.000Z',
            paidAt: '2026-08-20T09:01:00.000Z',
          }],
        }),
      },
    });

    expect(wrapper.text()).toContain('订单历史');
    expect(wrapper.text()).toContain('进阶课程包');
    expect(wrapper.get('[data-testid="simulated-qr-registration"]').text()).toContain('扫码登记（模拟）');
    expect(wrapper.find('[data-testid="simulated-qr-registration"] button').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('确认收款');
  });

  it('没有下节课时显示清楚的中文空状态', () => {
    const childWithoutNextLesson = {
      ...firstChild,
      lessons: [{ id: 'lesson-past', startsAt: '2020-01-02T10:00:00.000Z', status: 'completed' }],
    };
    const wrapper = mount(ParentShell, {
      props: { dashboard: dashboard({ students: [childWithoutNextLesson] }) },
    });

    expect(wrapper.get('[data-testid="next-lesson-empty"]').text()).toContain('还没有安排下一节课');
  });
});
