import { prisma } from '../db/client.js';

const demoAccounts = {
  'teacher-demo': { email: 'maya.chen.demo.teacher@example.test', role: 'teacher' },
  'parent-demo': { email: 'jordan.rivera.demo.parent@example.test', role: 'parent' },
};

export async function demoAuth(req, res, next) {
  const accountId = req.get('x-demo-user');
  if (!accountId) return res.status(401).json({ code: 'UNAUTHORIZED' });
  const alias = demoAccounts[accountId];
  const user = await prisma.user.findUnique({
    where: alias ? { email: alias.email } : { id: accountId },
  });
  if (!user || (alias && user.role !== alias.role)) {
    return res.status(401).json({ code: 'UNAUTHORIZED' });
  }

  req.demoUser = user;
  return next();
}

export const requireRole = (role) => (req, res, next) =>
  req.demoUser?.role === role ? next() : res.status(403).json({ code: 'FORBIDDEN' });
