const EMPLOYEE_DB_NAME = "EmployeeDB";
const EMPLOYEE_STORE = "employees";
let employeeDb;
let isNewEmployee = false;
let currentBranch = "";

function getSelectedBranch() {
  return localStorage.getItem("selectedBranch") || sessionStorage.getItem("selectedBranch") || "";
}

function openEmployeeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EMPLOYEE_DB_NAME, 1);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(EMPLOYEE_STORE)) {
        db.createObjectStore(EMPLOYEE_STORE, { keyPath: "branch" });
      }
    };

    request.onsuccess = event => {
      employeeDb = event.target.result;
      resolve(employeeDb);
    };

    request.onerror = () => reject(request.error);
  });
}

function lockEmployeeForm() {
  document.querySelectorAll(".employee-body input, .employee-body textarea").forEach(el => {
    el.readOnly = true;
    if (el.type === "file") el.disabled = true;
  });
}

function unlockEmployeeForm() {
  document.querySelectorAll(".employee-body input, .employee-body textarea").forEach(el => {
    el.readOnly = false;
    if (el.type === "file") el.disabled = false;
  });
}

function resetPhotoPreview(imgId, placeholderId) {
  const img = document.getElementById(imgId);
  const placeholder = document.getElementById(placeholderId);
  img.style.display = "none";
  img.src = "";
  placeholder.style.display = "block";
}

function setPhotoPreview(imgId, placeholderId, dataUrl) {
  const img = document.getElementById(imgId);
  const placeholder = document.getElementById(placeholderId);

  if (!dataUrl) {
    resetPhotoPreview(imgId, placeholderId);
    return;
  }

  img.src = dataUrl;
  img.style.display = "block";
  placeholder.style.display = "none";
}

function clearEmployeeForm() {
  document.querySelectorAll(".employee-body input, .employee-body textarea").forEach(el => {
    if (el.type === "file") {
      el.value = "";
      return;
    }
    el.value = "";
  });

  resetPhotoPreview("employeePhotoPreview", "employeePhotoPlaceholder");
  resetPhotoPreview("aadhaarPhotoPreview", "aadhaarPhotoPlaceholder");
}

function getEmployeePayload() {
  return {
    name: document.getElementById("name").value.trim(),
    mobileNumber: document.getElementById("mobileNumber").value.trim(),
    designation: document.getElementById("designation").value.trim(),
    joiningDate: document.getElementById("joiningDate").value,
    monthlySalary: document.getElementById("monthlySalary").value,
    perDaySalary: document.getElementById("perDaySalary").value,
    address: document.getElementById("address").value.trim(),
    employeePhoto: document.getElementById("employeePhotoPreview").src || "",
    aadhaarPhoto: document.getElementById("aadhaarPhotoPreview").src || ""
  };
}

function loadEmployeeToForm(employee) {
  document.getElementById("name").value = employee.name || "";
  document.getElementById("name").defaultValue = employee.name || "";
  document.getElementById("mobileNumber").value = employee.mobileNumber || "";
  document.getElementById("designation").value = employee.designation || "";
  document.getElementById("joiningDate").value = employee.joiningDate || "";
  document.getElementById("monthlySalary").value = employee.monthlySalary || "";
  document.getElementById("perDaySalary").value = employee.perDaySalary || "";
  document.getElementById("address").value = employee.address || "";

  setPhotoPreview("employeePhotoPreview", "employeePhotoPlaceholder", employee.employeePhoto || "");
  setPhotoPreview("aadhaarPhotoPreview", "aadhaarPhotoPlaceholder", employee.aadhaarPhoto || "");

  lockEmployeeForm();
}

function readBranchRecord() {
  return new Promise((resolve, reject) => {
    const tx = employeeDb.transaction(EMPLOYEE_STORE, "readonly");
    const store = tx.objectStore(EMPLOYEE_STORE);
    const request = store.get(currentBranch);

    request.onsuccess = () => resolve(request.result || { branch: currentBranch, employees: {} });
    request.onerror = () => reject(request.error);
  });
}

function writeBranchRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = employeeDb.transaction(EMPLOYEE_STORE, "readwrite");
    const store = tx.objectStore(EMPLOYEE_STORE);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadLatestEmployee() {
  const record = await readBranchRecord();
  const names = Object.keys(record.employees || {}).sort((a, b) => a.localeCompare(b));

  if (!names.length) {
    clearEmployeeForm();
    lockEmployeeForm();
    return;
  }

  const lastName = record.lastName && record.employees[record.lastName]
    ? record.lastName
    : names[names.length - 1];

  loadEmployeeToForm(record.employees[lastName]);
}

function createNewEmployee() {
  isNewEmployee = true;
  clearEmployeeForm();
  unlockEmployeeForm();
  document.getElementById("name").focus();
}

function editCurrentEmployee() {
  const currentName = document.getElementById("name").value.trim();
  if (!currentName) {
    alert("No employee loaded.");
    return;
  }

  isNewEmployee = false;
  unlockEmployeeForm();
  document.getElementById("name").focus();
}

async function saveEmployee() {
  const payload = getEmployeePayload();
  if (!payload.name) {
    alert("Name is required.");
    return;
  }

  const record = await readBranchRecord();
  record.employees = record.employees || {};

  const existingNames = Object.keys(record.employees);
  const normalizedTarget = payload.name.toLowerCase();
  const matchingName = existingNames.find(name => name.toLowerCase() === normalizedTarget);

  if (isNewEmployee && matchingName) {
    alert("This Name already exists.");
    return;
  }

  if (!isNewEmployee) {
    const loadedName = document.getElementById("name").defaultValue || "";
    if (loadedName && loadedName !== payload.name && record.employees[loadedName]) {
      delete record.employees[loadedName];
    }
  }

  record.employees[payload.name] = payload;
  record.lastName = payload.name;
  await writeBranchRecord(record);

  document.getElementById("name").defaultValue = payload.name;
  isNewEmployee = false;
  lockEmployeeForm();
  alert("Employee saved successfully.");
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

async function deleteCurrentEmployee() {
  const currentName = document.getElementById("name").value.trim();
  if (!currentName) {
    alert("No employee record loaded to delete.");
    return;
  }

  createDeleteConfirmPopup({
    onDelete: async () => {
      const record = await readBranchRecord();
      if (!record.employees?.[currentName]) {
        alert("Employee name not found.");
        return;
      }

      delete record.employees[currentName];
      if (record.lastName === currentName) {
        record.lastName = "";
      }

      await writeBranchRecord(record);
      alert("Employee entry deleted.");
      await loadLatestEmployee();
    }
  });
}

async function openFindEmployeePopup() {
  const record = await readBranchRecord();
  const names = Object.keys(record.employees || {}).sort((a, b) => a.localeCompare(b));

  if (!names.length) {
    alert("No employee records found.");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "overlay dispatch-find-overlay";

  const popup = document.createElement("div");
  popup.className = "popup dispatch-find-popup";
  popup.innerHTML = `
    <h3>Find Employee</h3>
    <div class="find-row">
      <label for="findEmployeeName">Name</label>
      <input type="text" id="findEmployeeName" placeholder="Enter employee name" />
    </div>
    <div class="find-row">
      <label for="employeeNameList">Available Names</label>
      <select id="employeeNameList" size="8"></select>
    </div>
    <div class="find-actions">
      <button type="button" id="findEmployeeLoad">Load</button>
      <button type="button" id="findEmployeeCancel">Cancel</button>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const input = popup.querySelector("#findEmployeeName");
  const list = popup.querySelector("#employeeNameList");

  names.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    list.appendChild(option);
  });

  list.onchange = () => {
    input.value = list.value;
  };

  popup.querySelector("#findEmployeeCancel").onclick = () => {
    document.body.removeChild(overlay);
  };

  popup.querySelector("#findEmployeeLoad").onclick = () => {
    const employeeName = input.value.trim();
    const employee = record.employees[employeeName];

    if (!employee) {
      alert("Employee name not found.");
      return;
    }

    loadEmployeeToForm(employee);
    document.getElementById("name").defaultValue = employee.name || "";
    document.body.removeChild(overlay);
  };

  overlay.onclick = event => {
    if (event.target === overlay) {
      document.body.removeChild(overlay);
    }
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function bindPhotoInput(inputId, imageId, placeholderId) {
  const input = document.getElementById(inputId);
  input.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) {
      resetPhotoPreview(imageId, placeholderId);
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setPhotoPreview(imageId, placeholderId, dataUrl);
    } catch (error) {
      console.error(error);
      alert("Unable to read selected image.");
    }
  });
}

function bindActions() {
  document.getElementById("btnEmpNew").onclick = createNewEmployee;
  document.getElementById("btnEmpEdit").onclick = editCurrentEmployee;
  document.getElementById("btnEmpSave").onclick = () => saveEmployee().catch(error => {
    console.error(error);
    alert("Failed to save employee data.");
  });
  document.getElementById("btnEmpDelete").onclick = () => deleteCurrentEmployee().catch(error => {
    console.error(error);
    alert("Failed to delete employee data.");
  });
  document.getElementById("btnEmpFind").onclick = () => openFindEmployeePopup().catch(error => {
    console.error(error);
    alert("Failed to open find popup.");
  });
}

async function initEmployeePage() {
  currentBranch = getSelectedBranch() || "UNASSIGNED";
  document.getElementById("employeeBranchLabel").textContent = `Branch: ${currentBranch}`;

  bindPhotoInput("employeePhotoInput", "employeePhotoPreview", "employeePhotoPlaceholder");
  bindPhotoInput("aadhaarPhotoInput", "aadhaarPhotoPreview", "aadhaarPhotoPlaceholder");
  bindActions();

  await openEmployeeDb();
  await loadLatestEmployee();
}

window.addEventListener("DOMContentLoaded", () => {
  initEmployeePage().catch(error => {
    console.error(error);
    alert("Failed to initialize employee page.");
  });
});
