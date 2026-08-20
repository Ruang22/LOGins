import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const teacher = {
  name: 'Maya Chen (Demo Teacher)',
  email: 'maya.chen.demo.teacher@example.test',
  role: 'teacher',
};

const parent = {
  name: 'Jordan Rivera (Demo Parent)',
  email: 'jordan.rivera.demo.parent@example.test',
  role: 'parent',
};

const students = [
  {
    name: 'Avery Rivera (Demo Student)',
    grade: 8,
    totalCredits: 12,
    attendedCredits: 3,
    reservedCredits: 1,
  },
  {
    name: 'Noah Rivera (Demo Student)',
    grade: 10,
    totalCredits: 8,
    attendedCredits: 2,
    reservedCredits: 0,
  },
];

export async function seedDatabase(prisma) {
  await prisma.user.upsert({
    where: { email: teacher.email },
    update: teacher,
    create: teacher,
  });

  const seededParent = await prisma.user.upsert({
    where: { email: parent.email },
    update: parent,
    create: parent,
  });

  for (const student of students) {
    await prisma.student.upsert({
      where: {
        parentId_name: {
          parentId: seededParent.id,
          name: student.name,
        },
      },
      update: student,
      create: {
        ...student,
        parentId: seededParent.id,
      },
    });
  }

  const firstStudent = await prisma.student.findFirstOrThrow({
    where: { parentId: seededParent.id },
    orderBy: { name: 'asc' },
  });
  await prisma.order.upsert({
    where: { id: 'demo-pending-order' },
    update: { parentId: seededParent.id, studentId: firstStudent.id, packageId: 'demo-10', packageName: 'Demo 10 Lesson Package', creditQuantity: 10, amountCents: 50000, paymentMode: 'simulation', status: 'pending', paidAt: null },
    create: { id: 'demo-pending-order', parentId: seededParent.id, studentId: firstStudent.id, packageId: 'demo-10', packageName: 'Demo 10 Lesson Package', creditQuantity: 10, amountCents: 50000, paymentMode: 'simulation' },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const prisma = new PrismaClient();

  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
