/* ===================================================================
   employee.js — Employee Dashboard Logic
   =================================================================== */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let todayAttendance = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth("employee")) return;

  // Set welcome name
  const nameEl = document.getElementById("employee-name");
  if (nameEl) nameEl.textContent = getUserName();

  // Wire up buttons
  document.getElementById("btn-check-in").addEventListener("click", handleCheckIn);
  document.getElementById("btn-check-out").addEventListener("click", handleCheckOut);
  document.getElementById("btn-logout").addEventListener("click", logout);

  // If user is admin, show admin link
  if (isAdmin()) {
    const adminLink = document.getElementById("admin-link");
    if (adminLink) adminLink.style.display = "inline-flex";
  }

  // Load data
  loadTodayStatus();
  loadHistory();
});

// ---------------------------------------------------------------------------
// Load today's status
// ---------------------------------------------------------------------------
async function loadTodayStatus() {
  try {
    const data = await apiGet("/attendance/history");
    const history = data.history || [];

    // Find today's record
    const today = _getTodayIST();
    todayAttendance = history.find((item) => item.date === today) || null;

    updateTodayUI();
  } catch (error) {
    showAlert("error", "Failed to load today's status: " + error.message);
  }
}

// ---------------------------------------------------------------------------
// Update today's attendance UI
// ---------------------------------------------------------------------------
function updateTodayUI() {
  const checkInTime = document.getElementById("check-in-time");
  const checkOutTime = document.getElementById("check-out-time");
  const btnCheckIn = document.getElementById("btn-check-in");
  const btnCheckOut = document.getElementById("btn-check-out");

  if (todayAttendance) {
    const ci = todayAttendance.check_in || "-";
    const co = todayAttendance.check_out || "-";

    checkInTime.textContent = ci;
    checkInTime.classList.toggle("empty", ci === "-");
    checkOutTime.textContent = co;
    checkOutTime.classList.toggle("empty", co === "-");

    // Disable check-in if already checked in
    btnCheckIn.disabled = ci !== "-";

    // Enable check-out only if checked in and not yet checked out
    btnCheckOut.disabled = ci === "-" || co !== "-";
  } else {
    checkInTime.textContent = "--:--";
    checkInTime.classList.add("empty");
    checkOutTime.textContent = "--:--";
    checkOutTime.classList.add("empty");

    btnCheckIn.disabled = false;
    btnCheckOut.disabled = true;
  }
}

// ---------------------------------------------------------------------------
// Check In
// ---------------------------------------------------------------------------
async function handleCheckIn() {
  const btn = document.getElementById("btn-check-in");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Checking In...';

  try {
    const data = await apiPost("/attendance/check-in");
    showAlert("success", "✓ " + data.message);

    todayAttendance = {
      date: data.date,
      check_in: data.check_in,
      check_out: "-",
      status: "Present",
    };
    updateTodayUI();
    loadHistory(); // Refresh history
  } catch (error) {
    showAlert("error", error.message);
    btn.disabled = false;
  }

  btn.innerHTML = originalText;
}

// ---------------------------------------------------------------------------
// Check Out
// ---------------------------------------------------------------------------
async function handleCheckOut() {
  const btn = document.getElementById("btn-check-out");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Checking Out...';

  try {
    const data = await apiPost("/attendance/check-out");
    showAlert("success", "✓ " + data.message);

    if (todayAttendance) {
      todayAttendance.check_out = data.check_out;
    }
    updateTodayUI();
    loadHistory(); // Refresh history
  } catch (error) {
    showAlert("error", error.message);
    btn.disabled = false;
  }

  btn.innerHTML = originalText;
}

// ---------------------------------------------------------------------------
// Load attendance history
// ---------------------------------------------------------------------------
async function loadHistory() {
  const tbody = document.getElementById("history-tbody");
  const emptyState = document.getElementById("history-empty");

  try {
    const data = await apiGet("/attendance/history");
    const history = data.history || [];

    if (history.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    tbody.innerHTML = history
      .map(
        (item) => `
        <tr class="fade-in">
          <td>${_formatDate(item.date)}</td>
          <td>${item.check_in || "-"}</td>
          <td>${item.check_out || "-"}</td>
          <td>
            <span class="badge ${item.status === "Present" ? "badge-present" : "badge-absent"}">
              ${item.status || "Absent"}
            </span>
          </td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert("error", "Failed to load history: " + error.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function showAlert(type, message) {
  const alertEl = document.getElementById("alert-message");
  if (!alertEl) return;

  alertEl.className = `alert alert-${type} show`;
  alertEl.textContent = message;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    alertEl.classList.remove("show");
  }, 5000);
}

function _getTodayIST() {
  // Get current date in IST
  const now = new Date();
  const istOffset = 5.5 * 60; // IST is UTC+5:30
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + istOffset * 60000);
  return istTime.toISOString().split("T")[0];
}

function _formatDate(dateStr) {
  // Convert YYYY-MM-DD to readable format
  try {
    const parts = dateStr.split("-");
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  } catch {
    return dateStr;
  }
}
