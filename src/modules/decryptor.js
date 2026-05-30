const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chacha20 = require('chacha20');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { exec } = require('child_process');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

class FiveMDecryptor {
    constructor(outputDir, tempDir) {
        this.outputDir = outputDir;
        this.tempDir = tempDir;

        this.DefaultKey = config.crypto.defaultKey;
        this.HeaderToVerify = config.headers.fxap;
        this.AesKey = config.crypto.aesKey;
        this.LuaHeader = config.headers.lua;
    }

    fileToHex(filePath) {
        return fs.readFileSync(filePath);
    }

    scanForId(buffer) {
        return parseInt(buffer.slice(74, 78).toString('hex'), 16);
    }

    verifyEncrypted(filePath) {
        const buffer = this.fileToHex(filePath);
        return buffer.slice(0, 4).equals(this.HeaderToVerify);
    }

    decryptFile(filePath, key) {
        const buffer = this.fileToHex(filePath);

        if (buffer.slice(0, 4).equals(this.HeaderToVerify)) {
            const iv = buffer.slice(74, 86);
            const encrypted = buffer.slice(86);
            return chacha20.decrypt(key, iv, encrypted);
        }

        return null;
    }

    decryptBuffer(hexData, key, bufferPtr = null, ivPtr = null) {
        if (!hexData) return null;

        let iv = hexData.slice(80, 92);
        let encrypted = hexData.slice(92);

        if (bufferPtr && ivPtr) {
            iv = hexData.slice(ivPtr, ivPtr + 12);
            encrypted = hexData.slice(bufferPtr);
        }

        return chacha20.decrypt(key, iv, encrypted);
    }

    calculateClientKey(grantsClk) {
        const iv = grantsClk.slice(0, 16);
        const encrypted = grantsClk.slice(16);

        const decipher = crypto.createDecipheriv('aes-256-cbc', this.AesKey, iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted;
    }

    async processLuaFile(decryptedBuffer, outputPath, resourceName, file) {
        const tmpPath = path.join(this.tempDir, `${resourceName}/${file}c`);
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
        fs.writeFileSync(tmpPath, decryptedBuffer);

        const finalPath = outputPath;
        fs.mkdirSync(path.dirname(finalPath), { recursive: true });

        const decompilerPath = path.join(config.paths.tools, 'unluac54.jar');

        return new Promise((resolve) => {
            exec(`java -jar "${decompilerPath}" "${tmpPath}" > "${finalPath}"`, (error) => {
                if (error) {
                    const fileName = path.basename(finalPath, path.extname(finalPath));
                    const errorFilePath = path.join(path.dirname(finalPath), `error_${fileName}_ag.txt`);
                    fs.writeFileSync(errorFilePath, error.toString());
                }
                resolve();
            });
        });
    }

    async decryptResourceFile(resourcePath, file, resourceName, decryptKey, grantsClk) {
        const fullPath = path.join(resourcePath, file);
        const outputPath = path.join(this.outputDir, resourceName, file);

        if (!this.verifyEncrypted(fullPath)) {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, this.fileToHex(fullPath));
            return;
        }

        const decryptedFile = this.decryptFile(fullPath, this.DefaultKey);
        if (!decryptedFile) return;

        let decryptedBuffer = this.decryptBuffer(decryptedFile, decryptKey);

        if (!grantsClk) {
            decryptedBuffer = this.decryptBuffer(decryptedFile, decryptKey, 90, 78);
        }

        if (file.toLowerCase().endsWith('.lua')) {
            const isLuaBytecode = decryptedBuffer.toString('hex').startsWith(config.headers.luaheaderhex);

            if (isLuaBytecode) {
                await this.processLuaFile(decryptedBuffer, outputPath, resourceName, file);
            } else {
                const alternativeKey = this.calculateClientKey(grantsClk);
                decryptedBuffer = this.decryptBuffer(decryptedFile, alternativeKey);
                return await this.processLuaFile(decryptedBuffer, outputPath, resourceName, file);
            }
        } else {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            return fs.writeFileSync(outputPath, decryptedBuffer); // 3D MAPS
        }
    }

    getAllFiles(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        return entries.flatMap(entry => {
            const filePath = path.join(dir, entry.name);
            return entry.isDirectory() ? this.getAllFiles(filePath) : [filePath];
        });
    }

    // getDirectories(source) {
    //     return fs.readdirSync(source, { withFileTypes: true })
    //         .filter(dirent => dirent.isDirectory())
    //         .map(dirent => path.join(source, dirent.name));
    // }

    checkBlacklist(resourceID) {
        try {
            const blacklistPath = path.join(__dirname, '..', 'database', 'blacklist.json');
            if (!fs.existsSync(blacklistPath)) return false;

            const blacklist = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
            return blacklist.includes(String(resourceID));
        } catch (error) {
            console.log('Blacklist check error:', error.message);
            return false;
        }
    }

    async validateKey(cfxKey) {
        const isFile = cfxKey.endsWith('txt');
        if (!cfxKey || (!cfxKey.startsWith('cfxk_') && !isFile)) {
            throw new Error('Invalid CFX Key');
        }

        if (isFile) {
            return { success: true, grants_token: fs.readFileSync(cfxKey, 'utf8') };
        }

        let requestConfig = {
            headers: { 'User-Agent': 'CitizenFX/1' },
            timeout: 10000
        };

        if (config.proxy.enabled) {
            const proxyUrl = `http://${config.proxy.auth.username}:${config.proxy.auth.password}@${config.proxy.host}:${config.proxy.port}`;
            const agent = new HttpsProxyAgent(proxyUrl, {
                rejectUnauthorized: true
            });

            requestConfig.httpsAgent = agent;
        }

        const { data, status } = await axios.get(`${config.keymaster.url}/${cfxKey}`, requestConfig);

        if (status !== 200 || !data.success || !data.grants_token) {
            throw new Error('Invalid Keymaster response');
        }

        return data;
    }

    async searchGrantsFromApi(resourceId) {
        try {
            const response = await axios.get(`https://keymaster.allgamers.dev/api/grants/search/${resourceId}`, {
                timeout: 10000
            });

            if (response.status === 200 && response.data && response.data.success) {
                const apiData = response.data.data;
                return {
                    grants: {
                        [apiData.resourceId]: apiData.grant
                    },
                    grants_clk: {
                        [apiData.resourceId]: apiData.grants_clk
                    }
                };
            }
            return null;
        } catch (error) {
            console.log('API search error:', error.message);
            return null;
        }
    }

    async addGrantsToApi(cfxKey) {
        try {
            const response = await axios.post("https://keymaster.allgamers.dev/api/grants", {
                cfxKey: cfxKey
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            if (response.status === 200 && response.data) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.log('API add grants error:', error.message);
            return null;
        }
    }

    async decryptResource(interaction, resourcePath, resourceName, cfxKey = null) {
        const fxapFile = path.join(resourcePath, '.fxap');
        if (!fs.existsSync(fxapFile)) return;

        const fxapBuffer = this.decryptFile(fxapFile, config.crypto.defaultKey);
        if (!fxapBuffer) {
            throw new Error("No buffer?");
            return;
        }

        const resourceId = this.scanForId(fxapBuffer);
        if (!resourceId) {
            throw new Error("Missing .fxap file");
            return;
        }

        if (this.checkBlacklist(resourceId)) {
            throw new Error("You can't decrypt this resource");
            return;
        }

        console.log("Resource ID: " + resourceId);
        try {
            let grantsData = null;

            grantsData = await this.searchGrantsFromApi(resourceId);

            if (!grantsData) {
                console.log(`No grants found for resource ID ${resourceId} in API`);

                if (!cfxKey) {
                    throw new Error('CFX key is required to decrypt this resource. Please add a CFX key to the command.');
                    return;
                }

                const keyData = await this.validateKey(cfxKey);
                if (!keyData) {
                    throw new Error('Failed to validate cfx key');
                    return;
                }
                const payload = JSON.parse(Buffer.from(keyData.grants_token.split('.')[1], 'base64').toString('utf-8'));

                if (!payload) {
                    throw new Error('Failed to parse payload');
                    return;
                }

                grantsData = payload;

                console.log("Adding new grants to API...");
                await this.addGrantsToApi(cfxKey);
            }

            // don't cry about it, it works :)
            let decryptKey = null;
            let grantsClk = null;

            if (grantsData.grants[resourceId]) {
                decryptKey = Buffer.from(grantsData.grants[resourceId], 'hex');
            }

            if (grantsData.grants_clk[resourceId]) {
                grantsClk = Buffer.from(grantsData.grants_clk[resourceId], 'hex');
            }

            const files = this.getAllFiles(resourcePath);

            const tasks = files.filter(f => !f.endsWith('.fxap')).map(f => {
                const relativePath = path.relative(resourcePath, f);
                return this.decryptResourceFile(resourcePath, relativePath, resourceName, decryptKey, grantsClk);
            });

            await Promise.all(tasks);

        } catch (error) {
            console.log('Keymaster error:', error.message);
            throw error;
        }
    }
}

module.exports = FiveMDecryptor;