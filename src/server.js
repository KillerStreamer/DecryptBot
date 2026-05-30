const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 PrimeLeaks Decrypt Bot - Web Server
// Website: https://primeleaks.cc
// Discord: https://discord.com/invite/wgnsTu24bg
// ═══════════════════════════════════════════════════════════════════════════

const app = express();

app.use(express.static('public'));

const downloadedFiles = new Set();

app.get('/redir', (req, res) => {
    res.redirect(config.discord.invite);
})

app.get('/download/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
        console.log(`Invalid session ID format: ${sessionId}`);
        return res.status(400).json({
            error: 'Invalid session ID format',
            code: 'INVALID_SESSION_ID'
        });
    }

    if (sessionId.includes('<') || sessionId.includes('>')) {
        console.log(`Invalid session ID format: ${sessionId}`);
        return res.status(400).json({
            error: 'Invalid session ID format',
            code: 'INVALID_SESSION_ID'
        });
    }

    const sessionDir = path.join(__dirname, '..', 'sessions', sessionId);
    const filePath = path.join(sessionDir, 'Output.zip');

    console.log(`Download request for session: ${sessionId}`);
    console.log(`Session directory: ${sessionDir}`);
    console.log(`File path: ${filePath}`);

    if (downloadedFiles.has(sessionId)) {
        console.log(`Session ${sessionId} already downloaded`);
        return res.status(410).json({
            error: 'File already downloaded and removed',
            code: 'ALREADY_DOWNLOADED'
        });
    }

    if (!fs.existsSync(sessionDir)) {
        console.log(`Session directory not found: ${sessionDir}`);
        return res.status(404).json({
            error: 'Session not found or expired',
            code: 'SESSION_NOT_FOUND'
        });
    }

    if (!fs.existsSync(filePath)) {
        console.log(`Output file not found: ${filePath}`);
        return res.status(404).json({
            error: 'File not ready or processing failed',
            code: 'FILE_NOT_READY'
        });
    }

    try {
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            console.log(`Empty file detected: ${filePath}`);
            return res.status(422).json({
                error: 'File is empty or corrupted',
                code: 'EMPTY_FILE'
            });
        }
        console.log(`File size: ${stats.size} bytes`);
    } catch (error) {
        console.error(`Error checking file stats: ${error.message}`);
        return res.status(500).json({
            error: 'File system error',
            code: 'FILE_SYSTEM_ERROR'
        });
    }

    const filename = `decrypted_${sessionId}.zip`;
    console.log(`Starting download: ${filename}`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    res.download(filePath, filename, (err) => {
        if (err) {
            console.error(`Download error for session ${sessionId}:`, err);
            if (!res.headersSent) {
                return res.status(500).json({
                    error: 'Download failed',
                    code: 'DOWNLOAD_ERROR',
                    details: err.message
                });
            }
        } else {
            console.log(`Download completed successfully for session: ${sessionId}`);
            downloadedFiles.add(sessionId);

            setTimeout(() => {
                try {
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        console.log(`Session ${sessionId} cleaned up after download`);
                    }
                    downloadedFiles.delete(sessionId);
                } catch (cleanupError) {
                    console.error(`Cleanup error for session ${sessionId}:`, cleanupError);
                }
            }, 5000);
        }
    });
});

app.get('/status/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const sessionDir = path.join(__dirname, '..', 'sessions', sessionId);
    const filePath = path.join(sessionDir, 'Output.zip');

    console.log(`Status check for session: ${sessionId}`);
    console.log(`Session dir exists: ${fs.existsSync(sessionDir)}`);
    console.log(`File exists: ${fs.existsSync(filePath)}`);
    console.log(`Downloaded files:`, Array.from(downloadedFiles));

    if (downloadedFiles.has(sessionId)) {
        console.log(`Session ${sessionId} marked as downloaded`);
        return res.json({ status: 'downloaded', available: false });
    }

    if (!fs.existsSync(sessionDir)) {
        console.log(`Session directory not found: ${sessionDir}`);
        return res.json({ status: 'not_found', available: false });
    }

    if (fs.existsSync(filePath)) {
        try {
            const stats = fs.statSync(filePath);
            console.log(`File size: ${stats.size} bytes`);

            if (stats.size > 0) {
                console.log(`Session ${sessionId} ready for download`);
                return res.json({ status: 'ready', available: true });
            } else {
                console.log(`File exists but is empty, still processing`);
                return res.json({ status: 'processing', available: false });
            }
        } catch (error) {
            console.error(`Error checking file stats:`, error);
            return res.json({ status: 'processing', available: false });
        }
    }

    try {
        const dirContents = fs.readdirSync(sessionDir);
        console.log(`Session directory contents:`, dirContents);

        if (dirContents.length > 0) {
            console.log(`Session ${sessionId} is processing`);
            return res.json({ status: 'processing', available: false });
        }
    } catch (error) {
        console.error(`Error reading session directory:`, error);
    }

    console.log(`Session ${sessionId} not found or failed`);
    return res.json({ status: 'not_found', available: false });
});

app.use((req, res) => {
    res.status(404).send(`
    <!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>404 - Page Not Found | AG</title>
        <link rel="shortcut icon" href="ico.webp" type="image/x-icon">
        <link rel="stylesheet" href="/style_23.css">
    </head>
    <body>
        <div class="container">
            <div class="card">
                <div class="card-header text-center">
                    <h1 class="card-title gradient-text">404 - Page Not Found</h1>
                    <p class="card-description">The requested page could not be found</p>
                </div>
                <div class="card-content text-center">
                    <p style="margin-bottom: 2rem; color: hsl(var(--muted-foreground));">
                        The page you're looking for doesn't exist or has been moved.
                    </p>
                    <a href="/" class="button button-primary">
                        Go to Home
                    </a>
                </div>
            </div>
        </div>
        <footer style="position: fixed; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 1rem; color: hsl(var(--muted-foreground)); font-size: 0.875rem; background: hsl(var(--background)); border-top: 1px solid hsl(var(--border));">
            <a href="https://primeleaks.cc" target="_blank" style="color: hsl(var(--muted-foreground)); text-decoration: none; display: flex; align-items: center; transition: color 0.2s;" onmouseover="this.style.color='hsl(var(--foreground))'" onmouseout="this.style.color='hsl(var(--muted-foreground))'">
                🔥 PrimeLeaks
            </a>
            <a href="https://discord.com/invite/wgnsTu24bg" target="_blank" style="color: hsl(var(--muted-foreground)); text-decoration: none; display: flex; align-items: center; transition: color 0.2s;" onmouseover="this.style.color='hsl(var(--foreground))'" onmouseout="this.style.color='hsl(var(--muted-foreground))'">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 0.5rem;">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0001 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                </svg>
                Discord
            </a>
            <div style="width: 20px;"></div>
        </footer>
    </body>
    </html>
  `);
});

function startServer() {
    return new Promise((resolve) => {
        const server = app.listen(config.server.port, '0.0.0.0', () => {
            console.log('╔═══════════════════════════════════════════════════════════════╗');
            console.log('║              🌐 Web Server Started Successfully            ║');
            console.log('╚═══════════════════════════════════════════════════════════════╝');
            console.log(`✅ Running on: ${config.appurl}`);
            console.log(`📡 Port: ${config.server.port}`);
            console.log(`🔓 Access: Public (0.0.0.0)`);
            console.log(`📦 Sessions ready for download!\n`);
            console.log('🔥 Powered by PrimeLeaks - https://primeleaks.cc\n');
            resolve(server);
        });
    });
}

module.exports = { startServer, app };