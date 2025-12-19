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

// Emulator management
let currentEmulatorId = null;

function displayEmulatorInfo(config, data) {
    const emulatorInfo = document.getElementById('emulator-info');
    const consoleOutput = document.getElementById('console-output');
    
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
                const emulatorInfo = document.getElementById('emulator-info');
                const statusText = emulatorInfo.querySelector('p:last-child');
                if (statusText) {
                    statusText.innerHTML = '<strong>Status:</strong> <span class="status-stopped">Stopped</span>';
                }
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
            const emulatorInfo = document.getElementById('emulator-info');
            const statusText = emulatorInfo.querySelector('p:last-child');
            if (statusText) {
                statusText.innerHTML = '<strong>Status:</strong> <span class="status-stopped">Stopped</span>';
            }
            stopButton.textContent = 'Stopped';
            
            // Close window after a brief delay
            setTimeout(() => {
                window.close();
            }, 2000);
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // Get emulator data from sessionStorage
    const emulatorId = sessionStorage.getItem('emulatorId');
    const configStr = sessionStorage.getItem('emulatorConfig');
    const output = sessionStorage.getItem('emulatorOutput');
    
    if (emulatorId && configStr) {
        currentEmulatorId = emulatorId;
        const config = JSON.parse(configStr);
        
        displayEmulatorInfo(config, {
            emulatorId: emulatorId,
            output: output
        });
        
        // Clear sessionStorage
        sessionStorage.removeItem('emulatorId');
        sessionStorage.removeItem('emulatorConfig');
        sessionStorage.removeItem('emulatorOutput');
    } else {
        // No emulator data found
        document.getElementById('emulator-info').innerHTML = 
            '<p class="error-message">No emulator data found. Please start an emulator from the main page.</p>';
    }
    
    // Stop emulator button
    document.getElementById('stop-emulator').addEventListener('click', stopEmulator);
    
    // Handle window close - stop emulator
    window.addEventListener('beforeunload', () => {
        if (currentEmulatorId) {
            // Send stop request (async, may not complete before window closes)
            fetch(`/api/stop-emulator/${currentEmulatorId}`, {
                method: 'POST',
                keepalive: true
            });
        }
    });
});
