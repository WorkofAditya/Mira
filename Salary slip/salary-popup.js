(function () {
  function openSalarySlipPopup({ mode = "employee" } = {}) {
    const branch = localStorage.getItem("selectedBranch") || sessionStorage.getItem("selectedBranch") || "";
    if (!branch) {
      alert("Please select a branch first.");
      return;
    }

    const isDriverMode = mode === "driver";
    const title = isDriverMode ? "Driver Salary Slip" : "Employee Salary Slip";
    const frameSrc = `Salary%20slip/salary-slip.html?mode=${isDriverMode ? "driver" : "employee"}`;

    const existingPopup = document.getElementById("salarySlipOverlay");
    if (existingPopup) existingPopup.remove();

    const overlay = document.createElement("div");
    overlay.className = "employee-popup-overlay";
    overlay.id = "salarySlipOverlay";

    const shell = document.createElement("div");
    shell.className = "employee-popup-shell";
    shell.style.width = "min(940px, 95vw)";
    shell.style.height = "min(86vh, 760px)";

    const header = document.createElement("div");
    header.className = "employee-popup-header";
    header.innerHTML = `
      <span>${title}</span>
      <button type="button" class="employee-popup-close" id="salaryPopupClose">Close</button>
    `;

    const frame = document.createElement("iframe");
    frame.className = "employee-popup-frame";
    frame.src = frameSrc;
    frame.title = title;

    shell.appendChild(header);
    shell.appendChild(frame);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);

    const closePopup = () => overlay.remove();
    header.querySelector("#salaryPopupClose").onclick = closePopup;
    overlay.onclick = event => {
      if (event.target === overlay) closePopup();
    };
  }

  window.openSalarySlipPopup = openSalarySlipPopup;
})();
