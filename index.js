const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { registerCommands } = require('./src/modules/commands');
const { handleInteraction } = require('./src/modules/handlers');
const { startServer } = require('./src/server');
const { cleanOldBackups } = require('./src/modules/backup');
const DiscordLogger = require('./src/modules/discord-logger');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 PrimeLeaks Decrypt Bot - Main Entry Point
// Website: https://primeleaks.cc
// Discord: https://discord.com/invite/wgnsTu24bg
// ═══════════════════════════════════════════════════════════════════════════

async function initializeApplication() {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          🔥 PrimeLeaks Decrypt Bot - Starting Up 🔥           ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log('📌 Website: https://primeleaks.cc');
    console.log('💬 Discord: https://discord.com/invite/wgnsTu24bg\n');

    // Start web server
    await startServer();

    // Register Discord commands
    await registerCommands();

    // Clean old backups (30 days retention)
    cleanOldBackups(30);

    client.on('ready', async() => {
        console.log(`✅ Discord Bot logged in as ${client.user.tag}`);
        console.log(`🌐 Serving on: ${config.appurl}\n`);
        global.discordLogger = new DiscordLogger(client);
    });

    client.on('interactionCreate', async(interaction) => {
        try {
            await handleInteraction(interaction);
        } catch (error) {
            console.error('❌ Error handling interaction:', error);
        }
    });

    client.on('error', (error) => {
        console.error('❌ Discord client error:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });

    await client.login(config.discord.token);
}

global.discordLogger = null;

initializeApplication().catch(console.error);
