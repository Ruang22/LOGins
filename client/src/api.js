const API_ROOT = import.meta.env.VITE_API_ROOT ?? '/api';

async function request(path, { account, method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (account) headers['x-demo-user'] = account;
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.code ?? 'REQUEST_FAILED');
  return data;
}

export const api = {
  accounts: (role) => request(`/accounts?role=${encodeURIComponent(role)}`),
  teacher: {
    schedule: (account = 'teacher-demo') => request('/teacher/schedule', { account }),
    students: (account = 'teacher-demo') => request('/teacher/students', { account }),
    orders: (account = 'teacher-demo') => request('/teacher/orders', { account }),
    createStudent: (student, account = 'teacher-demo') => request('/teacher/students', { account, method: 'POST', body: student }),
    updateStudent: (id, student, account = 'teacher-demo') => request(`/teacher/students/${id}`, { account, method: 'PATCH', body: student }),
    archiveStudent: (id, account = 'teacher-demo') => request(`/teacher/students/${id}`, { account, method: 'DELETE' }),
    parseSchedule: (text, account = 'teacher-demo') => request('/ai/parse-schedule', { account, method: 'POST', body: { text } }),
    createLesson: (lesson, account = 'teacher-demo') => request('/teacher/lessons', { account, method: 'POST', body: lesson }),
    editLesson: (id, lesson, account = 'teacher-demo') => request(`/teacher/lessons/${id}`, { account, method: 'PATCH', body: lesson }),
    updateLesson: (id, action, account = 'teacher-demo') => request(`/teacher/lessons/${id}`, { account, method: 'PATCH', body: { action } }),
    createManualOrder: (order, account = 'teacher-demo') => request('/teacher/orders/manual', { account, method: 'POST', body: order }),
    confirmManualOrder: (id, account = 'teacher-demo') => request(`/teacher/orders/${id}/confirm-manual`, { account, method: 'PATCH' }),
  },
  parent: {
    dashboard: (account = 'parent-demo') => request('/parent/dashboard', { account }),
    createOrder: (order, account = 'parent-demo') => request('/parent/orders', { account, method: 'POST', body: order }),
    simulatePayment: (id, account = 'parent-demo') => request(`/parent/orders/${id}/simulate-payment`, { account, method: 'POST' }),
  },
};
