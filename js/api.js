/**
 * Smart Location Based Attendance System
 * API Communication Module
 *
 * Endpoints:
 *   POST /api/register
 *   POST /api/login
 *   POST /api/admin/login
 *   POST /api/mark-attendance
 *   GET  /api/dashboard/{student_id}
 *   GET  /api/admin/today-attendance
 *   GET  /api/admin/students
 *   GET  /api/admin/attendance
 *   GET  /api/admin/export
 *   GET  /api/classes
 *   POST /api/classes/create
 */

// API_BASE is declared in config.js and loaded before this script.

/* ── Helpers ─────────────────────────────────────────────────────── */

/**
 * Return JSON headers, adding Bearer token when present.
 * @returns {Record<string, string>}
 */
function _authHeaders() {
  const token = localStorage.getItem('attendance_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Persist auth data returned by the server.
 * @param {{ token?: string, student?: object, student_id?: string|number }} data
 */
function _saveSession(data) {
  if (data.token) {
    localStorage.setItem('attendance_token', data.token);
  }
  if (data.student) {
    localStorage.setItem('attendance_student', JSON.stringify(data.student));
  }
  // Persist student_id – may come top-level or nested inside student object
  const sid = data.student_id ?? data.student?.id ?? data.student?.student_id;
  if (sid != null) {
    localStorage.setItem('student_id', String(sid));
  }
  localStorage.setItem('role', 'student');
}

/**
 * Read saved student info.
 * @returns {object|null}
 */
function getStudentInfo() {
  try {
    const raw = localStorage.getItem('attendance_student');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear session data.
 */
function clearSession() {
  localStorage.removeItem('attendance_token');
  localStorage.removeItem('attendance_student');
  localStorage.removeItem('student_id');
  localStorage.removeItem('role');
}

/**
 * Get the current device geo-coordinates.
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number}>}
 */
function _getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy:  pos.coords.accuracy,
      }),
      (err) => {
        let msg = 'Could not retrieve your location.';
        if (err.code === err.PERMISSION_DENIED)    msg = 'Location permission denied. Please allow location access and try again.';
        if (err.code === err.POSITION_UNAVAILABLE) msg = 'Location information is unavailable.';
        if (err.code === err.TIMEOUT)              msg = 'Location request timed out.';
        reject(new Error(msg));
      },
      { timeout: 10000, maximumAge: 0 }
    );
  });
}

/**
 * Core fetch wrapper with consistent error handling.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
async function _request(url, options = {}) {
  try {
    const response = await fetch(API_BASE + url, options);
    let data = {};
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { message: text || response.statusText };
    }

    if (!response.ok) {
      return {
        ok: false,
        data,
        message: data.message || data.error || `Server error (${response.status})`,
      };
    }

    return { ok: true, data, message: data.message || 'Success' };
  } catch (err) {
    const isNetworkError = err instanceof TypeError;
    return {
      ok: false,
      data: {},
      message: isNetworkError
        ? 'Network error – please check your connection.'
        : err.message || 'Unexpected error occurred.',
    };
  }
}

/* ── Public API Functions ─────────────────────────────────────────── */

/**
 * Register a new student.
 * @param {{ name: string, email: string, college_id: string, roll_number: string, branch: string, password: string }} payload
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
async function registerUser(payload) {
  return _request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Login a student.
 * @param {{ email: string, password: string }} payload
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
async function loginUser(payload) {
  const result = await _request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (result.ok) {
    _saveSession(result.data);
  }

  return result;
}
/**
 * Mark attendance for the logged-in student.
 * Automatically captures device location before sending.
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
async function markAttendance() {
  let location;
  try {
    location = await _getLocation();
  } catch (geoErr) {
    return { ok: false, data: {}, message: geoErr.message };
  }

  const student_id = localStorage.getItem('student_id');
  if (!student_id) {
    return { ok: false, data: {}, message: 'Session expired. Please log in again.' };
  }

  return _request('/api/mark-attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_id,
      latitude:  location.latitude,
      longitude: location.longitude,
      accuracy:  location.accuracy,
      device_info: {
        userAgent: navigator.userAgent  || '',
        platform:  (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
      },
    }),
  });
}

/**
 * Fetch student dashboard data (profile + attendance stats + history).
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
async function getDashboardData() {
  const student_id = localStorage.getItem('student_id');
  if (!student_id) {
    return { ok: false, data: {}, message: 'Session expired. Please log in again.' };
  }
  return _request(`/api/dashboard/${student_id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ── Admin API Functions ──────────────────────────────────────────── */

/**
 * Return JSON headers with admin Bearer token when present.
 * @returns {Record<string, string>}
 */
function _adminHeaders() {
  const token = localStorage.getItem('admin_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Login as admin.
 * @param {{ email: string, password: string }} payload
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
async function adminLogin(payload) {
  const result = await _request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (result.ok) {
    if (result.data.token) {
      localStorage.setItem('admin_token', result.data.token);
    }
    localStorage.setItem('role', 'admin');
  }
  return result;
}

/**
 * Clear admin session data.
 */
function clearAdminSession() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('role');
}

/**
 * Fetch admin dashboard statistics.
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
function getAdminDashboard() {
  return _request('/api/admin/dashboard', {
    method: 'GET',
    headers: _adminHeaders(),
  });
}

/**
 * Fetch all students list for admin.
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
function getAdminStudents() {
  return _request('/api/admin/students', {
    method: 'GET',
    headers: _adminHeaders(),
  });
}

/**
 * Fetch attendance analytics data for admin.
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
function getAdminAnalytics() {
  return _request('/api/admin/analytics', {
    method: 'GET',
    headers: _adminHeaders(),
  });
}

/* ── Role Guards ──────────────────────────────────────────────────── */

/**
 * Redirect to admin-login.html if not logged in as admin.
 * Call at the top of every admin page script.
 */
function guardAdmin() {
  const role  = localStorage.getItem('role');
  const token = localStorage.getItem('admin_token');
  if (role !== 'admin' || !token) {
    window.location.href = 'admin-login.html';
  }
}

/**
 * Redirect to login.html if not logged in as student.
 * Call at the top of every student page script.
 */
function guardStudent() {
  const role = localStorage.getItem('role');
  const sid  = localStorage.getItem('student_id');
  if (role !== 'student' || !sid) {
    window.location.href = 'login.html';
  }
}

/* ── Extended Admin API Functions ─────────────────────────────────── */

/**
 * Fetch admin today-attendance stats.
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
function getAdminTodayAttendance() {
  return _request('/api/admin/today-attendance', {
    method: 'GET',
    headers: _adminHeaders(),
  });
}

/**
 * Fetch all classes for admin.
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
function getAdminClasses() {
  return _request('/api/classes', {
    method: 'GET',
    headers: _adminHeaders(),
  });
}

/**
 * Create a new class.
 * @param {{ class_name: string, subject: string, teacher_name: string, schedule_time: string }} payload
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
function createClass(payload) {
  return _request('/api/classes/create', {
    method: 'POST',
    headers: _adminHeaders(),
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch full attendance report for admin.
 * @param {string} [date] - Optional ISO date string to filter by date
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
function getAdminAttendanceReport(date) {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return _request(`/api/admin/attendance${query}`, {
    method: 'GET',
    headers: _adminHeaders(),
  });
}

/**
 * Get URL to download attendance CSV export.
 * Triggers a file download in the browser.
 */
function exportAttendanceCsv() {
  const url = API_BASE + '/api/admin/export';
  fetch(url, { method: 'GET', headers: _adminHeaders() })
    .then((res) => {
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      return res.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'attendance_export.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    })
    .catch((err) => {
      console.error('CSV export error:', err);
    });
}
