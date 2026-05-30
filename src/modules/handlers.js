const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const FiveMDecryptor = require('./decryptor');
const { ensureEmptyDir, downloadTo, extractZipTo, findResourceDirs, dirFileCount, zipDirectory } = require('./utils');
const { getUserCredits, addCredits, removeCredits, hasEnoughCredits, setCredits, getUserSubscription, hasValidSubscription, setSubscription, removeSubscription, canUserDecrypt } = require('./credits');
const { createBackup, cleanOldBackups } = require('./backup');
const { validateApiKey, updateKeyUsage, createApiKey } = require('../api/auth');
const config = require('../../config');

async function handleDecryptCommand(interaction) {
    const file = interaction.options.getAttachment('file');
    const cfxKey = interaction.options.getString('cfx_key');
    const userId = interaction.user.id;
    const userCredits = getUserCredits(userId);
    const userSubscription = getUserSubscription(userId);
    const hasValidSub = hasValidSubscription(userId);

    if (!canUserDecrypt(userId)) {
        let description = `You need **1 credit** or an active subscription to decrypt files.\n\n**Your current balance:** ${userCredits} credits\n`;

        if (userSubscription) {
            const subType = userSubscription.type;
            const expiryText = userSubscription.type === 'lifetime' ? 'Never' :
                userSubscription.expiresAt ? new Date(userSubscription.expiresAt).toLocaleDateString() : 'N/A';
            description += `**Subscription:** ${subType} (${userSubscription.isActive ? 'Active' : 'Inactive'})\n`;
            description += `**Expires:** ${expiryText}\n`;
        } else {
            description += `**Subscription:** None\n`;
        }

        description += `\nContact an administrator to get credits or subscription.`;

        const noAccessEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription(description)
            .setColor(0xff9900)
            .setTimestamp();


        await interaction.reply({ embeds: [noAccessEmbed], flags: 64 });
        return;
    }

    let confirmationText = `**File:** ${file.name}\n`;

    if (hasValidSub) {
        confirmationText += `**Cost:** Free (using ${userSubscription.type} subscription)\n`;
        confirmationText += `**Your credits:** ${userCredits} (unchanged)\n`;
    } else {
        confirmationText += `**Cost:** 1 credit\n`;
        confirmationText += `**Your credits:** ${userCredits}\n`;
        confirmationText += `**Credits after:** ${userCredits - 1}\n`;
    }

    confirmationText += `\nDo you want to proceed with the decryption?`;

    const confirmEmbed = new EmbedBuilder()
        .setTitle('Decrypt Confirmation')
        .setDescription(confirmationText)
        .setColor(0x0099ff)
        .setTimestamp();

    const confirmRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
            .setCustomId('confirm_decrypt')
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
            .setCustomId('cancel_decrypt')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
        );

    let reply;
    try {
        reply = await interaction.reply({
            embeds: [confirmEmbed],
            components: [confirmRow],
            flags: 64,
            fetchReply: true
        });
    } catch (error) {
        if (error.code === 10062) {
            console.log('Interaction expired before initial reply could be sent');
            return;
        } else {
            throw error;
        }
    }

    console.log(`Waiting for confirmation from user ${interaction.user.tag} (${interaction.user.id})`);

    const filter = (i) => {
        console.log(`Button interaction from ${i.user.tag} (${i.user.id}), customId: ${i.customId}`);
        return i.user.id === interaction.user.id;
    };

    try {
        console.log('Starting awaitMessageComponent...');


        const confirmation = await reply.awaitMessageComponent({
            filter,
            time: 60000
        });
        console.log(`Confirmation received: ${confirmation.customId}`);

        if (confirmation.customId === 'cancel_decrypt') {
            const cancelEmbed = new EmbedBuilder()
                .setTitle('Decryption Cancelled')
                .setDescription('Decryption has been cancelled. No credits were charged.')
                .setColor(0xff0000)
                .setTimestamp();

            await confirmation.update({
                embeds: [cancelEmbed],
                components: []
            });
            return;
        }

        if (confirmation.customId === 'confirm_decrypt') {
            if (!hasValidSub) {
                if (!removeCredits(userId, 1)) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('Credit Deduction Failed')
                        .setDescription('Failed to deduct credits. Please try again.')
                        .setColor(0xff0000)
                        .setTimestamp();

                    await confirmation.update({
                        embeds: [errorEmbed],
                        components: []
                    });
                    return;
                }

            }


            await startDecryption(interaction, file, hasValidSub, cfxKey);
        }
    } catch (error) {
        if (error.code !== 'InteractionCollectorError') {
            console.error('awaitMessageComponent error:', error.message);
            console.error('Error details:', error);
        } else {
            console.log('User confirmation timed out after 60 seconds');
        }

        const timeoutEmbed = new EmbedBuilder()
            .setTitle('Confirmation Timeout')
            .setDescription('Confirmation timed out after 60 seconds. No credits were charged.')
            .setColor(0xff9900)
            .setTimestamp();

        try {
            await interaction.editReply({
                embeds: [timeoutEmbed],
                components: []
            });
        } catch (editError) {
            if (editError.code === 10062) {
                try {
                    await interaction.followUp({ embeds: [timeoutEmbed], ephemeral: true });
                } catch (followupError) {
                    console.log('Error sending timeout followup message:', followupError.message);
                }
            } else {
                console.log('Error updating interaction for timeout:', editError.message);
            }
        }
    }
}

async function startDecryption(interaction, file, usedSubscription = false, cfxKey = null) {

    const sessionDir = path.join(__dirname, '..', '..', 'sessions', interaction.id);
    const uploadsDir = path.join(sessionDir, 'Uploads');
    const resourcesDir = path.join(sessionDir, 'Resources');
    const outputDir = path.join(sessionDir, 'Output');
    const tempDir = path.join(sessionDir, 'TempCompiled');

    try {
        ensureEmptyDir(sessionDir);
        ensureEmptyDir(uploadsDir);
        ensureEmptyDir(resourcesDir);
        ensureEmptyDir(outputDir);
        ensureEmptyDir(tempDir);

        const progressEmbed1 = new EmbedBuilder()
            .setTitle('🔄 Processing')
            .setDescription('📥 Downloading file...')
            .setColor(0x0099ff)
            .setTimestamp();

        await interaction.editReply({ embeds: [progressEmbed1], components: [] });

        const uploadedPath = path.join(uploadsDir, file.name);
        console.log("File url: " + file.url)
        await downloadTo(file.url, uploadedPath);

        const progressEmbed2 = new EmbedBuilder()
            .setTitle('🔄 Processing')
            .setDescription('📂 Extracting files...')
            .setColor(0x0099ff)
            .setTimestamp();

        await interaction.editReply({ embeds: [progressEmbed2], components: [] });

        const ext = path.extname(uploadedPath).toLowerCase();
        if (ext === '.zip') {
            extractZipTo(resourcesDir, uploadedPath);
        } else if (ext === '.fxap') {
            const name = path.basename(uploadedPath, ext);
            const target = path.join(resourcesDir, name);
            fs.mkdirSync(target, { recursive: true });
            fs.copyFileSync(uploadedPath, path.join(target, '.fxap'));
        } else {
            throw new Error('Unsupported file type');
        }

        const progressEmbed3 = new EmbedBuilder()
            .setTitle('🔄 Processing')
            .setDescription('🔐 Processing decryption...')
            .setColor(0x0099ff)
            .setTimestamp();

        await interaction.editReply({ embeds: [progressEmbed3], components: [] });

        const decryptor = new FiveMDecryptor(outputDir, tempDir);
        const resourceDirs = findResourceDirs(resourcesDir);

        for (const dir of resourceDirs) {
            const resourceName = path.basename(dir);
            await decryptor.decryptResource(null, dir, resourceName, cfxKey);
        }

        const filesProduced = dirFileCount(outputDir);
        if (filesProduced === 0) {
            let failDescription = 'No decrypted files were produced. Check CFX key authorization and input structure.';

            if (!usedSubscription) {
                failDescription += '\n\n**Your credit has been refunded.**';
                addCredits(interaction.user.id, 1);
            }


            const failEmbed = new EmbedBuilder()
                .setTitle('Decryption Failed')
                .setDescription(failDescription)
                .setColor(0xff9900)
                .setTimestamp();

            await interaction.editReply({ embeds: [failEmbed], components: [] });
            return;
        }

        const progressEmbed4 = new EmbedBuilder()
            .setTitle('🔄 Processing')
            .setDescription('📦 Creating download package...')
            .setColor(0x0099ff)
            .setTimestamp();

        await interaction.editReply({ embeds: [progressEmbed4], components: [] });

        const zipPath = path.join(sessionDir, 'Output.zip');
        await zipDirectory(outputDir, zipPath);

        // ✅ Créer le fichier de métadonnées pour la session
        const sessionMetadata = {
            sessionId: interaction.id,
            userId: interaction.user.id,
            username: interaction.user.tag,
            fileName: file.name,
            resourceCount: filesProduced,
            timestamp: new Date().toISOString(),
            status: 'ready'
        };
        fs.writeFileSync(
            path.join(sessionDir, 'data.json'),
            JSON.stringify(sessionMetadata, null, 2)
        );

        // ✅ Session disponible directement sur ce serveur (pas de sync nécessaire)
        console.log(`✓ Session ${interaction.id} ready for download`);

        const backupSuccess = createBackup(
            interaction.id,
            interaction.user.tag,
            file.name,
            outputDir,
            cfxKey,
            'Discord Bot Interface',
            false
        );

        if (backupSuccess) {
            console.log(`Backup created for user ${interaction.user.tag} (${interaction.user.id})`);
        } else {
            console.log(`Backup failed for user ${interaction.user.tag} (${interaction.user.id})`);
        }

        cleanOldBackups(30);

        const downloadUrl = config.appurl;


        const doneEmbed = new EmbedBuilder()
            .setTitle('Decryption Complete')
            .setDescription(`Your files have been successfully decrypted!\n\n**Session ID:** \`${interaction.id}\`\n**Download Portal:** ${downloadUrl}\n\n**Instructions:**\n1. Visit the download portal\n2. Enter your session ID\n3. Click "Check Session" and download\n\n**Important:** Files are deleted after first download.`)
            .setColor(0x00ff00)
            .setTimestamp();

        if (global.discordLogger) {
            await global.discordLogger.logSuccess(
                interaction.user,
                file.name,
                interaction.id,
                filesProduced,
                usedSubscription,
                cfxKey
            );
        }

        try {
            await interaction.editReply({ embeds: [doneEmbed], components: [] });
        } catch (editError) {
            if (editError.code === 10062) {
                await interaction.followUp({ embeds: [doneEmbed], ephemeral: true });
            } else {
                throw editError;
            }
        }
    } catch (error) {
        let errorDescription = `Error: ${error.message}`;

        if (!usedSubscription) {
            errorDescription += '\n\n**Your credit has been refunded.**';
            addCredits(interaction.user.id, 1);
        }

        if (global.discordLogger) {
            await global.discordLogger.logError(
                interaction.user,
                file.name,
                error,
                interaction.id,
                usedSubscription,
                cfxKey
            );
        }

        const errorEmbed = new EmbedBuilder()
            .setTitle('Decryption Failed')
            .setDescription(errorDescription)
            .setColor(0xff0000)
            .setTimestamp();

        try {
            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        } catch (updateError) {
            if (updateError.code === 10062) {
                try {
                    await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                } catch (followupError) {
                    console.log('Error sending followup message:', followupError.message);
                }
            } else {
                console.log('Error updating interaction:', updateError.message);
            }
        }
    }
}

async function updateProgress(interaction, message, color) {
    const progressEmbed = new EmbedBuilder()
        .setTitle('🔄 Processing')
        .setDescription(message)
        .setColor(color)
        .setTimestamp();

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [progressEmbed] });
        } else {
            await interaction.update({ embeds: [progressEmbed] });
        }
    } catch (error) {
        if (error.code === 10062) {
            try {
                await interaction.followUp({ embeds: [progressEmbed], ephemeral: true });
            } catch (followupError) {
                console.log('Error sending progress followup message:', followupError.message);
            }
        } else {
            console.log('Progress update failed:', error.message);
        }
    }
}

async function handleCreditsCommand(interaction) {
    const userId = interaction.user.id;
    const credits = getUserCredits(userId);
    const subscription = getUserSubscription(userId);
    const hasValidSub = hasValidSubscription(userId);

    let description = `**Current Balance:** ${credits} credits\n`;

    if (subscription) {
        const subType = subscription.type;
        const expiryText = subscription.type === 'lifetime' ? 'Never' :
            subscription.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString() : 'N/A';
        description += `**Subscription:** ${subType} (${subscription.isActive ? 'Active' : 'Inactive'})\n`;
        description += `**Expires:** ${expiryText}\n\n`;

        if (hasValidSub) {
            description += `*You have an active subscription - decryptions are free!*`;
        } else {
            description += `*Your subscription has expired - each decryption costs 1 credit*`;
        }
    } else {
        description += `**Subscription:** None\n\n*Each decryption costs 1 credit*`;
    }

    const creditsEmbed = new EmbedBuilder()
        .setTitle('Your Account Status')
        .setDescription(description)
        .setColor(0x0099ff)
        .setTimestamp();

    await interaction.reply({ embeds: [creditsEmbed], flags: 64 });
}

async function handleAddCreditsCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (addCredits(targetUser.id, amount)) {
        const newBalance = getUserCredits(targetUser.id);


        const successEmbed = new EmbedBuilder()
            .setTitle('Credits Added')
            .setDescription(`**User:** ${targetUser.tag}\n**Added:** ${amount} credits\n**New Balance:** ${newBalance} credits`)
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], flags: 64 });
    } else {
        const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('Failed to add credits. Please try again.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
}

async function handleRemoveCreditsCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const currentCredits = getUserCredits(targetUser.id);

    if (amount === 0) {
        if (setCredits(targetUser.id, 0)) {
            const successEmbed = new EmbedBuilder()
                .setTitle('Credits Wiped')
                .setDescription(`**User:** ${targetUser.tag}\n**Previous Balance:** ${currentCredits} credits\n**New Balance:** 0 credits`)
                .setColor(0xff9900)
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed], flags: 64 });
        } else {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to wipe credits. Please try again.')
                .setColor(0xff0000)
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
    } else {
        if (removeCredits(targetUser.id, amount)) {
            const newBalance = getUserCredits(targetUser.id);
            const successEmbed = new EmbedBuilder()
                .setTitle('Credits Removed')
                .setDescription(`**User:** ${targetUser.tag}\n**Removed:** ${amount} credits\n**Previous Balance:** ${currentCredits} credits\n**New Balance:** ${newBalance} credits`)
                .setColor(0xff9900)
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed], flags: 64 });
        } else {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to remove credits. User may not have enough credits.')
                .setColor(0xff0000)
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
    }
}

async function handleApiKeyCreateCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const name = interaction.options.getString('name');
    const customKey = interaction.options.getString('key');
    const subscriptionType = interaction.options.getString('subscription') || 'monthly';
    const monthsValid = interaction.options.getInteger('months') || 1;

    try {
        let apiKey;
        if (customKey) {
            const fs = require('fs');
            const path = require('path');
            const dbPath = path.join(__dirname, '..', 'database', 'api-keys.json');
            const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

            if (db.keys[customKey]) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('API Key Creation Failed')
                    .setDescription('This API key already exists!')
                    .setColor(0xff0000)
                    .setTimestamp();

                await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                return;
            }

            let expiresAt = null;
            if (subscriptionType === 'monthly') {
                const expiryDate = new Date();
                expiryDate.setMonth(expiryDate.getMonth() + monthsValid);
                expiresAt = expiryDate.toISOString();
            }

            db.keys[customKey] = {
                name,
                subscriptionType,
                expiresAt,
                lastUsed: null,
                isActive: true,
                createdAt: new Date().toISOString()
            };

            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            apiKey = customKey;
        } else {
            apiKey = createApiKey(name, subscriptionType, monthsValid);
        }

        const expiryText = subscriptionType === 'lifetime' ? 'Never' :
            subscriptionType === 'monthly' ? `${monthsValid} month(s) from now` : 'N/A';

        const successEmbed = new EmbedBuilder()
            .setTitle('API Key Created')
            .setDescription(`**API Key:** \`${apiKey}\`\n**Name:** ${name}\n**Subscription Type:** ${subscriptionType}\n**Expires:** ${expiryText}`)
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], flags: 64 });
    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('API Key Creation Failed')
            .setDescription('An error occurred while creating the API key.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
}

async function handleApiKeyListCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    try {
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(__dirname, '..', 'database', 'api-keys.json');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        const keys = Object.keys(db.keys);

        if (keys.length === 0) {
            const noKeysEmbed = new EmbedBuilder()
                .setTitle('API Keys')
                .setDescription('No API keys found.')
                .setColor(0xff9900)
                .setTimestamp();

            await interaction.reply({ embeds: [noKeysEmbed], flags: 64 });
            return;
        }

        let description = '';
        keys.slice(0, 10).forEach(key => {
            const data = db.keys[key];
            const shortKey = key.length > 20 ? key.substring(0, 20) + '...' : key;
            const expiryStatus = data.subscriptionType === 'lifetime' ? 'Never' :
                data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : 'N/A';

            description += `**${shortKey}**\n`;
            description += `Name: ${data.name}\n`;
            description += `Subscription: ${data.subscriptionType || 'legacy'}\n`;
            description += `Expires: ${expiryStatus}\n`;
            description += `Active: ${data.isActive}\n`;
            description += `Last Used: ${data.lastUsed || 'Never'}\n\n`;
        });

        if (keys.length > 10) {
            description += `... and ${keys.length - 10} more keys`;
        }

        const listEmbed = new EmbedBuilder()
            .setTitle(`API Keys (${keys.length} total)`)
            .setDescription(description)
            .setColor(0x0099ff)
            .setTimestamp();

        await interaction.reply({ embeds: [listEmbed], flags: 64 });
    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('Failed to load API keys.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
}

async function handleApiKeyRemoveCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const apiKey = interaction.options.getString('key');

    try {
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(__dirname, '..', 'database', 'api-keys.json');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        if (!db.keys[apiKey]) {
            const notFoundEmbed = new EmbedBuilder()
                .setTitle('API Key Not Found')
                .setDescription('The specified API key does not exist.')
                .setColor(0xff9900)
                .setTimestamp();

            await interaction.reply({ embeds: [notFoundEmbed], flags: 64 });
            return;
        }

        const keyName = db.keys[apiKey].name;
        delete db.keys[apiKey];
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        const successEmbed = new EmbedBuilder()
            .setTitle('API Key Removed')
            .setDescription(`**API Key:** \`${apiKey}\`\n**Name:** ${keyName}`)
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], flags: 64 });
    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('Failed to remove API key.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
}

async function handleApiKeyInfoCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const apiKey = interaction.options.getString('key');
    const keyData = validateApiKey(apiKey);

    if (!keyData) {
        const notFoundEmbed = new EmbedBuilder()
            .setTitle('API Key Not Found')
            .setDescription('The specified API key does not exist.')
            .setColor(0xff9900)
            .setTimestamp();

        await interaction.reply({ embeds: [notFoundEmbed], flags: 64 });
        return;
    }

    const expiryStatus = keyData.subscriptionType === 'lifetime' ? 'Never' :
        keyData.expiresAt ? new Date(keyData.expiresAt).toLocaleString() : 'N/A';

    const infoEmbed = new EmbedBuilder()
        .setTitle('API Key Information')
        .setDescription(`**API Key:** \`${apiKey}\`\n**Name:** ${keyData.name}\n**Subscription Type:** ${keyData.subscriptionType || 'legacy'}\n**Expires:** ${expiryStatus}\n**Request Count:** ${keyData.requestCount}\n**Active:** ${keyData.isActive}\n**Created:** ${keyData.createdAt}\n**Last Used:** ${keyData.lastUsed || 'Never'}`)
        .setColor(0x0099ff)
        .setTimestamp();

    await interaction.reply({ embeds: [infoEmbed], flags: 64 });
}

async function handleSubscriptionAddCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const targetUser = interaction.options.getUser('user');
    const subscriptionType = interaction.options.getString('type');
    const duration = interaction.options.getInteger('duration') || 1;

    try {
        if (setSubscription(targetUser.id, subscriptionType, duration)) {

            const expiryText = subscriptionType === 'lifetime' ? 'Never' :
                subscriptionType === 'monthly' ? `${duration} month(s) from now` :
                subscriptionType === 'weekly' ? `${duration} week(s) from now` : 'N/A';

            const successEmbed = new EmbedBuilder()
                .setTitle('Subscription Added')
                .setDescription(`**User:** ${targetUser.tag}\n**Type:** ${subscriptionType}\n**Duration:** ${duration}\n**Expires:** ${expiryText}`)
                .setColor(0x00ff00)
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed], flags: 64 });
        } else {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to add subscription. Please try again.')
                .setColor(0xff0000)
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('Subscription Creation Failed')
            .setDescription('An error occurred while creating the subscription.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
}

async function handleSubscriptionRemoveCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const targetUser = interaction.options.getUser('user');
    const subscription = getUserSubscription(targetUser.id);

    if (!subscription) {
        const noSubEmbed = new EmbedBuilder()
            .setTitle('No Subscription Found')
            .setDescription(`${targetUser.tag} does not have an active subscription.`)
            .setColor(0xff9900)
            .setTimestamp();

        await interaction.reply({ embeds: [noSubEmbed], flags: 64 });
        return;
    }

    if (removeSubscription(targetUser.id)) {

        const successEmbed = new EmbedBuilder()
            .setTitle('Subscription Removed')
            .setDescription(`**User:** ${targetUser.tag}\n**Previous Type:** ${subscription.type}`)
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], flags: 64 });
    } else {
        const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('Failed to remove subscription.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
}

async function handleSubscriptionInfoCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const targetUser = interaction.options.getUser('user');
    const credits = getUserCredits(targetUser.id);
    const subscription = getUserSubscription(targetUser.id);
    const hasValidSub = hasValidSubscription(targetUser.id);

    let description = `**User:** ${targetUser.tag}\n**Credits:** ${credits}\n`;

    if (subscription) {
        const expiryText = subscription.type === 'lifetime' ? 'Never' :
            subscription.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString() : 'N/A';
        description += `**Subscription Type:** ${subscription.type}\n`;
        description += `**Status:** ${subscription.isActive ? 'Active' : 'Inactive'}\n`;
        description += `**Expires:** ${expiryText}\n`;
        description += `**Created:** ${new Date(subscription.createdAt).toLocaleDateString()}\n`;
        description += `**Valid:** ${hasValidSub ? 'Yes' : 'No'}`;
    } else {
        description += `**Subscription:** None`;
    }

    const infoEmbed = new EmbedBuilder()
        .setTitle('User Account Information')
        .setDescription(description)
        .setColor(0x0099ff)
        .setTimestamp();

    await interaction.reply({ embeds: [infoEmbed], flags: 64 });
}

async function handleBlacklistResourceCommand(interaction) {
    if (!config.adminUsers.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('You do not have permission to use this command.')
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [noPermEmbed], flags: 64 });
        return;
    }

    const file = interaction.options.getAttachment('file');

    if (file.name.toLowerCase() !== 'fxap') {
        const errorEmbed = new EmbedBuilder()
            .setTitle('Invalid File Type')
            .setDescription(`Please upload a .fxap file. Received: "${file.name}"`)
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        return;
    }

    try {
        const progressEmbed = new EmbedBuilder()
            .setTitle('🔄 Processing')
            .setDescription('📥 Downloading and analyzing .fxap file...')
            .setColor(0x0099ff)
            .setTimestamp();

        await interaction.reply({ embeds: [progressEmbed], flags: 64 });

        const sessionDir = path.join(__dirname, '..', '..', 'sessions', interaction.id);
        const tempFile = path.join(sessionDir, file.name);

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        await downloadTo(file.url, tempFile);

        const FiveMDecryptor = require('./decryptor');
        const decryptor = new FiveMDecryptor(null, null);

        if (!decryptor.verifyEncrypted(tempFile)) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Invalid .fxap File')
                .setDescription('The uploaded file is not a valid encrypted .fxap file.')
                .setColor(0xff0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });

            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }

            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            return;
        }

        const fxapBuffer = decryptor.decryptFile(tempFile, config.crypto.defaultKey);
        if (!fxapBuffer) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Decryption Failed')
                .setDescription('Failed to decrypt the .fxap file.')
                .setColor(0xff0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });

            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }

            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            return;
        }

        const resourceId = decryptor.scanForId(fxapBuffer);
        if (!resourceId) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Resource ID Not Found')
                .setDescription('Could not extract resource ID from the .fxap file.')
                .setColor(0xff0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });

            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }

            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            return;
        }

        const blacklistPath = path.join(__dirname, '..', 'database', 'blacklist.json');
        let blacklist = [];

        if (fs.existsSync(blacklistPath)) {
            blacklist = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
        }

        const isAlreadyBlacklisted = blacklist.includes(String(resourceId));

        if (isAlreadyBlacklisted) {
            const alreadyBlacklistedEmbed = new EmbedBuilder()
                .setTitle('Already Blacklisted')
                .setDescription(`This resource is already in the blacklist.\n**Resource ID:** ${resourceId}`)
                .setColor(0xff9900)
                .setTimestamp();

            await interaction.editReply({ embeds: [alreadyBlacklistedEmbed] });

            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }

            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            return;
        }

        blacklist.push(String(resourceId));

        fs.writeFileSync(blacklistPath, JSON.stringify(blacklist, null, 2));

        const successEmbed = new EmbedBuilder()
            .setTitle('Resource Blacklisted')
            .setDescription(`**Resource ID:** ${resourceId}\n**File:** ${file.name}`)
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });

        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }

        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }

    } catch (error) {
        console.error('Blacklist command error:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription(`An error occurred while processing the file: ${error.message}`)
            .setColor(0xff0000)
            .setTimestamp();

        try {
            await interaction.editReply({ embeds: [errorEmbed] });
        } catch (editError) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        }

        const tempFile = path.join(__dirname, '..', '..', 'sessions', interaction.id, file.name);
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }

        const sessionDir = path.join(__dirname, '..', '..', 'sessions', interaction.id);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
    }
}

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
        case 'decrypt':
            await handleDecryptCommand(interaction);
            break;
        case 'credits':
            await handleCreditsCommand(interaction);
            break;
        case 'addcredits':
            await handleAddCreditsCommand(interaction);
            break;
        case 'removecredits':
            await handleRemoveCreditsCommand(interaction);
            break;
        case 'subscription-add':
            await handleSubscriptionAddCommand(interaction);
            break;
        case 'subscription-remove':
            await handleSubscriptionRemoveCommand(interaction);
            break;
        case 'subscription-info':
            await handleSubscriptionInfoCommand(interaction);
            break;
        case 'apikey-create':
            await handleApiKeyCreateCommand(interaction);
            break;
        case 'apikey-list':
            await handleApiKeyListCommand(interaction);
            break;
        case 'apikey-remove':
            await handleApiKeyRemoveCommand(interaction);
            break;
        case 'apikey-info':
            await handleApiKeyInfoCommand(interaction);
            break;
        case 'blacklist-resource':
            await handleBlacklistResourceCommand(interaction);
            break;
    }
}

module.exports = {
    handleInteraction
};