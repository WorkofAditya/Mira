// ================= DATABASE SETUP =================
let isNewBooking = false;

const DB_NAME = "TransportDB";
const STORE_NAME = "bookings";
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

// ================= HOMEPAGE =================
function initHomePage() {
  const selectBtn = document.querySelector(".select-btn");
  const branchSelect = document.getElementById("branchSelect");

  selectBtn.onclick = () => {
    if (!branchSelect.value) {
      alert("Please select a branch");
      return;
    }
    sessionStorage.setItem("selectedBranch", branchSelect.value);
    window.location.href = "booking.html";
  };
}

// ================= BOOKING INIT =================
function initBookingPage() {
  const branch = sessionStorage.getItem("selectedBranch");
  const branchInput = document.getElementById("branchFrom");

  if (!branch) {
    alert("No branch selected");
    return;
  }

  branchInput.value = branch;
  branchInput.readOnly = true;

  lockForm();
  loadLatestBooking(branch);
  setupButtons(branch);
  setupEnterNavigation();
}

// ================= LOCK / UNLOCK =================
function lockForm() {
  document.querySelectorAll(".booking-body input").forEach(i => {
    if (i.id !== "branchFrom") i.readOnly = true;
  });
}

function unlockForm() {
  document.querySelectorAll(".booking-body input").forEach(i => {
    if (i.id !== "branchFrom") i.readOnly = false;
  });
}

// ================= NEW BOOKING =================
function newBooking() {
  isNewBooking = true;
  unlockForm();

  document.querySelectorAll(".booking-body input").forEach(input => {
    if (input.id !== "branchFrom") input.value = "";
  });

  const lr = document.getElementById("lrNo");
  lr.readOnly = false;
  lr.focus();
}


// ================= SAVE BOOKING =================
function saveData(branch) {
  const booking = {};
  document.querySelectorAll(".booking-body input").forEach(input => {
    if (input.id) booking[input.id] = input.value.trim();
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


// ================= LOAD LATEST =================
function loadLatestBooking(branch) {
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(branch);

  req.onsuccess = () => {
    if (!req.result || !req.result.bookings) return;

    const bookings = req.result.bookings;
    const lastLR = Object.keys(bookings).sort().pop();
    const data = bookings[lastLR];

    Object.keys(data).forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = data[id];
    });

    lockForm();
  };
}

// ================= BUTTONS =================
function setupButtons(branch) {
  document.getElementById("btnNew").onclick = newBooking;
  document.getElementById("btnEdit").onclick = unlockForm;
  document.getElementById("btnSave").onclick = () => saveData(branch);
  document.getElementById("btnPrint").onclick = printReceipt;
  document.getElementById("btnDelete").onclick = () => alert("Delete later");
  document.getElementById("btnFind").onclick = () => alert("Find later");
  document.getElementById("btnPreview").onclick = previewReceipt;
}

// ================= ENTER NAV =================
function setupEnterNavigation() {
  const inputs = [...document.querySelectorAll(".booking-body input")];
  inputs.forEach((input, i) => {
    input.onkeydown = e => {
      if (e.key === "Enter") {
        e.preventDefault();
        inputs[i + 1]?.focus();
      }
    };
  });
}

// ================= PRINT =================
function printReceipt() {
  const branch = sessionStorage.getItem("selectedBranch");
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

// ================= PRINT RECEIPT =================
document.getElementById("btnPrint").onclick = printReceipt;

function printReceipt() {
  const branch = sessionStorage.getItem("selectedBranch");
  if (!branch) return alert("No branch selected");

  const lrNo = document.getElementById("lrNo").value;
  if (!lrNo) return alert("Enter LR No to print");

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(branch);

  req.onsuccess = () => {
    if (!req.result || !req.result.bookings) {
      alert("No data to print");
      return;
    }

    const data = req.result.bookings[lrNo];
    if (!data) {
      alert("No booking found for this LR No");
      return;
    }

    const html = generateReceiptHTML(data);

    document.getElementById("receiptLeft").innerHTML = html;
    document.getElementById("receiptRight").innerHTML = html;

    document.getElementById("printArea").style.display = "block";

    setTimeout(() => {
      window.print();
      document.getElementById("printArea").style.display = "none";
    }, 300);
  };
}

// ================= RECEIPT TEMPLATE =================
function generateReceiptHTML(d) {
  return `
    <div class="receipt-header">
      <div class="logo">RC</div>
      <div class="meta">
        <div>Date : <b>${d.bookingDate || ""}</b></div>
        <div>Rcpt.No : <b>${d.lrNo || ""}</b></div>
      </div>
    </div>

    <div class="route">
      ${d.branchFrom || ""} &nbsp; TO &nbsp; ${d.branchTo || ""}
    </div>

    <div class="field"><span>Sender :</span> ${d.sender || ""}</div>
    <div class="field"><span>Receiver :</span> ${d.receiver || ""}</div>
    <div class="field"><span>Contact :</span> ${d.mobile || ""}</div>
    <div class="field"><span>Item :</span> ${d.content || ""}</div>
    <div class="field"><span>Packing :</span> ${d.pkgDetail || ""}</div>
    <div class="field"><span>Parcel :</span> ${d.packages || ""}</div>
    <div class="field"><span>Weight :</span> ${d.weight || ""}</div>

    <div class="to-pay">
      TO PAY : ${d.total || ""}
    </div>

    <div class="signature">Receiver's Signature</div>
  `;
}

// ================= PREVIEW RECEIPT =================
document.getElementById("btnPreview").onclick = previewReceipt;

function previewReceipt() {
  const branch = sessionStorage.getItem("selectedBranch");
  if (!branch) return alert("No branch selected");

  const lrNo = document.getElementById("lrNo").value;
  if (!lrNo) return alert("Enter LR No to preview");

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(branch);

  req.onsuccess = () => {
    if (!req.result || !req.result.bookings) {
      alert("No data to preview");
      return;
    }

    const data = req.result.bookings[lrNo];
    if (!data) {
      alert("No booking found for this LR No");
      return;
    }

    // Create preview overlay
    const overlay = document.createElement("div");
    overlay.id = "previewOverlay";
    overlay.style = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex; justify-content: center; align-items: center;
      z-index: 9999;
    `;

    const popup = document.createElement("div");
    popup.style = `
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      width: 600px;
      max-height: 90%;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      position: relative;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "x";
    closeBtn.style = `
      position: absolute;
      top: -5px; right: 0px;
      padding: 4px 10px;
      cursor: pointer;
      border: none;
      background: #f00;
      color: #fff;
      border-radius: 4px;
    `;
    closeBtn.onclick = () => document.body.removeChild(overlay);

    popup.appendChild(closeBtn);

    const receiptHTML = generateReceiptHTML(data);
    const receiptContainer = document.createElement("div");
    receiptContainer.innerHTML = receiptHTML;

    popup.appendChild(receiptContainer);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
  };
}
