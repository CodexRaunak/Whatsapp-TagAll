const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  MessageType,
  MessageOptions,
  Mimetype,
} = require("@whiskeysockets/baileys");
const { MongoClient } = require("mongodb");
const useMongoDBAuthState = require("./mongoAuthState.js");
const { DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
require("dotenv").config();

const app = express();
const mongoURL = process.env.MONGO_URL;
const port = process.env.PORT || 3000;

async function connectToWhatsApp() {
  const mongoClient = new MongoClient(mongoURL, {});
  await mongoClient.connect();

  // const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys"); // this will be called as soon as the credentials are updated
  const collection = mongoClient.db("Cluster0").collection("auth_info_baileys");
  const { state, saveCreds } = await useMongoDBAuthState(collection);
  const sock = makeWASocket({
    //make connection to whatsapp backend
    // can provide additional config here
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("connection.update", (update) =>
    handleConnectionUpdate(update, sock)
  );
  async function updateProfileName(sock, newName) {
    try {
      await sock.updateProfileName(newName);
      console.log(`Profile name updated to ${newName}`);
    } catch (error) {
      console.error("Error updating profile name:", error);
    }
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    const newProfileName = "~Asterin041";
    await updateProfileName(sock, newProfileName);
  });

  //handle incoming messages
  sock.ev.on("messages.upsert", async (messageUpdate) =>
    handleMessagesUpsert(messageUpdate, sock)
  );

  console.log("Connected to WhatsApp");
}

function handleConnectionUpdate(update, sock) {
  const { connection, lastDisconnect, qr } = update || {};
  if (qr) {
    console.log(qr);
  }
  if (connection === "close") {
    const shouldReconnect =
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

    if (shouldReconnect) {
      connectToWhatsApp();
    }
  } else if (connection == "open") {
    console.log("opened connection");
  }
}

async function handleMessagesUpsert(messageUpdate, sock) {
  const messageZero = messageUpdate.messages[0];
  const { key, message } = messageZero;
  if (!message) return;

  const { remoteJid } = key;
  //  if(remoteJid !== process.env.JINDAGI_JHAND_REMOTEJ_ID) return;
  const messageText = message?.conversation;
  // console.log("messageUpdate", messageUpdate);
  // console.log("remoteJid", remoteJid);
  // console.log("messageText", messageText);

  if (messageText.includes("!tagAll") || messageText.includes("!TagAll")) {
    await tagAllMembers(remoteJid, sock, key);
  } else if (messageText.includes("!tag") || messageText.includes("!Tag")) {
    await tagAllExceptOne(
      remoteJid,
      sock,
      process.env.SUHANI_ID,
      "@suhani",
      key
    );
  }
  const myPhone = sock.user.id.split(":")[0];
  const myId = myPhone + "@s.whatsapp.net";
  // console.log("message",message);
  const mentions = message.extendedTextMessage?.contextInfo?.mentionedJid || [];
  //mentionedJid = ids of all the members that have been tagged in the current message
  if (mentions.includes(myId)) {
    await sendTaggedReply(remoteJid, sock, key);
  }
  if (
    messageText.includes("Good morning") ||
    messageText.includes("Good Morning") ||
    messageText.includes("Good night") ||
    messageText.includes("good night") ||
    messageText.includes("Goodnight")
  ) {
    reactToMessage(remoteJid, sock, key);
  }
}

async function tagAllMembers(remoteJid, sock, messageKey) {
  try {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const myId = sock.user.id.split(":")[0];
    const participants = groupMetadata.participants;
    const filteredParticipants = participants.filter(
      (participant) =>
        participant.id !== myId + "@s.whatsapp.net" &&
        participant.id !== messageKey.participant
    );
    console.log(filteredParticipants);
    const mentions = filteredParticipants.map((p) => p.id);
    //join is just joining all the elements of the array seperated by a space
    const mentionText = filteredParticipants
      .map((p) => `@${p.id.split("@")[0]}`)
      .join(" ");
    const quotedMessage = {
      key: messageKey,
      message: {
        conversation: messageKey.conversation || "Quoted text",
      },
    };

    const options = {
      quoted: quotedMessage,
    };
    await sock.sendMessage(
      remoteJid,
      { text: mentionText, mentions: mentions },
      options
    );
    console.log("Tagged all members in the group, excluding yourself");
  } catch (error) {
    console.log("Error tagging all members:", error);
  }
}

async function sendTaggedReply(remoteJid, sock, messageKey) {
  try {
    const responseText = "Yeah! 😃☺️";
    const quotedMessage = {
      key: messageKey,
      message: {
        conversation: messageKey.conversation || "Quoted text",
      },
    };

    const options = {
      quoted: quotedMessage,
    };
    await sock.sendMessage(
      remoteJid,
      {
        text: responseText,
      },
      options
    );
  } catch (error) {
    console.log("Error sending response:", error);
  }
}

async function reactToMessage(remoteJid, sock, messageKey) {
  const reactionMessage = {
    react: {
      text: "🌸", // use an empty string to remove the reaction
      key: messageKey,
    },
  };
  await sock.sendMessage(remoteJid, reactionMessage);
}

async function tagAllExceptOne(
  remoteJid,
  sock,
  excludeId,
  extraMention,
  messageKey
) {
  try {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const myId = sock.user.id.split(":")[0];
    const participants = groupMetadata.participants;
    const filteredParticipants = participants.filter(
      (participant) =>
        participant.id !== myId + "@s.whatsapp.net" &&
        participant.id !== excludeId &&
        participant.id !== messageKey.participant
    );
    console.log(filteredParticipants);
    const mentions = filteredParticipants.map((p) => p.id);
    //join is just joining all the elements of the array seperated by a space
    const mentionText =
      filteredParticipants.map((p) => `@${p.id.split("@")[0]}`).join(" ") +
      " " +
      extraMention;
    const quotedMessage = {
      key: messageKey,
      message: {
        conversation: messageKey.conversation || "Quoted text",
      },
    };

    const options = {
      quoted: quotedMessage,
    };
    await sock.sendMessage(
      remoteJid,
      {
        text: mentionText,
        mentions: mentions,
      },
      options
    );
    console.log("Tagged all members in the group, excluding yourself");
  } catch (error) {
    console.log("Error tagging all members:", error);
  }
}
connectToWhatsApp();

app.get("/", (req, res) => {
  res.send("WhatsApp bot is running");
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
