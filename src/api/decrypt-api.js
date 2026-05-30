const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FiveMDecryptor = require('../modules/decryptor');
const { ensureEmptyDir, downloadTo, extractZipTo, findResourceDirs, dirFileCount, zipDirectory } = require('../modules/utils');
const { createBackup } = require('../modules/backup');
const config = require('../../config');

class DecryptAPI {
    constructor() {
        this.activeSessions = new Map();
    }

    async startDecryption(file, cfxKey, apiKey, userIP = null) {

        const sessionId = uuidv4();

        const sessionData = {
            sessionId,
            status: 'processing',
            apiKey,
            startTime: Date.now(),
            file: file.originalname,
            userIP,
            cfxKey
        };

        this.activeSessions.set(sessionId, sessionData);

        this.processDecryption(sessionId, file, cfxKey, apiKey, userIP)
            .then(async(result) => {
                this.activeSessions.set(sessionId, {
                    ...this.activeSessions.get(sessionId),
                    status: 'completed',
                    zipPath: result.zipPath,
                    completedAt: Date.now()
                });

                if (global.discordLogger) {
                    const fields = [
                        { name: 'API Key', value: apiKey, inline: false },
                        { name: 'License Key', value: cfxKey, inline: false },
                        { name: 'File', value: file.originalname, inline: true },
                        { name: 'Session ID', value: sessionId, inline: true },
                        { name: 'IP', value: userIP || 'Unknown', inline: true },
                        { name: 'Time', value: new Date().toLocaleString(), inline: true }
                    ];
                    await global.discordLogger.sendLog('API Decryption Success', '', 0x00ff00, fields);
                }

                setTimeout(() => {
                    this.cleanupSession(sessionId);
                }, 30 * 60 * 1000);
            })
            .catch(async(error) => {
                console.error(`Session ${sessionId} failed:`, error);
                this.activeSessions.set(sessionId, {
                    ...this.activeSessions.get(sessionId),
                    status: 'failed',
                    error: error.message,
                    failedAt: Date.now()
                });

                if (global.discordLogger) {
                    const fields = [
                        { name: 'API Key', value: apiKey, inline: false },
                        { name: 'License Key', value: cfxKey, inline: false },
                        { name: 'File', value: file.originalname, inline: true },
                        { name: 'Session ID', value: sessionId, inline: true },
                        { name: 'IP', value: userIP || 'Unknown', inline: true },
                        { name: 'Time', value: new Date().toLocaleString(), inline: true },
                        { name: 'Error', value: error.message || error.toString(), inline: false }
                    ];
                    await global.discordLogger.sendLog('API Decryption Failed', '', 0xff0000, fields);
                }
            });

        return {
            sessionId,
            status: 'processing'
        };
    }

    async processDecryption(sessionId, file, cfxKey, apiKey, userIP) {
        const sessionDir = path.join(__dirname, '..', '..', 'sessions', sessionId);
        const uploadsDir = path.join(sessionDir, 'Uploads');
        const resourcesDir = path.join(sessionDir, 'Resources');
        const outputDir = path.join(sessionDir, 'Output');
        const tempDir = path.join(sessionDir, 'TempCompiled');

        try {
            ensureEmptyDir(sessionDir);
            ensureEmptyDir(uploadsDir);
            ensureEmptyDir(resourcesDir);
            ensureEmptyDir(outputDir);
            ensureEmptyDir(tempDir);

            const uploadedPath = path.join(uploadsDir, file.originalname);
            if (file.buffer) {
                fs.writeFileSync(uploadedPath, file.buffer);
            } else if (file.url) {
                await downloadTo(file.url, uploadedPath);
            } else {
                throw new Error('No file data provided');
            }

            const ext = path.extname(uploadedPath).toLowerCase();
            if (ext === '.zip') {
                extractZipTo(resourcesDir, uploadedPath);
            } else if (ext === '.fxap') {
                const name = path.basename(uploadedPath, ext);
                const target = path.join(resourcesDir, name);
                fs.mkdirSync(target, { recursive: true });
                fs.copyFileSync(uploadedPath, path.join(target, '.fxap'));
            } else {
                throw new Error('Unsupported file type');
            }

            const resourceDirs = findResourceDirs(resourcesDir);
            if (resourceDirs.length === 0) {
                throw new Error('No resources found in the uploaded file');
            }

            const decryptor = new FiveMDecryptor(outputDir, tempDir);

            for (const resourceDir of resourceDirs) {
                const resourceName = path.basename(resourceDir);
                await decryptor.decryptResource(null, resourceDir, resourceName, cfxKey);
            }

            const zipPath = path.join(sessionDir, 'Output.zip');
            await zipDirectory(outputDir, zipPath);

            await createBackup(sessionId, `API_${apiKey.substring(0, 8)}`, file.originalname, outputDir, cfxKey, userIP, true);

            return { zipPath };
        } catch (error) {
            console.error(`Decryption failed for session ${sessionId}:`, error);
            throw error;
        }
    }

    getSessionStatus(sessionId) {
        return this.activeSessions.get(sessionId) || null;
    }

    cleanupSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            this.activeSessions.delete(sessionId);

            const sessionDir = path.join(__dirname, '..', '..', 'sessions', sessionId);
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
        }
    }

    async shutdown() {
        for (const sessionId of this.activeSessions.keys()) {
            this.cleanupSession(sessionId);
        }
        this.activeSessions.clear();
    }
}

module.exports = DecryptAPI;