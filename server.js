const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute

function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }
    
    const requests = requestCounts.get(ip);
    // Remove old requests outside the window
    const recentRequests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    
    recentRequests.push(now);
    requestCounts.set(ip, recentRequests);
    
    next();
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(rateLimiter);
app.use(express.static('public'));

// Store active emulator instances
const emulators = new Map();

// Maximum output buffer size (in characters)
const MAX_BUFFER_SIZE = 50000;

// Browser configurations
const browserConfigs = {
    midori: {
        name: 'Midori',
        image: 'alpine-midori.img',
        imageUrl: 'https://github.com/sriail/file-serving/releases/download/browser-packages/alpine-midori.img.gz',
        description: 'Lightweight web browser'
    },
    waterfox: {
        name: 'Waterfox',
        image: 'waterfox-browser.img',
        description: 'Privacy-focused Firefox fork'
    },
    brave: {
        name: 'Brave',
        image: 'brave-browser.img',
        description: 'Privacy-focused browser with ad blocking'
    }
};

// Directory to store downloaded images
const IMAGES_DIR = path.join(__dirname, 'qemu-images');

// Base VNC port (QEMU uses display number, actual port = 5900 + display)
let nextVncDisplay = 0;

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Find an available VNC display number
 */
function getAvailableVncDisplay() {
    const display = nextVncDisplay;
    nextVncDisplay = (nextVncDisplay + 1) % 100; // Cycle through 0-99
    return display;
}

/**
 * Download and extract a gzipped image file
 */
async function downloadAndExtractImage(url, targetPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading image from: ${url}`);
        
        const gzPath = targetPath + '.gz';
        
        const cleanup = () => {
            // Clean up temp gz file if exists
            if (fs.existsSync(gzPath)) {
                try {
                    fs.unlinkSync(gzPath);
                } catch (err) {
                    console.error(`Failed to clean up temp file ${gzPath}:`, err.message);
                }
            }
            // Clean up target file if exists and incomplete
            if (fs.existsSync(targetPath)) {
                try {
                    fs.unlinkSync(targetPath);
                } catch (err) {
                    console.error(`Failed to clean up file ${targetPath}:`, err.message);
                }
            }
        };
        
        /**
         * Download file from URL following redirects
         */
        const downloadFile = (downloadUrl, destPath, callback) => {
            const file = fs.createWriteStream(destPath);
            
            file.on('error', (err) => {
                file.close();
                callback(err);
            });
            
            const request = https.get(downloadUrl, (response) => {
                // Follow redirects (GitHub releases use 302)
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    if (!redirectUrl) {
                        file.close();
                        callback(new Error('Redirect response missing location header'));
                        return;
                    }
                    
                    // Validate redirect URL
                    try {
                        const parsed = new URL(redirectUrl);
                        if (parsed.protocol !== 'https:') {
                            file.close();
                            callback(new Error('Redirect URL must use HTTPS protocol'));
                            return;
                        }
                    } catch (parseErr) {
                        file.close();
                        callback(new Error(`Invalid redirect URL: ${redirectUrl}`));
                        return;
                    }
                    
                    file.close();
                    // Follow redirect
                    downloadFile(redirectUrl, destPath, callback);
                    return;
                }
                
                if (response.statusCode !== 200) {
                    file.close();
                    callback(new Error(`Failed to download: HTTP ${response.statusCode}`));
                    return;
                }
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    callback(null);
                });
                
                response.on('error', (err) => {
                    file.close();
                    callback(err);
                });
            });
            
            request.on('error', (err) => {
                file.close();
                callback(err);
            });
            
            request.setTimeout(300000, () => { // 5 minute timeout
                request.destroy();
                file.close();
                callback(new Error('Download timeout'));
            });
        };
        
        // Step 1: Download the gzipped file
        console.log(`Downloading gzipped file to: ${gzPath}`);
        downloadFile(url, gzPath, (downloadErr) => {
            if (downloadErr) {
                cleanup();
                reject(new Error(`Download failed: ${downloadErr.message}`));
                return;
            }
            
            console.log(`Download complete, extracting to: ${targetPath}`);
            
            // Step 2: Extract the gzipped file
            const readStream = fs.createReadStream(gzPath);
            const writeStream = fs.createWriteStream(targetPath);
            const gunzip = zlib.createGunzip();
            
            readStream.on('error', (err) => {
                cleanup();
                reject(new Error(`Read error: ${err.message}`));
            });
            
            gunzip.on('error', (err) => {
                cleanup();
                reject(new Error(`Decompression error: ${err.message}`));
            });
            
            writeStream.on('error', (err) => {
                cleanup();
                reject(new Error(`Write error: ${err.message}`));
            });
            
            writeStream.on('finish', () => {
                // Clean up temp gz file
                if (fs.existsSync(gzPath)) {
                    fs.unlinkSync(gzPath);
                }
                console.log(`Image downloaded and extracted to: ${targetPath}`);
                resolve(targetPath);
            });
            
            readStream.pipe(gunzip).pipe(writeStream);
        });
    });
}

/**
 * Get or download the browser image
 */
async function ensureImageAvailable(browserConfig) {
    const imagePath = path.join(IMAGES_DIR, browserConfig.image);
    
    // Check if image already exists
    if (fs.existsSync(imagePath)) {
        console.log(`Image already exists at: ${imagePath}`);
        return imagePath;
    }
    
    // If no URL is configured, return null (image not available)
    if (!browserConfig.imageUrl) {
        console.log(`No image URL configured for ${browserConfig.name}`);
        return null;
    }
    
    // Download and extract the image
    try {
        await downloadAndExtractImage(browserConfig.imageUrl, imagePath);
        return imagePath;
    } catch (error) {
        console.error(`Failed to download image: ${error.message}`);
        return null;
    }
}

/**
 * Convert RAM configuration to QEMU memory parameter
 */
function getRamParameter(ram) {
    if (ram === 'unlimited') {
        // Set a high but reasonable limit (16GB)
        return '16G';
    }
    return `${ram}G`;
}

/**
 * Convert VRAM configuration to QEMU VGA memory parameter
 */
function getVramParameter(vram) {
    // VRAM is specified in MB for QEMU
    return vram;
}

/**
 * Start a QEMU emulator instance
 */
async function startQemuEmulator(config) {
    const emulatorId = uuidv4();
    const ramParam = getRamParameter(config.ram);
    const vramParam = getVramParameter(config.vram);
    const browserConfig = browserConfigs[config.browser];
    
    // Get VNC display number
    const vncDisplay = getAvailableVncDisplay();
    const vncPort = 5900 + vncDisplay;
    const websocketPort = 6080 + vncDisplay;
    
    // Ensure image is available (download if needed)
    let imagePath = null;
    try {
        imagePath = await ensureImageAvailable(browserConfig);
    } catch (error) {
        console.error('Error ensuring image availability:', error);
        // Continue without image (simulation mode)
    }
    
    // Build QEMU command arguments with VNC display
    const qemuArgs = [
        '-m', ramParam,                          // RAM allocation
        '-vga', 'std',                           // Standard VGA
        '-device', `VGA,vgamem_mb=${vramParam}`, // VRAM allocation
        '-smp', '2',                             // 2 CPU cores
        '-vnc', `:${vncDisplay}`,                // VNC display
        '-serial', 'stdio'                       // Serial output to stdio
    ];
    
    // Only add KVM if available (check if /dev/kvm exists)
    if (fs.existsSync('/dev/kvm')) {
        qemuArgs.push('-enable-kvm', '-cpu', 'host');
    } else {
        // Use software emulation
        qemuArgs.push('-cpu', 'qemu64');
    }
    
    // Add disk image if available
    if (imagePath) {
        qemuArgs.push('-hda', imagePath);
        console.log(`Using disk image: ${imagePath}`);
    }
    
    let outputBuffer = '';
    let qemuProcess = null;
    
    // Initial output
    outputBuffer = generateStartupMessage(config, browserConfig, imagePath, vncPort, websocketPort);
    
    // Store emulator instance first
    const emulatorData = {
        id: emulatorId,
        process: null,
        config,
        browserConfig,
        outputBuffer,
        lastReadPosition: 0,
        running: true,
        startTime: new Date(),
        vncDisplay,
        vncPort,
        websocketPort,
        imagePath
    };
    emulators.set(emulatorId, emulatorData);
    
    // Check if QEMU is available and start accordingly
    try {
        const qemuPath = findQemu();
        
        if (qemuPath && imagePath) {
            // QEMU is available and we have an image
            console.log(`Starting QEMU with VNC on port ${vncPort}`);
            console.log(`QEMU command: ${qemuPath} ${qemuArgs.join(' ')}`);
            
            qemuProcess = spawn(qemuPath, qemuArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            setupProcessHandlers(qemuProcess, emulatorId, config);
            emulatorData.process = qemuProcess;
            
            // Add VNC connection info to output
            setTimeout(() => {
                const emulator = emulators.get(emulatorId);
                if (emulator) {
                    emulator.outputBuffer += `\nVNC Server started on port ${vncPort}\n`;
                    emulator.outputBuffer += `Websocket proxy available on port ${websocketPort}\n`;
                }
            }, 500);
        } else {
            // QEMU not available or no image, run in simulation mode
            console.log('QEMU not found or no image available, running in simulation mode');
            qemuProcess = simulateQemu(config, vncPort, websocketPort);
            setupProcessHandlers(qemuProcess, emulatorId, config);
            emulatorData.process = qemuProcess;
        }
    } catch (error) {
        console.error('Error starting QEMU:', error);
        emulatorData.outputBuffer += `\nError: ${error.message}\n`;
        emulatorData.running = false;
    }
    
    return {
        emulatorId,
        output: outputBuffer,
        vncPort,
        websocketPort,
        hasImage: !!imagePath
    };
}

/**
 * Find QEMU executable
 */
function findQemu() {
    try {
        const result = execSync('which qemu-system-x86_64 2>/dev/null', { encoding: 'utf8' });
        return result.trim();
    } catch {
        return null;
    }
}

/**
 * Simulate QEMU for demo purposes when QEMU is not installed
 */
function simulateQemu(config, vncPort, websocketPort) {
    const { EventEmitter } = require('events');
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    const processEmitter = new EventEmitter();
    
    // Simulate process interface
    const simulatedProcess = {
        stdout: stdoutEmitter,
        stderr: stderrEmitter,
        pid: Math.floor(Math.random() * 90000) + 10000,
        kill: () => {
            processEmitter.emit('close', 0);
        },
        on: (event, handler) => {
            processEmitter.on(event, handler);
        }
    };
    
    // Simulate startup messages (only on stdout)
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from('QEMU emulator version 7.0.0 (simulation mode)\n'));
    }, 500);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from(`Starting ${config.browser} browser...\n`));
    }, 1000);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from('Initializing virtual hardware...\n'));
    }, 1500);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from(`RAM: ${config.ram === 'unlimited' ? '16GB' : config.ram + 'GB'} allocated\n`));
    }, 2000);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from(`VRAM: ${config.vram}MB allocated\n`));
    }, 2500);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from(`VNC Server: port ${vncPort} (simulation)\n`));
    }, 3000);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from(`WebSocket proxy: port ${websocketPort} (simulation)\n`));
    }, 3500);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from('Browser environment ready!\n'));
    }, 4000);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from('\n[Note: Running in simulation mode - QEMU not installed]\n'));
    }, 4500);
    
    return simulatedProcess;
}

/**
 * Setup process event handlers
 */
function setupProcessHandlers(process, emulatorId, config) {
    if (!process) return;
    
    const emulator = emulators.get(emulatorId);
    if (!emulator) return;
    
    process.stdout?.on('data', (data) => {
        const output = data.toString();
        emulator.outputBuffer += output;
        
        // Trim buffer if it gets too large (keep last MAX_BUFFER_SIZE characters)
        if (emulator.outputBuffer.length > MAX_BUFFER_SIZE) {
            const excessLength = emulator.outputBuffer.length - MAX_BUFFER_SIZE;
            emulator.outputBuffer = emulator.outputBuffer.substring(excessLength);
            // Adjust read position accordingly
            emulator.lastReadPosition = Math.max(0, emulator.lastReadPosition - excessLength);
        }
        
        console.log(`[${config.browser}] ${output}`);
    });
    
    process.stderr?.on('data', (data) => {
        const output = data.toString();
        emulator.outputBuffer += `ERROR: ${output}`;
        
        // Trim buffer if it gets too large
        if (emulator.outputBuffer.length > MAX_BUFFER_SIZE) {
            const excessLength = emulator.outputBuffer.length - MAX_BUFFER_SIZE;
            emulator.outputBuffer = emulator.outputBuffer.substring(excessLength);
            emulator.lastReadPosition = Math.max(0, emulator.lastReadPosition - excessLength);
        }
        
        console.error(`[${config.browser}] ERROR: ${output}`);
    });
    
    process.on('close', (code) => {
        console.log(`Emulator ${emulatorId} exited with code ${code}`);
        if (emulator) {
            emulator.running = false;
            emulator.outputBuffer += `\n\nEmulator stopped (exit code: ${code})\n`;
        }
    });
    
    process.on('error', (error) => {
        console.error(`Emulator ${emulatorId} error:`, error);
        if (emulator) {
            emulator.running = false;
            emulator.outputBuffer += `\n\nError: ${error.message}\n`;
        }
    });
}

/**
 * Generate startup message
 */
function generateStartupMessage(config, browserConfig, imagePath, vncPort, websocketPort) {
    const ram = config.ram === 'unlimited' ? 'Unlimited (16GB)' : `${config.ram} GB`;
    const vram = config.vram === '1024' ? '1 GB' : `${config.vram} MB`;
    const imageInfo = imagePath ? `\nDisk Image: ${path.basename(imagePath)}` : '\nDisk Image: None (simulation mode)';
    const vncInfo = `\nVNC Port: ${vncPort}\nWebSocket Port: ${websocketPort}`;
    
    return `
===========================================
  Browser IG - QEMU Emulator
===========================================
Browser: ${browserConfig.name}
Description: ${browserConfig.description}
RAM: ${ram}
VRAM: ${vram}${imageInfo}${vncInfo}
===========================================

Initializing emulator...
`;
}

// API Routes

/**
 * Start emulator endpoint
 */
app.post('/api/start-emulator', async (req, res) => {
    try {
        const { browser, ram, vram } = req.body;
        
        // Validate input
        if (!browser || !browserConfigs[browser]) {
            return res.status(400).json({ error: 'Invalid browser selection' });
        }
        
        if (!ram) {
            return res.status(400).json({ error: 'RAM amount is required' });
        }
        
        if (!vram) {
            return res.status(400).json({ error: 'VRAM amount is required' });
        }
        
        // Start the emulator
        const result = await startQemuEmulator({ browser, ram, vram });
        
        res.json({
            success: true,
            emulatorId: result.emulatorId,
            output: result.output,
            vncPort: result.vncPort,
            websocketPort: result.websocketPort,
            hasImage: result.hasImage
        });
        
    } catch (error) {
        console.error('Error in start-emulator:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get emulator status endpoint
 */
app.get('/api/emulator-status/:id', (req, res) => {
    const emulatorId = req.params.id;
    const emulator = emulators.get(emulatorId);
    
    if (!emulator) {
        return res.status(404).json({ error: 'Emulator not found' });
    }
    
    // Get new output since last check
    const newOutput = emulator.outputBuffer.substring(emulator.lastReadPosition);
    emulator.lastReadPosition = emulator.outputBuffer.length;
    
    res.json({
        running: emulator.running,
        output: newOutput,
        config: emulator.config,
        uptime: Math.floor((new Date() - emulator.startTime) / 1000),
        vncPort: emulator.vncPort,
        websocketPort: emulator.websocketPort
    });
});

/**
 * Stop emulator endpoint
 */
app.post('/api/stop-emulator/:id', (req, res) => {
    const emulatorId = req.params.id;
    const emulator = emulators.get(emulatorId);
    
    if (!emulator) {
        return res.status(404).json({ error: 'Emulator not found' });
    }
    
    try {
        if (emulator.process && emulator.running) {
            emulator.process.kill('SIGTERM');
            emulator.running = false;
        }
        
        // Remove from active emulators after a delay
        setTimeout(() => {
            emulators.delete(emulatorId);
        }, 5000);
        
        res.json({ success: true, message: 'Emulator stopped' });
        
    } catch (error) {
        console.error('Error stopping emulator:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * List all active emulators
 */
app.get('/api/emulators', (req, res) => {
    const activeEmulators = Array.from(emulators.values()).map(e => ({
        id: e.id,
        browser: e.config.browser,
        ram: e.config.ram,
        vram: e.config.vram,
        running: e.running,
        uptime: Math.floor((new Date() - e.startTime) / 1000)
    }));
    
    res.json({ emulators: activeEmulators });
});

// Serve index.html for root (rate-limited by global middleware)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
===========================================
  Browser IG Server Started
===========================================
  Server running on: http://localhost:${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
===========================================
    `);
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    
    // Stop all running emulators
    emulators.forEach((emulator) => {
        if (emulator.process && emulator.running) {
            emulator.process.kill('SIGTERM');
        }
    });
    
    process.exit(0);
});

module.exports = app;
