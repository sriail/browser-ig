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

// Browser selection management with grid
function setupBrowserGrid() {
    const browserOptions = document.querySelectorAll('.browser-option');
    
    browserOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            browserOptions.forEach(opt => opt.classList.remove('selected'));
            // Add selected class to clicked option
            option.classList.add('selected');
        });
    });
}

function getSelectedBrowser() {
    const selectedOption = document.querySelector('.browser-option.selected');
    return selectedOption ? selectedOption.dataset.browser : 'midori';
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

// Emulator management - open in new window
async function startEmulator() {
    const ramSelect = document.getElementById('ram-select');
    const vramSelect = document.getElementById('vram-select');
    const startButton = document.getElementById('start-emulator');
    
    const config = {
        browser: getSelectedBrowser(),
        ram: ramSelect.value,
        vram: vramSelect.value
    };
    
    // Disable button and show loading
    startButton.disabled = true;
    startButton.classList.add('loading');
    startButton.innerHTML = `
        <svg class="button-icon" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" opacity="0.25"/>
            <path d="M12 2 A 10 10 0 0 1 22 12" opacity="0.75"/>
        </svg>
        Starting...
    `;
    
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
            // Open emulator in new window with configuration
            const params = new URLSearchParams({
                browser: config.browser,
                ram: config.ram,
                vram: config.vram,
                id: data.emulatorId
            });
            
            const emulatorWindow = window.open(
                `emulator.html?${params.toString()}`,
                '_blank',
                'width=1000,height=800,resizable=yes,scrollbars=yes'
            );
            
            if (emulatorWindow) {
                showStatus('Emulator started in new window!', 'success');
            } else {
                showStatus('Emulator started, but popup was blocked. Please allow popups for this site.', 'info');
            }
            
            // Reset button
            startButton.disabled = false;
            startButton.classList.remove('loading');
            startButton.innerHTML = `
                <svg class="button-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                Start Emulator
            `;
        } else {
            showStatus(`Error: ${data.error}`, 'error');
            startButton.disabled = false;
            startButton.classList.remove('loading');
            startButton.innerHTML = `
                <svg class="button-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                Start Emulator
            `;
        }
    } catch (error) {
        console.error('Error starting emulator:', error);
        showStatus('Failed to connect to server. Make sure the backend is running.', 'error');
        startButton.disabled = false;
        startButton.classList.remove('loading');
        startButton.innerHTML = `
            <svg class="button-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
            Start Emulator
        `;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupBrowserGrid();
    
    // Start emulator button
    document.getElementById('start-emulator').addEventListener('click', startEmulator);
});
