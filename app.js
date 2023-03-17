async function main() {

  const { App } = require("@slack/bolt");
  const { WebClient } = require("@slack/web-api");
  const { Client, GatewayIntentBits, WebhookClient } = require('discord.js');

  require('dotenv').config();
  const discordToken = process.env.DISCORD_TOKEN;
  const slackToken = process.env.SLACK_TOKEN;
  const wsToken = process.env.SLACK_TOKEN_WEBSOCKET;
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  const devChatDiscordId = process.env.DEV_CHAT_ID;
  const devChatSlackId = process.env.DEV_CHAT_SLACK_ID;
  const devSupportDiscordId = process.env.DEV_SUPPORT_ID;
  const devSupportSlackId = process.env.DEV_SUPPORT_SLACK_ID;
  const ticketCategoryId = process.env.TICKET_CATEGORY_ID;
  const ticketSlackId = process.env.TICKET_SLACK_ID;

  const slack = new App({
    token: slackToken,
    signingSecret: slackSigningSecret,
    socketMode: true,
    appToken: wsToken,
  });

  const slack_web = new WebClient(slackToken);

  const discord = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildWebhooks,
    ],
  });

  //Start webhookChat Client for #dev-chat in Discord
  const webhookChat = new WebhookClient({
    id: 'insert webhook id',
    token: 'insert webhook token'
  });

  // #dev-chat DISCORD TO SLACK
  discord.on("messageCreate", (message) => {
    if (message.channel.id === devChatDiscordId && !message.author.bot && !message.webhookId && message.content) {
      console.log('Message received from discord-dev-chat', message);
      slack_web.chat.postMessage({
        channel: devChatSlackId,
        text: `${message.author.username}\n\n${message.content}\n\n${message.url}`,
        username: `Discord: ${message.author.username}`,
      });
    }
  });

  // #dev-chat SLACK TO DISCORD
  slack.event("message", ({ message }) => {
    if (message.channel === devChatSlackId && !message.type.bot && message.text) {
      console.log('Message received from slack-dev-chat', message);
      webhookChat.send({
        channelId: devChatDiscordId,
        content: `${message.text}`,
        username: "Switchboard Team",
      })
    }
  });

  //Start webhookSupport Client for #dev-support in Discord
  const webhookSupport = new WebhookClient({
    id: 'insert webhook id',
    token: 'insert webhook token'
  });

  // #dev-support DISCORD TO SLACK
  discord.on("messageCreate", (message) => {
    if (message.channel.id === devSupportDiscordId && !message.author.bot && !message.webhookId && message.content) {
      console.log('Message received from discord-dev-support', message);
      slack_web.chat.postMessage({
        channel: devSupportSlackId,
        text: `${message.author.username}\n\n${message.content}\n\n${message.url}`,
        username: `Discord: ${message.author.username}`,
      });
    }
  });

  // #dev-support SLACK TO DISCORD
  slack.event("message", ({ message }) => {
    if (message.channel === devSupportSlackId && !message.type.bot && message.text) {
      console.log('Message received from slack-dev-support', message);
      webhookSupport.send({
        channelId: devSupportDiscordId,
        content: `${message.text}`,
        username: "Switchboard Team",
      })
    }
  });

  //Map webhookClient(value) to Discord channel name (key)
  const webhookClients = new Map();

  //Event -> Discord channelCreate
  //Action -> Slack start thread parent message in #ticket
  //Action -> Create a webhook in the Discord channel
  //Action -> Start webhookClient and map it as a value to the Discord channel name as the key
  discord.on("channelCreate", async (channel) => {
    if (channel.parentId === ticketCategoryId) {
      console.log(channel);
      slack_web.chat.postMessage({
        channel: ticketSlackId,
        text: `${channel.name}`
      });
      const webhook = await channel.createWebhook({
        name: `${channel.name}`
      });
      console.log(`Created webhook ${webhook.name} with URL ${webhook.url}`);
      const webhookClient = new WebhookClient({
        id: `${webhook.id}`,
        token: `${webhook.token}`
      });
      webhookClients.set(`${channel.name}`, webhookClient);

      for (let [key, value] of webhookClients.entries()) {
        console.log(`Channel name: ${key}, Webhook: ${value}`);
      };
      }
  });

  //Event -> Discord messageCreate
  //Action -> Identify the Discord channel name to correspond to the Slack parent message
  //Action -> Identify the ts of the parent message to send the new message as a reply (thread)
  discord.on("messageCreate", (message) => {
    if (message.channel.parentId === ticketCategoryId && message.channel.name !== 'transcipts' && !message.author.bot && !message.webhookId) {
      console.log(message);
      const discordName = message.channel.name;
      const slackHistory = slack_web.conversations.history ({
        channel: ticketSlackId,
        limit: 100,
        inclusive: true
      });
      
      slackHistory.then((result) => {
        const slackMessage = result.messages.find((message) => message.text === discordName);
        if (slackMessage) {
          const tsThread = slackMessage.ts;
          console.log(slackMessage);
          console.log(slackMessage.ts);

          slack_web.chat.postMessage({
            channel: ticketSlackId,
            text: `${message.content}`,
            username: `Discord: ${message.author.username}`,
            thread_ts: `${tsThread}`
          })
        }
      })
    }
  });

  //Event -> Slack messageCreate ias a reply in thread
  //Action -> Identify the the Slack parent message and correspond to the Discord channel name
  //Action -> Identify the webhookClient (value) using the channel name (key) and send reply
  slack.event("message", ({message}) => {
    if (message.channel === ticketSlackId && message.thread_ts !== undefined) {
      console.log(message);
      const replyTS = message.thread_ts;
      const slackHistory = slack_web.conversations.history ({
        channel: ticketSlackId,
        limit: 100,
        inclusive: true
      });
      slackHistory.then ((result) => {
        const slackParentMessage = result.messages.find((message) => message.ts === replyTS);
        if (slackParentMessage) {
          const slackParentText = slackParentMessage.text
          console.log(`This is the name of the Slack's parent text`, slackParentText)

          const discordChannel = discord.channels.cache.find(channel => channel.name === `${slackParentText}`);
          console.log(`This is the name of the Discord channel`, discordChannel.name);
          const discordId = discordChannel.id

          const webhookClient = webhookClients.get(discordChannel.name);
          console.log(webhookClient);

          webhookClient.send({
            channelId: `${discordId}`,
            content: `${message.text}`,
            username: "Switchboard Team"
          })
        }
      })
    }
  });

  //Event -> Discord ticket closes
  //Action -> Update Slack parent message to "ticket-xxxx (CLOSED)"
  //Action -> Remove key-value pair from webhookClients map
  discord.on("channelDelete", (channel) => {
    if (channel.parentId === ticketCategoryId) {
      console.log(`${channel.name} deleted`);
      const discordName = channel.name;
      const slackHistory = slack_web.conversations.history ({
        channel: ticketSlackId,
        limit: 100,
        inclusive: true
      });
      
      slackHistory.then((result) => {
        const slackMessage = result.messages.find((message) => message.text === discordName);
        if (slackMessage) {
          slack_web.chat.update({
            channel: ticketSlackId,
            text: `${slackMessage.text} (CLOSED)`,
            ts: slackMessage.ts
          })
        }
      });

      webhookClients.delete(channel.name);
      console.log(webhookClients)
    }
  });

  // Slack readiness
  (async () => {
    await slack.start();

    console.log('Slack connected');
  })();

  // Discord readiness
  discord.once("ready", () => {
    console.log("Discord connected");
    discord.user.setActivity("with plugs!");
    discord.user.setStatus('online');
  });

  discord.login(discordToken)

}

main();
