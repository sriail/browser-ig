const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active emulator instances
const emulators = new Map();

// Browser configurations
const browserConfigs = {
    midori: {
        name: 'Midori',
        image: 'midori-browser.img',
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
function startQemuEmulator(config) {
    const emulatorId = uuidv4();
    const ramParam = getRamParameter(config.ram);
    const vramParam = getVramParameter(config.vram);
    const browserConfig = browserConfigs[config.browser];
    
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
    
    // Add disk image if it exists (for demo, we'll simulate without actual image)
    // In production, you would add: ['-hda', path.to.disk.image]
    
    let outputBuffer = '';
    let process = null;
    
    try {
        // For demonstration purposes, we'll simulate QEMU with a echo command
        // In production, you would use: spawn('qemu-system-x86_64', qemuArgs)
        
        // Check if QEMU is available
        const qemuCheck = spawn('which', ['qemu-system-x86_64']);
        
        qemuCheck.on('close', (code) => {
            if (code === 0) {
                // QEMU is available, start it
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
        outputBuffer = generateStartupMessage(config, browserConfig);
        
        // Store emulator instance
        emulators.set(emulatorId, {
            id: emulatorId,
            process: null, // Will be set when process starts
            config,
            browserConfig,
            outputBuffer,
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
        console.log(`[${config.browser}] ${output}`);
    });
    
    process.stderr?.on('data', (data) => {
        const output = data.toString();
        emulator.outputBuffer += `ERROR: ${output}`;
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
function generateStartupMessage(config, browserConfig) {
    const ram = config.ram === 'unlimited' ? 'Unlimited (16GB)' : `${config.ram} GB`;
    const vram = config.vram === '1024' ? '1 GB' : `${config.vram} MB`;
    
    return `
===========================================
  Browser IG - QEMU Emulator
===========================================
Browser: ${browserConfig.name}
Description: ${browserConfig.description}
RAM: ${ram}
VRAM: ${vram}
===========================================

Initializing emulator...
`;
}

// API Routes

/**
 * Start emulator endpoint
 */
app.post('/api/start-emulator', (req, res) => {
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
        const result = startQemuEmulator({ browser, ram, vram });
        
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
    const output = emulator.outputBuffer;
    emulator.outputBuffer = ''; // Clear buffer after reading
    
    res.json({
        running: emulator.running,
        output: output,
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

// Serve index.html for root
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
