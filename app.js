const LR_START = 1200;
// ================= DATABASE SETUP =================
const DB_NAME = "TransportDB";
const STORE_NAME = "bookings";
let db;

const request = indexedDB.open(DB_NAME, 2);

request.onupgradeneeded = e => {
  db = e.target.result;
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: "branch" });
  }
};

request.onsuccess = e => {
  db = e.target.result;

  // Homepage
  if (document.getElementById("branchSelect")) {
    initHomePage();
  }

  // Booking page
  if (document.getElementById("branchFrom")) {
    initBookingPage();
  }
};

request.onerror = e => console.error("IndexedDB error:", e);

// ================= HOMEPAGE =================
function initHomePage() {
  const selectBtn = document.querySelector(".select-btn");
  const branchSelect = document.getElementById("branchSelect");

  selectBtn.addEventListener("click", () => {
    if (!branchSelect.value) {
      alert("Please select a branch");
      return;
    }
    sessionStorage.setItem("selectedBranch", branchSelect.value);
    window.location.href = "booking.html";
  });
}

// ================= BOOKING =================
function initBookingPage() {
  const branch = sessionStorage.getItem("selectedBranch");
  const branchInput = document.getElementById("branchFrom");

  if (!branch) return alert("No branch selected");

  branchInput.value = branch;
  branchInput.readOnly = true;


  // Lock all other inputs by default
  lockForm();

  // Load saved data for this branch
  loadData(branch);

  // Setup buttons
  setupButtons(branch);

  // Enter navigation
  setupEnterNavigation();
}

// ================= LOCK / UNLOCK =================
function lockForm() {
  document.querySelectorAll(".booking-body input").forEach(input => {
    if (input.id !== "branchFrom" && input.id !== "lrNo") {
      input.readOnly = true;
    }
  });
}

function unlockForm() {
  document.querySelectorAll(".booking-body input").forEach(input => {
    if (input.id !== "branchFrom" && input.id !== "lrNo") {
      input.readOnly = false;
    }
  });
}

// ================= SAVE DATA =================
function saveData(branch) {
  const booking = {};

  document.querySelectorAll(".booking-body input").forEach(input => {
    if (input.id && input.id !== "branchFrom") {
      booking[input.id] = input.value;
    }
  });

  const lrValue = parseInt(document.getElementById("lrNo").value, 10);

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const getReq = store.get(branch);

  getReq.onsuccess = () => {
    const data = getReq.result || {
      branch,
      booking: {},
      lastLR: LR_START - 1
    };

    data.booking = booking;
    data.lastLR = lrValue; // store last used LR

    store.put(data);
  };

  tx.oncomplete = () => {
    lockForm();

    // prepare next LR immediately
    document.getElementById("lrNo").value = lrValue + 1;

    alert("Booking saved for " + branch);
  };
}


// ================= LOAD DATA =================
function loadData(branch) {
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(branch);

  req.onsuccess = () => {
    const record = req.result;

    // If no record exists → first time branch
    if (!record) {
      document.getElementById("lrNo").value = LR_START;
      return;
    }

    // Fill booking data
    if (record.booking) {
      Object.entries(record.booking).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
      });
    }

    // Set next LR number
    const nextLR = (record.lastLR ?? (LR_START - 1)) + 1;
    document.getElementById("lrNo").value = nextLR;
  };
}


// ================= RESET =================
function resetForm() {
  document.querySelectorAll(".booking-body input").forEach(input => {
    if (input.id !== "branchFrom" && !input.readOnly) input.value = "";
  });
}

// ================= BUTTONS =================
function setupButtons(branch) {
  document.getElementById("btnEdit").onclick = unlockForm;
  document.getElementById("btnSave").onclick = () => saveData(branch);
  document.getElementById("btnAdd").onclick = () => saveData(branch);
  document.getElementById("btnReset").onclick = resetForm;
  document.getElementById("btnPrint").onclick = printReceipt;
  document.getElementById("btnDelete").onclick = () => alert("Delete logic can be added");
  document.getElementById("btnPdf").onclick = () => alert("PDF logic can be added");
}

// ================= ENTER KEY NAVIGATION =================
function setupEnterNavigation() {
  const inputs = [...document.querySelectorAll(".booking-body input")];
  inputs.forEach((input, i) => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = inputs[i + 1];
        if (next) next.focus();
      }
    });
  });
}

// ================= DROPDOWNS =================
document.querySelectorAll(".drop-btn").forEach(btn => {
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const menu = btn.nextElementSibling;
    document.querySelectorAll(".drop-menu").forEach(m => {
      if (m !== menu) m.style.display = "none";
    });
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
});

document.addEventListener("click", () => {
  document.querySelectorAll(".drop-menu").forEach(m => (m.style.display = "none"));
});

// ================= PRINT RECEIPT =================
document.getElementById("btnPrint").onclick = printReceipt;

function printReceipt() {
  const branch = sessionStorage.getItem("selectedBranch");
  if (!branch) return alert("No branch selected");

  const tx = db.transaction("bookings", "readonly");
  const store = tx.objectStore("bookings");
  const req = store.get(branch);

  req.onsuccess = () => {
    if (!req.result) {
      alert("No data to print");
      return;
    }

    const data = req.result.booking;

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
