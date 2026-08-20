import { ref } from 'vue';

export function createRoleSession() {
  const role = ref(null);

  return {
    role,
    select: (next) => {
      if (next === 'teacher' || next === 'parent') role.value = next;
    },
    reset: () => { role.value = null; },
  };
}
