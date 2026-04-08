// ================= DATABASE SETUP =================
let isNewBooking = false;

const DB_NAME = "TransportDB";
const STORE_NAME = "bookings";
const DISPATCH_DB_NAME = "DispatchDB";
const DISPATCH_STORE = "dispatchBranchState";
const EMPLOYEE_DB_NAME = "EmployeeDB";
const EMPLOYEE_STORE = "employees";
const BACKUP_DB_CONFIG = {
  booking: {
    dbName: DB_NAME,
    defaultVersion: 3,
    stores: [STORE_NAME, "counters"],
    storeOptions: {
      [STORE_NAME]: { keyPath: "branch" },
      counters: { keyPath: "name" }
    }
  },
  dispatch: {
    dbName: DISPATCH_DB_NAME,
    defaultVersion: 2,
    stores: [DISPATCH_STORE],
    storeOptions: {
      [DISPATCH_STORE]: { keyPath: "branch" }
    }
  },
  employee: {
    dbName: EMPLOYEE_DB_NAME,
    defaultVersion: 1,
    stores: [EMPLOYEE_STORE],
    storeOptions: {
      [EMPLOYEE_STORE]: { keyPath: "branch" }
    }
  }
};
let db;

const request = indexedDB.open(DB_NAME, 3);

request.onupgradeneeded = e => {
  db = e.target.result;

  if (!db.objectStoreNames.contains("bookings")) {
    db.createObjectStore("bookings", { keyPath: "branch" });
  }

  if (!db.objectStoreNames.contains("counters")) {
    const counterStore = db.createObjectStore("counters", { keyPath: "name" });
    counterStore.put({ name: "receiptNo", value: 1200 });
  }
};

request.onsuccess = e => {
  db = e.target.result;

  if (document.getElementById("branchSelect")) initHomePage();
  if (document.getElementById("branchFrom")) initBookingPage();
};

request.onerror = e => console.error("IndexedDB error:", e);

function getSelectedBranch() {
  return localStorage.getItem("selectedBranch") || sessionStorage.getItem("selectedBranch");
}

function setSelectedBranch(branch) {
  localStorage.setItem("selectedBranch", branch);
  sessionStorage.setItem("selectedBranch", branch);
}

// ================= HOMEPAGE =================
function initHomePage() {
  const selectBtn = document.querySelector(".select-btn");
  const branchSelect = document.getElementById("branchSelect");
  const closeAllMenus = () => {
    document.querySelectorAll(".drop-menu").forEach(menu => {
      menu.style.display = "none";
    });
  };

  const savedBranch = getSelectedBranch();
  if (savedBranch) branchSelect.value = savedBranch;

  selectBtn.onclick = () => {
    if (!branchSelect.value) {
      alert("Please select a branch");
      return;
    }
    setSelectedBranch(branchSelect.value);
    alert(`Branch set to ${branchSelect.value}`);
  };

  const employDataEntryBtn = document.getElementById("employDataEntryBtn");
  if (employDataEntryBtn) {
    employDataEntryBtn.onclick = event => {
      event.stopPropagation();
      openEntryPopup({ mode: "employee" });
      closeAllMenus();
    };
  }

  const driverDataEntryBtn = document.getElementById("driverDataEntryBtn");
  if (driverDataEntryBtn) {
    driverDataEntryBtn.onclick = event => {
      event.stopPropagation();
      openEntryPopup({ mode: "driver" });
      closeAllMenus();
    };
  }

  const openMenuNameData = target => {
    const branch = getSelectedBranch() || "";
    if (!branch) {
      alert("Please select a branch first.");
      return;
    }
    openNameFilterPopup({ branch, target });
    closeAllMenus();
  };

  const consignorDataBtn = document.getElementById("consignorDataBtn");
  if (consignorDataBtn) {
    consignorDataBtn.onclick = event => {
      event.stopPropagation();
      openMenuNameData("sender");
    };
  }

  const consigneeDataBtn = document.getElementById("consigneeDataBtn");
  if (consigneeDataBtn) {
    consigneeDataBtn.onclick = event => {
      event.stopPropagation();
      openMenuNameData("receiver");
    };
  }

  const dataToolsBtn = document.getElementById("dataToolsBtn");
  if (dataToolsBtn) {
    dataToolsBtn.onclick = () => openDataToolsPopup();
  }
}

async function readStoreRecords(idb, storeName) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error(`Failed to read ${storeName}`));
  });
}

function openDbWithVersion(dbName, version, stores = [], storeOptions = {}) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = event => {
      const idb = event.target.result;
      stores.forEach(storeName => {
        if (!idb.objectStoreNames.contains(storeName)) {
          idb.createObjectStore(storeName, storeOptions[storeName] || { keyPath: "branch" });
        }
      });
    };

    request.onsuccess = event => resolve(event.target.result);
    request.onerror = () => reject(request.error || new Error(`Failed opening ${dbName}`));
  });
}

function normalizeDbVersion(value, fallback = 1) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function exportDataGroup(groupKey) {
  const config = BACKUP_DB_CONFIG[groupKey];
  if (!config) throw new Error("Invalid export group");

  const idb = await openDbWithVersion(config.dbName, config.defaultVersion, config.stores, config.storeOptions);
  try {
    const stores = {};
    for (const storeName of config.stores) {
      if (!idb.objectStoreNames.contains(storeName)) continue;
      stores[storeName] = await readStoreRecords(idb, storeName);
    }

    const payload = {
      backupType: groupKey,
      createdAt: new Date().toISOString(),
      databases: {
        [config.dbName]: {
          version: idb.version,
          stores
        }
      }
    };

    downloadBackupFile(payload, `mira-${groupKey}-backup`);
  } finally {
    idb.close();
  }
}

function triggerFilePicker(onFile) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = () => {
    const [file] = input.files || [];
    if (file) onFile(file);
  };
  input.click();
}

function parseJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || "")));
      } catch {
        reject(new Error("Invalid JSON backup file."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read backup file."));
    reader.readAsText(file);
  });
}

async function exportAllDatabases() {
  const payload = {
    backupType: "all",
    createdAt: new Date().toISOString(),
    databases: {}
  };

  for (const config of Object.values(BACKUP_DB_CONFIG)) {
    const idb = await openDbWithVersion(config.dbName, config.defaultVersion, config.stores, config.storeOptions);
    try {
      const stores = {};
      for (const storeName of config.stores) {
        if (!idb.objectStoreNames.contains(storeName)) continue;
        stores[storeName] = await readStoreRecords(idb, storeName);
      }
      payload.databases[config.dbName] = {
        version: idb.version,
        stores
      };
    } finally {
      idb.close();
    }
  }

  downloadBackupFile(payload, "mira-full-backup");
}

async function clearDataGroup(groupKey) {
  const config = BACKUP_DB_CONFIG[groupKey];
  if (!config) throw new Error("Invalid delete group");

  const idb = await openDbWithVersion(config.dbName, config.defaultVersion, config.stores, config.storeOptions);
  try {
    for (const storeName of config.stores) {
      if (!idb.objectStoreNames.contains(storeName)) continue;
      await overwriteStore(idb, storeName, []);
    }
  } finally {
    idb.close();
  }
}

async function clearAllDatabases() {
  for (const groupKey of Object.keys(BACKUP_DB_CONFIG)) {
    await clearDataGroup(groupKey);
  }
}

function downloadBackupFile(payload, filePrefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filePrefix}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function overwriteStore(idb, storeName, records) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const clearReq = store.clear();
    clearReq.onerror = () => reject(new Error(`Failed clearing ${storeName}`));
    clearReq.onsuccess = () => {
      records.forEach(record => {
        store.put(record);
      });
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`Failed writing ${storeName}`));
  });
}

async function restoreBackupPayload(payload) {
  const databases = payload?.databases;
  if (!databases || typeof databases !== "object") {
    throw new Error("Backup file format is not supported.");
  }

  for (const [dbName, dbBackup] of Object.entries(databases)) {
    const stores = dbBackup?.stores || {};
    const matchingConfig = Object.values(BACKUP_DB_CONFIG).find(cfg => cfg.dbName === dbName);
    const defaultVersion = matchingConfig?.defaultVersion || 1;
    const backupVersion = normalizeDbVersion(dbBackup?.version, defaultVersion);
    const openVersion = Math.max(defaultVersion, backupVersion);
    const storeNames = Object.keys(stores);
    const upgradeStores = matchingConfig ? matchingConfig.stores : storeNames;
    const upgradeStoreOptions = matchingConfig?.storeOptions || {};

    const idb = await openDbWithVersion(dbName, openVersion, upgradeStores, upgradeStoreOptions);
    try {
      for (const storeName of storeNames) {
        if (!idb.objectStoreNames.contains(storeName)) continue;
        const records = Array.isArray(stores[storeName]) ? stores[storeName] : [];
        await overwriteStore(idb, storeName, records);
      }
    } finally {
      idb.close();
    }
  }
}

function openDataToolsPopup() {
  const existingPopup = document.getElementById("dataPopupOverlay");
  if (existingPopup) existingPopup.remove();

  const overlay = document.createElement("div");
  overlay.className = "data-popup-overlay";
  overlay.id = "dataPopupOverlay";

  const shell = document.createElement("div");
  shell.className = "data-popup-shell";
  shell.innerHTML = `
    <div class="data-popup-header">
      <h3>Data Backup & Restore</h3>
      <button type="button" class="data-popup-close" id="dataPopupClose">Close</button>
    </div>
    <div class="data-popup-body">
      <div class="data-actions-grid">
        <section class="data-card">
          <h4>Export data</h4>
          <p>Download complete backup or export each module separately.</p>
          <button type="button" class="data-btn primary" id="exportAllBtn">Export All</button>
          <button type="button" class="data-btn" id="exportBookingBtn">Booking</button>
          <button type="button" class="data-btn" id="exportDispatchBtn">Dispatch</button>
          <button type="button" class="data-btn" id="exportEmployeeBtn">Employee</button>
          <div class="data-hint">Includes LR numbers, dispatch numbers, and all saved entries branch-wise.</div>
        </section>
        <section class="data-card">
          <h4>Import data</h4>
          <p>Restore from a downloaded JSON backup file.</p>
          <button type="button" class="data-btn primary" id="importDataBtn">Import Backup</button>
          <div class="data-hint">Import replaces existing data for included modules and restores it as backed up.</div>
        </section>
        <section class="data-card danger">
          <h4>Delete data</h4>
          <p>Delete all data at once or clear only one module's saved records.</p>
          <button type="button" class="data-btn danger" id="deleteAllBtn">Delete All</button>
          <button type="button" class="data-btn danger-outline" id="deleteBookingBtn">Booking</button>
          <button type="button" class="data-btn danger-outline" id="deleteDispatchBtn">Dispatch</button>
          <button type="button" class="data-btn danger-outline" id="deleteEmployeeBtn">Employee</button>
          <div class="data-hint">Deleting is immediate and cannot be undone. Please export a backup first if needed.</div>
        </section>
      </div>
    </div>
  `;

  overlay.appendChild(shell);
  document.body.appendChild(overlay);

  const closePopup = () => overlay.remove();
  shell.querySelector("#dataPopupClose").onclick = closePopup;
  overlay.onclick = event => {
    if (event.target === overlay) closePopup();
  };

  shell.querySelector("#exportAllBtn").onclick = async () => {
    try {
      await exportAllDatabases();
      alert("Full backup downloaded.");
    } catch (error) {
      console.error(error);
      alert("Could not export full backup.");
    }
  };

  shell.querySelector("#exportBookingBtn").onclick = async () => {
    try {
      await exportDataGroup("booking");
      alert("Booking backup downloaded.");
    } catch (error) {
      console.error(error);
      alert("Could not export booking backup.");
    }
  };

  shell.querySelector("#exportDispatchBtn").onclick = async () => {
    try {
      await exportDataGroup("dispatch");
      alert("Dispatch backup downloaded.");
    } catch (error) {
      console.error(error);
      alert("Could not export dispatch backup.");
    }
  };

  shell.querySelector("#exportEmployeeBtn").onclick = async () => {
    try {
      await exportDataGroup("employee");
      alert("Employee backup downloaded.");
    } catch (error) {
      console.error(error);
      alert("Could not export employee backup.");
    }
  };

  shell.querySelector("#importDataBtn").onclick = () => {
    triggerFilePicker(async file => {
      try {
        const payload = await parseJsonFile(file);
        await restoreBackupPayload(payload);
        alert("Backup imported successfully. Reload pages to see restored data.");
      } catch (error) {
        console.error(error);
        alert(error.message || "Could not import backup.");
      }
    });
  };

  shell.querySelector("#deleteAllBtn").onclick = async () => {
    const shouldDelete = window.confirm("Delete ALL booking, dispatch, and employee data? This cannot be undone.");
    if (!shouldDelete) return;
    try {
      await clearAllDatabases();
      alert("All data deleted successfully.");
    } catch (error) {
      console.error(error);
      alert("Could not delete all data.");
    }
  };

  shell.querySelector("#deleteBookingBtn").onclick = async () => {
    const shouldDelete = window.confirm("Delete all booking data and counters? This cannot be undone.");
    if (!shouldDelete) return;
    try {
      await clearDataGroup("booking");
      alert("Booking data deleted successfully.");
    } catch (error) {
      console.error(error);
      alert("Could not delete booking data.");
    }
  };

  shell.querySelector("#deleteDispatchBtn").onclick = async () => {
    const shouldDelete = window.confirm("Delete all dispatch data? This cannot be undone.");
    if (!shouldDelete) return;
    try {
      await clearDataGroup("dispatch");
      alert("Dispatch data deleted successfully.");
    } catch (error) {
      console.error(error);
      alert("Could not delete dispatch data.");
    }
  };

  shell.querySelector("#deleteEmployeeBtn").onclick = async () => {
    const shouldDelete = window.confirm("Delete all employee data? This cannot be undone.");
    if (!shouldDelete) return;
    try {
      await clearDataGroup("employee");
      alert("Employee data deleted successfully.");
    } catch (error) {
      console.error(error);
      alert("Could not delete employee data.");
    }
  };
}

function openEntryPopup({ mode = "employee" } = {}) {
  const isDriverMode = mode === "driver";
  const popupTitle = isDriverMode ? "Driver Data Entry" : "Employee Data Entry";
  const frameSrc = isDriverMode ? "employee/employee.html?mode=driver" : "employee/employee.html";
  const existingPopup = document.getElementById("employeePopupOverlay");
  if (existingPopup) {
    existingPopup.remove();
  }

  const overlay = document.createElement("div");
  overlay.className = "employee-popup-overlay";
  overlay.id = "employeePopupOverlay";

  const shell = document.createElement("div");
  shell.className = "employee-popup-shell";

  const header = document.createElement("div");
  header.className = "employee-popup-header";
  header.innerHTML = `
    <span>${popupTitle}</span>
    <button type="button" class="employee-popup-close" id="employeePopupClose">Close</button>
  `;

  const frame = document.createElement("iframe");
  frame.className = "employee-popup-frame";
  frame.src = frameSrc;
  frame.title = popupTitle;

  shell.appendChild(header);
  shell.appendChild(frame);
  overlay.appendChild(shell);
  document.body.appendChild(overlay);

  const closePopup = () => {
    overlay.remove();
  };

  header.querySelector("#employeePopupClose").onclick = closePopup;
  overlay.onclick = event => {
    if (event.target === overlay) closePopup();
  };
}

// ================= BOOKING INIT =================
function initBookingPage() {
  const branch = getSelectedBranch();
  const branchInput = document.getElementById("branchFrom");
  const pickupFrom = document.getElementById("pickupFrom");

  if (!branch) {
    alert("No branch selected");
    return;
  }

  branchInput.value = branch;
  branchInput.readOnly = true;

  // Sync pickup from here
  pickupFrom.value = branch;

  lockForm();
  loadLatestBooking(branch);
  setupButtons(branch);
  setupNameFilterButtons(branch);
  setupEnterNavigation();
  setupBookingFeeCalculations();
  setupDispatchAutoSync();
}

function setDefaultBookingSelections() {
  const branchToSelect = document.getElementById("branchTo");
  const payModeSelect = document.getElementById("payMode");
  const deliveryToInput = document.getElementById("deliveryTo");

  if (branchToSelect) {
    branchToSelect.value = "DELHI";
    if (deliveryToInput) deliveryToInput.value = "DELHI";
  }

  if (payModeSelect) payModeSelect.value = "TO PAY";
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

let recalculateBookingFees = () => {};

function setupBookingFeeCalculations() {
  const weightInput = document.getElementById("weight");
  const freightInput = document.getElementById("freight");
  const freightExtraInput = document.getElementById("freightExtra");
  const doorDeliveryInput = document.getElementById("doorDelivery");
  const extraCharges1Input = document.getElementById("extraCharges1");
  const extraCharges2Input = document.getElementById("extraCharges2");
  const totalInput = document.getElementById("total");

  if (!weightInput || !freightInput || !freightExtraInput || !totalInput) return;

  freightInput.readOnly = true;

  recalculateBookingFees = () => {
    const weight = toNumber(weightInput.value);
    const freightRate = toNumber(freightExtraInput.value);
    const freight = weight * freightRate;

    freightInput.value = freight ? freight.toString() : "";

    const total =
      freight +
      toNumber(doorDeliveryInput?.value) +
      toNumber(extraCharges1Input?.value) +
      toNumber(extraCharges2Input?.value);

    totalInput.value = total ? total.toString() : "";
  };

  [
    weightInput,
    freightExtraInput,
    doorDeliveryInput,
    extraCharges1Input,
    extraCharges2Input
  ]
    .filter(Boolean)
    .forEach(input => input.addEventListener("input", recalculateBookingFees));

  recalculateBookingFees();
}


// ================= LOCK / UNLOCK =================
function lockForm() {
  document
    .querySelectorAll(".booking-body input, .booking-body select")
    .forEach(el => {
      if (el.id !== "branchFrom") {
        el.tagName === "SELECT"
          ? (el.disabled = true)
          : (el.readOnly = true);
      }
    });
}

function unlockForm() {
  document
    .querySelectorAll(".booking-body input, .booking-body select")
    .forEach(el => {
      if (el.id !== "branchFrom") {
        el.tagName === "SELECT"
          ? (el.disabled = false)
          : (el.readOnly = false);
      }
    });

  const freightInput = document.getElementById("freight");
  const totalInput = document.getElementById("total");
  if (freightInput) freightInput.readOnly = true;
  if (totalInput) totalInput.readOnly = true;
}


// ================= NEW BOOKING =================
function newBooking() {
  isNewBooking = true;
  unlockForm();
  const previousBranchTo = document.getElementById("branchTo")?.value || "";
  const previousPayMode = document.getElementById("payMode")?.value || "";
  const previousBookingDate = document.getElementById("bookingDate")?.value || "";

  document
    .querySelectorAll(".booking-body input, .booking-body select")
    .forEach(el => {
      if (el.id !== "branchFrom") el.value = "";
    });

  // Re-sync pickup after clear
  document.getElementById("pickupFrom").value =
    document.getElementById("branchFrom").value;
  setDefaultBookingSelections();

  if (previousBranchTo && document.getElementById("branchTo")) {
    document.getElementById("branchTo").value = previousBranchTo;
    const deliveryToInput = document.getElementById("deliveryTo");
    if (deliveryToInput) deliveryToInput.value = previousBranchTo;
  }

  if (previousPayMode && document.getElementById("payMode")) {
    document.getElementById("payMode").value = previousPayMode;
  }

  if (previousBookingDate && document.getElementById("bookingDate")) {
    document.getElementById("bookingDate").value = previousBookingDate;
  }

  const lr = document.getElementById("lrNo");
  lr.readOnly = false;
  lr.focus();

  recalculateBookingFees();
}


function getNextReceiptNo(callback) {
  const tx = db.transaction("counters", "readwrite");
  const store = tx.objectStore("counters");

  const req = store.get("receiptNo");

  req.onsuccess = () => {
    const data = req.result || { name: "receiptNo", value: 1200 };
    const next = data.value + 1;

    data.value = next;
    store.put(data);

    callback(next);
  };

  req.onerror = () => {
    alert("Failed to generate receipt number");
  };
}


// ================= SAVE BOOKING =================
function saveData(branch) {
  const booking = {};
  document.querySelectorAll(".booking-body input, .booking-body select")
  .forEach(el => {
    if (el.id) booking[el.id] = el.value.trim();
  });

  booking.branchFrom = branch;

  if (!booking.lrNo) {
    alert("LR No is required");
    return;
  }

  const doSave = receiptNo => {
    if (receiptNo !== null) booking.receiptNo = receiptNo;

    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const getReq = store.get(branch);
    getReq.onsuccess = () => {
  const data = getReq.result || { branch, bookings: {} };

  // FIX: ensure bookings exists
  if (!data.bookings) data.bookings = {};

  if (isNewBooking && data.bookings[booking.lrNo]) {
  alert("This LR No already exists");
  return;
  }

  data.bookings[booking.lrNo] = booking;


  const putReq = store.put(data);

  putReq.onsuccess = () => {
    isNewBooking = false;
    lockForm();
    alert("Booking saved successfully");
  };

  putReq.onerror = () => alert("Save failed");
};

  };

  if (isNewBooking) {
    // NEW booking: get receipt number
    getNextReceiptNo(doSave);
  } else {
    // EDIT existing: keep receipt number
    doSave(booking.receiptNo || null);
  }
}


function getDispatchDetailsForLr(branch, lrNo) {
  return new Promise(resolve => {
    if (!branch || !lrNo) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DISPATCH_DB_NAME);

    request.onsuccess = e => {
      const dispatchDb = e.target.result;

      if (!dispatchDb.objectStoreNames.contains(DISPATCH_STORE)) {
        dispatchDb.close();
        resolve(null);
        return;
      }

      try {
        const tx = dispatchDb.transaction(DISPATCH_STORE, "readonly");
        const store = tx.objectStore(DISPATCH_STORE);
        const req = store.get(branch);

        req.onsuccess = () => {
          const details = req.result?.dispatchDetailsByLr?.[lrNo] || null;
          resolve(details);
        };

        req.onerror = () => resolve(null);
        tx.oncomplete = () => dispatchDb.close();
      } catch (error) {
        dispatchDb.close();
        resolve(null);
      }
    };

    request.onerror = () => resolve(null);
  });
}

function applyDispatchDetailsToForm(details) {
  const memo = document.getElementById("dispatchMemo");
  const dispatchDate = document.getElementById("dispatchDate");
  const driverName = document.getElementById("driverName");

  if (!memo || !dispatchDate || !driverName) return;

  memo.value = details?.dispatchNo || "";
  dispatchDate.value = details?.dispatchDate || "";
  driverName.value = details?.driverName || "";
}

async function syncDispatchSectionForCurrentLr() {
  const branch = getSelectedBranch();
  const lrNo = document.getElementById("lrNo")?.value?.trim();
  const details = await getDispatchDetailsForLr(branch, lrNo);
  applyDispatchDetailsToForm(details);
}

function setupDispatchAutoSync() {
  const lrInput = document.getElementById("lrNo");
  if (!lrInput) return;

  const sync = () => {
    syncDispatchSectionForCurrentLr();
  };

  lrInput.addEventListener("change", sync);
  lrInput.addEventListener("blur", sync);
}

// ================= LOAD LATEST =================
async function loadLatestBooking(branch) {
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(branch);

  req.onsuccess = async () => {
    if (!req.result || !req.result.bookings || !Object.keys(req.result.bookings).length) {
      document
        .querySelectorAll(".booking-body input, .booking-body select")
        .forEach(el => {
          if (el.id !== "branchFrom") el.value = "";
        });
      document.getElementById("pickupFrom").value = branch;
      setDefaultBookingSelections();
      lockForm();
      recalculateBookingFees();
      applyDispatchDetailsToForm(null);
      return;
    }

    const bookings = req.result.bookings;
    const lastLR = Object.keys(bookings).sort().pop();
    const data = bookings[lastLR];

    Object.keys(data).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = data[id];
    });

    lockForm();
    recalculateBookingFees();
    await syncDispatchSectionForCurrentLr();
  };
}

// ================= BUTTONS =================
function setupButtons(branch) {
  document.getElementById("btnNew").onclick = newBooking;
  document.getElementById("btnEdit").onclick = unlockForm;
  document.getElementById("btnSave").onclick = () => saveData(branch);
  document.getElementById("btnPrint").onclick = printReceipt;
  document.getElementById("btnDelete").onclick = () => deleteCurrentBooking(branch);
  document.getElementById("btnFind").onclick = openFindPopup;
  document.getElementById("btnPreview").onclick = previewReceipt;
}

function setupNameFilterButtons(branch) {
  const senderBtn = document.getElementById("senderFilterBtn");
  const receiverBtn = document.getElementById("receiverFilterBtn");

  if (senderBtn) {
    senderBtn.onclick = () => openNameFilterPopup({ branch, target: "sender" });
  }

  if (receiverBtn) {
    receiverBtn.onclick = () => openNameFilterPopup({ branch, target: "receiver" });
  }
}

function loadBookingsForBranch(branch) {
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(branch);

    req.onsuccess = () => {
      resolve(req.result?.bookings || {});
    };

    req.onerror = () => resolve({});
  });
}

function filterBookingsByCriteria(bookings, { dateFrom, dateTo, payMode }) {
  return Object.values(bookings).filter(booking => {
    const bookingDate = booking.bookingDate || "";
    const bookingPayMode = booking.payMode || "";

    if (dateFrom && bookingDate < dateFrom) return false;
    if (dateTo && bookingDate > dateTo) return false;
    if (payMode && bookingPayMode !== payMode) return false;
    return true;
  });
}

async function openNameFilterPopup({ branch, target }) {
  const nameKey = target === "receiver" ? "receiver" : "sender";
  const label = nameKey === "receiver" ? "Receiver" : "Sender";
  const bookings = await loadBookingsForBranch(branch);

  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const popup = document.createElement("div");
  popup.className = "popup name-filter-popup";
  popup.innerHTML = `
    <h3>${label} Filter</h3>
    <div class="name-filter-fields">
      <label for="filterDateFrom">Date from</label>
      <input type="date" id="filterDateFrom">

      <label for="filterDateTo">Date to</label>
      <input type="date" id="filterDateTo">

      <label for="filterPayMode">B-Pay Mode</label>
      <select id="filterPayMode">
        <option value="">-- Select --</option>
        <option value="TO PAY">To Pay</option>
        <option value="PAID">Paid</option>
        <option value="ACCOUNT">Account</option>
      </select>

      <label for="nameFilterResults">${label} box</label>
      <select id="nameFilterResults" class="name-filter-results" size="8"></select>
    </div>
    <div class="name-filter-actions">
      <button type="button" id="nameFilterClose">Close</button>
      <button type="button" id="nameFilterApply">Search</button>
      <button type="button" id="nameFilterOpen">Open</button>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const dateFromEl = popup.querySelector("#filterDateFrom");
  const dateToEl = popup.querySelector("#filterDateTo");
  const payModeEl = popup.querySelector("#filterPayMode");
  const resultsEl = popup.querySelector("#nameFilterResults");
  const closeBtn = popup.querySelector("#nameFilterClose");
  const applyBtn = popup.querySelector("#nameFilterApply");
  const openBtn = popup.querySelector("#nameFilterOpen");

  if (payModeEl) {
    payModeEl.value = document.getElementById("payMode")?.value || "";
  }

  const closePopup = () => {
    if (overlay.parentNode) document.body.removeChild(overlay);
  };

  const renderResults = names => {
    resultsEl.innerHTML = "";

    if (!names.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No matching records";
      option.disabled = true;
      resultsEl.appendChild(option);
      return;
    }

    names.forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      resultsEl.appendChild(option);
    });
  };

  const applyFilter = (preferredSelection = "") => {
    if (dateFromEl.value && dateToEl.value && dateFromEl.value > dateToEl.value) {
      alert("Date from cannot be after Date to.");
      return;
    }

    const filteredBookings = filterBookingsByCriteria(bookings, {
      dateFrom: dateFromEl.value,
      dateTo: dateToEl.value,
      payMode: payModeEl.value
    });

    const names = [...new Set(
      filteredBookings
        .map(booking => (booking[nameKey] || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    renderResults(names);

    if (names.length) {
      const preferredIndex = preferredSelection
        ? names.findIndex(name => name === preferredSelection)
        : -1;
      resultsEl.selectedIndex = preferredIndex >= 0 ? preferredIndex : 0;
    }

    return filteredBookings;
  };

  closeBtn.onclick = closePopup;
  applyBtn.onclick = () => applyFilter(resultsEl.value || "");
  openBtn.onclick = () => {
    const selectedBeforeApply = resultsEl.value || "";
    const filteredBookings = applyFilter(selectedBeforeApply);
    if (!filteredBookings) return;

    const selectedName = resultsEl.value || "";
    if (!selectedName) {
      alert(`Select a ${label.toLowerCase()} name first.`);
      return;
    }

    const rows = filteredBookings
      .filter(booking => (booking[nameKey] || "").trim() === selectedName)
      .sort((a, b) => (a.bookingDate || "").localeCompare(b.bookingDate || ""));

    if (!rows.length) {
      alert("No booking rows found for selected name.");
      return;
    }

    openNameLedgerPopup({
      target: nameKey,
      selectedName,
      rows
    });
  };
  overlay.onclick = event => {
    if (event.target === overlay) closePopup();
  };
}

function openNameLedgerPopup({ target, selectedName, rows }) {
  const counterPartyLabel = target === "sender" ? "Receiver" : "Sender";
  const counterPartyKey = target === "sender" ? "receiver" : "sender";

  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const popup = document.createElement("div");
  popup.className = "popup name-ledger-popup";
  popup.innerHTML = `
    <div class="name-ledger-header">
      <div class="name-ledger-logo">RC</div>
      <div class="name-ledger-title">
        <h3>Riya Cargo</h3>
        <h4>${target === "sender" ? "SENDER" : "RECEIVER"} BOOKING LIST</h4>
      </div>
    </div>
    <p class="name-ledger-info"><strong>${target === "sender" ? "Sender" : "Receiver"}:</strong> ${selectedName}</p>
    <table class="dispatch-table">
      <thead>
        <tr>
          <th>LR</th>
          <th>Date</th>
          <th>${counterPartyLabel}</th>
          <th>Content</th>
          <th>Total</th>
          <th>B-Pay Mode</th>
        </tr>
      </thead>
      <tbody id="nameLedgerBody"></tbody>
    </table>
    <div class="name-filter-actions">
      <button type="button" id="nameLedgerClose">Close</button>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const tbody = popup.querySelector("#nameLedgerBody");
  rows.forEach(booking => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${booking.lrNo || ""}</td>
      <td>${booking.bookingDate || ""}</td>
      <td>${booking[counterPartyKey] || ""}</td>
      <td>${booking.content || ""}</td>
      <td>${booking.total || ""}</td>
      <td>${booking.payMode || ""}</td>
    `;
    tbody.appendChild(tr);
  });

  const closePopup = () => {
    if (overlay.parentNode) document.body.removeChild(overlay);
  };

  popup.querySelector("#nameLedgerClose").onclick = closePopup;
  overlay.onclick = event => {
    if (event.target === overlay) closePopup();
  };
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
    if (overlay.parentNode) document.body.removeChild(overlay);
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
    if (event.target === overlay) closePopup();
  };

  input.focus();
}

function deleteCurrentBooking(branch) {
  const lrNo = document.getElementById("lrNo")?.value?.trim();
  if (!lrNo) {
    alert("No LR number loaded to delete.");
    return;
  }

  createDeleteConfirmPopup({
    onDelete: () => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(branch);

      req.onsuccess = () => {
        const branchData = req.result;
        if (!branchData?.bookings?.[lrNo]) {
          alert("No booking found for the current LR number.");
          return;
        }

        delete branchData.bookings[lrNo];

        const putReq = store.put(branchData);
        putReq.onsuccess = () => {
          alert("Booking deleted successfully.");
          loadLatestBooking(branch);
        };
        putReq.onerror = () => alert("Failed to delete booking.");
      };

      req.onerror = () => alert("Failed to read bookings for deletion.");
    }
  });
}

// ================= ENTER NAV =================
function setupEnterNavigation() {
  const enterOrder = [
    "lrNo",
    "payMode",
    "sender",
    "receiver",
    "content",
    "packages",
    "weight",
    "reminder",
    "mobile",
    "pkgDetail",
    "freightExtra",
    "doorDelivery",
    "extraCharges1",
    "extraCharges2",
    "total"
  ]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  enterOrder.forEach((field, index) => {
    field.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();

      const nextField = enterOrder[index + 1];
      if (nextField) {
        nextField.focus();
        if (typeof nextField.select === "function") nextField.select();
        return;
      }

      document.getElementById("btnSave")?.click();
    });
  });
}

// ================= PRINT =================
function printReceipt() {
  const branch = getSelectedBranch();
  const lrNo = document.getElementById("lrNo").value;

  if (!lrNo) {
    alert("Enter LR No to print");
    return;
  }

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(branch);

  req.onsuccess = () => {
    const booking = req.result?.bookings?.[lrNo];
    if (!booking) {
      alert("No booking found");
      return;
    }

    const html = generateReceiptHTML(booking);
    receiptLeft.innerHTML = html;
    receiptRight.innerHTML = html;

    printArea.style.display = "block";
    setTimeout(() => {
      window.print();
      printArea.style.display = "none";
    }, 300);
  };
}

function generateReceiptHTML(d) {
  const tpl = document.getElementById("receiptTemplate").content.cloneNode(true);

  tpl.querySelector("[data-booking-date]").textContent = d.bookingDate || "";
  tpl.querySelector("[data-lr-no]").textContent = d.lrNo || "";
  tpl.querySelector("[data-route]").textContent =
    `${d.branchFrom || ""} TO ${d.branchTo || ""}`;

  tpl.querySelector("[data-sender]").textContent = d.sender || "";
  tpl.querySelector("[data-receiver]").textContent = d.receiver || "";
  tpl.querySelector("[data-mobile]").textContent = d.mobile || "";
  tpl.querySelector("[data-content]").textContent = d.content || "";
  tpl.querySelector("[data-pkg]").textContent = d.pkgDetail || "";
  tpl.querySelector("[data-packages]").textContent = d.packages || "";
  tpl.querySelector("[data-weight]").textContent = d.weight || "";
  tpl.querySelector("[data-total]").textContent = `TO PAY : ${d.total || ""}`;

  const wrapper = document.createElement("div");
  wrapper.appendChild(tpl);
  return wrapper.innerHTML;
}

function previewReceipt() {
  const branch = getSelectedBranch();
  if (!branch) return alert("No branch selected");

  const lrNo = document.getElementById("lrNo").value;
  if (!lrNo) return alert("Enter LR No to preview");

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(branch);

  req.onsuccess = () => {
    const data = req.result?.bookings?.[lrNo];
    if (!data) return alert("No booking found");

    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const popup = document.createElement("div");
    popup.className = "popup";

    popup.innerHTML = generateReceiptHTML(data);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    overlay.onclick = e => {
      if (e.target === overlay) document.body.removeChild(overlay);
    };
  };
}

function openFindPopup() {
  const branch = getSelectedBranch();
  if (!branch) return alert("No branch selected");

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(branch);

  req.onsuccess = () => {
    const bookings = req.result?.bookings;
    if (!bookings) return alert("No bookings found");

    const tpl = document.getElementById("findPopupTemplate").content.cloneNode(true);
    const overlay = tpl.querySelector(".overlay");
    const list = tpl.querySelector("#lrList");

    Object.keys(bookings).sort().forEach(lr => {
      list.innerHTML += `<option value="${lr}">${lr}</option>`;
    });

    document.body.appendChild(tpl);

    list.onchange = e =>
      document.getElementById("findLR").value = e.target.value;

    document.getElementById("findCancel").onclick = () =>
      document.body.removeChild(overlay);

    document.getElementById("findLoad").onclick = () => {
      const lr = document.getElementById("findLR").value.trim();
      if (!bookings[lr]) return alert("Invalid LR No");
      loadBookingToForm(bookings[lr]);
      document.body.removeChild(overlay);
    };
  };
}

async function loadBookingToForm(data) {
  Object.keys(data).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = data[id];
  });

  lockForm();
  recalculateBookingFees();
  await syncDispatchSectionForCurrentLr();
}

const branchTo = document.getElementById("branchTo");
const deliveryTo = document.getElementById("deliveryTo");
if (branchTo && deliveryTo) {
  branchTo.addEventListener("change", () => {
    deliveryTo.value = branchTo.value;
  });
}


document.querySelectorAll(".drop-btn").forEach(btn => {
  const menu = btn.nextElementSibling;
  if (!menu) return; // skip if no menu exists

  btn.addEventListener("click", e => {
    e.stopPropagation(); // prevent the document click handler immediately closing it

    // Close other menus
    document.querySelectorAll(".drop-menu").forEach(m => {
      if (m !== menu) m.style.display = "none";
    });

    // Toggle this menu
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
});

// Close all menus when clicking outside
document.addEventListener("click", () => {
  document.querySelectorAll(".drop-menu").forEach(m => (m.style.display = "none"));
});
