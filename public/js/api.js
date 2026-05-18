/* api.js — HTTP client wrapper con manejo de errores centralizado */
const API = {
  async request(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  get:    (url)        => API.request('GET',    url),
  post:   (url, body)  => API.request('POST',   url, body),
  put:    (url, body)  => API.request('PUT',    url, body),
  delete: (url)        => API.request('DELETE', url),

  // Auth
  login:  (u, p)  => API.post('/api/auth/login',  { username: u, password: p }),
  logout: ()       => API.post('/api/auth/logout'),
  check:  ()       => API.get('/api/auth/check'),

  // Employees
  getEmployees:       (subs) => API.get(`/api/employees?include_substitutes=${!!subs}`),
  getActiveEmployees: ()     => API.get('/api/employees/active'),
  createEmployee:     (data) => API.post('/api/employees', data),
  updateEmployee:     (id, data) => API.put(`/api/employees/${id}`, data),
  deleteEmployee:     (id)   => API.delete(`/api/employees/${id}`),
  getEmployeeNotes:   (id)   => API.get(`/api/employees/${id}/notes`),
  createEmployeeNote: (id, data) => API.post(`/api/employees/${id}/notes`, data),
  deleteEmployeeNote: (noteId) => API.delete(`/api/employees/notes/${noteId}`),

  // Employee types
  getEmployeeTypes:   ()          => API.get('/api/employee-types'),
  createEmployeeType: (data)      => API.post('/api/employee-types', data),
  updateEmployeeType: (id, data)  => API.put(`/api/employee-types/${id}`, data),
  deleteEmployeeType: (id)        => API.delete(`/api/employee-types/${id}`),

  // Shift types
  getShiftTypes:      ()         => API.get('/api/shift-types'),
  createShiftType:    (data)     => API.post('/api/shift-types', data),
  updateShiftType:    (id, data) => API.put(`/api/shift-types/${id}`, data),
  deleteShiftType:    (id)       => API.delete(`/api/shift-types/${id}`),

  // Schedules
  getSchedules:     ()        => API.get('/api/schedules'),
  getSchedule:      (id)      => API.get(`/api/schedules/${id}`),
  getPublishedEntries: ()     => API.get('/api/schedules/published/entries'),
  generateSchedule: (data)    => API.post('/api/schedules/generate', data),
  updateEntry:      (id, data) => API.put(`/api/schedules/${id}/entry`, data),
  lockEntry:        (id, data) => API.put(`/api/schedules/${id}/lock`, data),
  swapEntry:        (id, data) => API.put(`/api/schedules/${id}/swap`, data),
  rebalance:        (id)      => API.post(`/api/schedules/${id}/rebalance`),
  setStatus:        (id, s)   => API.put(`/api/schedules/${id}/status`, { status: s }),
  setNotes:         (id, n)   => API.put(`/api/schedules/${id}/notes`, { notes: n }),
  deleteSchedule:   (id)      => API.delete(`/api/schedules/${id}`),
  notifySchedule:   (id)      => API.post(`/api/schedules/${id}/notify`),

  // Settings
  getSettings:     ()         => API.get('/api/settings'),
  updateSettings:  (data)     => API.put('/api/settings', data),
  changePassword:  (cur, nw)  => API.put('/api/settings/password', { current_pass: cur, new_pass: nw }),
  testSmtp:        ()         => API.post('/api/settings/test-smtp'),
};
