const BOOKING_DB_NAME = "TransportDB";
const BOOKING_STORE = "bookings";

const DISPATCH_DB_NAME = "DispatchDB";
const DISPATCH_STORE = "dispatchBranchState";
const DISPATCH_START_NUMBER = 253001;

let bookingDb;
let dispatchDb;
let selectedBranch = "";
let allBranchLRs = [];
let isDispatchEditable = false;

function getSelectedBranch() {
  return localStorage.getItem("selectedBranch") || sessionStorage.getItem("selectedBranch");
}

function openBookingDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BOOKING_DB_NAME, 3);
    request.onsuccess = e => {
      bookingDb = e.target.result;
      resolve();
    };
    request.onerror = () => reject(new Error("Could not open booking database"));
  });
}

function openDispatchDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DISPATCH_DB_NAME, 2);

    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DISPATCH_STORE)) {
        db.createObjectStore(DISPATCH_STORE, { keyPath: "branch" });
      }
    };

    request.onsuccess = e => {
      dispatchDb = e.target.result;
      resolve();
    };

    request.onerror = () => reject(new Error("Could not open dispatch database"));
  });
}

function readBookingLRs(branch) {
  return new Promise(resolve => {
    const tx = bookingDb.transaction(BOOKING_STORE, "readonly");
    const store = tx.objectStore(BOOKING_STORE);
    const req = store.get(branch);

    req.onsuccess = () => {
      const branchData = req.result;
      const lrList = Object.keys(branchData?.bookings || {}).sort();
      resolve(lrList);
    };

    req.onerror = () => resolve([]);
  });
}

function readDispatchState(branch) {
  return new Promise(resolve => {
    const tx = dispatchDb.transaction(DISPATCH_STORE, "readonly");
    const store = tx.objectStore(DISPATCH_STORE);
    const req = store.get(branch);

    req.onsuccess = () => {
      const saved = req.result;
      resolve(saved || null);
    };

    req.onerror = () => resolve(null);
  });
}

function writeDispatchState(state) {
  return new Promise((resolve, reject) => {
    const tx = dispatchDb.transaction(DISPATCH_STORE, "readwrite");
    const store = tx.objectStore(DISPATCH_STORE);
    const req = store.put(state);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error("Failed to write dispatch state"));
  });
}

function toDispatchNumber(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNextDispatchNumber(state) {
  const existingNumbers = Object.keys(state.dispatchRecords || {})
    .map(toDispatchNumber)
    .filter(Number.isFinite);

  const highest = existingNumbers.length
    ? Math.max(...existingNumbers)
    : Math.max(DISPATCH_START_NUMBER - 1, toDispatchNumber(state.lastDispatchNo) || DISPATCH_START_NUMBER - 1);

  return String(highest + 1);
}

function getListValues(listId) {
  return [...document.getElementById(listId).options].map(opt => opt.value);
}

function fillList(listId, values) {
  const list = document.getElementById(listId);
  list.innerHTML = "";

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    list.appendChild(option);
  });
}

function setDispatchFormValues(values = {}) {
  document.getElementById("dispatchNo").value = values.dispatchNo || "";
  document.getElementById("dispatchDate").value = values.dispatchDate || "";
  document.getElementById("method").value = values.method || "";
  document.getElementById("branchInput").value = selectedBranch;
  document.getElementById("driverName").value = values.driverName || "";
  document.getElementById("mobileNo").value = values.mobileNo || "";
  document.getElementById("vehicleNo").value = values.vehicleNo || "";
  document.getElementById("route").value = values.route || "";
  document.getElementById("remark").value = values.remark || "";
}

function getDispatchFormValues() {
  return {
    dispatchNo: document.getElementById("dispatchNo").value.trim(),
    dispatchDate: document.getElementById("dispatchDate").value,
    method: document.getElementById("method").value.trim(),
    branch: document.getElementById("branchInput").value.trim(),
    driverName: document.getElementById("driverName").value.trim(),
    mobileNo: document.getElementById("mobileNo").value.trim(),
    vehicleNo: document.getElementById("vehicleNo").value.trim(),
    route: document.getElementById("route").value.trim(),
    remark: document.getElementById("remark").value.trim()
  };
}

function applyDispatchRecord(record, lockAfter = true) {
  if (!record) return;

  const allSet = new Set(allBranchLRs);
  const vehicle = (record.vehicle || []).filter(lr => allSet.has(lr));
  const godown = (record.godown || []).filter(lr => allSet.has(lr));
  
  setDispatchFormValues(record.form);
  fillList("godownList", godown);
  fillList("vehicleList", vehicle);

  const state = window.currentDispatchState;
  state.currentDispatchNo = record.dispatchNo;
  state.godown = godown;
  state.vehicle = vehicle;

  if (lockAfter) {
    lockDispatchPage();
  }
}

function moveSelected(fromId, toId) {
  if (!isDispatchEditable) return;
  const from = document.getElementById(fromId);
  const to = document.getElementById(toId);
  const selected = [...from.selectedOptions];

  selected.forEach(opt => to.appendChild(opt));
}

function moveAll(fromId, toId) {
  if (!isDispatchEditable) return;
  const from = document.getElementById(fromId);
  const to = document.getElementById(toId);
  [...from.options].forEach(opt => to.appendChild(opt));
}

function lockDispatchPage() {
  isDispatchEditable = false;
  document.querySelectorAll(".dispatch-form input").forEach(input => {
    if (input.id !== "branchInput") {
      input.readOnly = true;
    }
  });

  document.getElementById("godownList").disabled = true;
  document.getElementById("vehicleList").disabled = true;

  [
    "btnMoveOneToVehicle",
    "btnMoveAllToVehicle",
    "btnMoveOneToGodown",
    "btnMoveAllToGodown",
    "loadingBtn",
    "saveGodownBtn"
  ].forEach(id => {
    document.getElementById(id).disabled = true;
  });
}

function unlockDispatchPage() {
  isDispatchEditable = true;
  document.querySelectorAll(".dispatch-form input").forEach(input => {
    if (input.id !== "branchInput" && input.id !== "dispatchNo") {
      input.readOnly = false;
    }
  });

  document.getElementById("godownList").disabled = false;
  document.getElementById("vehicleList").disabled = false;

  [
    "btnMoveOneToVehicle",
    "btnMoveAllToVehicle",
    "btnMoveOneToGodown",
    "btnMoveAllToGodown",
    "loadingBtn",
    "saveGodownBtn"
  ].forEach(id => {
    document.getElementById(id).disabled = false;
  });
}

function buildDispatchRecordFromUI() {
  const form = getDispatchFormValues();
  const dispatchNo = form.dispatchNo;

  return {
    dispatchNo,
    form,
    godown: getListValues("godownList"),
    vehicle: getListValues("vehicleList"),
    dispatchDetailsByLr: getDispatchDetailsByLrFromForm(form, getListValues("vehicleList"))
  };
}

function getDispatchDetailsByLrFromForm(form, vehicleLrs) {
  const detailsByLr = {};
  vehicleLrs.forEach(lr => {
    detailsByLr[lr] = { ...form };
  });
  return detailsByLr;
}

function rebuildAggregateDispatchDetails(state) {
  const aggregated = {};
  const dispatchNumbers = Object.keys(state.dispatchRecords || {}).sort((a, b) => Number(a) - Number(b));

  dispatchNumbers.forEach(dispatchNo => {
    const record = state.dispatchRecords[dispatchNo];
    Object.assign(aggregated, record.dispatchDetailsByLr || {});
  });

  state.dispatchDetailsByLr = aggregated;
}

function getPersistedVehicleLrs(state) {
  const allSet = new Set(allBranchLRs);
  const movedSet = new Set();

  Object.values(state.dispatchRecords || {}).forEach(record => {
    (record.vehicle || []).forEach(lr => {
      if (allSet.has(lr)) {
        movedSet.add(lr);
      }
    });
  });

  return allBranchLRs.filter(lr => movedSet.has(lr));
}

async function persistCurrentRecord() {
  const state = window.currentDispatchState;
  const record = buildDispatchRecordFromUI();

  if (!record.dispatchNo) {
    alert("Dispatch No is required.");
    return false;
  }

  state.dispatchRecords[record.dispatchNo] = record;
  state.currentDispatchNo = record.dispatchNo;
  state.lastDispatchNo = record.dispatchNo;
  state.godown = record.godown;
  state.vehicle = record.vehicle;

  rebuildAggregateDispatchDetails(state);

  await writeDispatchState(state);
  return true;
}

async function saveLoadingForVehicleLRs() {
  if (!isDispatchEditable) {
    alert("Press Edit or New before making changes.");
    return;
  }

  const vehicleLRs = getListValues("vehicleList");

  if (!vehicleLRs.length) {
    alert("Move at least one LR to LR ON VEHICLE before loading.");
    return;
  }

  try {
    const saved = await persistCurrentRecord();
    if (!saved) return;
    lockDispatchPage();
    alert("Dispatch details saved successfully.");
  } catch (error) {
    console.error(error);
    alert("Failed to save loading details.");
  }
}

async function saveGodownStockOnly() {
  if (!isDispatchEditable) {
    alert("Press Edit or New before making changes.");
    return;
  }

  try {
    const saved = await persistCurrentRecord();
    if (!saved) return;
    lockDispatchPage();
    alert("Godown stock saved successfully.");
  } catch (error) {
    console.error(error);
    alert("Failed to save godown stock.");
  }
}

async function createNewDispatch() {
  const state = window.currentDispatchState;
  const nextDispatchNo = getNextDispatchNumber(state);
  const persistedVehicleLrs = getPersistedVehicleLrs(state);
  const persistedVehicleSet = new Set(persistedVehicleLrs);
  const remainingGodownLrs = allBranchLRs.filter(lr => !persistedVehicleSet.has(lr));

  setDispatchFormValues({
    dispatchNo: nextDispatchNo,
    dispatchDate: new Date().toISOString().slice(0, 10)
  });

  fillList("godownList", remainingGodownLrs);
  fillList("vehicleList", []);
  
  state.currentDispatchNo = nextDispatchNo;
  state.godown = [...remainingGodownLrs];
  state.vehicle = [];
  
  unlockDispatchPage();
}

function editCurrentDispatch() {
  const dispatchNo = document.getElementById("dispatchNo").value.trim();
  if (!dispatchNo) {
    alert("No dispatch number loaded.");
    return;
  }

  unlockDispatchPage();
}

function createFindPopup(state) {
  const overlay = document.createElement("div");
  overlay.className = "overlay dispatch-find-overlay";

  const popup = document.createElement("div");
  popup.className = "popup dispatch-find-popup";

  const dispatchNumbers = Object.keys(state.dispatchRecords || {}).sort((a, b) => Number(a) - Number(b));

  popup.innerHTML = `
    <h3>Find Dispatch</h3>
    <div class="find-row">
      <label for="findDispatchNo">Dispatch No</label>
      <input type="text" id="findDispatchNo" placeholder="Enter dispatch number" />
    </div>
    <div class="find-row">
      <label for="dispatchNoList">Available Dispatch Nos</label>
      <select id="dispatchNoList" size="8"></select>
    </div>
    <div class="find-actions">
      <button type="button" id="findDispatchLoad">Load</button>
      <button type="button" id="findDispatchCancel">Cancel</button>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const input = popup.querySelector("#findDispatchNo");
  const list = popup.querySelector("#dispatchNoList");

  dispatchNumbers.forEach(no => {
    const option = document.createElement("option");
    option.value = no;
    option.textContent = no;
    list.appendChild(option);
  });

  list.onchange = () => {
    input.value = list.value;
  };

  popup.querySelector("#findDispatchCancel").onclick = () => {
    document.body.removeChild(overlay);
  };

  popup.querySelector("#findDispatchLoad").onclick = () => {
    const dispatchNo = input.value.trim();
    const record = state.dispatchRecords[dispatchNo];

    if (!record) {
      alert("Dispatch number not found.");
      return;
    }

    applyDispatchRecord(record, true);
    document.body.removeChild(overlay);
  };

  overlay.onclick = event => {
    if (event.target === overlay) {
      document.body.removeChild(overlay);
    }
  };
}

function openFindDispatchPopup() {
  const state = window.currentDispatchState;
  if (!state) return;

  if (!Object.keys(state.dispatchRecords || {}).length) {
    alert("No dispatch records found.");
    return;
  }

  createFindPopup(state);
}

function normalizeSavedState(savedState) {
  if (!savedState) return null;

  const normalized = {
    branch: selectedBranch,
    dispatchRecords: {},
    currentDispatchNo: "",
    lastDispatchNo: "",
    godown: [],
    vehicle: [],
    dispatchDetailsByLr: {}
  };

  if (savedState.dispatchRecords) {
    normalized.dispatchRecords = { ...savedState.dispatchRecords };
    normalized.currentDispatchNo = savedState.currentDispatchNo || "";
    normalized.lastDispatchNo = savedState.lastDispatchNo || "";
  } else {
    const legacyDispatchNo = savedState.dispatchDetailsByLr
      ? Object.values(savedState.dispatchDetailsByLr)[0]?.dispatchNo || String(DISPATCH_START_NUMBER)
      : String(DISPATCH_START_NUMBER);

    const form = {
      dispatchNo: legacyDispatchNo,
      dispatchDate: "",
      method: "",
      branch: selectedBranch,
      driverName: "",
      mobileNo: "",
      vehicleNo: "",
      route: "",
      remark: ""
    };

    Object.values(savedState.dispatchDetailsByLr || {}).forEach(detail => {
      Object.assign(form, detail || {});
    });

    normalized.dispatchRecords[legacyDispatchNo] = {
      dispatchNo: legacyDispatchNo,
      form,
      godown: savedState.godown || [],
      vehicle: savedState.vehicle || [],
      dispatchDetailsByLr: savedState.dispatchDetailsByLr || {}
    };
    normalized.currentDispatchNo = legacyDispatchNo;
    normalized.lastDispatchNo = legacyDispatchNo;
  }

  rebuildAggregateDispatchDetails(normalized);
  return normalized;
}

function setupButtons() {
  document.getElementById("btnMoveOneToVehicle").onclick = () =>
    moveSelected("godownList", "vehicleList");

  document.getElementById("btnMoveAllToVehicle").onclick = () =>
    moveAll("godownList", "vehicleList");

  document.getElementById("btnMoveOneToGodown").onclick = () =>
    moveSelected("vehicleList", "godownList");

  document.getElementById("btnMoveAllToGodown").onclick = () =>
    moveAll("vehicleList", "godownList");

  document.getElementById("loadingBtn").onclick = saveLoadingForVehicleLRs;
  document.getElementById("saveGodownBtn").onclick = saveGodownStockOnly;
  document.getElementById("btnNewDispatch").onclick = createNewDispatch;
  document.getElementById("btnEditDispatch").onclick = editCurrentDispatch;
  document.getElementById("btnDeleteDispatch").onclick = deleteCurrentDispatchEntry;
  document.getElementById("btnFindDispatch").onclick = openFindDispatchPopup;
  document.getElementById("btnPreviewDispatch").onclick = openDispatchPreview;
  document.getElementById("btnPrintDispatch").onclick = openDispatchPrintPreview;
}

function openDispatchPreview() {
  const dispatchNo = document.getElementById("dispatchNo").value.trim();

  if (!dispatchNo) {
    alert("No dispatch number loaded.");
    return;
  }

  const branch = document.getElementById("branchInput").value.trim() || selectedBranch;
  const query = new URLSearchParams({ dispatchNo, branch }).toString();
  window.open(`../Preview/preview.html?${query}`, "_blank");
}

function openDispatchPrintPreview() {
  const dispatchNo = document.getElementById("dispatchNo").value.trim();

  if (!dispatchNo) {
    alert("No dispatch number loaded.");
    return;
  }

  const branch = document.getElementById("branchInput").value.trim() || selectedBranch;
  const query = new URLSearchParams({ dispatchNo, branch, autoPrint: "1" }).toString();
  window.location.href = `../Preview/preview.html?${query}`;

  if (!previewWindow) {
    alert("Popup blocked. Please allow popups to print preview.");
    return;
  }

  previewWindow.addEventListener(
    "load",
    () => {
      setTimeout(() => {
        previewWindow.focus();
        previewWindow.print();
      }, 250);
    },
    { once: true }
  );
}

function createDeleteConfirmPopup({ onDelete }) {
  const overlay = document.createElement("div");
  overlay.className = "overlay delete-confirm-overlay";

  const popup = document.createElement("div");
  popup.className = "popup delete-confirm-popup";
  popup.innerHTML = `
    <h3>Confirm Delete</h3>
    <p>Type <strong>DELETE</strong> and press Delete to remove this entry.</p>
    <input type="text" id="deleteConfirmInput" placeholder="Type DELETE" autocomplete="off" />
    <div class="delete-confirm-actions">
      <button type="button" id="deleteConfirmBack">Back</button>
      <button type="button" id="deleteConfirmSubmit">Delete</button>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const input = popup.querySelector("#deleteConfirmInput");
  const backBtn = popup.querySelector("#deleteConfirmBack");
  const submitBtn = popup.querySelector("#deleteConfirmSubmit");

  const closePopup = () => {
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
    }
  };

  backBtn.onclick = closePopup;
  submitBtn.onclick = () => {
    if (input.value.trim() !== "DELETE") {
      alert('Please type "DELETE" in capital letters to confirm.');
      input.focus();
      return;
    }

    closePopup();
    onDelete();
  };

  overlay.onclick = event => {
    if (event.target === overlay) {
      closePopup();
    }
  };

  input.focus();
}

async function deleteCurrentDispatchEntry() {
  const state = window.currentDispatchState;
  if (!state) return;

  const dispatchNo = document.getElementById("dispatchNo").value.trim();
  if (!dispatchNo || !state.dispatchRecords?.[dispatchNo]) {
    alert("No dispatch record found to delete.");
    return;
  }

  createDeleteConfirmPopup({
    onDelete: async () => {
      try {
        delete state.dispatchRecords[dispatchNo];
        const remainingNumbers = Object.keys(state.dispatchRecords || {}).sort((a, b) => Number(a) - Number(b));

        if (!remainingNumbers.length) {
          const resetDispatchNo = String(DISPATCH_START_NUMBER);
          const freshRecord = {
            dispatchNo: resetDispatchNo,
            form: {
              dispatchNo: resetDispatchNo,
              dispatchDate: new Date().toISOString().slice(0, 10),
              method: "",
              branch: selectedBranch,
              driverName: "",
              mobileNo: "",
              vehicleNo: "",
              route: "",
              remark: ""
            },
            godown: [...allBranchLRs],
            vehicle: [],
            dispatchDetailsByLr: {}
          };

          state.dispatchRecords = { [resetDispatchNo]: freshRecord };
          state.currentDispatchNo = resetDispatchNo;
          state.lastDispatchNo = resetDispatchNo;
          state.godown = [...allBranchLRs];
          state.vehicle = [];
          rebuildAggregateDispatchDetails(state);
          await writeDispatchState(state);
          applyDispatchRecord(freshRecord, true);
          lockDispatchPage();
          alert("Dispatch entry deleted.");
          return;
        }

        const lastDispatchNo = remainingNumbers[remainingNumbers.length - 1];
        const recordToShow = state.dispatchRecords[lastDispatchNo];
        state.currentDispatchNo = lastDispatchNo;
        state.lastDispatchNo = lastDispatchNo;
        state.godown = [...(recordToShow.godown || [])];
        state.vehicle = [...(recordToShow.vehicle || [])];
        rebuildAggregateDispatchDetails(state);
        await writeDispatchState(state);
        applyDispatchRecord(recordToShow, true);
        lockDispatchPage();
        alert("Dispatch entry deleted.");
      } catch (error) {
        console.error(error);
        alert("Failed to delete dispatch entry.");
      }
    }
  });
}

async function initDispatchPage() {
  selectedBranch = getSelectedBranch();

  if (!selectedBranch) {
    alert("Please select a branch from the home page first.");
    return;
  }

  document.getElementById("branchInput").value = selectedBranch;

  try {
    await openBookingDb();
    await openDispatchDb();

    allBranchLRs = await readBookingLRs(selectedBranch);
    const savedState = await readDispatchState(selectedBranch);
    let state = normalizeSavedState(savedState);

    if (!state) {
      const initialDispatchNo = String(DISPATCH_START_NUMBER);
      state = {
        branch: selectedBranch,
        dispatchRecords: {
          [initialDispatchNo]: {
            dispatchNo: initialDispatchNo,
            form: {
              dispatchNo: initialDispatchNo,
              dispatchDate: new Date().toISOString().slice(0, 10),
              method: "",
              branch: selectedBranch,
              driverName: "",
              mobileNo: "",
              vehicleNo: "",
              route: "",
              remark: ""
            },
            godown: [...allBranchLRs],
            vehicle: [],
            dispatchDetailsByLr: {}
          }
        },
        currentDispatchNo: initialDispatchNo,
        lastDispatchNo: initialDispatchNo,
        godown: [...allBranchLRs],
        vehicle: [],
        dispatchDetailsByLr: {}
      };
      await writeDispatchState(state);
    }

    window.currentDispatchState = state;

    const lastDispatchNo = state.lastDispatchNo || state.currentDispatchNo;
    const recordToShow = state.dispatchRecords[lastDispatchNo] || Object.values(state.dispatchRecords)[0];
    applyDispatchRecord(recordToShow, true);

    setupButtons();
    lockDispatchPage();
  } catch (error) {
    console.error(error);
    alert("Failed to load dispatch data.");
  }
}

document.addEventListener("DOMContentLoaded", initDispatchPage);
