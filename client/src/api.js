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
    parseSchedule: (text, account = 'teacher-demo') => request('/ai/parse-schedule', { account, method: 'POST', body: { text } }),
    createLesson: (lesson, account = 'teacher-demo') => request('/teacher/lessons', { account, method: 'POST', body: lesson }),
    updateLesson: (id, action, account = 'teacher-demo') => request(`/teacher/lessons/${id}`, { account, method: 'PATCH', body: { action } }),
  },
  parent: {
    dashboard: (account = 'parent-demo') => request('/parent/dashboard', { account }),
    createOrder: (order, account = 'parent-demo') => request('/parent/orders', { account, method: 'POST', body: order }),
    simulatePayment: (id, account = 'parent-demo') => request(`/parent/orders/${id}/simulate-payment`, { account, method: 'POST' }),
  },
};
