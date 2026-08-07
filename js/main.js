lucide.createIcons();
const body = document.body;
const toggle = document.getElementById('theme-toggle');
const stored = localStorage.getItem('theme');
    if (stored === 'dark') applyDark();

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