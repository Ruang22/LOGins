const API_ROOT = import.meta.env.VITE_API_ROOT ?? '/api';

async function request(path, { account, method = 'GET', body } = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-demo-user': account },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.code ?? 'REQUEST_FAILED');
  return data;
}

export const api = {
  teacher: {
    schedule: () => request('/teacher/schedule', { account: 'teacher-demo' }),
    students: () => request('/teacher/students', { account: 'teacher-demo' }),
    orders: () => request('/teacher/orders', { account: 'teacher-demo' }),
    parseSchedule: (text) => request('/ai/parse-schedule', { account: 'teacher-demo', method: 'POST', body: { text } }),
    createLesson: (lesson) => request('/teacher/lessons', { account: 'teacher-demo', method: 'POST', body: lesson }),
    updateLesson: (id, action) => request(`/teacher/lessons/${id}`, { account: 'teacher-demo', method: 'PATCH', body: { action } }),
  },
  parent: {
    dashboard: () => request('/parent/dashboard', { account: 'parent-demo' }),
    createOrder: (order) => request('/parent/orders', { account: 'parent-demo', method: 'POST', body: order }),
    simulatePayment: (id) => request(`/parent/orders/${id}/simulate-payment`, { account: 'parent-demo', method: 'POST' }),
  },
};
