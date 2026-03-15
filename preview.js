const BOOKING_DB_NAME = "TransportDB";
const BOOKING_STORE = "bookings";
const DISPATCH_DB_NAME = "DispatchDB";
const DISPATCH_STORE = "dispatchBranchState";

function getSelectedBranch() {
  return localStorage.getItem("selectedBranch") || sessionStorage.getItem("selectedBranch");
}

function openDb(dbName, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = () => reject(new Error(`Could not open ${dbName}`));
  });
}

function getRecord(db, storeName, key) {
  return new Promise(resolve => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function formatDate(isoDate) {
  if (!isoDate) return "-";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}-${month}-${year}`;
}

function getDispatchRecord(state, dispatchNoFromQuery) {
  const records = state?.dispatchRecords || {};
  if (!Object.keys(records).length) return null;

  if (dispatchNoFromQuery && records[dispatchNoFromQuery]) {
    return records[dispatchNoFromQuery];
  }

  const fallbackDispatchNo = state.lastDispatchNo || state.currentDispatchNo;
  if (fallbackDispatchNo && records[fallbackDispatchNo]) {
    return records[fallbackDispatchNo];
  }

  return Object.values(records)[0] || null;
}

function setMeta(record) {
  const form = record?.form || {};
  document.getElementById("metaDispatchNo").textContent = form.dispatchNo || "-";
  document.getElementById("metaDispatchDate").textContent = formatDate(form.dispatchDate);
  document.getElementById("metaMethod").textContent = form.method || "-";
  document.getElementById("metaRoute").textContent = form.route || "-";
  document.getElementById("metaDriver").textContent = form.driverName || "-";
  document.getElementById("metaMobile").textContent = form.mobileNo || "-";
  document.getElementById("metaKmReading").textContent = form.remark || "-";
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function renderRows(vehicleLrs, bookingsByLr) {
  const tbody = document.getElementById("previewTableBody");
  tbody.innerHTML = "";

  let totalPackages = 0;
  let totalWeight = 0;

  vehicleLrs.forEach(lr => {
    const booking = bookingsByLr?.[lr] || {};
    const packages = toNumber(booking.packages);
    const weight = toNumber(booking.weight);

    totalPackages += packages;
    totalWeight += weight;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${lr}</td>
      <td>${booking.sender || ""}</td>
      <td>${booking.receiver || ""}</td>
      <td>${packages || ""}</td>
      <td>${weight || ""}</td>
      <td>${booking.payMode || ""}</td>
    `;

    tbody.appendChild(row);
  });

  document.getElementById("totalLrCount").textContent = String(vehicleLrs.length);
  document.getElementById("totalPackages").textContent = String(totalPackages);
  document.getElementById("totalWeight").textContent = String(totalWeight);
}

async function initPreviewPage() {
  const branch = getSelectedBranch();
  if (!branch) {
    alert("Please select a branch first.");
    return;
  }

  try {
    const queryDispatchNo = new URLSearchParams(window.location.search).get("dispatchNo");

    const [bookingDb, dispatchDb] = await Promise.all([
      openDb(BOOKING_DB_NAME, 3),
      openDb(DISPATCH_DB_NAME, 2)
    ]);

    const [bookingBranchData, dispatchState] = await Promise.all([
      getRecord(bookingDb, BOOKING_STORE, branch),
      getRecord(dispatchDb, DISPATCH_STORE, branch)
    ]);

    const dispatchRecord = getDispatchRecord(dispatchState, queryDispatchNo);
    if (!dispatchRecord) {
      alert("No dispatch record found for this branch.");
      return;
    }

    const vehicleLrs = (dispatchRecord.vehicle || []).slice().sort((a, b) => Number(a) - Number(b));

    setMeta(dispatchRecord);
    renderRows(vehicleLrs, bookingBranchData?.bookings || {});

    bookingDb.close();
    dispatchDb.close();
  } catch (error) {
    console.error(error);
    alert("Failed to load preview page data.");
  }
}

document.addEventListener("DOMContentLoaded", initPreviewPage);
