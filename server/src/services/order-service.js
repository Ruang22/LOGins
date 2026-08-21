import { prisma } from '../db/client.js';
import { getPackage } from '../catalog/package-catalog.js';
import { teacherManualOrderSchema } from '../schemas/order-schema.js';

const MANUAL_QR_PACKAGE_ID = 'manual_qr';

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

function validateTeacherManualOrderInput(input) {
  const parsed = teacherManualOrderSchema.safeParse(input);
  if (!parsed.success) throw new OrderError('INVALID_ORDER');

  if (parsed.data.packageId) {
    const packageOption = getPackage(parsed.data.packageId);
    if (!packageOption) throw new OrderError('INVALID_PACKAGE');
    return packageOption;
  }

  return {
    packageId: MANUAL_QR_PACKAGE_ID,
    packageName: parsed.data.packageName,
    creditQuantity: parsed.data.creditQuantity,
    amountCents: parsed.data.amountCents,
  };
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
    const packageOption = getPackage(order.packageId);
    if (!packageOption) throw new OrderError('INVALID_PACKAGE');
    const paidOrder = await tx.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    await tx.student.update({
      where: { id: order.studentId },
      data: { totalCredits: { increment: packageOption.creditQuantity } },
    });
    return paidOrder;
  }, { isolationLevel: 'Serializable' });
}

export async function createTeacherManualOrder(input, teacherInput) {
  const teacher = requireActor(teacherInput);
  if (teacher.role !== 'teacher') throw new OrderError('FORBIDDEN');
  const orderInput = validateTeacherManualOrderInput(input);

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: { parentId: true, isActive: true },
    });
    if (!student) throw new OrderError('STUDENT_NOT_FOUND');
    if (!student.isActive) throw new OrderError('STUDENT_INACTIVE');
    const order = await tx.order.create({
      data: {
        ...orderInput,
        parentId: student.parentId,
        studentId: input.studentId,
        paymentMode: 'manual_qr',
      },
    });
    await tx.$executeRaw`UPDATE "Order" SET "teacherId" = ${teacher.id} WHERE "id" = ${order.id}`;
    return order;
  });
}

export async function confirmTeacherManualOrder({ orderId } = {}, teacherInput) {
  const teacher = requireActor(teacherInput);
  if (teacher.role !== 'teacher') throw new OrderError('FORBIDDEN');
  if (typeof orderId !== 'string' || !orderId) throw new OrderError('ORDER_NOT_FOUND');

  return prisma.$transaction(async (tx) => {
    await lock(tx, `order:${orderId}`);
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError('ORDER_NOT_FOUND');
    if (order.status === 'paid') throw new OrderError('ORDER_ALREADY_PAID');
    if (order.status !== 'pending') throw new OrderError('ORDER_NOT_PENDING');
    if (order.paymentMode !== 'manual_qr') throw new OrderError('INVALID_PAYMENT_MODE');
    const [ownership] = await tx.$queryRaw`
      SELECT "teacherId" FROM "Order" WHERE "id" = ${order.id}
    `;
    if (ownership?.teacherId !== teacher.id) throw new OrderError('FORBIDDEN');

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
