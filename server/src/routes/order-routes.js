import { Router } from 'express';
import { prisma } from '../db/client.js';
import { requireRole } from '../middleware/demo-auth.js';
import { confirmSimulationOrder, createOrder, OrderError } from '../services/order-service.js';

function respondToOrderError(error, res) {
  if (!(error instanceof OrderError)) return false;
  const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'STUDENT_NOT_FOUND' || error.code === 'ORDER_NOT_FOUND' ? 404 : 400;
  res.status(status).json({ code: error.code });
  return true;
}

export function createParentOrderRouter() {
  const router = Router();
  router.use(requireRole('parent'));

  router.post('/orders', async (req, res, next) => {
    try {
      const order = await createOrder(req.body, req.demoUser);
      res.status(201).json({ ...order, paymentMode: 'simulation' });
    } catch (error) {
      if (!respondToOrderError(error, res)) next(error);
    }
  });

  router.post('/orders/:id/simulate-payment', async (req, res, next) => {
    try {
      const order = await confirmSimulationOrder(req.params.id, req.demoUser);
      res.json({ ...order, paymentMode: 'simulation' });
    } catch (error) {
      if (!respondToOrderError(error, res)) next(error);
    }
  });
  return router;
}

export function createTeacherOrderRouter() {
  const router = Router();
  router.use(requireRole('teacher'));

  router.get('/orders', async (_req, res, next) => {
    try {
      const orders = await prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        include: { student: { select: { id: true, name: true, grade: true } }, parent: { select: { id: true, name: true } } },
      });
      res.json(orders.map((order) => ({ ...order, paymentMode: 'simulation' })));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/orders/:id/confirm', async (req, res, next) => {
    try {
      const order = await confirmSimulationOrder(req.params.id, req.demoUser);
      res.json({ ...order, paymentMode: 'simulation' });
    } catch (error) {
      if (!respondToOrderError(error, res)) next(error);
    }
  });
  return router;
}
