/* ===================================================================
   admin.js — Admin Dashboard Logic
   =================================================================== */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let allAttendance = [];

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth("admin")) return;

  // Set admin name
  const nameEl = document.getElementById("admin-name");
  if (nameEl) nameEl.textContent = getUserName();

  // Wire up controls
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("date-filter").addEventListener("change", handleDateChange);
  document.getElementById("search-input").addEventListener("input", handleSearch);

  // Set default date to today (IST)
  const dateInput = document.getElementById("date-filter");
  dateInput.value = _getTodayIST();

  // Load data
  loadAttendance();
});

// ---------------------------------------------------------------------------
// Load attendance for a given date
// ---------------------------------------------------------------------------
async function loadAttendance(date = null) {
  const dateInput = document.getElementById("date-filter");
  const targetDate = date || dateInput.value || _getTodayIST();

  // Show loading state
  const tbody = document.getElementById("attendance-tbody");
  tbody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center; padding: 2rem;">
        <span class="spinner"></span>
        <p style="margin-top: 0.5rem; color: var(--text-muted);">Loading attendance...</p>
      </td>
    </tr>`;

  try {
    let data;
    if (targetDate === _getTodayIST()) {
      data = await apiGet("/attendance/today");
    } else {
      data = await apiGet(`/attendance/all?date=${targetDate}`);
    }

    allAttendance = data.attendance || [];

    // Update stats
    updateStats(data);

    // Render table
    renderAttendanceTable(allAttendance);
  } catch (error) {
    showAdminAlert("error", "Failed to load attendance: " + error.message);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <p>Failed to load data. Please try again.</p>
        </td>
      </tr>`;
  }
}

// ---------------------------------------------------------------------------
// Update stats cards
// ---------------------------------------------------------------------------
function updateStats(data) {
  const totalEl = document.getElementById("stat-total");
  const presentEl = document.getElementById("stat-present");
  const absentEl = document.getElementById("stat-absent");

  if (totalEl) totalEl.textContent = data.total_employees || 0;
  if (presentEl) presentEl.textContent = data.present || 0;
  if (absentEl) absentEl.textContent = data.absent || 0;

  // Animate the numbers
  [totalEl, presentEl, absentEl].forEach((el) => {
    if (el) {
      el.classList.remove("scale-in");
      void el.offsetWidth; // trigger reflow
      el.classList.add("scale-in");
    }
  });
}

// ---------------------------------------------------------------------------
// Render attendance table
// ---------------------------------------------------------------------------
function renderAttendanceTable(attendanceList) {
  const tbody = document.getElementById("attendance-tbody");
  const emptyState = document.getElementById("attendance-empty");

  if (attendanceList.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  tbody.innerHTML = attendanceList
    .map(
      (item, index) => `
      <tr class="fade-in" style="animation-delay: ${index * 0.03}s;">
        <td>
          <div style="font-weight: 500; color: var(--text-primary);">${item.name || "Unknown"}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${item.email || ""}</div>
        </td>
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
}

// ---------------------------------------------------------------------------
// Handle date filter change
// ---------------------------------------------------------------------------
function handleDateChange(e) {
  const date = e.target.value;
  if (date) {
    loadAttendance(date);
  }
}

// ---------------------------------------------------------------------------
// Handle search
// ---------------------------------------------------------------------------
function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    renderAttendanceTable(allAttendance);
    return;
  }

  const filtered = allAttendance.filter(
    (item) =>
      (item.name || "").toLowerCase().includes(query) ||
      (item.email || "").toLowerCase().includes(query)
  );

  renderAttendanceTable(filtered);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function showAdminAlert(type, message) {
  const alertEl = document.getElementById("alert-message");
  if (!alertEl) return;

  alertEl.className = `alert alert-${type} show`;
  alertEl.textContent = message;

  setTimeout(() => {
    alertEl.classList.remove("show");
  }, 5000);
}

function _getTodayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + istOffset * 60000);
  return istTime.toISOString().split("T")[0];
}
