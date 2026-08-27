import { ref } from 'vue';

const STORAGE_KEY = 'schedule-assistant-role-session';
const aliasRoles = {
  'teacher-demo': 'teacher',
  'parent-demo': 'parent',
};

function isValidSelection(selection) {
  if (!selection || !['teacher', 'parent'].includes(selection.role)) return false;
  if (typeof selection.accountId !== 'string' || !selection.accountId.trim()) return false;
  return !aliasRoles[selection.accountId] || aliasRoles[selection.accountId] === selection.role;
}

function readSelection(storage) {
  try {
    const selection = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    return isValidSelection(selection) ? selection : null;
  } catch {
    return null;
  }
}

export function createRoleSession(storage = globalThis.sessionStorage) {
  const stored = readSelection(storage);
  const role = ref(stored?.role ?? null);
  const accountId = ref(stored?.accountId ?? null);

  return {
    role,
    accountId,
    select: (next) => {
      if (!isValidSelection(next)) return;
      const selection = { role: next.role, accountId: next.accountId.trim() };
      role.value = selection.role;
      accountId.value = selection.accountId;
      storage?.setItem(STORAGE_KEY, JSON.stringify(selection));
    },
    reset: () => {
      role.value = null;
      accountId.value = null;
      storage?.removeItem(STORAGE_KEY);
    },
  };
}
