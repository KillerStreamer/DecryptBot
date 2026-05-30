const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

class DiscordLogger {
    constructor(client) {
        this.client = client;
        this.logChannelId = config.discord.logChannelId;
    }

    async sendLog(title, description, color = 0x0099ff, fields = []) {
        // Skip si pas de logChannelId configuré
        if (!this.logChannelId || this.logChannelId === 'VOTRE_LOG_CHANNEL') {
            console.log(`[DISCORD LOG SKIP] ${title}`);
            return;
        }

        try {
            const channel = this.client.channels.cache.get(this.logChannelId);
            if (!channel) {
                console.error('Log channel not found:', this.logChannelId);
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .setTimestamp();

            if (description && description.trim() !== '') {
                embed.setDescription(description);
            }

            if (fields.length > 0) {
                embed.addFields(fields);
            }

            await channel.send({ embeds: [embed] });
        } catch (error) {
            // Ne pas bloquer le processus si les logs échouent
            console.warn('Failed to send log to Discord (non-blocking):', error.message);
        }
    }

    async logSuccess(user, fileName, sessionId, resourceCount = 0, usedSubscription = false, cfxKey = null) {
        const fields = [
            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
            { name: 'File', value: fileName, inline: true },
            { name: 'Session ID', value: sessionId, inline: true },
            { name: 'Resources', value: resourceCount.toString(), inline: true },
            { name: 'Payment', value: usedSubscription ? 'Subscription' : 'Credit', inline: true },
            { name: 'Time', value: new Date().toLocaleString(), inline: true }
        ];

        if (cfxKey) {
            fields.push({ name: 'License Key', value: cfxKey, inline: false });
        }

        await this.sendLog('Successful Decryption', '', 0x00ff00, fields);
    }

    async logError(user, fileName, error, sessionId = null, usedSubscription = false, cfxKey = null) {
        const fields = [
            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
            { name: 'File', value: fileName, inline: true },
            { name: 'Session ID', value: sessionId || 'N/A', inline: true },
            { name: 'Payment', value: usedSubscription ? 'Subscription' : 'Credit', inline: true },
            { name: 'Time', value: new Date().toLocaleString(), inline: true },
            { name: 'Error', value: error.message || error.toString(), inline: false }
        ];

        if (cfxKey) {
            fields.push({ name: 'License Key', value: cfxKey, inline: false });
        }

        await this.sendLog('Decryption Failed', '', 0xff0000, fields);
    }
}

module.exports = DiscordLogger;
