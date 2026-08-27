import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const teacher = {
  name: '崔欣（演示教师）',
  email: 'maya.chen.demo.teacher@example.test',
  role: 'teacher',
};

const parent = {
  name: '李女士（演示家长）',
  email: 'jordan.rivera.demo.parent@example.test',
  role: 'parent',
};

const students = [
  {
    name: '刘丽（演示学员）',
    grade: 8,
    totalCredits: 12,
    attendedCredits: 3,
    reservedCredits: 1,
  },
  {
    name: '张晨（演示学员）',
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

  for (const [index, student] of students.entries()) {
    const legacyName = index === 0 ? 'Avery Rivera (Demo Student)' : 'Noah Rivera (Demo Student)';
    const existingStudent = await prisma.student.findFirst({
      where: { parentId: seededParent.id, name: { in: [student.name, legacyName] } },
    });
    if (existingStudent) {
      await prisma.student.update({ where: { id: existingStudent.id }, data: student });
    } else {
      await prisma.student.create({ data: { ...student, parentId: seededParent.id } });
    }
  }

  const firstStudent = await prisma.student.findFirstOrThrow({
    where: { parentId: seededParent.id },
    orderBy: { name: 'asc' },
  });
  await prisma.order.upsert({
    where: { id: 'demo-pending-order' },
    update: { parentId: seededParent.id, studentId: firstStudent.id, packageId: 'demo-10', packageName: '10 节课程包', creditQuantity: 10, amountCents: 50000, paymentMode: 'simulation', status: 'pending', paidAt: null },
    create: { id: 'demo-pending-order', parentId: seededParent.id, studentId: firstStudent.id, packageId: 'demo-10', packageName: '10 节课程包', creditQuantity: 10, amountCents: 50000, paymentMode: 'simulation' },
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
