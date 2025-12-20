const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, 'vm-images');

// Ensure vm-images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// VNC port management - start from 5900
let nextVncPort = 5900;

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
        image: 'midori-browser.img',
        compressedImage: 'midori-browser.img.gz',
        description: 'Lightweight web browser',
        downloadUrl: null // Can be set to a URL for downloading the image
    },
    waterfox: {
        name: 'Waterfox',
        image: 'waterfox-browser.img',
        compressedImage: 'waterfox-browser.img.gz',
        description: 'Privacy-focused Firefox fork',
        downloadUrl: null
    },
    brave: {
        name: 'Brave',
        image: 'brave-browser.img',
        compressedImage: 'brave-browser.img.gz',
        description: 'Privacy-focused browser with ad blocking',
        downloadUrl: null
    }
};

/**
 * Decompress a .img.gz file to .img
 * @param {string} gzPath - Path to the compressed .img.gz file
 * @param {string} imgPath - Path for the decompressed .img file
 * @returns {Promise<void>}
 */
async function decompressImage(gzPath, imgPath) {
    return new Promise((resolve, reject) => {
        console.log(`Decompressing ${gzPath} to ${imgPath}...`);
        
        const gunzip = zlib.createGunzip();
        const source = fs.createReadStream(gzPath);
        const destination = fs.createWriteStream(imgPath);
        
        // Helper function to clean up streams on error
        const cleanup = (err) => {
            source.destroy();
            gunzip.destroy();
            destination.destroy();
            // Remove partial output file on error
            fs.unlink(imgPath, () => {}); // Ignore unlink errors
            reject(err);
        };
        
        source.pipe(gunzip).pipe(destination);
        
        destination.on('finish', () => {
            console.log(`Successfully decompressed ${gzPath}`);
            resolve();
        });
        
        destination.on('error', (err) => {
            console.error(`Error writing to ${imgPath}:`, err);
            cleanup(err);
        });
        
        source.on('error', (err) => {
            console.error(`Error reading ${gzPath}:`, err);
            cleanup(err);
        });
        
        gunzip.on('error', (err) => {
            console.error(`Gunzip error for ${gzPath}:`, err);
            cleanup(err);
        });
    });
}

/**
 * Get or prepare the disk image for a browser
 * @param {string} browser - The browser name
 * @returns {Promise<{imagePath: string|null, error: string|null}>}
 */
async function getOrPrepareImage(browser) {
    const config = browserConfigs[browser];
    if (!config) {
        return { imagePath: null, error: 'Invalid browser selection' };
    }
    
    const imgPath = path.join(IMAGES_DIR, config.image);
    const gzPath = path.join(IMAGES_DIR, config.compressedImage);
    
    // Check if decompressed image already exists
    if (fs.existsSync(imgPath)) {
        console.log(`Image ${imgPath} already exists`);
        return { imagePath: imgPath, error: null };
    }
    
    // Check if compressed image exists and decompress it
    if (fs.existsSync(gzPath)) {
        try {
            await decompressImage(gzPath, imgPath);
            return { imagePath: imgPath, error: null };
        } catch (err) {
            return { imagePath: null, error: `Failed to decompress image: ${err.message}` };
        }
    }
    
    // No image available - return null with info message
    // In simulation mode, this is expected
    console.log(`No disk image found for ${browser}. Running in simulation mode.`);
    return { imagePath: null, error: null };
}

/**
 * Get the next available VNC port
 */
function getNextVncPort() {
    const port = nextVncPort;
    nextVncPort++;
    return port;
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
 * @param {Object} config - Configuration object with browser, ram, vram
 * @param {string|null} imagePath - Path to the disk image (null for simulation mode)
 */
async function startQemuEmulator(config, imagePath = null) {
    const emulatorId = uuidv4();
    const ramParam = getRamParameter(config.ram);
    const vramParam = getVramParameter(config.vram);
    const browserConfig = browserConfigs[config.browser];
    const vncPort = getNextVncPort();
    const vncDisplay = vncPort - 5900; // VNC display number (0 = 5900, 1 = 5901, etc.)
    
    // Build disk arguments separately for clarity
    const diskArgs = imagePath ? ['-hda', imagePath] : [];
    
    // Build QEMU command arguments with VNC display support
    const qemuArgs = [
        ...diskArgs,                             // Disk image (if available)
        '-m', ramParam,                          // RAM allocation
        '-vga', 'std',                           // Standard VGA
        '-device', `VGA,vgamem_mb=${vramParam}`, // VRAM allocation
        '-cpu', 'max',                           // Use max CPU features (fallback for non-KVM)
        '-smp', '2',                             // 2 CPU cores
        '-vnc', `:${vncDisplay}`,                // VNC display on calculated port
        '-monitor', 'stdio'                      // QEMU monitor on stdio
    ];
    
    let outputBuffer = '';
    let process = null;
    
    // Initial output
    outputBuffer = generateStartupMessage(config, browserConfig, vncPort, imagePath);
    
    // Store emulator instance
    emulators.set(emulatorId, {
        id: emulatorId,
        process: null, // Will be set when process starts
        config,
        browserConfig,
        outputBuffer,
        lastReadPosition: 0, // Track what has been sent to client
        running: true,
        startTime: new Date(),
        vncPort: vncPort,
        imagePath: imagePath,
        simulationMode: false
    });
    
    try {
        // Check if QEMU is available
        const qemuAvailable = await new Promise((resolve) => {
            const qemuCheck = spawn('which', ['qemu-system-x86_64']);
            qemuCheck.on('close', (code) => resolve(code === 0));
            qemuCheck.on('error', () => resolve(false));
        });
        
        const emulator = emulators.get(emulatorId);
        
        if (qemuAvailable && imagePath) {
            // QEMU is available and we have an image, start it
            console.log(`Starting QEMU with VNC on port ${vncPort}`);
            process = spawn('qemu-system-x86_64', qemuArgs);
            setupProcessHandlers(process, emulatorId, config);
            emulator.process = process;
        } else {
            // QEMU not available or no image, run in simulation mode
            console.log('Running in simulation mode (QEMU not found or no disk image)');
            emulator.simulationMode = true;
            process = simulateQemu(config, vncPort, imagePath);
            setupProcessHandlers(process, emulatorId, config);
            emulator.process = process;
        }
        
    } catch (error) {
        console.error('Error starting QEMU:', error);
        throw new Error(`Failed to start emulator: ${error.message}`);
    }
    
    return {
        emulatorId,
        output: outputBuffer,
        vncPort: vncPort,
        simulationMode: !imagePath
    };
}

/**
 * Simulate QEMU for demo purposes when QEMU is not installed
 */
function simulateQemu(config, vncPort, imagePath) {
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
        stdoutEmitter.emit('data', Buffer.from('QEMU emulator version 8.0.0 (Simulation Mode)\n'));
    }, 500);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from(`Starting ${config.browser} browser VM...\n`));
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
        stdoutEmitter.emit('data', Buffer.from(`VNC Server: listening on port ${vncPort}\n`));
    }, 3000);
    
    if (imagePath) {
        setTimeout(() => {
            stdoutEmitter.emit('data', Buffer.from(`Disk Image: ${imagePath}\n`));
        }, 3500);
        
        setTimeout(() => {
            stdoutEmitter.emit('data', Buffer.from('Booting from disk image...\n'));
        }, 4000);
    } else {
        setTimeout(() => {
            stdoutEmitter.emit('data', Buffer.from('No disk image - running in demo mode.\n'));
        }, 3500);
        
        setTimeout(() => {
            stdoutEmitter.emit('data', Buffer.from('To use a real VM, place your .img.gz file in the vm-images folder.\n'));
        }, 4000);
    }
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from('VM display ready! View the VM window to see the graphical output.\n'));
    }, 4500);
    
    setTimeout(() => {
        stdoutEmitter.emit('data', Buffer.from('Browser environment ready!\n'));
    }, 5000);
    
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
function generateStartupMessage(config, browserConfig, vncPort, imagePath) {
    const ram = config.ram === 'unlimited' ? 'Unlimited (16GB)' : `${config.ram} GB`;
    const vram = config.vram === '1024' ? '1 GB' : `${config.vram} MB`;
    const imageStatus = imagePath ? `Loaded: ${path.basename(imagePath)}` : 'None (Simulation Mode)';
    
    return `
===========================================
  Browser IG - QEMU Emulator
===========================================
Browser: ${browserConfig.name}
Description: ${browserConfig.description}
RAM: ${ram}
VRAM: ${vram}
VNC Port: ${vncPort}
Disk Image: ${imageStatus}
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
        
        // Get or prepare the disk image (decompress if needed)
        const { imagePath, error: imageError } = await getOrPrepareImage(browser);
        
        if (imageError) {
            return res.status(500).json({ error: imageError });
        }
        
        // Start the emulator
        const result = await startQemuEmulator({ browser, ram, vram }, imagePath);
        
        res.json({
            success: true,
            emulatorId: result.emulatorId,
            output: result.output,
            vncPort: result.vncPort,
            simulationMode: result.simulationMode
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
        simulationMode: emulator.simulationMode
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
        uptime: Math.floor((new Date() - e.startTime) / 1000),
        vncPort: e.vncPort,
        simulationMode: e.simulationMode
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
