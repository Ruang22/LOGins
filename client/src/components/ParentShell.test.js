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

  it('从订单历史恢复待支付模拟订单，并把订单编号交给支付动作', async () => {
    const pendingOrder = {
      id: 'order-1',
      status: 'pending',
      packageName: '进阶课程包',
      paymentMode: 'simulation',
      creditQuantity: 8,
      amountCents: 128000,
      createdAt: '2026-08-22T09:30:00.000Z',
    };
    const wrapper = mount(ParentShell, {
      props: { dashboard: dashboard({ students: [firstChild], orders: [pendingOrder] }) },
    });

    await wrapper.get('[data-testid="simulate-payment-order-1"]').trigger('click');

    expect(wrapper.emitted('simulate-payment')).toHaveLength(1);
    expect(wrapper.emitted('simulate-payment')[0]).toEqual(['order-1']);
  });

  it('以底部导航将老师寄语、教育套餐和排课信息分成互不混排的页面', async () => {
    const wrapper = mount(ParentShell, { props: { dashboard: dashboard({ students: [firstChild] }) } });

    expect(wrapper.get('[data-testid="parent-bottom-navigation"]').attributes('aria-label')).toBe('家长端导航');
    expect(wrapper.get('[data-testid="parent-nav-indicator"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[data-testid="parent-bottom-navigation"]').attributes('style')).toContain('--parent-nav-index: 0');
    expect(wrapper.get('[data-testid="parent-schedule-page"]').attributes('style') ?? '').not.toContain('display: none');
    expect(wrapper.get('[data-testid="parent-message-page"]').attributes('style')).toContain('display: none');
    expect(wrapper.get('[data-testid="parent-packages-page"]').attributes('style')).toContain('display: none');

    await wrapper.get('[data-testid="parent-tab-message"]').trigger('click');
    expect(wrapper.get('[data-testid="parent-message-page"]').attributes('style') ?? '').not.toContain('display: none');
    expect(wrapper.get('[data-testid="parent-schedule-page"]').attributes('style')).toContain('display: none');
    expect(wrapper.get('[data-testid="parent-tab-message"]').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[data-testid="parent-bottom-navigation"]').attributes('style')).toContain('--parent-nav-index: 1');

    await wrapper.get('[data-testid="parent-tab-packages"]').trigger('click');
    expect(wrapper.get('[data-testid="parent-packages-page"]').attributes('style') ?? '').not.toContain('display: none');
    expect(wrapper.get('[data-testid="parent-message-page"]').attributes('style')).toContain('display: none');
    expect(wrapper.get('[data-testid="parent-tab-packages"]').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[data-testid="parent-bottom-navigation"]').attributes('style')).toContain('--parent-nav-index: 2');
  });

  it('按创建时间从新到旧在线性订单轨迹中展示套餐、课时、金额、状态和创建时间', () => {
    const wrapper = mount(ParentShell, {
      props: {
        dashboard: dashboard({
          students: [firstChild],
          orders: [
            {
              id: 'order-earlier',
              packageName: '基础课程包',
              creditQuantity: 8,
              amountCents: 128000,
              paymentMode: 'simulation',
              status: 'paid',
              createdAt: '2026-08-20T09:00:00.000Z',
              paidAt: '2026-08-20T09:01:00.000Z',
            },
            {
              id: 'order-later',
              packageName: '进阶课程包',
              creditQuantity: 12,
              amountCents: 188000,
              paymentMode: 'manual_qr',
              status: 'pending',
              createdAt: '2026-08-22T09:30:00.000Z',
              paidAt: null,
            },
          ],
        }),
      },
    });

    const orderItems = wrapper.get('[data-testid="order-trail"]').findAll('li');

    expect(orderItems).toHaveLength(2);
    expect(orderItems[0].text()).toContain('进阶课程包');
    expect(orderItems[0].text()).toContain('12 节');
    expect(orderItems[0].text()).toContain('¥1,880');
    expect(orderItems[0].text()).toContain('扫码登记（模拟）');
    expect(orderItems[0].text()).toContain('待登记');
    expect(orderItems[0].find('time').attributes('datetime')).toBe('2026-08-22T09:30:00.000Z');
    expect(orderItems[1].text()).toContain('基础课程包');
    expect(orderItems[1].text()).toContain('8 节');
    expect(orderItems[1].text()).toContain('¥1,280');
    expect(orderItems[1].text()).toContain('模拟支付');
    expect(orderItems[1].text()).toContain('已到账');
    expect(orderItems[1].find('time').attributes('datetime')).toBe('2026-08-20T09:00:00.000Z');
  });

  it('没有订单时显示清楚的中文空状态', () => {
    const wrapper = mount(ParentShell, {
      props: { dashboard: dashboard({ students: [firstChild], orders: [] }) },
    });

    expect(wrapper.find('[data-testid="order-trail"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('还没有课程包订单');
  });

  it('展示不可交互的扫码登记模拟区，不给家长确认收款动作', () => {
    const wrapper = mount(ParentShell, { props: { dashboard: dashboard({ students: [firstChild] }) } });

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

  it('在非 +08 设备时区仍把下一课与历史轨迹显示为北京时间 18:05', () => {
    const wrapper = mount(ParentShell, {
      props: {
        dashboard: dashboard({
          students: [{
            ...firstChild,
            lessons: [
              { id: 'lesson-history-timezone', startsAt: '2020-01-02T10:05:00.000Z', status: 'completed' },
              { id: 'lesson-next-timezone', startsAt: '2099-01-03T10:05:00.000Z', status: 'scheduled' },
            ],
          }],
        }),
      },
    });

    expect(wrapper.get('[data-testid="next-lesson-time"]').text()).toBe('18:05');
    expect(wrapper.get('[data-testid="lesson-trail"] time').text()).toContain('18:05');
  });
});
