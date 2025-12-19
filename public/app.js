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
const browserIcons = {
    midori: 'images/midori.webp',
    waterfox: 'images/waterfox.png',
    brave: 'images/brave.png'
};

function updateBrowserPreview() {
    const browserSelect = document.getElementById('browser-select');
    const browserIcon = document.getElementById('browser-icon');
    const selectedBrowser = browserSelect.value;
    
    browserIcon.src = browserIcons[selectedBrowser];
    browserIcon.alt = `${selectedBrowser.charAt(0).toUpperCase() + selectedBrowser.slice(1)} Browser`;
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
let currentEmulatorId = null;

async function startEmulator() {
    const browserSelect = document.getElementById('browser-select');
    const ramSelect = document.getElementById('ram-select');
    const vramSelect = document.getElementById('vram-select');
    const startButton = document.getElementById('start-emulator');
    
    const config = {
        browser: browserSelect.value,
        ram: ramSelect.value,
        vram: vramSelect.value
    };
    
    // Disable button and show loading
    startButton.disabled = true;
    startButton.classList.add('loading');
    startButton.innerHTML = '<span class="button-icon">⏳</span>Starting...';
    
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
            currentEmulatorId = data.emulatorId;
            displayEmulatorInfo(config, data);
            showStatus('Emulator started successfully!', 'success');
        } else {
            showStatus(`Error: ${data.error}`, 'error');
            startButton.disabled = false;
            startButton.classList.remove('loading');
            startButton.innerHTML = '<span class="button-icon">▶️</span>Start Emulator';
        }
    } catch (error) {
        console.error('Error starting emulator:', error);
        showStatus('Failed to connect to server. Make sure the backend is running.', 'error');
        startButton.disabled = false;
        startButton.classList.remove('loading');
        startButton.innerHTML = '<span class="button-icon">▶️</span>Start Emulator';
    }
}

function displayEmulatorInfo(config, data) {
    const emulatorDisplay = document.getElementById('emulator-display');
    const emulatorInfo = document.getElementById('emulator-info');
    const consoleOutput = document.getElementById('console-output');
    
    // Show emulator display
    emulatorDisplay.classList.remove('hidden');
    
    // Display configuration
    const ramText = config.ram === 'unlimited' ? 'Unlimited' : `${config.ram} GB`;
    const vramText = config.vram === '1024' ? '1 GB' : `${config.vram} MB`;
    
    emulatorInfo.innerHTML = `
        <p><strong>Browser:</strong> ${config.browser.charAt(0).toUpperCase() + config.browser.slice(1)}</p>
        <p><strong>RAM:</strong> ${ramText}</p>
        <p><strong>VRAM:</strong> ${vramText}</p>
        <p><strong>Emulator ID:</strong> ${data.emulatorId}</p>
        <p><strong>Status:</strong> <span style="color: var(--accent-color);">Running</span></p>
    `;
    
    // Display console output
    consoleOutput.textContent = data.output || 'Emulator starting...\n';
    
    // Start polling for updates
    pollEmulatorStatus();
    
    // Scroll to emulator display
    emulatorDisplay.scrollIntoView({ behavior: 'smooth' });
}

async function pollEmulatorStatus() {
    if (!currentEmulatorId) return;
    
    try {
        const response = await fetch(`/api/emulator-status/${currentEmulatorId}`);
        const data = await response.json();
        
        if (response.ok) {
            const consoleOutput = document.getElementById('console-output');
            if (data.output) {
                consoleOutput.textContent += data.output;
                // Auto-scroll to bottom
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
            
            // Continue polling if emulator is still running
            if (data.running) {
                setTimeout(pollEmulatorStatus, 2000);
            } else {
                showStatus('Emulator has stopped.', 'info');
                resetUI();
            }
        }
    } catch (error) {
        console.error('Error polling emulator status:', error);
    }
}

async function stopEmulator() {
    if (!currentEmulatorId) return;
    
    const stopButton = document.getElementById('stop-emulator');
    stopButton.disabled = true;
    stopButton.textContent = 'Stopping...';
    
    try {
        const response = await fetch(`/api/stop-emulator/${currentEmulatorId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showStatus('Emulator stopped successfully.', 'success');
            resetUI();
        } else {
            showStatus(`Error: ${data.error}`, 'error');
            stopButton.disabled = false;
            stopButton.textContent = 'Stop';
        }
    } catch (error) {
        console.error('Error stopping emulator:', error);
        showStatus('Failed to stop emulator.', 'error');
        stopButton.disabled = false;
        stopButton.textContent = 'Stop';
    }
}

function resetUI() {
    const startButton = document.getElementById('start-emulator');
    const emulatorDisplay = document.getElementById('emulator-display');
    const stopButton = document.getElementById('stop-emulator');
    
    // Reset start button
    startButton.disabled = false;
    startButton.classList.remove('loading');
    startButton.innerHTML = '<span class="button-icon">▶️</span>Start Emulator';
    
    // Hide emulator display
    emulatorDisplay.classList.add('hidden');
    
    // Reset stop button
    stopButton.disabled = false;
    stopButton.textContent = 'Stop';
    
    // Clear emulator ID
    currentEmulatorId = null;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    updateBrowserPreview();
    
    // Browser selection change
    document.getElementById('browser-select').addEventListener('change', updateBrowserPreview);
    
    // Start emulator button
    document.getElementById('start-emulator').addEventListener('click', startEmulator);
    
    // Stop emulator button
    document.getElementById('stop-emulator').addEventListener('click', stopEmulator);
});
