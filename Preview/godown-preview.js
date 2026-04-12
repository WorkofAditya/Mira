const BOOKING_DB_NAME = "TransportDB";
const BOOKING_STORE = "bookings";
const DISPATCH_DB_NAME = "DispatchDB";
const DISPATCH_STORE = "dispatchBranchState";
const MIN_PREVIEW_ROWS = 18;

function setPrintTime() {
  const now = new Date();
  document.getElementById("printTime").textContent = now.toLocaleString();
}

function openDb(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = () => reject(new Error(`Could not open ${name}`));
  });
}

function readStoreRecord(db, storeName, key) {
  return new Promise(resolve => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function getPreviewContext() {
  const params = new URLSearchParams(window.location.search);
  const dispatchNo = params.get("dispatchNo")?.trim() || "";
  const branchFromQuery = params.get("branch")?.trim() || "";
  const branchFromStorage = localStorage.getItem("selectedBranch") || sessionStorage.getItem("selectedBranch") || "";

  return {
    dispatchNo,
    branchHint: branchFromQuery || branchFromStorage
  };
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePayMode(value) {
  return String(value || "").trim().toUpperCase();
}

function addRow(data) {
  const tbody = document.getElementById("dispatchBody");
  const tr = document.createElement("tr");

  tr.innerHTML = `
<td>${data.lrNo}</td>
<td>${data.sender}</td>
<td>${data.receiver}</td>
<td>${data.packages}</td>
<td>${data.weight}</td>
<td>${data.paid}</td>
<td>${data.toPay}</td>
<td>DD</td>
`;

  tbody.appendChild(tr);
}

function addEmptyRow() {
  addRow({
    lrNo: "",
    sender: "",
    receiver: "",
    packages: "",
    weight: "",
    paid: "",
    toPay: ""
  });
}

function clearTableBody() {
  const tbody = document.getElementById("dispatchBody");
  if (tbody) {
    tbody.innerHTML = "";
  }
}

function ensureMinimumRows(existingRowCount) {
  const emptyRowsNeeded = Math.max(0, MIN_PREVIEW_ROWS - existingRowCount);
  for (let index = 0; index < emptyRowsNeeded; index += 1) {
    addEmptyRow();
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function showNotice(messageHtml) {
  const notice = document.getElementById("previewNotice");
  if (!notice) return;
  notice.innerHTML = messageHtml;
  notice.hidden = false;
}

function hideNotice() {
  const notice = document.getElementById("previewNotice");
  if (!notice) return;
  notice.hidden = true;
  notice.innerHTML = "";
}

function fillHeader(dispatchRecord) {
  const form = dispatchRecord?.form || {};
  setText("dispMethod", form.method || "TRUCK");
  setText("dispRoute", form.route || "");
  setText("driver", form.driverName || "");
  setText("driverMobile", form.mobileNo || "");
  setText("kmReading", form.remark || "");
}

function calculateTotals(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.parcel += row.packages;
      acc.kg += row.weight;
      acc.paid += row.paid;
      acc.toPay += row.toPay;
      return acc;
    },
    { parcel: 0, kg: 0, paid: 0, toPay: 0 }
  );
}

function addBranchSummaryRow(rows, totals) {
  const tbody = document.getElementById("dispatchBody");
  const fromBranch = rows[0]?.branchFrom || "";
  const toBranch = rows[0]?.branchTo || "";
  const tr = document.createElement("tr");

  tr.innerHTML = `
<td></td>
<td class="city" id="fromBranchLabel">${fromBranch}</td>
<td class="city" id="toBranchLabel">${toBranch}</td>
<td id="totalParcel">${totals.parcel}</td>
<td id="totalKg">${totals.kg}</td>
<td id="totalPaid">${totals.paid}</td>
<td id="totalToPay">${totals.toPay}</td>
<td></td>
`;

  tbody.appendChild(tr);
}

function addGrandTotalRow(totals) {
  const tbody = document.getElementById("dispatchBody");
  const tr = document.createElement("tr");

  tr.innerHTML = `
<td></td>
<td></td>
<td><strong>Grand Total</strong></td>
<td id="grandParcel"><strong>${totals.parcel}</strong></td>
<td id="grandKg"><strong>${totals.kg}</strong></td>
<td id="grandPaid"><strong>${totals.paid}</strong></td>
<td id="grandToPay"><strong>${totals.toPay}</strong></td>
<td></td>
`;

  tbody.appendChild(tr);
}

function resolveGodownRecord(state, dispatchNo) {
  if (!state) return null;

  if (dispatchNo && state.dispatchRecords?.[dispatchNo]) {
    return state.dispatchRecords[dispatchNo];
  }

  if (state.currentDispatchNo && state.dispatchRecords?.[state.currentDispatchNo]) {
    return state.dispatchRecords[state.currentDispatchNo];
  }

  if (state.lastDispatchNo && state.dispatchRecords?.[state.lastDispatchNo]) {
    return state.dispatchRecords[state.lastDispatchNo];
  }

  return Object.values(state.dispatchRecords || {})[0] || null;
}

async function loadPreview() {
  setPrintTime();
  const { dispatchNo, branchHint } = getPreviewContext();
  const dispatchDb = await openDb(DISPATCH_DB_NAME, 2);

  try {
    const allStates = await new Promise(resolve => {
      const tx = dispatchDb.transaction(DISPATCH_STORE, "readonly");
      const store = tx.objectStore(DISPATCH_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    const branches = allStates
      .map(state => String(state?.branch || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    if (!branches.length) {
      hideNotice();
      clearTableBody();
      showNotice("No branch data found in dispatch records.");
      ensureMinimumRows(0);
      return;
    }

    const toolbar = document.getElementById("godownToolbar");
    const selector = document.getElementById("branchSelector");
    if (toolbar && selector) {
      selector.innerHTML = branches
        .map(branch => `<option value="${branch}">${branch}</option>`)
        .join("");
      toolbar.hidden = false;
    }

    const activeBranch = branches.includes(branchHint) ? branchHint : branches[0];
    if (selector) {
      selector.value = activeBranch;
      selector.addEventListener("change", () => {
        const selectedBranch = selector.value;
        localStorage.setItem("selectedBranch", selectedBranch);
        sessionStorage.setItem("selectedBranch", selectedBranch);
        const params = new URLSearchParams(window.location.search);
        params.set("branch", selectedBranch);
        const nextUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, "", nextUrl);
        renderPreviewForBranch(selectedBranch, dispatchNo).catch(error => {
          console.error(error);
          alert("Failed to load selected branch data.");
        });
      });
    }

    await renderPreviewForBranch(activeBranch, dispatchNo);
  } finally {
    dispatchDb.close();
  }
}

async function renderPreviewForBranch(branch, dispatchNo) {
  hideNotice();
  clearTableBody();

  const dispatchDb = await openDb(DISPATCH_DB_NAME, 2);
  const bookingDb = await openDb(BOOKING_DB_NAME, 3);

  try {
    const state = await readStoreRecord(dispatchDb, DISPATCH_STORE, branch);

    if (!state) {
      showNotice(`No dispatch state found for branch <strong>${branch}</strong>.`);
      ensureMinimumRows(0);
      return;
    }

    const selectedRecord = resolveGodownRecord(state, dispatchNo);

    if (!selectedRecord) {
      showNotice(`No dispatch record found for branch <strong>${branch}</strong>.`);
      ensureMinimumRows(0);
      return;
    }

    fillHeader(selectedRecord);

    const bookingBranchData = await readStoreRecord(bookingDb, BOOKING_STORE, branch);
    const bookings = bookingBranchData?.bookings || {};
    const godownLrs = (selectedRecord.godown || []).map(lr => String(lr));

    const rows = godownLrs
      .map(lrNo => {
        const booking = bookings[lrNo];
        if (!booking) return null;

        const total = toNumber(booking.total);
        const payMode = normalizePayMode(booking.payMode);
        const paid = payMode === "PAID" ? total : 0;
        const toPay = payMode === "TO PAY" ? total : 0;

        return {
          lrNo,
          sender: booking.sender || "",
          receiver: booking.receiver || "",
          packages: toNumber(booking.packages),
          weight: toNumber(booking.weight),
          paid,
          toPay,
          branchFrom: booking.branchFrom || "",
          branchTo: booking.branchTo || ""
        };
      })
      .filter(Boolean);

    rows.forEach(addRow);
    const totals = calculateTotals(rows);
    addBranchSummaryRow(rows, totals);
    ensureMinimumRows(rows.length + 1);
    addGrandTotalRow(totals);
  } finally {
    dispatchDb.close();
    bookingDb.close();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPreview().catch(error => {
    console.error(error);
    alert("Failed to load godown stock preview.");
  });
});
