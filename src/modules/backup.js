const fs = require('fs');
const path = require('path');


function createBackup(sessionId, userName, originalFileName, outputDir, cfxKey, userIP = null, isApiRequest = false) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedUserName = userName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedFileName = path.parse(originalFileName).name.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    const backupDirName = `${sanitizedUserName}_${sessionId}_${sanitizedFileName}_${timestamp}`;
    const backupRootPath = isApiRequest ? 
      path.join(__dirname, '..', '..', 'api_backup') :
      path.join(__dirname, '..', '..', 'backup');
    const backupPath = path.join(backupRootPath, backupDirName);
    
    if (!fs.existsSync(outputDir)) {
      console.log(`Output directory not found: ${outputDir}`);
      return false;
    }
    
    const zipPath = path.join(outputDir, '..', 'Output.zip');
    if (!fs.existsSync(zipPath)) {
      console.log(`Zip file not found: ${zipPath}`);
      return false;
    }
    
    fs.mkdirSync(backupPath, { recursive: true });
    
    const backupZipPath = path.join(backupPath, `${sanitizedFileName}_decrypted.zip`);
    fs.copyFileSync(zipPath, backupZipPath);
    
    const infoPath = path.join(backupPath, 'info.txt');
    let infoContent = `User: ${userName}
Session ID: ${sessionId}
Original File: ${originalFileName}
Timestamp: ${new Date().toISOString()}
Cfx: ${cfxKey || 'Used from API grants (no CFX key required)'}
Decrypted Files: ${sanitizedFileName}_decrypted.zip
Request Type: ${isApiRequest ? 'API' : 'Discord Bot'}`;

    if (userIP) {
      infoContent += `\nDecrypter IP: ${userIP}`;
    }
    
    infoContent += '\n';
    
    fs.writeFileSync(infoPath, infoContent);
    
    console.log(`Backup created successfully: ${backupPath}`);
    
    
    return true;
    
  } catch (error) {
    console.error(`Backup creation failed:`, error);
    return false;
  }
}

function cleanOldBackups(daysToKeep = 30) {
  try {
    const backupDirs = [
      path.join(__dirname, '..', '..', 'backup'),
      path.join(__dirname, '..', '..', 'api_backup')
    ];
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    for (const backupDir of backupDirs) {
      if (!fs.existsSync(backupDir)) {
        continue;
      }
      
      const entries = fs.readdirSync(backupDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const entryPath = path.join(backupDir, entry.name);
          const stats = fs.statSync(entryPath);
          
          if (stats.birthtime < cutoffDate) {
            fs.rmSync(entryPath, { recursive: true, force: true });
            console.log(`Removed old backup: ${entry.name} from ${path.basename(backupDir)}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Failed to clean old backups:`, error);
  }
}

module.exports = {
  createBackup,
  cleanOldBackups
};