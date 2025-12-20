const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');

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

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Download and extract a gzipped image file
 */
async function downloadAndExtractImage(url, targetPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading image from: ${url}`);
        
        const file = fs.createWriteStream(targetPath);
        const gunzip = zlib.createGunzip();
        
        // Add error handlers for streams
        const cleanup = () => {
            fs.stat(targetPath, (statErr) => {
                if (!statErr) {
                    fs.unlink(targetPath, (err) => {
                        if (err) {
                            console.error(`Failed to clean up file ${targetPath}:`, err.message);
                        }
                    });
                }
            });
        };
        
        file.on('error', (err) => {
            cleanup();
            reject(err);
        });
        
        // Register finish handler before piping
        file.on('finish', () => {
            file.close();
            console.log(`Image downloaded and extracted to: ${targetPath}`);
            resolve(targetPath);
        });
        
        gunzip.on('error', (err) => {
            cleanup();
            reject(err);
        });
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Validate location header exists
                if (!response.headers.location) {
                    cleanup();
                    reject(new Error('Redirect response missing location header'));
                    return;
                }
                
                // Handle redirect
                https.get(response.headers.location, (redirectResponse) => {
                    // Validate redirect response status
                    if (redirectResponse.statusCode !== 200) {
                        cleanup();
                        reject(new Error(`Failed to download image: HTTP ${redirectResponse.statusCode}`));
                        return;
                    }
                    
                    // Add error handler for redirect response
                    redirectResponse.on('error', (err) => {
                        cleanup();
                        reject(err);
                    });
                    
                    redirectResponse.pipe(gunzip).pipe(file);
                }).on('error', (err) => {
                    cleanup();
                    reject(err);
                });
            } else if (response.statusCode === 200) {
                // Add error handler for response
                response.on('error', (err) => {
                    cleanup();
                    reject(err);
                });
                
                response.pipe(gunzip).pipe(file);
            } else {
                cleanup();
                reject(new Error(`Failed to download image: HTTP ${response.statusCode}`));
            }
        }).on('error', (err) => {
            cleanup();
            reject(err);
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
    
    // Ensure image is available (download if needed)
    let imagePath = null;
    try {
        imagePath = await ensureImageAvailable(browserConfig);
    } catch (error) {
        console.error('Error ensuring image availability:', error);
        // Continue without image (simulation mode)
    }
    
    // Build QEMU command arguments
    const qemuArgs = [
        '-m', ramParam,                          // RAM allocation
        '-vga', 'std',                           // Standard VGA
        '-device', `VGA,vgamem_mb=${vramParam}`, // VRAM allocation
        '-enable-kvm',                           // Enable KVM if available
        '-cpu', 'host',                          // Use host CPU features
        '-smp', '2',                             // 2 CPU cores
        '-display', 'none',                      // No display (headless)
        '-nographic',                            // No graphic output
        '-serial', 'stdio'                       // Serial output to stdio
    ];
    
    // Add disk image if available
    if (imagePath) {
        qemuArgs.push('-hda', imagePath);
        console.log(`Using disk image: ${imagePath}`);
    }
    
    let outputBuffer = '';
    let process = null;
    
    try {
        // For demonstration purposes, we'll simulate QEMU with a echo command
        // In production, you would use: spawn('qemu-system-x86_64', qemuArgs)
        
        // Check if QEMU is available
        const qemuCheck = spawn('which', ['qemu-system-x86_64']);
        
        qemuCheck.on('close', (code) => {
            if (code === 0) {
                // QEMU is available, start it (with or without image)
                process = spawn('qemu-system-x86_64', qemuArgs);
                setupProcessHandlers(process, emulatorId, config);
            } else {
                // QEMU not available, run in simulation mode
                console.log('QEMU not found, running in simulation mode');
                process = simulateQemu(config);
                setupProcessHandlers(process, emulatorId, config);
            }
        });
        
        // Initial output
        outputBuffer = generateStartupMessage(config, browserConfig, imagePath);
        
        // Store emulator instance
        emulators.set(emulatorId, {
            id: emulatorId,
            process: null, // Will be set when process starts
            config,
            browserConfig,
            outputBuffer,
            lastReadPosition: 0, // Track what has been sent to client
            running: true,
            startTime: new Date()
        });
        
        // Set process after a brief delay to allow initialization
        setTimeout(() => {
            const emulator = emulators.get(emulatorId);
            if (emulator) {
                emulator.process = process;
            }
        }, 100);
        
    } catch (error) {
        console.error('Error starting QEMU:', error);
        throw new Error(`Failed to start emulator: ${error.message}`);
    }
    
    return {
        emulatorId,
        output: outputBuffer
    };
}

/**
 * Simulate QEMU for demo purposes when QEMU is not installed
 */
function simulateQemu(config) {
    const { EventEmitter } = require('events');
    const emitter = new EventEmitter();
    
    // Simulate process interface
    const simulatedProcess = {
        stdout: emitter,
        stderr: emitter,
        pid: Math.floor(Math.random() * 90000) + 10000,
        kill: () => {
            emitter.emit('close', 0);
        },
        on: (event, handler) => {
            emitter.on(event, handler);
        }
    };
    
    // Simulate startup messages
    setTimeout(() => {
        emitter.emit('data', Buffer.from('QEMU emulator version 7.0.0\n'));
    }, 500);
    
    setTimeout(() => {
        emitter.emit('data', Buffer.from(`Starting ${config.browser} browser...\n`));
    }, 1000);
    
    setTimeout(() => {
        emitter.emit('data', Buffer.from('Initializing virtual hardware...\n'));
    }, 1500);
    
    setTimeout(() => {
        emitter.emit('data', Buffer.from(`RAM: ${config.ram === 'unlimited' ? '16GB' : config.ram + 'GB'} allocated\n`));
    }, 2000);
    
    setTimeout(() => {
        emitter.emit('data', Buffer.from(`VRAM: ${config.vram}MB allocated\n`));
    }, 2500);
    
    setTimeout(() => {
        emitter.emit('data', Buffer.from('Browser environment ready!\n'));
    }, 3000);
    
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
function generateStartupMessage(config, browserConfig, imagePath) {
    const ram = config.ram === 'unlimited' ? 'Unlimited (16GB)' : `${config.ram} GB`;
    const vram = config.vram === '1024' ? '1 GB' : `${config.vram} MB`;
    const imageInfo = imagePath ? `\nDisk Image: ${path.basename(imagePath)}` : '';
    
    return `
===========================================
  Browser IG - QEMU Emulator
===========================================
Browser: ${browserConfig.name}
Description: ${browserConfig.description}
RAM: ${ram}
VRAM: ${vram}${imageInfo}
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
            output: result.output
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
        uptime: Math.floor((new Date() - emulator.startTime) / 1000)
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
