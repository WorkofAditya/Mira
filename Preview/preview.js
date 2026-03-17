const BOOKING_DB_NAME = "TransportDB";
const BOOKING_STORE = "bookings";
const DISPATCH_DB_NAME = "DispatchDB";
const DISPATCH_STORE = "dispatchBranchState";

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
  setText("dispNo", form.dispatchNo || "");
  setText("dispDate", form.dispatchDate || "");
  setText("dispMethod", form.method || "TRUCK");
  setText("dispRoute", form.route || "");
  setText("driver", form.driverName || "");
  setText("driverMobile", form.mobileNo || "");
  setText("kmReading", form.remark || "");
}

function fillTotals(rows) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.parcel += row.packages;
      acc.kg += row.weight;
      acc.paid += row.paid;
      acc.toPay += row.toPay;
      return acc;
    },
    { parcel: 0, kg: 0, paid: 0, toPay: 0 }
  );

  const fromBranch = rows[0]?.branchFrom || "";
  const toBranch = rows[0]?.branchTo || "";

  setText("totalLrCount", String(rows.length));
  setText("fromBranchLabel", fromBranch);
  setText("toBranchLabel", toBranch);
  setText("totalParcel", String(totals.parcel));
  setText("totalKg", String(totals.kg));
  setText("totalPaid", String(totals.paid));
  setText("totalToPay", String(totals.toPay));

  setText("grandLrCount", String(rows.length));
  setText("grandParcel", String(totals.parcel));
  setText("grandKg", String(totals.kg));
  setText("grandPaid", String(totals.paid));
  setText("grandToPay", String(totals.toPay));
}

function buildBranchSpecificPreviewLinks(dispatchNo, matchingBranches) {
  return matchingBranches
    .map(branch => {
      const query = new URLSearchParams({ dispatchNo, branch }).toString();
      return `<a href="preview.html?${query}">${branch}</a>`;
    })
    .join(", ");
}

function resolveDispatchRecord(allStates, dispatchNo, branchHint) {
  if (branchHint) {
    const hintedState = allStates.find(state => state?.branch === branchHint);
    const hintedRecord = hintedState?.dispatchRecords?.[dispatchNo] || null;

    if (hintedRecord) {
      return { selectedState: hintedState, selectedRecord: hintedRecord, isAmbiguous: false, matchingBranches: [] };
    }
  }

  const matches = allStates.filter(state => state?.dispatchRecords?.[dispatchNo]);

  if (!matches.length) {
    return { selectedState: null, selectedRecord: null, isAmbiguous: false, matchingBranches: [] };
  }

  if (matches.length === 1) {
    return {
      selectedState: matches[0],
      selectedRecord: matches[0].dispatchRecords[dispatchNo],
      isAmbiguous: false,
      matchingBranches: [matches[0].branch]
    };
  }

  return {
    selectedState: null,
    selectedRecord: null,
    isAmbiguous: true,
    matchingBranches: matches.map(state => state.branch).filter(Boolean)
  };
}

async function loadPreview() {
  setPrintTime();
  hideNotice();

  const { dispatchNo, branchHint } = getPreviewContext();
  if (!dispatchNo) {
    alert("Dispatch number is missing.");
    return;
  }

  const dispatchDb = await openDb(DISPATCH_DB_NAME, 2);
  const bookingDb = await openDb(BOOKING_DB_NAME, 3);

  try {
    const dispatchTx = dispatchDb.transaction(DISPATCH_STORE, "readonly");
    const dispatchStore = dispatchTx.objectStore(DISPATCH_STORE);
    const stateRequest = dispatchStore.getAll();

    const allStates = await new Promise(resolve => {
      stateRequest.onsuccess = () => resolve(stateRequest.result || []);
      stateRequest.onerror = () => resolve([]);
    });

    const { selectedState, selectedRecord, isAmbiguous, matchingBranches } = resolveDispatchRecord(allStates, dispatchNo, branchHint);

    if (isAmbiguous) {
      const links = buildBranchSpecificPreviewLinks(dispatchNo, matchingBranches);
      showNotice(
        `Dispatch no <strong>${dispatchNo}</strong> exists in multiple branches. ` +
        `Please open with a branch: ${links}`
      );
      return;
    }

    if (!selectedRecord || !selectedState) {
      alert(`Dispatch no ${dispatchNo} not found.`);
      return;
    }

    fillHeader(selectedRecord);

    const branch = selectedState.branch;
    const bookingBranchData = await readStoreRecord(bookingDb, BOOKING_STORE, branch);
    const bookings = bookingBranchData?.bookings || {};

    const vehicleLrs = (selectedRecord.vehicle || []).map(lr => String(lr));

    const rows = vehicleLrs
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
    fillTotals(rows);
  } finally {
    dispatchDb.close();
    bookingDb.close();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPreview().catch(error => {
    console.error(error);
    alert("Failed to load preview.");
  });
});