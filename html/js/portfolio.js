 lucide.createIcons();
const body = document.body;
const toggle = document.getElementById('theme-toggle');

// --- THEME TOGGLE LOGIC ---
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

// --- MODAL LOGIC ---
const modal = document.getElementById("image-modal");
const modalImg = document.getElementById("full-image");
const closeBtn = document.querySelector(".close-btn");

// FIX: Target the actual images inside your art cards
const artImages = document.querySelectorAll(".art-card img");

// Loop through all artwork images and add click event
artImages.forEach(img => {
  // Add a pointer cursor so visitors know the image is clickable
  img.style.cursor = "pointer"; 
  
  img.addEventListener("click", function() {
    modal.classList.add("show-modal"); // Use class to trigger the CSS flexbox display
    modalImg.src = this.src;           // Pass the clicked image src to the modal
    modalImg.alt = this.alt;           // Pass the alt text for accessibility
  });
});

// Close the modal when clicking the close (X) button
closeBtn.addEventListener("click", function() {
  modal.classList.remove("show-modal");
});

// Close the modal when clicking anywhere outside the image (the dark background)
modal.addEventListener("click", function(e) {
  if (e.target !== modalImg) {
    modal.classList.remove("show-modal");
  }
});