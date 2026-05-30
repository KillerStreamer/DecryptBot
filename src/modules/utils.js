const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

function ensureEmptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function downloadTo(fileUrl, destPath) {
  const writer = fs.createWriteStream(destPath);
  const response = await axios.get(fileUrl, { responseType: 'stream' });
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function extractZipTo(dir, zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    
    if (zip.getEntries().length === 0) {
      throw new Error('Empty zip file');
    }
    
    zip.extractAllTo(dir, true);
  } catch (error) {
    if (error.message.includes('Invalid or unsupported zip format')) {
      throw new Error('Invalid or unsupported zip format. Please ensure the file is a valid ZIP archive.');
    } else if (error.message.includes('Empty zip file')) {
      throw new Error('Empty zip file. The uploaded file contains no data.');
    } else {
      throw new Error(`Failed to extract zip file: ${error.message}`);
    }
  }
}

function findResourceDirs(root) {
  const result = [];
  
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hasFxap = entries.some(entry => !entry.isDirectory() && entry.name === '.fxap');
    
    if (hasFxap) result.push(dir);
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      }
    }
  }
  
  walk(root);
  return result;
}

function dirFileCount(root) {
  let count = 0;
  
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
      } else {
        count++;
      }
    }
  }
  
  if (fs.existsSync(root)) walk(root);
  return count;
}

function zipDirectory(srcDir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      // Attendre que le fichier soit complètement écrit sur le disque
      setTimeout(() => {
        // Vérifier que le fichier existe et a une taille > 0
        if (fs.existsSync(zipPath)) {
          const stats = fs.statSync(zipPath);
          if (stats.size > 0) {
            console.log(`✓ ZIP created: ${zipPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            resolve();
          } else {
            reject(new Error('ZIP file is empty'));
          }
        } else {
          reject(new Error('ZIP file not found after creation'));
        }
      }, 1000); // Attendre 1 seconde
    });
    
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir + '/', false);
    archive.finalize();
  });
}

module.exports = {
  ensureEmptyDir,
  downloadTo,
  extractZipTo,
  findResourceDirs,
  dirFileCount,
  zipDirectory
};
