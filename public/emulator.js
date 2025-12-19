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

// Get emulator configuration from URL parameters
function getEmulatorConfig() {
    const params = new URLSearchParams(window.location.search);
    return {
        browser: params.get('browser') || 'midori',
        ram: params.get('ram') || '2',
        vram: params.get('vram') || '200',
        emulatorId: params.get('id')
    };
}

// Start emulator and display info
async function startEmulator() {
    const config = getEmulatorConfig();
    
    // If we have an emulator ID, it's already running, just display it
    if (config.emulatorId) {
        displayExistingEmulator(config);
        pollEmulatorStatus(config.emulatorId);
        return;
    }
    
    // Otherwise start a new emulator
    try {
        const response = await fetch('/api/start-emulator', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                browser: config.browser,
                ram: config.ram,
                vram: config.vram
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            config.emulatorId = data.emulatorId;
            // Update URL with emulator ID
            const url = new URL(window.location);
            url.searchParams.set('id', data.emulatorId);
            window.history.replaceState({}, '', url);
            
            displayEmulatorInfo(config, data);
            pollEmulatorStatus(data.emulatorId);
        } else {
            showError(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error starting emulator:', error);
        showError('Failed to connect to server. Make sure the backend is running.');
    }
}

function displayExistingEmulator(config) {
    const emulatorInfo = document.getElementById('emulator-info');
    
    const ramText = config.ram === 'unlimited' ? 'Unlimited' : `${config.ram} GB`;
    const vramText = config.vram === '1024' ? '1 GB' : `${config.vram} MB`;
    
    emulatorInfo.innerHTML = `
        <p><strong>Browser:</strong> ${config.browser.charAt(0).toUpperCase() + config.browser.slice(1)}</p>
        <p><strong>RAM:</strong> ${ramText}</p>
        <p><strong>VRAM:</strong> ${vramText}</p>
        <p><strong>Emulator ID:</strong> ${config.emulatorId}</p>
        <p><strong>Status:</strong> <span style="color: var(--accent-color);">Running</span></p>
    `;
    
    const consoleOutput = document.getElementById('console-output');
    consoleOutput.textContent = 'Loading emulator output...\n';
}

function displayEmulatorInfo(config, data) {
    const emulatorInfo = document.getElementById('emulator-info');
    const consoleOutput = document.getElementById('console-output');
    
    const ramText = config.ram === 'unlimited' ? 'Unlimited' : `${config.ram} GB`;
    const vramText = config.vram === '1024' ? '1 GB' : `${config.vram} MB`;
    
    emulatorInfo.innerHTML = `
        <p><strong>Browser:</strong> ${config.browser.charAt(0).toUpperCase() + config.browser.slice(1)}</p>
        <p><strong>RAM:</strong> ${ramText}</p>
        <p><strong>VRAM:</strong> ${vramText}</p>
        <p><strong>Emulator ID:</strong> ${data.emulatorId}</p>
        <p><strong>Status:</strong> <span style="color: var(--accent-color);">Running</span></p>
    `;
    
    consoleOutput.textContent = data.output || 'Emulator starting...\n';
}

function showError(message) {
    const emulatorInfo = document.getElementById('emulator-info');
    emulatorInfo.innerHTML = `
        <p style="color: var(--error-color);"><strong>Error:</strong> ${message}</p>
        <p>Please close this window and try again from the main page.</p>
    `;
}

async function pollEmulatorStatus(emulatorId) {
    if (!emulatorId) return;
    
    try {
        const response = await fetch(`/api/emulator-status/${emulatorId}`);
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
                setTimeout(() => pollEmulatorStatus(emulatorId), 2000);
            } else {
                const emulatorInfo = document.getElementById('emulator-info');
                emulatorInfo.innerHTML += '<p style="color: var(--error-color);"><strong>Status:</strong> Stopped</p>';
            }
        }
    } catch (error) {
        console.error('Error polling emulator status:', error);
    }
}

async function stopEmulator() {
    const config = getEmulatorConfig();
    if (!config.emulatorId) return;
    
    const stopButton = document.getElementById('stop-emulator');
    stopButton.disabled = true;
    stopButton.textContent = 'Stopping...';
    
    try {
        const response = await fetch(`/api/stop-emulator/${config.emulatorId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const emulatorInfo = document.getElementById('emulator-info');
            emulatorInfo.innerHTML += '<p style="color: var(--error-color);"><strong>Status:</strong> Stopped</p>';
            stopButton.textContent = 'Stopped';
            
            // Optionally close the window after a delay
            setTimeout(() => {
                if (confirm('Emulator stopped. Close this window?')) {
                    window.close();
                }
            }, 1000);
        } else {
            stopButton.disabled = false;
            stopButton.textContent = 'Stop';
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error stopping emulator:', error);
        stopButton.disabled = false;
        stopButton.textContent = 'Stop';
        alert('Failed to stop emulator.');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    startEmulator();
    
    // Stop emulator button
    document.getElementById('stop-emulator').addEventListener('click', stopEmulator);
});
