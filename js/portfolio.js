lucide.createIcons();
const body = document.body;
const toggle = document.getElementById('theme-toggle');

if (localStorage.getItem('theme') === 'dark') applyDark();

toggle.addEventListener('click', () => {
  if (body.classList.contains('dark-mode')) {
    body.classList.replace('dark-mode', 'light-mode');
    localStorage.setItem('theme', 'light');
    document.querySelector('.light-icon').classList.remove('hidden');
    document.querySelector('.dark-icon').classList.add('hidden');
  } else {
    applyDark();
  }
});

function applyDark() {
  body.classList.replace('light-mode', 'dark-mode');
  localStorage.setItem('theme', 'dark');
  document.querySelector('.light-icon').classList.add('hidden');
  document.querySelector('.dark-icon').classList.remove('hidden');
}
// Get DOM elements
const modal = document.getElementById("image-modal");
const modalImg = document.getElementById("full-image");
const closeBtn = document.querySelector(".close-btn");
const previews = document.querySelectorAll(".preview-img");

// Loop through all preview images and add click event
previews.forEach(img => {
  img.addEventListener("click", function() {
    modal.style.display = "block"; // Show the modal
    modalImg.src = this.src;      // Pass the clicked image src to the modal img
  });
});

// Close the modal when clicking the close button
closeBtn.addEventListener("click", function() {
  modal.style.display = "none";
});

// Optional: Close the modal when clicking anywhere outside the image
modal.addEventListener("click", function(e) {
  if (e.target !== modalImg) {
    modal.style.display = "none";
  }
});
