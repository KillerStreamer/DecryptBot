const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'database', 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving data:', error);
    return false;
  }
}

function getUserCredits(userId) {
  const data = loadData();
  return data[userId]?.credits || 0;
}

function getUserSubscription(userId) {
  const data = loadData();
  return data[userId]?.subscription || null;
}

function hasValidSubscription(userId) {
  const data = loadData();
  const user = data[userId];
  
  if (!user || !user.subscription || !user.subscription.isActive) {
    return false;
  }
  
  const sub = user.subscription;
  
  if (sub.type === 'lifetime') {
    return true;
  }
  
  if (sub.expiresAt) {
    const now = new Date();
    const expiryDate = new Date(sub.expiresAt);
    
    if (now > expiryDate) {
      sub.isActive = false;
      saveData(data);
      return false;
    }
    
    return true;
  }
  
  return false;
}

function setSubscription(userId, type, duration = 1) {
  const data = loadData();
  
  if (!data[userId]) {
    data[userId] = { credits: 0 };
  }
  
  let expiresAt = null;
  
  if (type === 'monthly') {
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + duration);
    expiresAt = expiryDate.toISOString();
  } else if (type === 'weekly') {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (7 * duration));
    expiresAt = expiryDate.toISOString();
  }
  
  data[userId].subscription = {
    type,
    expiresAt,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  
  return saveData(data);
}

function removeSubscription(userId) {
  const data = loadData();
  
  if (data[userId] && data[userId].subscription) {
    data[userId].subscription.isActive = false;
    return saveData(data);
  }
  
  return false;
}

function canUserDecrypt(userId) {
  return hasEnoughCredits(userId, 1) || hasValidSubscription(userId);
}

function addCredits(userId, amount) {
  const data = loadData();
  if (!data[userId]) {
    data[userId] = { credits: 0 };
  }
  data[userId].credits += amount;
  return saveData(data);
}

function removeCredits(userId, amount) {
  const data = loadData();
  if (!data[userId]) {
    data[userId] = { credits: 0 };
  }
  
  if (data[userId].credits < amount) {
    return false;
  }
  
  data[userId].credits -= amount;
  return saveData(data);
}

function hasEnoughCredits(userId, required = 1) {
  return getUserCredits(userId) >= required;
}

function setCredits(userId, amount) {
  const data = loadData();
  if (!data[userId]) {
    data[userId] = {};
  }
  data[userId].credits = amount;
  return saveData(data);
}

module.exports = {
  getUserCredits,
  addCredits,
  removeCredits,
  hasEnoughCredits,
  setCredits,
  getUserSubscription,
  hasValidSubscription,
  setSubscription,
  removeSubscription,
  canUserDecrypt
};
