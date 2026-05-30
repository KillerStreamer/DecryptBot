const express = require('express');
const multer = require('multer');
const path = require('path');
const { validateApiKey } = require('./auth');
const DecryptAPI = require('./decrypt-api');
const config = require('../../config');

class ApiServer {
  constructor() {
    this.app = express();
    this.decryptAPI = new DecryptAPI();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: config.api.maxFileSize
      }
    });
  }

  setupRoutes() {
    this.app.post('/api/decrypt', this.upload.single('file'), async (req, res) => {
      try {
        const apiKey = req.headers['authorization']?.replace('Bearer ', '');
        const cfxKey = req.body.license;
        const userIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress || req.socket.remoteAddress || req.ip;

        const keyData = validateApiKey(apiKey, userIP);
        if (!keyData) {
          return res.status(401).json({ success: false, error: 'invalid_api_key' });
        }


        if (!req.file) {
          return res.status(400).json({ success: false, error: 'missing_file' });
        }

        if (!cfxKey) {
          return res.status(400).json({ success: false, error: 'missing_license' });
        }

        const result = await this.decryptAPI.startDecryption(req.file, cfxKey, apiKey, userIP);
        res.json({
          success: true,
          sessionId: result.sessionId,
          status: result.status
        });

      } catch (error) {
        console.error('Decrypt API error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/download/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const apiKey = req.headers['authorization']?.replace('Bearer ', '');
        const userIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress || req.socket.remoteAddress || req.ip;

        const keyData = validateApiKey(apiKey, userIP);
        if (!keyData) {
          return res.status(401).json({ success: false, error: 'invalid_api_key' });
        }

        const status = this.decryptAPI.getSessionStatus(sessionId);
        
        if (!status) {
          return res.status(404).json({ success: false, error: 'session_not_found' });
        }

        if (status.status === 'processing') {
          return res.status(202).json({ success: false, error: 'still_processing' });
        }

        if (status.status === 'failed') {
          return res.status(422).json({ success: false, error: 'decryption_failed' });
        }

        if (status.status !== 'completed') {
          return res.status(400).json({ success: false, error: 'invalid_status' });
        }

        if (!status.zipPath || !require('fs').existsSync(status.zipPath)) {
          return res.status(404).json({ success: false, error: 'file_not_found' });
        }

        res.download(status.zipPath, `decrypted_${sessionId}.zip`, (err) => {
          if (err) {
            console.error('Download error:', err);
            res.status(500).json({ success: false, error: 'download_failed' });
          } else {
            if (global.discordLogger) {
              const fields = [
                { name: 'API Key', value: apiKey, inline: false },
                { name: 'Session ID', value: sessionId, inline: true },
                { name: 'IP', value: userIP || 'Unknown', inline: true },
                { name: 'Time', value: new Date().toLocaleString(), inline: true }
              ];
              global.discordLogger.sendLog('API Download Success', '', 0x0099ff, fields);
            }

            setTimeout(() => {
              this.decryptAPI.cleanupSession(sessionId);
            }, 1000);
          }
        });

      } catch (error) {
        console.error('Download API error:', error);
        res.status(500).json({ success: false, error: 'internal_error' });
      }
    });

    this.app.use((error, req, res, next) => {
      console.error('API Server error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(config.server.apiPort, '127.0.0.1', () => {
        console.log(`API server running on port ${config.server.apiPort} (localhost only)`);
        resolve();
    });
  });
}

  async stop() {
    if (this.server) {
      await this.decryptAPI.shutdown();
      this.server.close();
    }
  }
}

module.exports = ApiServer;
