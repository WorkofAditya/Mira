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
}


// ================= NEW BOOKING =================
function newBooking() {
  isNewBooking = true;
  unlockForm();

  document.querySelectorAll(".booking-body input, .booking-body select")
  .forEach(el => {
    if (el.id !== "branchFrom") el.value = "";
  });

  const lr = document.getElementById("lrNo");
  lr.readOnly = false;
  lr.focus();
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
    const el = document.getElementById(id);
    if (el) el.value = data[id];
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
  document.getElementById("btnFind").onclick = openFindPopup;
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
  const branch = sessionStorage.getItem("selectedBranch");
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

function loadBookingToForm(data) {
  Object.keys(data).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = data[id];
  });

  lockForm();
}
