import { prisma } from '../db/client.js';
import { getPackage } from '../catalog/package-catalog.js';

class OrderError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
  }
}

function requireActor(actor) {
  if (!actor?.id || !actor?.role) throw new OrderError('UNAUTHORIZED');
  return actor;
}

function validateOrderInput(input) {
  const { studentId, packageId } = input ?? {};
  if (
    typeof studentId !== 'string' || !studentId
    || typeof packageId !== 'string' || !packageId
  ) {
    throw new OrderError('INVALID_ORDER');
  }
  const packageOption = getPackage(packageId);
  if (!packageOption) throw new OrderError('INVALID_PACKAGE');
  return { studentId, ...packageOption };
}

async function lock(tx, value) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${value}))`;
}

export async function createOrder(input, parent) {
  const actor = requireActor(parent);
  if (actor.role !== 'parent') throw new OrderError('FORBIDDEN');
  const orderInput = validateOrderInput(input);

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({ where: { id: orderInput.studentId }, select: { parentId: true } });
    if (!student) throw new OrderError('STUDENT_NOT_FOUND');
    if (student.parentId !== actor.id) throw new OrderError('FORBIDDEN');
    return tx.order.create({ data: { ...orderInput, parentId: actor.id, paymentMode: 'simulation' } });
  });
}

export async function confirmSimulationOrder(orderId, actorInput) {
  const actor = requireActor(actorInput);
  if (typeof orderId !== 'string' || !orderId) throw new OrderError('ORDER_NOT_FOUND');
  if (actor.role !== 'parent') throw new OrderError('FORBIDDEN');

  return prisma.$transaction(async (tx) => {
    await lock(tx, `order:${orderId}`);
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError('ORDER_NOT_FOUND');
    if (order.parentId !== actor.id) throw new OrderError('FORBIDDEN');
    if (order.status !== 'pending') throw new OrderError('ORDER_NOT_PENDING');

    if (order.paymentMode !== 'simulation') throw new OrderError('INVALID_PAYMENT_MODE');
    const paidOrder = await tx.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    await tx.student.update({
      where: { id: order.studentId },
      data: { totalCredits: { increment: order.creditQuantity } },
    });
    return paidOrder;
  }, { isolationLevel: 'Serializable' });
}

export { OrderError };
