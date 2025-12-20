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

// Browser icons mapping for VM display
const browserIcons = {
    midori: 'images/midori.png',
    waterfox: 'images/waterfox.png',
    brave: 'images/brave.png'
};

// Emulator management
let currentEmulatorId = null;
let currentVncPort = null;
let isSimulationMode = false;
let vmDisplayInitialized = false;

/**
 * Initialize the VM display based on mode
 */
function initVmDisplay(config, simulationMode, vncPort) {
    const vmDisplay = document.getElementById('vm-display');
    const statusBadge = document.getElementById('vm-status-badge');
    
    isSimulationMode = simulationMode;
    currentVncPort = vncPort;
    
    if (simulationMode) {
        // Show simulation mode display
        statusBadge.textContent = 'Simulation Mode';
        statusBadge.className = 'vm-status simulation';
        
        // Create simulated VM boot screen
        showSimulatedVmDisplay(config);
    } else {
        // Real QEMU with VNC
        statusBadge.textContent = 'Running';
        statusBadge.className = 'vm-status running';
        
        // Show VNC connection info
        vmDisplay.innerHTML = `
            <div class="vm-display-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <h3>VM Running on VNC</h3>
                <p>Connect to VNC port <strong>${vncPort}</strong> to view the VM display.</p>
                <p style="margin-top: 10px; font-size: 0.85rem;">
                    Use a VNC client or the following command:<br>
                    <code style="background: #333; padding: 4px 8px; border-radius: 4px; color: #0f0;">
                        vncviewer localhost:${vncPort}
                    </code>
                </p>
            </div>
        `;
    }
    
    vmDisplayInitialized = true;
}

/**
 * Show simulated VM display with browser boot animation
 */
function showSimulatedVmDisplay(config) {
    const vmDisplay = document.getElementById('vm-display');
    const browserName = config.browser.charAt(0).toUpperCase() + config.browser.slice(1);
    const browserIcon = browserIcons[config.browser] || 'images/midori.png';
    
    // Initial boot screen
    vmDisplay.innerHTML = `
        <div class="vm-simulation">
            <div class="boot-screen" id="boot-screen">
                <img src="${browserIcon}" alt="${browserName}" class="browser-logo">
                <h2>${browserName} Browser</h2>
                <p>Virtual Machine Starting...</p>
                <div class="loading-bar"></div>
                <p style="font-size: 0.8rem; opacity: 0.7;">Powered by Browser IG</p>
            </div>
            <div class="vm-info-badge">
                Simulation Mode | VNC Port: ${currentVncPort || 'N/A'}
            </div>
        </div>
    `;
    
    // Simulate boot sequence
    setTimeout(() => {
        updateBootScreen('Initializing virtual hardware...', 1);
    }, 1500);
    
    setTimeout(() => {
        updateBootScreen('Loading kernel...', 2);
    }, 3000);
    
    setTimeout(() => {
        updateBootScreen('Starting graphical interface...', 3);
    }, 4500);
    
    setTimeout(() => {
        showSimulatedDesktop(config);
    }, 6000);
}

/**
 * Update boot screen message
 */
function updateBootScreen(message, stage) {
    const bootScreen = document.getElementById('boot-screen');
    if (bootScreen) {
        const loadingText = bootScreen.querySelector('p:nth-of-type(1)');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }
}

/**
 * Show simulated desktop environment
 */
function showSimulatedDesktop(config) {
    const vmDisplay = document.getElementById('vm-display');
    const browserName = config.browser.charAt(0).toUpperCase() + config.browser.slice(1);
    const browserIcon = browserIcons[config.browser] || 'images/midori.png';
    
    vmDisplay.innerHTML = `
        <div class="vm-simulation" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <div style="position: absolute; top: 0; left: 0; right: 0; padding: 8px 15px; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.85rem;" aria-label="Current time"><span aria-hidden="true">📅</span> ${new Date().toLocaleTimeString()}</span>
                <span style="font-size: 0.85rem;">${browserName} Browser VM</span>
            </div>
            <div style="text-align: center; padding: 60px 20px; animation: fadeIn 0.5s ease-in-out;">
                <img src="${browserIcon}" alt="${browserName}" style="width: 80px; height: 80px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <h2 style="margin-bottom: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${browserName} Browser Ready</h2>
                <p style="opacity: 0.9; max-width: 300px; margin: 0 auto;">Your virtual browser environment is now running in simulation mode.</p>
                <div style="margin-top: 30px; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    <div style="background: rgba(255,255,255,0.15); padding: 15px 25px; border-radius: 8px; backdrop-filter: blur(10px);">
                        <div style="font-size: 1.5rem; font-weight: bold;" aria-hidden="true">✓</div>
                        <div style="font-size: 0.8rem; opacity: 0.8;">VM Active</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.15); padding: 15px 25px; border-radius: 8px; backdrop-filter: blur(10px);">
                        <div style="font-size: 1.5rem; font-weight: bold;">${config.ram === 'unlimited' ? '16' : config.ram}GB</div>
                        <div style="font-size: 0.8rem; opacity: 0.8;">RAM</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.15); padding: 15px 25px; border-radius: 8px; backdrop-filter: blur(10px);">
                        <div style="font-size: 1.5rem; font-weight: bold;">${config.vram}MB</div>
                        <div style="font-size: 0.8rem; opacity: 0.8;">VRAM</div>
                    </div>
                </div>
            </div>
            <div class="vm-info-badge">
                Simulation Mode | VNC Port: ${currentVncPort || 'N/A'}
            </div>
        </div>
    `;
}

function displayEmulatorInfo(config, data) {
    const emulatorInfo = document.getElementById('emulator-info');
    const consoleOutput = document.getElementById('console-output');
    
    // Display configuration
    const ramText = config.ram === 'unlimited' ? 'Unlimited' : `${config.ram} GB`;
    const vramText = config.vram === '1024' ? '1 GB' : `${config.vram} MB`;
    const modeText = data.simulationMode ? 'Simulation' : 'Real VM';
    
    emulatorInfo.innerHTML = `
        <p><strong>Browser:</strong> ${config.browser.charAt(0).toUpperCase() + config.browser.slice(1)}</p>
        <p><strong>RAM:</strong> ${ramText}</p>
        <p><strong>VRAM:</strong> ${vramText}</p>
        <p><strong>VNC Port:</strong> ${data.vncPort || 'N/A'}</p>
        <p><strong>Mode:</strong> ${modeText}</p>
        <p><strong>Emulator ID:</strong> ${data.emulatorId}</p>
        <p><strong>Status:</strong> <span style="color: var(--accent-color);">Running</span></p>
    `;
    
    // Display console output
    consoleOutput.textContent = data.output || 'Emulator starting...\n';
    
    // Initialize VM display
    initVmDisplay(config, data.simulationMode !== false, data.vncPort);
    
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
                updateVmStopped();
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

/**
 * Update VM display to show stopped state
 */
function updateVmStopped() {
    const statusBadge = document.getElementById('vm-status-badge');
    statusBadge.textContent = 'Stopped';
    statusBadge.className = 'vm-status stopped';
    
    const vmDisplay = document.getElementById('vm-display');
    vmDisplay.innerHTML = `
        <div class="vm-display-placeholder" style="background: linear-gradient(135deg, #333 0%, #222 100%); height: 100%; width: 100%; border-radius: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.3;">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <h3 style="color: #888;">VM Stopped</h3>
            <p style="color: #666;">The virtual machine has been stopped.</p>
        </div>
    `;
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
            updateVmStopped();
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
    const vncPort = sessionStorage.getItem('emulatorVncPort');
    const simulationMode = sessionStorage.getItem('emulatorSimulationMode');
    
    if (emulatorId && configStr) {
        currentEmulatorId = emulatorId;
        const config = JSON.parse(configStr);
        
        displayEmulatorInfo(config, {
            emulatorId: emulatorId,
            output: output,
            vncPort: vncPort ? parseInt(vncPort) : null,
            simulationMode: simulationMode === 'true'
        });
        
        // Clear sessionStorage
        sessionStorage.removeItem('emulatorId');
        sessionStorage.removeItem('emulatorConfig');
        sessionStorage.removeItem('emulatorOutput');
        sessionStorage.removeItem('emulatorVncPort');
        sessionStorage.removeItem('emulatorSimulationMode');
    } else {
        // No emulator data found
        document.getElementById('emulator-info').innerHTML = 
            '<p class="error-message">No emulator data found. Please start an emulator from the main page.</p>';
        
        // Update VM display
        const vmDisplay = document.getElementById('vm-display');
        vmDisplay.innerHTML = `
            <div class="vm-display-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <h3>No Emulator Data</h3>
                <p>Please start an emulator from the main page.</p>
            </div>
        `;
        
        const statusBadge = document.getElementById('vm-status-badge');
        statusBadge.textContent = 'Not Started';
        statusBadge.className = 'vm-status stopped';
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
