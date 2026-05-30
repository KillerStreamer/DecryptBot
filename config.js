const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 PrimeLeaks Decrypt Bot - Configuration
// Website: https://primeleaks.cc
// Discord: https://discord.com/invite/wgnsTu24bg
// ═══════════════════════════════════════════════════════════════════════════

const config = {
    // 🌐 Server URL (change to your domain/IP when deploying)
    appurl: 'http://localhost:3000/',

    discord: {
        // 📌 Discord Configuration - Fill these with your bot information
        invite: 'YOUR_DISCORD_INVITE_LINK',  // Your Discord server invite
        token: 'YOUR_DISCORD_BOT_TOKEN',      // Bot token from Discord Developer Portal
        clientId: 'YOUR_CLIENT_ID',           // Application ID from Discord Developer Portal
        guildId: 'YOUR_GUILD_ID',             // Your Discord server ID
        logChannelId: 'YOUR_LOG_CHANNEL_ID'   // Channel ID for logging (optional)
    },

    server: {
        port: 3000,      // Web server port
        apiPort: 3001    // API server port
    },

    api: {
        maxFileSize: 500 * 1024 * 1024  // 500 MB max file size
    },

    paths: {
        tools: path.join(__dirname, 'Tools')  // Path to decompilation tools
    },

    keymaster: {
        url: 'https://keymaster.fivem.net/api/validate'  // FiveM Keymaster API
    },

    // 🔐 Proxy Configuration (optional - for API requests)
    proxy: {
        enabled: false,
        host: '',
        port: 0,
        auth: {
            username: '',
            password: ''
        }
    },

    // 🔐 Cryptography Keys (FiveM default keys)
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

    // 📄 File Headers
    headers: {
        fxap: Buffer.from([0x46, 0x58, 0x41, 0x50]),
        lua: Buffer.from([0x1b, 0x4c, 0x75, 0x61, 0x54, 0x00, 0x19, 0x93, 0x0d, 0x0a, 0x1a, 0x0a, 0x04, 0x08, 0x08, 0x78, 0x5]),
        luaheaderhex: "1b4c7561540019930d0a1a0a040808785"
    },

    // 👑 Admin Users (Discord User IDs)
    adminUsers: [
        // Add Discord user IDs here for admin access
        // Example: "123456789012345678"
    ]
};

module.exports = config;

