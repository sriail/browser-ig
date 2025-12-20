// Theme detection and logo/favicon management
function initTheme() {
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    updateLogoAndFavicon(darkMode);
    
    // Listen for theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        updateLogoAndFavicon(e.matches);
    });
}

function updateLogoAndFavicon(isDarkMode) {
    const logo = document.getElementById('logo');
    const favicon = document.getElementById('favicon');
    
    // In dark mode, use light logo/favicon (inverse)
    // In light mode, use dark logo/favicon (inverse)
    if (isDarkMode) {
        logo.src = 'images/browser_ig_logo_light.png';
        favicon.href = 'images/favicon_light.png';
    } else {
        logo.src = 'images/browser_ig_logo_dark.png';
        favicon.href = 'images/favicon_dark.png';
    }
}

// Browser selection management
let selectedBrowser = 'midori'; // Default selection

function initBrowserGrid() {
    const browserCards = document.querySelectorAll('.browser-card');
    
    // Set initial selection
    browserCards[0].classList.add('selected');
    
    // Add click handlers
    browserCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove selected class from all cards
            browserCards.forEach(c => c.classList.remove('selected'));
            // Add selected class to clicked card
            card.classList.add('selected');
            // Update selected browser
            selectedBrowser = card.dataset.browser;
        });
    });
}

// Status message display
function showStatus(message, type = 'info') {
    const statusElement = document.getElementById('status-message');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    
    // Auto-hide success/info messages after 5 seconds
    if (type !== 'error') {
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 5000);
    }
}

// Emulator management
async function startEmulator() {
    const ramSelect = document.getElementById('ram-select');
    const vramSelect = document.getElementById('vram-select');
    const windowTargetSelect = document.getElementById('window-target-select');
    const startButton = document.getElementById('start-emulator');
    
    const config = {
        browser: selectedBrowser,
        ram: ramSelect.value,
        vram: vramSelect.value
    };
    
    const windowTarget = windowTargetSelect.value;
    
    // Disable button and show loading
    startButton.disabled = true;
    startButton.classList.add('loading');
    startButton.innerHTML = '<svg class="button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>Starting...';
    
    try {
        const response = await fetch('/api/start-emulator', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Store emulator ID and config in sessionStorage for emulator page
            sessionStorage.setItem('emulatorId', data.emulatorId);
            sessionStorage.setItem('emulatorConfig', JSON.stringify(config));
            sessionStorage.setItem('emulatorOutput', data.output);
            sessionStorage.setItem('emulatorVncPort', data.vncPort ? data.vncPort.toString() : '');
            sessionStorage.setItem('emulatorSimulationMode', data.simulationMode ? 'true' : 'false');
            
            // Open emulator based on selected target
            if (windowTarget === 'window') {
                // Open in new popup window with specific dimensions (larger for VM display)
                window.open('emulator.html', '_blank', 'width=1024,height=900');
            } else if (windowTarget === '_blank') {
                // Open in new tab
                window.open('emulator.html', '_blank');
            } else {
                // Open in same tab (_self)
                window.location.href = 'emulator.html';
            }
            
            showStatus('Emulator started successfully!', 'success');
            
            // Reset button (only if not opening in same tab)
            if (windowTarget !== '_self') {
                setTimeout(() => {
                    startButton.disabled = false;
                    startButton.classList.remove('loading');
                    startButton.innerHTML = '<svg class="button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Start Emulator';
                }, 2000);
            }
        } else {
            showStatus(`Error: ${data.error}`, 'error');
            startButton.disabled = false;
            startButton.classList.remove('loading');
            startButton.innerHTML = '<svg class="button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Start Emulator';
        }
    } catch (error) {
        console.error('Error starting emulator:', error);
        showStatus('Failed to connect to server. Make sure the backend is running.', 'error');
        startButton.disabled = false;
        startButton.classList.remove('loading');
        startButton.innerHTML = '<svg class="button-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Start Emulator';
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initBrowserGrid();
    
    // Start emulator button
    document.getElementById('start-emulator').addEventListener('click', startEmulator);
});
