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
let vncPort = null;
let websocketPort = null;

function displayEmulatorInfo(config, data) {
    const emulatorInfo = document.getElementById('emulator-info');
    const consoleOutput = document.getElementById('console-output');
    
    // Store VNC ports
    vncPort = data.vncPort;
    websocketPort = data.websocketPort;
    
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
    
    // Update connection info display
    if (vncPort && websocketPort) {
        document.getElementById('connection-info').style.display = 'block';
        document.getElementById('vnc-port-display').textContent = vncPort;
        document.getElementById('ws-port-display').textContent = websocketPort;
    }
    
    // Initialize VM display
    initVmDisplay(data.hasImage);
    
    // Start polling for updates
    pollEmulatorStatus();
}

function initVmDisplay(hasImage) {
    const placeholder = document.getElementById('vm-placeholder');
    const statusDot = document.getElementById('vnc-status-dot');
    const statusText = document.getElementById('vnc-status-text');
    const connectionStatus = document.getElementById('vm-connection-status');
    
    if (hasImage) {
        // Real VM with VNC
        statusText.textContent = 'VM Starting...';
        connectionStatus.textContent = 'Waiting for VNC connection...';
        
        // Simulate VM boot progress (in real implementation, this would connect to VNC)
        setTimeout(() => {
            connectionStatus.textContent = 'VM is booting...';
        }, 2000);
        
        setTimeout(() => {
            connectionStatus.textContent = 'Loading graphical interface...';
        }, 4000);
        
        setTimeout(() => {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
            placeholder.innerHTML = `
                <h3>🖥️ VM Display Active</h3>
                <p>VNC connection established on port ${vncPort}</p>
                <p>To view the VM graphically, connect a VNC client to:</p>
                <p style="font-family: monospace; margin-top: 10px;">localhost:${vncPort}</p>
                <p style="font-size: 0.8rem; margin-top: 15px; color: #888;">
                    (noVNC web client integration coming soon)
                </p>
            `;
        }, 6000);
    } else {
        // Simulation mode
        statusText.textContent = 'Simulation Mode';
        statusDot.classList.add('connected');
        placeholder.innerHTML = `
            <h3>🖥️ Simulation Mode</h3>
            <p>Running in simulation mode (no disk image available)</p>
            <p>VM display is simulated - no actual graphical output</p>
            <p style="font-size: 0.8rem; margin-top: 15px; color: #888;">
                Download the browser image to see the actual VM display
            </p>
        `;
    }
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
                updateEmulatorStopped();
            }
        }
    } catch (error) {
        console.error('Error polling emulator status:', error);
    }
}

function updateEmulatorStopped() {
    const emulatorInfo = document.getElementById('emulator-info');
    const statusText = emulatorInfo.querySelector('p:last-child');
    if (statusText) {
        statusText.innerHTML = '<strong>Status:</strong> <span class="status-stopped">Stopped</span>';
    }
    
    // Update VM display status
    const statusDot = document.getElementById('vnc-status-dot');
    const vncStatusText = document.getElementById('vnc-status-text');
    statusDot.classList.remove('connected');
    statusDot.classList.add('disconnected');
    vncStatusText.textContent = 'Disconnected';
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
            updateEmulatorStopped();
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

function toggleFullscreen() {
    const vmScreen = document.getElementById('vm-screen');
    if (!document.fullscreenElement) {
        vmScreen.requestFullscreen().catch(err => {
            console.log('Error attempting fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // Get emulator data from sessionStorage
    const emulatorId = sessionStorage.getItem('emulatorId');
    const configStr = sessionStorage.getItem('emulatorConfig');
    const output = sessionStorage.getItem('emulatorOutput');
    const storedVncPort = sessionStorage.getItem('vncPort');
    const storedWsPort = sessionStorage.getItem('websocketPort');
    const hasImage = sessionStorage.getItem('hasImage') === 'true';
    
    if (emulatorId && configStr) {
        currentEmulatorId = emulatorId;
        const config = JSON.parse(configStr);
        
        displayEmulatorInfo(config, {
            emulatorId: emulatorId,
            output: output,
            vncPort: storedVncPort ? parseInt(storedVncPort) : null,
            websocketPort: storedWsPort ? parseInt(storedWsPort) : null,
            hasImage: hasImage
        });
        
        // Clear sessionStorage
        sessionStorage.removeItem('emulatorId');
        sessionStorage.removeItem('emulatorConfig');
        sessionStorage.removeItem('emulatorOutput');
        sessionStorage.removeItem('vncPort');
        sessionStorage.removeItem('websocketPort');
        sessionStorage.removeItem('hasImage');
    } else {
        // No emulator data found
        document.getElementById('emulator-info').innerHTML = 
            '<p class="error-message">No emulator data found. Please start an emulator from the main page.</p>';
        
        // Update VM placeholder
        const placeholder = document.getElementById('vm-placeholder');
        placeholder.innerHTML = `
            <h3>⚠️ No Emulator Running</h3>
            <p>Please start an emulator from the main page.</p>
        `;
    }
    
    // Stop emulator button
    document.getElementById('stop-emulator').addEventListener('click', stopEmulator);
    
    // Fullscreen button
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
    
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
