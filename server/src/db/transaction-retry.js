import { prisma } from './client.js';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export async function runSerializableTransaction(operation, createConflictError) {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error?.code !== 'P2034') throw error;
      if (attempt === MAX_SERIALIZABLE_ATTEMPTS) {
        const conflict = createConflictError();
        conflict.cause = error;
        throw conflict;
      }
    }
  }
  throw createConflictError();
}
