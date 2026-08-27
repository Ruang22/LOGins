import { Router } from 'express';
import { prisma } from '../db/client.js';

const accountSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
};

export function createAccountRouter() {
  const router = Router();

  router.get('/accounts', async (req, res, next) => {
    try {
      const role = req.query.role;
      const accounts = await prisma.user.findMany({
        where: role ? { role } : undefined,
        select: accountSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      res.json(accounts);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
