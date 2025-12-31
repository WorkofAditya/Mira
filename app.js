// app.js

let db;

// ---------- IndexedDB Initialization ----------
const request = indexedDB.open('TransportDB', 2);

request.onupgradeneeded = function(event) {
  db = event.target.result;
  if (!db.objectStoreNames.contains('bookings')) {
    db.createObjectStore('bookings', { keyPath: 'branch' });
  }
};

request.onsuccess = function(event) {
  db = event.target.result;

  // ---------- HOMEPAGE SELECT BUTTON ----------
  const selectBtn = document.querySelector('.select-btn');
  if (selectBtn) {
    selectBtn.addEventListener('click', () => {
      const branch = document.getElementById('branchSelect').value;
      if (!branch) return alert('Please select a branch');

      const tx = db.transaction('bookings', 'readwrite');
      const store = tx.objectStore('bookings');

      // Check if branch exists
      const getRequest = store.get(branch);
      getRequest.onsuccess = function(event) {
        if (!event.target.result) {
          // Add new branch if it doesn't exist
          const addRequest = store.add({ branch: branch, bookings: [] });
          addRequest.onsuccess = function() {
            sessionStorage.setItem('selectedBranch', branch);
            window.location.href = 'booking.html';
          };
          addRequest.onerror = function() {
            alert('Error saving branch!');
          };
        } else {
          // Branch exists, just redirect
          sessionStorage.setItem('selectedBranch', branch);
          window.location.href = 'booking.html';
        }
      };
      getRequest.onerror = function() {
        alert('Error reading branch data!');
      };
    });
  }

  // ---------- BOOKING PAGE LOGIC ----------
  const branchField = document.getElementById('branchFrom');
  if (branchField) {
    const selectedBranch = sessionStorage.getItem('selectedBranch');
    if (selectedBranch) {
      branchField.value = selectedBranch; // autofill
      branchField.readOnly = true;
    }

    // Handle 5 action buttons
    const actionButtons = document.querySelectorAll('.actions button');
    if (actionButtons.length) {
      actionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const branch = branchField.value;
          if (!branch) return alert('No branch selected');

          // Collect booking data dynamically
          const bookingData = {};
          const inputs = document.querySelectorAll('.booking-form input, .payment-box input');
          inputs.forEach(input => {
            bookingData[input.previousElementSibling.textContent || input.name] = input.value;
          });

          const tx = db.transaction('bookings', 'readwrite');
          const store = tx.objectStore('bookings');
          const getRequest = store.get(branch);
          getRequest.onsuccess = function(event) {
            const data = event.target.result;
            if (!data) {
              alert('Branch not found in database!');
              return;
            }

            switch(btn.textContent.trim().toLowerCase()) {
              case 'add booking':
                data.bookings.push(bookingData);
                store.put(data);
                alert(`Booking saved for branch ${branch}`);
                break;
              case 'edit booking':
                alert('Edit booking functionality can be implemented here');
                break;
              case 'delete booking':
                alert('Delete booking functionality can be implemented here');
                break;
              case 'print':
                alert('Print functionality can be implemented here');
                break;
              case 'reset':
                document.querySelectorAll('.booking-form input, .payment-box input').forEach(i => i.value = '');
                break;
            }
          };
        });
      });
    }
  }

  // ---------- ENTER KEY NAVIGATION ----------
  const inputs = Array.from(document.querySelectorAll("input, select, textarea"));
  inputs.forEach((input, index) => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = inputs[index + 1];
        if (next) next.focus();
      }
    });
  });
};

request.onerror = function(event) {
  console.error('Database failed to open', event);
};

document.addEventListener("DOMContentLoaded", () => {
  const inputs = Array.from(document.querySelectorAll("input, select, textarea"))

  inputs.forEach((input, index) => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault()
        const next = inputs[index + 1]
        if (next) next.focus()
      }
    })
  })
})

document.querySelectorAll(".drop-btn").forEach(btn => {
  btn.addEventListener("click", e => {
    e.stopPropagation()
    const menu = btn.nextElementSibling
    document.querySelectorAll(".drop-menu").forEach(m => {
      if (m !== menu) m.style.display = "none"
    })
    menu.style.display = menu.style.display === "flex" ? "none" : "flex"
  })
})

document.addEventListener("click", () => {
  document.querySelectorAll(".drop-menu").forEach(m => m.style.display = "none")
})
