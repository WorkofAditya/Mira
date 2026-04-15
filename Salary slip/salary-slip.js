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
  setEditMode(false);
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
  setEditMode(false);
}

function setEditMode(enabled) {
  const editableInputs = [
    els.dateFrom,
    els.dateTo,
    els.name,
    els.totalDays,
    els.currentWithdrawal,
    els.oldWithdrawal,
    els.paidSalary
  ];

  editableInputs.forEach(input => {
    if (!input) return;
    if (input.tagName === "SELECT") {
      input.disabled = !enabled;
      return;
    }
    input.readOnly = !enabled;
  });
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
    <html>
      <head>
        <title>${label} Salary Slip</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f4f4f5; padding: 18px; }
          .slip { max-width: 760px; margin: 0 auto; background: #fff; border: 2px solid #111; }
          .slip-head { padding: 14px 16px; border-bottom: 2px solid #111; display: flex; justify-content: space-between; align-items: center; }
          .slip-title { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: .5px; }
          .slip-sub { margin: 2px 0 0; color: #374151; font-size: 13px; }
          .slip-body { padding: 14px 16px; }
          .meta { display: grid; grid-template-columns: 140px 1fr; gap: 8px 10px; margin-bottom: 14px; }
          .meta .k { font-weight: 700; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #111; padding: 8px; font-size: 14px; }
          th { background: #f3f4f6; text-align: left; width: 62%; }
          .total-row th, .total-row td { font-weight: 700; background: #eef2ff; }
          .sign { display: flex; justify-content: space-between; margin-top: 36px; font-size: 13px; }
          .line { border-top: 1px solid #111; width: 180px; padding-top: 6px; text-align: center; }
          @media print {
            body { background: #fff; padding: 0; }
            .slip { border: 1px solid #111; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <section class="slip">
          <div class="slip-head">
            <div>
              <h2 class="slip-title">${label.toUpperCase()} SALARY SLIP</h2>
              <p class="slip-sub">Mira Transport</p>
            </div>
            <div><strong>Branch:</strong> ${payload.branch}</div>
          </div>
          <div class="slip-body">
            <div class="meta">
              <div class="k">Name</div><div>${payload.name}</div>
              <div class="k">Period</div><div>${payload.dateFrom} to ${payload.dateTo}</div>
            </div>
            <table>
              <tr><th>Total Days</th><td>${payload.totalDays}</td></tr>
              <tr><th>Per Day Salary</th><td>${payload.perDaySalary}</td></tr>
              <tr><th>Salary</th><td>${payload.salary}</td></tr>
              <tr><th>Current Withdrawal</th><td>${payload.currentWithdrawal}</td></tr>
              <tr><th>Old Withdrawal</th><td>${payload.oldWithdrawal}</td></tr>
              <tr><th>Total Withdrawal</th><td>${payload.totalWithdrawal}</td></tr>
              <tr class="total-row"><th>Total Salary</th><td>${payload.totalSalary}</td></tr>
              <tr><th>Paid Salary</th><td>${payload.paidSalary}</td></tr>
            </table>
            <div class="sign">
              <div class="line">Authorized Sign</div>
              <div class="line">${label} Sign</div>
            </div>
          </div>
        </section>
      </body>
    </html>
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

  document.getElementById("salaryBtnNew").onclick = () => {
    resetForm();
    setEditMode(true);
  };
  document.getElementById("salaryBtnEdit").onclick = () => {
    if (!loadedSlipId && !els.name.value.trim()) {
      alert("Load a saved salary slip first.");
      return;
    }
    editMode = true;
    setEditMode(true);
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
      setEditMode(false);
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
    setEditMode(false);
  } catch (error) {
    console.error(error);
    alert("Could not open salary slip page.");
  }
}

window.addEventListener("beforeunload", () => {
  if (salaryDb) salaryDb.close();
});

init();
