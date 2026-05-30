const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 PrimeLeaks Decrypt Bot - Configuration Example
// Website: https://primeleaks.cc
// Discord: https://discord.com/invite/wgnsTu24bg
// ═══════════════════════════════════════════════════════════════════════════
//
// This is an EXAMPLE configuration file.
// Copy this file to config.js and fill in your actual values.
//
// ═══════════════════════════════════════════════════════════════════════════

const config = {
    // 🌐 Server URL - Change this when deploying to a server
    // Examples:
    //   - Localhost: 'http://localhost:3000/'
    //   - VPS: 'http://123.456.789.0:3000/'
    //   - Domain: 'https://decrypt.yourdomain.com/'
    appurl: 'http://localhost:3000/',

    discord: {
        // 📌 Discord Configuration
        // Get these from: https://discord.com/developers/applications
        
        invite: 'https://discord.gg/YOURCODE',           // Your Discord server invite link
        token: 'MTxxxxxxxxxxxxx.Xxxxxx.xxxxxxxxxxx',    // Bot token (keep this SECRET!)
        clientId: '1234567890123456789',                 // Application ID
        guildId: '1234567890123456789',                  // Your Discord server ID
        logChannelId: '1234567890123456789'              // Channel ID for bot logs
    },

    server: {
        port: 3000,      // Web server port (change if 3000 is taken)
        apiPort: 3001    // API server port (change if 3001 is taken)
    },

    api: {
        maxFileSize: 500 * 1024 * 1024  // 500 MB - Maximum upload size
    },

    paths: {
        tools: path.join(__dirname, 'Tools')  // Path to decompilation tools (usually don't change)
    },

    keymaster: {
        url: 'https://keymaster.fivem.net/api/validate'  // FiveM Keymaster API (don't change)
    },

    // 🔐 Proxy Configuration (OPTIONAL - for Keymaster API requests)
    // Enable this if you need to use a proxy for API calls
    proxy: {
        enabled: false,              // Set to true to enable proxy
        host: 'proxy.example.com',   // Proxy host
        port: 12345,                 // Proxy port
        auth: {
            username: 'your_username',  // Proxy username (if required)
            password: 'your_password'   // Proxy password (if required)
        }
    },

    // 🔐 Cryptography Keys (FiveM default keys - DO NOT CHANGE)
    crypto: {
        defaultKey: Buffer.from([
            0xb3, 0xcb, 0x2e, 0x04, 0x87, 0x94, 0xd6, 0x73, 0x08, 0x23, 0xc4, 0x93, 0x7a, 0xbd, 0x18, 0xad,
            0x6b, 0xe6, 0xdc, 0xb3, 0x91, 0x43, 0x0d, 0x28, 0xf9, 0x40, 0x9d, 0x48, 0x37, 0xb9, 0x38, 0xfb
        ]),
        aesKey: Buffer.from([
            0x7a, 0xba, 0x8d, 0x53, 0x25, 0x5b, 0x0e, 0xfd, 0x16, 0xbd, 0x35, 0x22, 0xa0, 0xb9, 0x26, 0xa5,
            0x61, 0x83, 0x2e, 0xec, 0xa2, 0x4b, 0xfd, 0x56, 0x9e, 0xc0, 0x1d, 0x8f, 0x38, 0x40, 0x54, 0x6d
        ])
    },

    // 📄 File Headers (DO NOT CHANGE)
    headers: {
        fxap: Buffer.from([0x46, 0x58, 0x41, 0x50]),
        lua: Buffer.from([0x1b, 0x4c, 0x75, 0x61, 0x54, 0x00, 0x19, 0x93, 0x0d, 0x0a, 0x1a, 0x0a, 0x04, 0x08, 0x08, 0x78, 0x5]),
        luaheaderhex: "1b4c7561540019930d0a1a0a040808785"
    },

    // 👑 Admin Users (Discord User IDs)
    // These users have access to admin commands
    // To get your User ID: Right-click your profile in Discord → Copy User ID
    adminUsers: [
        "123456789012345678",  // Replace with your Discord User ID
        // Add more admin user IDs below if needed
        // "987654321098765432",
    ]
};

module.exports = config;
