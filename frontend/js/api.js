/* ===================================================================
   api.js — API Gateway HTTP Client
   Wraps fetch() with JWT authorization header
   =================================================================== */

// ---------------------------------------------------------------------------
// Configuration — UPDATE THIS AFTER DEPLOYING THE SAM STACK
// ---------------------------------------------------------------------------
const API_BASE_URL = "https://8vfsrhngwh.execute-api.ap-south-1.amazonaws.com/Prod";

// ---------------------------------------------------------------------------
// Generic API request
// ---------------------------------------------------------------------------
async function apiRequest(method, path, body = null) {
  const token = await getIdToken();
  if (!token) {
    logout();
    throw new Error("Not authenticated");
  }

  const options = {
    method: method,
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }

  const url = `${API_BASE_URL}${path}`;

  try {
    const response = await fetch(url, options);

    if (response.status === 401) {
      logout();
      throw new Error("Session expired. Please login again.");
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
  } catch (error) {
    if (error.message === "Session expired. Please login again.") {
      throw error;
    }
    console.error(`API Error [${method} ${path}]:`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Convenience methods
// ---------------------------------------------------------------------------
async function apiGet(path) {
  return apiRequest("GET", path);
}

async function apiPost(path, body = {}) {
  return apiRequest("POST", path, body);
}

async function apiDelete(path) {
  return apiRequest("DELETE", path);
}
