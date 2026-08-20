import { ref } from 'vue';

export function createRoleSession() {
  const role = ref(null);

  return {
    role,
    select: (next) => { role.value = next; },
    reset: () => { role.value = null; },
  };
}
