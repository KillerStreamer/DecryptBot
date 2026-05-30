const { SlashCommandBuilder, REST, Routes } = require('discord.js');
const config = require('../../config');

const commands = [
  new SlashCommandBuilder()
    .setName('decrypt')
    .setDescription('Decrypt your FiveM resource files (costs 1 credit or free with subscription)')
    .addAttachmentOption(option => 
      option.setName('file')
        .setDescription('Upload your resource .zip')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('cfx_key')
        .setDescription('CFX key for decryption (optional)')
        .setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('credits')
    .setDescription('Check your credit balance and subscription status'),
    
  new SlashCommandBuilder()
    .setName('addcredits')
    .setDescription('Add credits to a user (Admin only)')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to add credits to')
        .setRequired(true)
    )
    .addIntegerOption(option => 
      option.setName('amount')
        .setDescription('Amount of credits to add')
        .setRequired(true)
        .setMinValue(1)
    ),
    
  new SlashCommandBuilder()
    .setName('removecredits')
    .setDescription('Remove credits from a user (Admin only)')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to remove credits from')
        .setRequired(true)
    )
    .addIntegerOption(option => 
      option.setName('amount')
        .setDescription('Amount of credits to remove (use 0 for full wipe)')
        .setRequired(true)
        .setMinValue(0)
    ),
    
  new SlashCommandBuilder()
    .setName('subscription-add')
    .setDescription('Add subscription to a user (Admin only)')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to add subscription to')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('type')
        .setDescription('Subscription type')
        .setRequired(true)
        .addChoices(
          { name: 'Weekly', value: 'weekly' },
          { name: 'Monthly', value: 'monthly' },
          { name: 'Lifetime', value: 'lifetime' }
        )
    )
    .addIntegerOption(option => 
      option.setName('duration')
        .setDescription('Duration (weeks/months, ignored for lifetime)')
        .setRequired(false)
        .setMinValue(1)
    ),
    
  new SlashCommandBuilder()
    .setName('subscription-remove')
    .setDescription('Remove subscription from a user (Admin only)')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to remove subscription from')
        .setRequired(true)
    ),
    
  new SlashCommandBuilder()
    .setName('subscription-info')
    .setDescription('Get user subscription information (Admin only)')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to check subscription for')
        .setRequired(true)
    ),
    
  new SlashCommandBuilder()
    .setName('apikey-create')
    .setDescription('Create new API key (Admin only)')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Client name for the API key')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('key')
        .setDescription('Custom API key (leave empty for auto-generation)')
        .setRequired(false)
    )
    .addStringOption(option => 
      option.setName('subscription')
        .setDescription('Subscription type for the API key')
        .setRequired(false)
        .addChoices(
          { name: 'Monthly', value: 'monthly' },
          { name: 'Lifetime', value: 'lifetime' }
        )
    )
    .addIntegerOption(option => 
      option.setName('months')
        .setDescription('Duration in months (ignored for lifetime)')
        .setRequired(false)
        .setMinValue(1)
    ),
    
  new SlashCommandBuilder()
    .setName('apikey-list')
    .setDescription('List all API keys (Admin only)'),
    
  new SlashCommandBuilder()
    .setName('apikey-remove')
    .setDescription('Remove API key (Admin only)')
    .addStringOption(option => 
      option.setName('key')
        .setDescription('API key to remove')
        .setRequired(true)
    ),
    
  new SlashCommandBuilder()
    .setName('apikey-info')
    .setDescription('Get API key information (Admin only)')
    .addStringOption(option => 
      option.setName('key')
        .setDescription('API key to check')
        .setRequired(true)
    ),
    
  new SlashCommandBuilder()
    .setName('blacklist-resource')
    .setDescription('Add a .fxap file to the blacklist (Admin only)')
    .addAttachmentOption(option => 
      option.setName('file')
        .setDescription('Upload the .fxap file to blacklist')
        .setRequired(true)
    )
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  
  try {
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands }
    );
    console.log('Slash commands registered');
  } catch (error) {
    console.error('Slash registration failed:', error);
  }
}

module.exports = {
  registerCommands
};
