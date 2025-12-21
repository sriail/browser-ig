// Import noVNC RFB class
import RFB from './novnc/rfb.js';

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
let rfbConnection = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 2000;

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
    
    // Update connection info display
    document.getElementById('connection-info').style.display = 'block';
    document.getElementById('emulator-id-display').textContent = data.emulatorId;
    document.getElementById('connection-status-display').textContent = 'Connecting...';
    
    // Initialize VM display with noVNC
    initVmDisplay(data.hasImage, data.emulatorId);
    
    // Start polling for updates
    pollEmulatorStatus();
}

function initVmDisplay(hasImage, emulatorId) {
    const placeholder = document.getElementById('vm-placeholder');
    const statusDot = document.getElementById('vnc-status-dot');
    const statusText = document.getElementById('vnc-status-text');
    const connectionStatus = document.getElementById('vm-connection-status');
    const vncScreen = document.getElementById('vnc-screen');
    
    if (hasImage) {
        // Real VM with VNC - connect using noVNC
        statusText.textContent = 'VM Starting...';
        connectionStatus.textContent = 'Waiting for VM to boot...';
        
        // Give the VM time to boot before connecting
        setTimeout(() => {
            connectionStatus.textContent = 'Connecting to VM display...';
            connectToVnc(emulatorId);
        }, 3000);
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
        document.getElementById('connection-status-display').textContent = 'Simulated';
    }
}

function connectToVnc(emulatorId) {
    const placeholder = document.getElementById('vm-placeholder');
    const statusDot = document.getElementById('vnc-status-dot');
    const statusText = document.getElementById('vnc-status-text');
    const vncScreen = document.getElementById('vnc-screen');
    
    // Build WebSocket URL for VNC proxy
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/vnc/${emulatorId}`;
    
    console.log(`Connecting to VNC WebSocket: ${wsUrl}`);
    
    try {
        // Create noVNC RFB connection
        rfbConnection = new RFB(vncScreen, wsUrl, {
            scaleViewport: true,
            resizeSession: false,
            credentials: { password: '' }
        });
        
        // Handle connection events
        rfbConnection.addEventListener('connect', () => {
            console.log('VNC connected!');
            placeholder.style.display = 'none';
            vncScreen.style.display = 'block';
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
            document.getElementById('connection-status-display').textContent = 'Connected';
            reconnectAttempts = 0;
        });
        
        rfbConnection.addEventListener('disconnect', (e) => {
            console.log('VNC disconnected:', e.detail);
            vncScreen.style.display = 'none';
            placeholder.style.display = 'block';
            statusDot.classList.remove('connected');
            
            if (e.detail.clean) {
                statusText.textContent = 'Disconnected';
                placeholder.innerHTML = `
                    <h3>🔌 Disconnected</h3>
                    <p>VNC connection closed</p>
                `;
            } else {
                // Connection failed - might need to retry
                handleVncConnectionFailure(emulatorId);
            }
        });
        
        rfbConnection.addEventListener('credentialsrequired', () => {
            console.log('VNC credentials required');
            // Try with empty password
            rfbConnection.sendCredentials({ password: '' });
        });
        
        rfbConnection.addEventListener('securityfailure', (e) => {
            console.error('VNC security failure:', e.detail);
        });
        
        rfbConnection.addEventListener('clipboard', (e) => {
            console.log('VNC clipboard:', e.detail.text);
        });
        
    } catch (error) {
        console.error('Failed to create VNC connection:', error);
        handleVncConnectionFailure(emulatorId);
    }
}

function handleVncConnectionFailure(emulatorId) {
    const placeholder = document.getElementById('vm-placeholder');
    const statusDot = document.getElementById('vnc-status-dot');
    const statusText = document.getElementById('vnc-status-text');
    
    reconnectAttempts++;
    
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
        statusText.textContent = `Connecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;
        placeholder.innerHTML = `
            <h3>⏳ Connecting to VM...</h3>
            <p>The VM is starting up. Attempt ${reconnectAttempts} of ${MAX_RECONNECT_ATTEMPTS}</p>
            <p style="font-size: 0.8rem; margin-top: 10px; color: #888;">
                This may take a moment while the system boots...
            </p>
        `;
        
        // Retry connection after delay using currentEmulatorId for consistency
        setTimeout(() => {
            if (currentEmulatorId) {
                connectToVnc(currentEmulatorId);
            }
        }, RECONNECT_DELAY_MS);
    } else {
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Connection Failed';
        document.getElementById('connection-status-display').textContent = 'Failed';
        placeholder.innerHTML = `
            <h3>❌ Connection Failed</h3>
            <p>Could not connect to VM display after ${MAX_RECONNECT_ATTEMPTS} attempts</p>
            <p style="font-size: 0.8rem; margin-top: 10px; color: #888;">
                The VM may still be booting. Check the console output below.
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
    document.getElementById('connection-status-display').textContent = 'Stopped';
    
    // Disconnect VNC
    if (rfbConnection) {
        rfbConnection.disconnect();
        rfbConnection = null;
    }
}

async function stopEmulator() {
    if (!currentEmulatorId) return;
    
    const stopButton = document.getElementById('stop-emulator');
    stopButton.disabled = true;
    stopButton.textContent = 'Stopping...';
    
    // Disconnect VNC first
    if (rfbConnection) {
        rfbConnection.disconnect();
        rfbConnection = null;
    }
    
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
    const hasImage = sessionStorage.getItem('hasImage') === 'true';
    
    if (emulatorId && configStr) {
        currentEmulatorId = emulatorId;
        const config = JSON.parse(configStr);
        
        displayEmulatorInfo(config, {
            emulatorId: emulatorId,
            output: output,
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
            // Disconnect VNC
            if (rfbConnection) {
                rfbConnection.disconnect();
            }
            
            // Send stop request (async, may not complete before window closes)
            fetch(`/api/stop-emulator/${currentEmulatorId}`, {
                method: 'POST',
                keepalive: true
            });
        }
    });
});
