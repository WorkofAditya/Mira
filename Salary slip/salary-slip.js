const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") === "driver" ? "driver" : "employee";
const label = mode === "driver" ? "Driver" : "Employee";
const entryDbName = mode === "driver" ? "DriverDB" : "EmployeeDB";
const entryStore = mode === "driver" ? "drivers" : "employees";
const SALARY_DB_NAME = "SalarySlipDB";
const SALARY_STORE = "salarySlips";

const branch = localStorage.getItem("selectedBranch") || sessionStorage.getItem("selectedBranch") || "";

const els = {
  title: document.getElementById("salaryTitle"),
  branchLabel: document.getElementById("salaryBranchLabel"),
  dateFrom: document.getElementById("salaryDateFrom"),
  dateTo: document.getElementById("salaryDateTo"),
  name: document.getElementById("salaryName"),
  totalDays: document.getElementById("salaryTotalDays"),
  perDay: document.getElementById("salaryPerDay"),
  salaryBase: document.getElementById("salaryBase"),
  currentWithdrawal: document.getElementById("salaryCurrentWithdrawal"),
  oldWithdrawal: document.getElementById("salaryOldWithdrawal"),
  totalWithdrawal: document.getElementById("salaryTotalWithdrawal"),
  totalSalary: document.getElementById("salaryTotalSalary"),
  paidSalary: document.getElementById("salaryPaidSalary"),
  photo: document.getElementById("salaryPhotoPreview"),
  photoPlaceholder: document.getElementById("salaryPhotoPlaceholder")
};

let salaryDb = null;
let memberMap = new Map();
let loadedSlipId = "";
let editMode = false;

function num(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textNum(value) {
  return Number.isFinite(value) ? String(value) : "";
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function defaultDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: formatDate(year, month, 1),
    to: formatDate(year, month, Math.min(30, lastDay))
  };
}

function slipId({ dateFrom, dateTo, name }) {
  return [branch, mode, dateFrom, dateTo, name].join("|").toLowerCase();
}

function openDb(name, version, store, keyPath) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(store)) {
        db.createObjectStore(store, { keyPath });
      }
    };
    req.onsuccess = event => resolve(event.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function openSalaryDb() {
  return openDb(SALARY_DB_NAME, 1, SALARY_STORE, "id");
}

function readAllSlips() {
  return new Promise((resolve, reject) => {
    const tx = salaryDb.transaction(SALARY_STORE, "readonly");
    const req = tx.objectStore(SALARY_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function saveSlip(payload) {
  return new Promise((resolve, reject) => {
    const tx = salaryDb.transaction(SALARY_STORE, "readwrite");
    const req = tx.objectStore(SALARY_STORE).put(payload);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function removeSlip(id) {
  return new Promise((resolve, reject) => {
    const tx = salaryDb.transaction(SALARY_STORE, "readwrite");
    const req = tx.objectStore(SALARY_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadMembers() {
  const entryDb = await openDb(entryDbName, 1, entryStore, "branch");
  try {
    const record = await new Promise((resolve, reject) => {
      const tx = entryDb.transaction(entryStore, "readonly");
      const req = tx.objectStore(entryStore).get(branch);
      req.onsuccess = () => resolve(req.result || { employees: {} });
      req.onerror = () => reject(req.error);
    });

    const employees = record.employees || {};
    const members = Object.keys(employees)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({
        name,
        perDaySalary: num(employees[name]?.perDaySalary),
        photo: employees[name]?.employeePhoto || ""
      }));

    memberMap = new Map(members.map(item => [item.name, item]));
    els.name.innerHTML = `<option value="">Select ${label} name</option>`;
    members.forEach(item => {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = item.name;
      els.name.appendChild(option);
    });
  } finally {
    entryDb.close();
  }
}

function updatePhoto(src) {
  if (!src) {
    els.photo.style.display = "none";
    els.photo.src = "";
    els.photoPlaceholder.style.display = "block";
    return;
  }
  els.photo.src = src;
  els.photo.style.display = "block";
  els.photoPlaceholder.style.display = "none";
}

function refreshFromName() {
  const selected = memberMap.get(els.name.value);
  els.perDay.value = selected ? textNum(selected.perDaySalary) : "";
  updatePhoto(selected?.photo || "");
  recalculate();
}

function recalculate() {
  const salary = num(els.totalDays.value) * num(els.perDay.value);
  const totalWithdrawal = num(els.currentWithdrawal.value) + num(els.oldWithdrawal.value);
  els.salaryBase.value = textNum(salary);
  els.totalWithdrawal.value = textNum(totalWithdrawal);
  els.totalSalary.value = textNum(salary - totalWithdrawal);
}

function resetForm() {
  const defaults = defaultDates();
  els.dateFrom.value = defaults.from;
  els.dateTo.value = defaults.to;
  els.name.value = "";
  els.totalDays.value = "";
  els.currentWithdrawal.value = "";
  els.oldWithdrawal.value = "";
  els.paidSalary.value = "";
  els.salaryBase.value = "";
  els.totalWithdrawal.value = "";
  els.totalSalary.value = "";
  loadedSlipId = "";
  editMode = false;
  refreshFromName();
}

function payloadFromForm() {
  const name = els.name.value.trim();
  const dateFrom = els.dateFrom.value;
  const dateTo = els.dateTo.value;
  return {
    id: slipId({ dateFrom, dateTo, name }),
    branch,
    mode,
    dateFrom,
    dateTo,
    name,
    totalDays: num(els.totalDays.value),
    perDaySalary: num(els.perDay.value),
    salary: num(els.salaryBase.value),
    currentWithdrawal: num(els.currentWithdrawal.value),
    oldWithdrawal: num(els.oldWithdrawal.value),
    totalWithdrawal: num(els.totalWithdrawal.value),
    totalSalary: num(els.totalSalary.value),
    paidSalary: num(els.paidSalary.value),
    photo: els.photo.src || memberMap.get(name)?.photo || "",
    updatedAt: new Date().toISOString()
  };
}

function loadSlip(payload) {
  els.name.value = payload.name || "";
  els.dateFrom.value = payload.dateFrom || "";
  els.dateTo.value = payload.dateTo || "";
  els.totalDays.value = textNum(payload.totalDays);
  els.perDay.value = textNum(payload.perDaySalary);
  els.salaryBase.value = textNum(payload.salary);
  els.currentWithdrawal.value = textNum(payload.currentWithdrawal);
  els.oldWithdrawal.value = textNum(payload.oldWithdrawal);
  els.totalWithdrawal.value = textNum(payload.totalWithdrawal);
  els.totalSalary.value = textNum(payload.totalSalary);
  els.paidSalary.value = textNum(payload.paidSalary);
  updatePhoto(payload.photo || memberMap.get(payload.name)?.photo || "");
  loadedSlipId = payload.id;
  editMode = false;
}

function openFindPopup() {
  readAllSlips()
    .then(rows => rows.filter(row => row.branch === branch && row.mode === mode))
    .then(rows => {
      if (!rows.length) {
        alert("No salary slips found.");
        return;
      }

      const overlay = document.createElement("div");
      overlay.className = "overlay dispatch-find-overlay";

      const popup = document.createElement("div");
      popup.className = "popup dispatch-find-popup";
      popup.innerHTML = `
        <h3>Find ${label} Salary Slip</h3>
        <div class="find-row">
          <label for="findSalaryId">Name + Dates</label>
          <input type="text" id="findSalaryId" placeholder="Select from list below">
        </div>
        <div class="find-row">
          <label for="salarySlipList">Available Slips</label>
          <select id="salarySlipList" size="8"></select>
        </div>
        <div class="find-actions">
          <button type="button" id="salaryFindLoad">Load</button>
          <button type="button" id="salaryFindCancel">Cancel</button>
        </div>
      `;

      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      const input = popup.querySelector("#findSalaryId");
      const list = popup.querySelector("#salarySlipList");
      rows
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach(row => {
          const option = document.createElement("option");
          option.value = row.id;
          option.textContent = `${row.name} (${row.dateFrom} to ${row.dateTo})`;
          list.appendChild(option);
        });

      const closePopup = () => overlay.remove();
      list.onchange = () => {
        input.value = list.value;
      };

      popup.querySelector("#salaryFindCancel").onclick = closePopup;
      popup.querySelector("#salaryFindLoad").onclick = () => {
        const id = input.value.trim();
        const selected = rows.find(row => row.id === id);
        if (!selected) {
          alert("Please select a valid salary slip.");
          return;
        }
        loadSlip(selected);
        closePopup();
      };

      overlay.onclick = event => {
        if (event.target === overlay) closePopup();
      };
    })
    .catch(error => {
      console.error(error);
      alert("Could not load salary slips.");
    });
}

function openPreview(shouldPrint = false) {
  const payload = payloadFromForm();
  if (!payload.name) {
    alert("Please select a name first.");
    return;
  }

  const previewWindow = window.open("", "_blank", "width=760,height=900");
  if (!previewWindow) {
    alert("Unable to open preview window.");
    return;
  }

  previewWindow.document.write(`
    <html><head><title>${label} Salary Slip</title></head>
    <body style="font-family:Arial,sans-serif;padding:20px;">
      <h2>${label} Salary Slip</h2>
      <p><strong>Branch:</strong> ${payload.branch}</p>
      <p><strong>Date From:</strong> ${payload.dateFrom} <strong>Date To:</strong> ${payload.dateTo}</p>
      <p><strong>Name:</strong> ${payload.name}</p>
      <p><strong>Total Days:</strong> ${payload.totalDays}</p>
      <p><strong>Per Day Salary:</strong> ${payload.perDaySalary}</p>
      <p><strong>Salary:</strong> ${payload.salary}</p>
      <p><strong>Current Withdrawal:</strong> ${payload.currentWithdrawal}</p>
      <p><strong>Old Withdrawal:</strong> ${payload.oldWithdrawal}</p>
      <p><strong>Total Withdrawal:</strong> ${payload.totalWithdrawal}</p>
      <p><strong>Total Salary:</strong> ${payload.totalSalary}</p>
      <p><strong>Paid Salary:</strong> ${payload.paidSalary}</p>
    </body></html>
  `);
  previewWindow.document.close();

  if (shouldPrint) {
    previewWindow.focus();
    previewWindow.print();
  }
}

function setupEvents() {
  [els.totalDays, els.currentWithdrawal, els.oldWithdrawal].forEach(el => {
    el.addEventListener("input", recalculate);
  });
  els.name.addEventListener("change", refreshFromName);

  document.getElementById("salaryBtnNew").onclick = resetForm;
  document.getElementById("salaryBtnEdit").onclick = () => {
    if (!loadedSlipId) {
      alert("Load a saved salary slip first.");
      return;
    }
    editMode = true;
    alert("Edit mode enabled.");
  };
  document.getElementById("salaryBtnSave").onclick = async () => {
    try {
      const payload = payloadFromForm();
      if (!payload.name) {
        alert("Please select a name.");
        return;
      }
      if (!payload.dateFrom || !payload.dateTo) {
        alert("Date From and Date To are required.");
        return;
      }

      if (loadedSlipId && !editMode && payload.id !== loadedSlipId) {
        alert("Click New for a new slip, or Edit to modify this one.");
        return;
      }

      await saveSlip(payload);
      loadedSlipId = payload.id;
      editMode = false;
      alert("Salary slip saved successfully.");
    } catch (error) {
      console.error(error);
      alert("Save failed. Please try again.");
    }
  };

  document.getElementById("salaryBtnDelete").onclick = async () => {
    if (!loadedSlipId) {
      alert("Load a salary slip to delete.");
      return;
    }
    if (!window.confirm("Delete this salary slip?")) return;

    try {
      await removeSlip(loadedSlipId);
      alert("Salary slip deleted.");
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Delete failed.");
    }
  };

  document.getElementById("salaryBtnFind").onclick = openFindPopup;
  document.getElementById("salaryBtnPreview").onclick = () => openPreview(false);
  document.getElementById("salaryBtnPrint").onclick = () => openPreview(true);
}

async function init() {
  els.title.textContent = `${label} Salary Slip`;
  els.branchLabel.textContent = branch ? `Branch: ${branch}` : "";

  if (!branch) {
    alert("Please select a branch first.");
    return;
  }

  try {
    salaryDb = await openSalaryDb();
    await loadMembers();
    setupEvents();
    resetForm();
  } catch (error) {
    console.error(error);
    alert("Could not open salary slip page.");
  }
}

window.addEventListener("beforeunload", () => {
  if (salaryDb) salaryDb.close();
});

init();
