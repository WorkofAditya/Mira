const BOOKING_DB_NAME = "TransportDB";
const BOOKING_STORE = "bookings";

const DISPATCH_DB_NAME = "DispatchDB";
const DISPATCH_STORE = "dispatchBranchState";

let bookingDb;
let dispatchDb;
let selectedBranch = "";

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
    const request = indexedDB.open(DISPATCH_DB_NAME, 1);

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

function saveDispatchState() {
  const tx = dispatchDb.transaction(DISPATCH_STORE, "readwrite");
  const store = tx.objectStore(DISPATCH_STORE);

  const state = {
    branch: selectedBranch,
    godown: getListValues("godownList"),
    vehicle: getListValues("vehicleList"),
    dispatchDetailsByLr: getSavedDispatchDetails()
  };

  store.put(state);
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

function moveSelected(fromId, toId) {
  const from = document.getElementById(fromId);
  const to = document.getElementById(toId);
  const selected = [...from.selectedOptions];

  selected.forEach(opt => to.appendChild(opt));
  saveDispatchState();
}

function moveAll(fromId, toId) {
  const from = document.getElementById(fromId);
  const to = document.getElementById(toId);
  [...from.options].forEach(opt => to.appendChild(opt));
  saveDispatchState();
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

function getSavedDispatchDetails() {
  const state = window.currentDispatchState;
  if (!state || !state.dispatchDetailsByLr) return {};
  return { ...state.dispatchDetailsByLr };
}

function saveLoadingForVehicleLRs() {
  const vehicleLRs = getListValues("vehicleList");

  if (!vehicleLRs.length) {
    alert("Move at least one LR to LR ON VEHICLE before loading.");
    return;
  }

  const details = getDispatchFormValues();
  const previousDetails = getSavedDispatchDetails();
  const currentVehicleSet = new Set(vehicleLRs);

  Object.keys(previousDetails).forEach(lr => {
    if (!currentVehicleSet.has(lr)) {
      delete previousDetails[lr];
    }
  });

  vehicleLRs.forEach(lr => {
    previousDetails[lr] = { ...details };
  });

  const tx = dispatchDb.transaction(DISPATCH_STORE, "readwrite");
  const store = tx.objectStore(DISPATCH_STORE);

  const stateToSave = {
    branch: selectedBranch,
    godown: getListValues("godownList"),
    vehicle: vehicleLRs,
    dispatchDetailsByLr: previousDetails
  };

  const req = store.put(stateToSave);

  req.onsuccess = () => {
    window.currentDispatchState = stateToSave;
    alert("Dispatch details saved for LR ON VEHICLE.");
  };

  req.onerror = () => alert("Failed to save loading details.");
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

    const allBranchLRs = await readBookingLRs(selectedBranch);
    const savedState = await readDispatchState(selectedBranch);

    if (savedState) {
      const allSet = new Set(allBranchLRs);
      const vehicle = (savedState.vehicle || []).filter(lr => allSet.has(lr));
      const vehicleSet = new Set(vehicle);
      const godown = allBranchLRs.filter(lr => !vehicleSet.has(lr));

      fillList("godownList", godown);
      fillList("vehicleList", vehicle);

      window.currentDispatchState = {
        ...savedState,
        godown,
        vehicle,
        dispatchDetailsByLr: { ...(savedState.dispatchDetailsByLr || {}) }
      };
    } else {
      fillList("godownList", allBranchLRs);
      fillList("vehicleList", []);
      window.currentDispatchState = {
        branch: selectedBranch,
        godown: allBranchLRs,
        vehicle: [],
        dispatchDetailsByLr: {}
      };
      saveDispatchState();
    }
  } catch (error) {
    console.error(error);
    alert("Failed to load dispatch data.");
  }

  setupButtons();
}

document.addEventListener("DOMContentLoaded", initDispatchPage);
