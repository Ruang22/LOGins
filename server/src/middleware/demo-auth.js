import { prisma } from '../db/client.js';

const demoAccounts = {
  'teacher-demo': { email: 'maya.chen.demo.teacher@example.test', role: 'teacher' },
  'parent-demo': { email: 'jordan.rivera.demo.parent@example.test', role: 'parent' },
};

export async function demoAuth(req, res, next) {
  const account = demoAccounts[req.get('x-demo-user')];
  if (!account) return res.status(401).json({ code: 'UNAUTHORIZED' });

  const user = await prisma.user.findUnique({ where: { email: account.email } });
  if (!user || user.role !== account.role) return res.status(401).json({ code: 'UNAUTHORIZED' });

  req.demoUser = user;
  return next();
}

export const requireRole = (role) => (req, res, next) =>
  req.demoUser?.role === role ? next() : res.status(403).json({ code: 'FORBIDDEN' });
