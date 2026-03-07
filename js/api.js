/**
 * Smart Location Based Attendance System
 * API Communication Module
 *
 * Endpoints:
 *   POST /api/register
 *   POST /api/login
 *   POST /api/mark-attendance
 *   GET  /api/dashboard/{student_id}
 */

import { API_BASE } from '../config.js';

/* ── Helpers ─────────────────────────────────────────────────────── */

/**
 * Return JSON headers.
 * @returns {Record<string, string>}
 */
function _jsonHeaders() {
  return { 'Content-Type': 'application/json', 'Accept': 'application/json' };
}

/**
 * Persist auth data returned by the server.
 * @param {{ student_id?: string, student?: object }} data
 */
function _saveSession(data) {
  if (data.student_id) {
    localStorage.setItem('student_id', data.student_id);
  }
  if (data.student) {
    localStorage.setItem('attendance_student', JSON.stringify(data.student));
  }
}

/**
 * Read saved student info.
 * @returns {object|null}
 */
export function getStudentInfo() {
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
export function clearSession() {
  localStorage.removeItem('student_id');
  localStorage.removeItem('attendance_student');
}

/**
 * Get the current device geo-coordinates.
 * @returns {Promise<{latitude: number, longitude: number}>}
 */
function _getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
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
export async function registerUser(payload) {
  return _request('/api/register', {
    method: 'POST',
    headers: _jsonHeaders(),
    body: JSON.stringify(payload),
  });
}

/**
 * Login a student.
 * @param {{ email: string, password: string }} payload
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
export async function loginUser(payload) {
  const result = await _request('/api/login', {
    method: 'POST',
    headers: _jsonHeaders(),
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
export async function markAttendance() {
  const studentId = localStorage.getItem('student_id');
  if (!studentId) {
    return { ok: false, data: {}, message: 'Not logged in. Please log in again.' };
  }

  let location;
  try {
    location = await _getLocation();
  } catch (geoErr) {
    return { ok: false, data: {}, message: geoErr.message };
  }

  return _request('/api/mark-attendance', {
    method: 'POST',
    headers: _jsonHeaders(),
    body: JSON.stringify({
      student_id: studentId,
      latitude:   location.latitude,
      longitude:  location.longitude,
    }),
  });
}

/**
 * Fetch student dashboard data (profile + attendance stats + history).
 * @returns {Promise<{ok: boolean, data: any, message: string}>}
 */
export async function getDashboardData() {
  const studentId = localStorage.getItem('student_id');
  if (!studentId) {
    return { ok: false, data: {}, message: 'Not logged in. Please log in again.' };
  }
  return _request(`/api/dashboard/${studentId}`, {
    method: 'GET',
    headers: _jsonHeaders(),
  });
}
