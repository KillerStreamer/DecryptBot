const crypto = require('crypto');
const fs = require('fs');
const path = require('path');


const DB_PATH = path.join(__dirname, '..', 'database', 'api-keys.json');

function loadApiKeys() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { keys: {} };
  }
}

function saveApiKeys(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function validateApiKey(apiKey, userIP = null) {
  const db = loadApiKeys();
  const keyData = db.keys[apiKey];
  
  if (!keyData) {
    return null;
  }
  
  if (!keyData.isActive) {
    return null;
  }
  
  if (keyData.subscriptionType === 'monthly' && keyData.expiresAt) {
    const now = new Date();
    const expiryDate = new Date(keyData.expiresAt);
    
    if (now > expiryDate) {
      keyData.isActive = false;
      saveApiKeys(db);
      return null;
    }
  }
  
  return keyData;
}

function updateKeyUsage(apiKey) {
  const db = loadApiKeys();
  
  if (db.keys[apiKey]) {
    db.keys[apiKey].lastUsed = new Date().toISOString();
    saveApiKeys(db);
    return true;
  }
  return false;
}

function createApiKey(name, subscriptionType = 'monthly', monthsValid = 1) {
  const apiKey = 'ag_fxap_' + crypto.randomBytes(12).toString('hex');
  const db = loadApiKeys();
  
  let expiresAt = null;
  if (subscriptionType === 'monthly') {
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + monthsValid);
    expiresAt = expiryDate.toISOString();
  }
  
  db.keys[apiKey] = {
    name,
    subscriptionType,
    expiresAt,
    lastUsed: null,
    requestCount: 0,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  
  saveApiKeys(db);
  
  
  return apiKey;
}

module.exports = {
  validateApiKey,
  updateKeyUsage,
  createApiKey
};
