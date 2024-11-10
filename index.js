const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  uploadFolder,
  downloadFolder,
  initializeFirebase,
} = require("./firebase.js");

const {
  MessageType,
  MessageOptions,
  Mimetype,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
// const { MongoClient } = require("mongodb");
// const useMongoDBAuthState = require("./mongoAuthState.js");
// const { useMongoDBAuthState } = require("mongo-baileys");
const { DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const app = express();
const mongoURL = process.env.MONGO_URL;
const port = process.env.PORT || 3000;
let stopSpam = false;
let spamInitiatorId = null;

const authorizedParticipants = [
  process.env.SUHANI_ID,
  process.env.KEVIN_ID,
  process.env.RAUNAK_ID,
  process.env.SWATI_ID,
  process.env.AADHISHREE_ID,
  process.env.ASTERIN_ID,
  process.env.RIDHIMA_ID,
];

const localFolderPath = "./auth_info_baileys"; // Path to the local folder you want to sync
const storageFolderPath = "auth_info_baileys"; // Path in Firebase Storage

let bucket;
async function uploadToFirebase(bucket) {
  try {
    console.log("Uploading local folder to Firebase...");
    await uploadFolder(localFolderPath, storageFolderPath, bucket); // Upload the folder
    console.log("Folder uploaded to Firebase successfully.");
  } catch (err) {
    console.error("Error uploading folder:", err);
  }
}

async function downloadFromFirebase(bucket) {
  try {
    console.log("Downloading folder from Firebase...");
    await downloadFolder(storageFolderPath, localFolderPath, bucket); // Download the folder
    console.log("Folder downloaded from Firebase successfully.");
  } catch (err) {
    console.error("Error downloading folder:", err);
  }
}

async function connectToWhatsApp() {
  // Wait for Firebase initialization and get the bucket
  bucket = await initializeFirebase();

  if (fs.existsSync(localFolderPath)) {
    console.log("Local folder found, proceeding with bot setup...");
  } else {
    // If the local folder doesn't exist, download it from Firebase
    console.log("Local folder not found, downloading from Firebase...");
    await downloadFromFirebase(bucket);

    const { state, saveCreds } = await useMultiFileAuthState(localFolderPath);
    await saveCreds(); // Save the credentials after loading
    console.log("Credentials saved successfully after download.");

    await delay(2000);
  }

  const { state, saveCreds } = await useMultiFileAuthState(localFolderPath); // this will be called as soon as the credentials are updated
  // const collection = mongoClient.db("Cluster1").collection("authState");
  // const { state, saveCreds } = await useMongoDBAuthState(collection);
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

  // sock.ev.on("creds.update", async () => {
  //   await saveCreds();
  //   const newProfileName = "~Asterin041";
  //   await updateProfileName(sock, newProfileName);
  // });

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
  try {
    const messageZero = messageUpdate.messages[0];
    const { key, message } = messageZero;
    if (!message) return;

    const { remoteJid } = key;
    //  if(remoteJid !== process.env.JINDAGI_JHAND_REMOTEJ_ID) return;
    const messageText =
      message.conversation || message.extendedTextMessage?.text;
    // console.log("messageUpdate", messageUpdate);
    // console.log("remoteJid", remoteJid);
    // console.log("messageText", messageText);
    if (!messageText) {
      return;
    }
    //if participant not authorized then enter || if the message is not from me then also enter
    if (!(authorizedParticipants.includes(key.participant) || key.fromMe)) {
      if (!key.participant) return;
      // Inform the user if they are not authorized
      // const notAuthorizedMessage = "You are not authorized to use this command.";
      // await sock.sendMessage(remoteJid, {
      //   text: notAuthorizedMessage,
      // });
      return;
    }

    const myPhone = sock.user.id.split(":")[0];
    const myId = myPhone + "@s.whatsapp.net";
    const mentions =
      message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    //mentionedJid = ids of all the members that have been tagged in the current message

    if (messageText.toLowerCase().includes("stop") && mentions.includes(myId)) {
      if (!spamInitiatorId) {
        console.log("No spam initiator found.");
        return;
      }
      if (spamInitiatorId === key.participant) {
        stopSpam = true; // Set flag to stop spamming
        console.log("Spam stopped by initiator.");
      } else {
        console.log("Only the spam initiator can stop the spam.");
      }
      return; // Exit function
    }

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

    
    if (messageText === '@919868129121' ) {
      await sendTaggedReply(remoteJid, sock, key);
      return;
    }

    if (mentions.includes(myId)) {
      // const numberPattern = /\s\d+\s/;

      const doubleQuotesPattern = /“([^“]+)”|"([^"]+)"/; // Adjusted pattern to directly capture text inside quotes

      const newMessageText = messageText.replace(`@${myPhone}`, "");
      const extractedTextMatch = newMessageText.match(doubleQuotesPattern);

      if (!extractedTextMatch[1]) {
        extractedTextMatch[1] = extractedTextMatch[0].replaceAll('"', "");
      }

      const extractedTextAfterQuotes = newMessageText
        .substring(
          newMessageText.indexOf(extractedTextMatch[0]) +
            extractedTextMatch[0].length
        )
        .trim();

      // Check if the extracted text contains a number pattern
      const numberPattern = /\d+/; // Pattern to match numbers
      const extractedNumberMatch =
        extractedTextAfterQuotes.match(numberPattern);

      if (
        (messageText.includes("Spam") || messageText.includes("spam")) &&
        extractedNumberMatch &&
        extractedTextMatch
      ) {
        console.log("I can spam now");
        await spamMessage(
          remoteJid,
          sock,
          extractedNumberMatch[0],
          extractedTextMatch[1],
          key
        );
      } else {
        console.log("No spam detected");
        await sendTaggedReply(remoteJid, sock, key);
      }
    }
    if (messageText.includes("!help") || messageText.includes("!Help")) {
      await help(remoteJid, sock, key);
    }
    if (
      messageText.includes("Good morning") ||
      messageText.includes("good morning") ||
      messageText.includes("Good Morning") ||
      messageText.includes("Good night") ||
      messageText.includes("good night") ||
      messageText.includes("Goodnight")
    ) {
      await reactToMessage(remoteJid, sock, key);
    }
  } catch (error) {
    console.log("Error in handleMessagesUpsert", error);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function spamMessage(
  remoteJid,
  sock,
  extractedNumber,
  extractedText,
  messageKey
) {
  try {
    console.log("Extracted number:", extractedNumber);
    console.log("Extracted text:", extractedText);
    spamInitiatorId = messageKey.participant;
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const myId = `${sock.user.id.split(":")[0]}@s.whatsapp.net`;
    const filteredParticipants = groupMetadata.participants.filter(
      (participant) =>
        participant.id !== myId && participant.id !== messageKey.participant
    );

    let mentionIds = [];

    const mentionText = filteredParticipants
      .map((p) => `@${p.id.split("@")[0]}`)
      .join(" ");

    //check if my extracted text contains a tag, by tallying it with mentionText

    // const sampleMentionText = "@919999999999 @919999999998 @919999999997";
    // const sampleExtractedText = "Hello @91999999999123 @91999999999123 @91999999999123";

    const phoneNumberPattern = /@(\d+)/g;
    const phoneNumberMatches = [...extractedText.matchAll(phoneNumberPattern)]; //found a @tag in " "

    phoneNumberMatches.forEach((match) => {
      const phoneNumber = match[1]; // Extracted phone number
      if (mentionText.includes(phoneNumber)) {
        mentionIds.push(`${phoneNumber}@s.whatsapp.net`);
      }
    });

    console.log("mentionIds:", mentionIds);

    let count = parseInt(extractedNumber);
    for (let i = 0; i < count; i++) {
      if (stopSpam) {
        stopSpam = false; // Reset the flag after stopping
        spamInitiatorId = null; // Reset the initiator ID
        break;
      }

      await sock.sendMessage(remoteJid, {
        text: extractedText,
        mentions: mentionIds,
      });
      await delay(500); // Adding delay between messages
    }
  } catch (error) {
    console.log("Error while spamming:", error);
  }
}

// async function spamMessage(remoteJid, sock, newMessageText, messageKey) {
//   try {
//     //extract the message and the number
//     const numberPattern = /\s\d+\s/;
//     const extractedNumber = newMessageText.match(numberPattern)[0]; // Extract the first matched number
//     console.log("Extracted number:", extractedNumber);
//     const doubleQuotesPattern =  /"([^"]+)"/; // Regular expression to match text enclosed in double quotes

//     const quotesMatch = newMessageText.match(doubleQuotesPattern);
//     let extractedText = "";
//     if (quotesMatch) {
//         extractedText = quotesMatch[1]; // Extract the first matched text within double quotes
//         console.log("Extracted text:", extractedText);
//     } else {
//         console.log("No text found in double quotes.");
//     }

//     const groupMetadata = await sock.groupMetadata(remoteJid);
//     const myId = sock.user.id.split(":")[0];
//     const participants = groupMetadata.participants;
//     const filteredParticipants = participants.filter(
//       (participant) =>
//         participant.id !== myId + "@s.whatsapp.net" &&
//         participant.id !== messageKey.participant
//     );

//     console.log(filteredParticipants);
//     const mentionText = filteredParticipants
//       .map((p) => `@${p.id.split("@")[0]}`)
//       .join(" ");

//     // ----------------------------------------

//     const phoneNumberPattern = /@(\d+)/g;
//     const phoneNumberMatches = [...extractedText.matchAll(phoneNumberPattern)]; //found a @tag in " "
//     let mentionIds = [];

//     phoneNumberMatches.forEach(match => {
//       const phoneNumber = match[1]; // Extracted phone number
//       mentionIds.push(`${phoneNumber}@s.whatsapp.net`);
//     });

//     if (phoneNumberMatches) {

//       // If my extracted text has a tag then just
//       if (extractedText.includes(mentionText)) {
//         const mentions = filteredParticipants
//           .filter((p) => p.id.includes(phoneNumber))
//           .map((p) => p.id);
//         console.log("Mentions:", mentions);
//       }
//     }

//     // -----------------------------------------------

//     let count = parseInt(extractedNumber);
//     for (let i = 0; i < count; i++) {
//       await sock.sendMessage(remoteJid, {
//         text: extractedText,
//         mentions: mentionIds,
//       });
//       await delay(500); // Adding a 1-second delay between messages
//     }
//   } catch (error) {
//     console.log("Error while spamming ", error);
//   }
// }

async function help(remoteJid, sock, messageKey) {
  try {
    if (!messageKey.participant) return;
    const responseText =
      `I can help you with the following commands:\n\n` +
      `1. *!tagAll* or *!TagAll* - Tag all members in the group.\n\n` +
      `2. *!tag* or *!Tag* - Tag all members in the group, excluding Suhani madam🫡.\n\n` +
      `3. *"Good morning"* or *"Good night"* - React with a flower emoji🌸.\n\n` +
      `4. "*@Asterin041 Spam \"<text to spam>\" <number>*" - Tag me and provide a number and a message in double quotes to spam the group.\n\n` +
      `5. "*Stop @Asterin041*" - Tag me and I will stop spamming only the person who initiated the spam can make it stop.`;

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

async function tagAllMembers(remoteJid, sock, messageKey) {
  try {
    if (!messageKey.participant) return;
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const myId = sock.user.id.split(":")[0];
    const participants = groupMetadata.participants;
    const filteredParticipants = participants.filter(
      (participant) =>
        participant.id !== myId + "@s.whatsapp.net" &&
        participant.id !== messageKey.participant
    );
    // console.log(filteredParticipants);
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
    if (!messageKey.participant) return;
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
  if (!messageKey.participant) return;
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
    if (!messageKey.participant) return;
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const myId = sock.user.id.split(":")[0];
    const participants = groupMetadata.participants;
    const filteredParticipants = participants.filter(
      (participant) =>
        participant.id !== myId + "@s.whatsapp.net" &&
        participant.id !== excludeId &&
        participant.id !== messageKey.participant
    );
    // console.log(filteredParticipants);
    const mentions = filteredParticipants.map((p) => p.id);
    const isSuhaniId = participants.find((p) => p.id === excludeId); // Check if suhani is in the group
    const addExtraMention =
      messageKey.participant === excludeId || !isSuhaniId ? "" : extraMention;
    //join is just joining all the elements of the array seperated by a space
    const mentionText =
      filteredParticipants.map((p) => `@${p.id.split("@")[0]}`).join(" ") +
      " " +
      addExtraMention;
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

// Upload periodically to Firebase (in case the folder keeps getting updated)
setInterval(async () => {
  console.log("Periodic upload to Firebase...");
  await uploadToFirebase(bucket);
}, 60 * 60 * 1000); // Every hour, or any interval you prefer

app.get("/", (req, res) => {
  res.send("WhatsApp bot is running");
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
