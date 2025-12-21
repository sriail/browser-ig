/**
 * Script to download and set up noVNC for the browser-ig project.
 * This downloads the noVNC source from GitHub and copies the core files
 * to the public/novnc directory for browser use.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NOVNC_VERSION = '1.6.0';
const NOVNC_URL = `https://github.com/novnc/noVNC/archive/refs/tags/v${NOVNC_VERSION}.zip`;
const TEMP_DIR = path.join(__dirname, '..', '.novnc-temp');
const DEST_DIR = path.join(__dirname, '..', 'public', 'novnc');

/**
 * Download a file from URL
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        
        const request = https.get(url, (response) => {
            // Follow redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(destPath);
                downloadFile(response.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            if (response.statusCode !== 200) {
                file.close();
                reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                resolve();
            });
        });
        
        request.on('error', (err) => {
            file.close();
            fs.unlinkSync(destPath);
            reject(err);
        });
    });
}

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Clean up temporary files
 */
function cleanup() {
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
}

async function main() {
    console.log('Setting up noVNC...');
    
    // Check if noVNC is already set up
    if (fs.existsSync(path.join(DEST_DIR, 'rfb.js'))) {
        console.log('noVNC already set up in public/novnc');
        return;
    }
    
    try {
        // Create temp directory
        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }
        
        const zipPath = path.join(TEMP_DIR, 'novnc.zip');
        
        // Download noVNC
        console.log(`Downloading noVNC v${NOVNC_VERSION}...`);
        await downloadFile(NOVNC_URL, zipPath);
        
        // Extract - try unzip first, fall back to error message
        console.log('Extracting noVNC...');
        try {
            execSync(`unzip -o "${zipPath}" -d "${TEMP_DIR}"`, { stdio: 'pipe' });
        } catch (unzipError) {
            // Check if unzip is available
            try {
                execSync('which unzip', { stdio: 'pipe' });
                // unzip is available but failed for another reason
                throw new Error(`Failed to extract noVNC: ${unzipError.message}`);
            } catch (whichError) {
                throw new Error('unzip utility not found. Please install unzip: sudo apt-get install unzip (Linux) or brew install unzip (macOS)');
            }
        }
        
        // Copy core files to public/novnc
        const extractedDir = path.join(TEMP_DIR, `noVNC-${NOVNC_VERSION}`);
        const coreDir = path.join(extractedDir, 'core');
        const vendorDir = path.join(extractedDir, 'vendor');
        
        console.log('Copying noVNC core files...');
        if (!fs.existsSync(DEST_DIR)) {
            fs.mkdirSync(DEST_DIR, { recursive: true });
        }
        
        // Copy core files
        copyDir(coreDir, DEST_DIR);
        
        // Copy vendor files
        copyDir(vendorDir, path.join(DEST_DIR, 'vendor'));
        
        // Fix vendor paths in inflator.js and deflator.js
        // The original paths use "../vendor/pako" but since we copied vendor inside novnc, we need "./vendor/pako"
        console.log('Fixing vendor paths...');
        const filesToFix = ['inflator.js', 'deflator.js'];
        for (const filename of filesToFix) {
            const filePath = path.join(DEST_DIR, filename);
            if (fs.existsSync(filePath)) {
                let content = fs.readFileSync(filePath, 'utf8');
                content = content.replace(/"\.\.\/vendor\/pako/g, '"./vendor/pako');
                fs.writeFileSync(filePath, content, 'utf8');
            }
        }
        
        console.log('noVNC setup complete!');
        
    } catch (error) {
        console.error('Error setting up noVNC:', error.message);
        process.exit(1);
    } finally {
        cleanup();
    }
}

main();
