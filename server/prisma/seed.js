import { PrismaClient } from '@prisma/client';

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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = new PrismaClient();

  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
