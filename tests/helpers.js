export const HTTP_STATUS = {
  OK: 200, BAD_REQUEST: 400, UNAUTHORIZED: 401, NOT_FOUND: 404, CONFLICT: 409, TOO_MANY_REQUESTS: 429
};

export async function testRequest(method, path, data = null) {
  const port = process.env.CI_PORT || process.env.PORT || '3000';
  const baseUrl = process.env.TEST_BASE_URL || `http://localhost:${port}`;
  const url = `${baseUrl}${path}`;
  
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (data && method !== 'GET') { options.body = JSON.stringify(data); }
  
  try {
    const response = await fetch(url, options);
    const responseData = await response.json().catch(() => ({}));
    const status = typeof response.status === 'number' ? response.status : 500;
    return { status, data: responseData };
  } catch (error) {
    console.warn(`Request failed: ${method} ${path} - ${error.message}`);
    return { status: 500, data: { error: 'Connection failed' } };
  }
}

let emailSequence = 0;
const baseTimestamp = Date.now();

export function generateTestEmail() {
  const id = `${baseTimestamp}.${++emailSequence}`;
  return `test.${id}@example.com`;
}

export function resetEmailSequence() {
  emailSequence = 0;
}