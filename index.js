const makeWASocket = require("@whiskeysockets/baileys").default;
const axios = require("axios");
const nodeCron = require("node-cron");
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
  getUrlInfo,
} = require("@whiskeysockets/baileys");
// const { MongoClient } = require("mongodb");
// const useMongoDBAuthState = require("./mongoAuthState.js");
// const { useMongoDBAuthState } = require("mongo-baileys");
const { DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
// const chokidar = require('chokidar');

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const app = express();
const mongoURL = process.env.MONGO_URL;
const port = process.env.PORT || 3000;
const MAX_SENT_ARTICLES = 50;
let stopSpam = false;
let spamInitiatorId = null;
let sentArticles = [];

const authorizedParticipants = [
  process.env.SUHANI_ID,
  process.env.KEVIN_ID,
  process.env.RAUNAK_ID,
  process.env.SWATI_ID,
  process.env.AADHISHREE_ID,
  process.env.ASTERIN_ID,
];

const localFolderPath = path.normalize(
  path.join(__dirname, "auth_info_baileys")
); // Path to the local folder you want to sync
console.log(localFolderPath);

let bucket;
async function uploadToFirebase(bucket) {
  try {
    console.log("Uploading local folder to Firebase...");
    await uploadFolder(localFolderPath, bucket); // Upload the folder
    console.log("Folder uploaded to Firebase successfully.");
  } catch (err) {
    console.error("Error uploading folder:", err);
  }
}

async function downloadFromFirebase(bucket) {
  try {
    console.log("Downloading folder from Firebase...");
    await downloadFolder(localFolderPath, bucket); // Download the folder
    console.log("Folder downloaded from Firebase successfully.");
  } catch (err) {
    console.error("Error downloading folder:", err);
  }
}

async function connectToWhatsApp() {
  try {
    //Wait for Firebase initialization and get the bucket
  if(!bucket) {
    console.log("Bucket not found, initializing");
    bucket = await initializeFirebase();
  }  

  if (fs.existsSync(localFolderPath)) {
    console.log("Local folder found, proceeding with bot setup...");
  } else {
    // If the local folder doesn't exist, download it from Firebase
    console.log("Local folder not found, downloading from Firebase...");
    await downloadFromFirebase(bucket);

    const { state, saveCreds } = await useMultiFileAuthState(localFolderPath);
    await saveCreds(); // Save the credentials after loading
    console.log("Credentials saved successfully after download.");

    await delay(3000);
  }
  } catch (error) {
   console.log("Error in connectToWhatsApp", error); 
  }
  
  try {
    const downloadedFiles = fs
      .readdirSync(localFolderPath)
      .map((file) => path.join(localFolderPath, file)) // Combine the full path
      .map((fullPath) => path.normalize(fullPath)); // Normalize the full path

    console.log("Contents after download:", downloadedFiles);
  } catch (err) {
    console.error("Error downloading folder:", err);
  }

  const { state, saveCreds } = await useMultiFileAuthState(localFolderPath); // this will be called as soon as the credentials are updated
  // const collection = mongoClient.db("Cluster1").collection("authState");
  // const { state, saveCreds } = await useMongoDBAuthState(collection);
  const WHATSAPP_VERSION = [2, 3000, 1027934701];  // Issue 1939: https://github.com/WhiskeySockets/Baileys/issues/1939
  const sock = makeWASocket({
    //make connection to whatsapp backend
    // can provide additional config here
    version: WHATSAPP_VERSION,
    printQRInTerminal: true,
    auth: state,
    keepAliveIntervalMs: 20000,
    defaultQueryTimeoutMs: 0,
    generateHighQualityLinkPreview: true,
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

async function handleConnectionUpdate(update, sock) {
  const { connection, lastDisconnect, qr } = update || {};
  if (qr) {
    console.log(qr);
    const QRCode = require("qrcode-terminal");
    QRCode.generate(qr, { small: true });
  }
  if (connection === "close") {
    const shouldReconnect =
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

    if (shouldReconnect) {
      connectToWhatsApp();
    }
  } else if (connection == "open") {
    console.log("opened connection");
    try {
      nodeCron.schedule("0 11 * * *",  async () => {
        console.log("Cron job triggered for news!");
        // Check if socket is open before sending a message
        if (sock.ws?.readyState === sock.ws.OPEN) {
          try {
            await sendDailyNews(sock, process.env.CODE_ON_REMOTEJ_ID);
          } catch (sendError) {
            console.error("Error sending message:", sendError);
          }
        } else {
          console.error("Socket is not open. Unable to send message.");
        }
      }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
      });

      nodeCron.schedule("0 9 * * *",  async () => {
        console.log("Cron job triggered for quotes!");
        // Check if socket is open before sending a message
        if (sock.ws?.readyState === sock.ws.OPEN) {
          try {
            await sendDailyQuote(sock, process.env.CODE_ON_REMOTEJ_ID);
          } catch (sendError) {
            console.error("Error sending message:", sendError);
          }
        } else {
          console.error("Socket is not open. Unable to send message.");
        }
      }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
      });
      console.log("Cron job scheduled successfully!");
    } catch (error) {
      console.error("Error during cron job setup:", error);
    }
  }
}

async function handleMessagesUpsert(messageUpdate, sock) {
  try {
    const messageZero = messageUpdate.messages[0];
    // console.log("New message received:", messageZero);
    const { key, message } = messageZero;
    // console.log("Message key:", key);
    // console.log("Message content:", message);

    // --- ID debug prints (helpful to update env vars) ---
    // try {
    //   const participantId = key?.participant || null;
    //   console.log('DEBUG: participantId (raw):', participantId);
    //   const rawMentions = message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    //   // Resolve mention display names from socket contact cache when available
    //   const rawMentionsResolved = rawMentions.map(m => ({
    //     jid: m,
    //     name: (sock.contacts && sock.contacts[m] && (sock.contacts[m].notify || sock.contacts[m].name)) || null
    //   }));
    //   console.log('DEBUG: raw mentionedJids:', rawMentionsResolved);

    //   // Try to print group participants mapping (id -> name)
    //   try {
    //     const gm = await sock.groupMetadata(key.remoteJid);
    //     const participantList = (gm.participants || []).map(p => ({
    //       id: p.id,
    //       name: (sock.contacts && sock.contacts[p.id] && (sock.contacts[p.id].notify || sock.contacts[p.id].name)) || null
    //     }));
    //     console.log('DEBUG: group participants (id -> name):', participantList);
    //   } catch (e) {
    //     // If not a group or metadata not available, just skip
    //     console.log('DEBUG: groupMetadata not available or not a group');
    //   }
    // } catch (e) {
    //   console.log('DEBUG: error while printing ids', e);
    // }
    if (!message) return;

    const { remoteJid } = key;
    // console.log("remoteJid", remoteJid);
    //  if(remoteJid !== process.env.JINDAGI_JHAND_REMOTEJ_ID) return;
    const messageText =
      message.conversation || message.extendedTextMessage?.text;
    
    // console.log("Extracted messageText:", messageText);
    // console.log("messageUpdate", messageUpdate);
    // console.log("remoteJid", remoteJid);
    // console.log("messageText", messageText);
    if (!messageText) {
      return;
    }
    //if participant not authorized then enter || if the message is not from me then also enter
    if (!(authorizedParticipants.includes(key.participant) || key.fromMe)) {
      // console.log("User not authorized:", key.participant);
      if (!key.participant) return;
      // Inform the user if they are not authorized
      // const notAuthorizedMessage = "You are not authorized to use this command.";
      // await sock.sendMessage(remoteJid, {
      //   text: notAuthorizedMessage,
      // });
      return;
    }
    
    const myPhone = sock.user.id.split(":")[0];
    const myId = process.env.ASTERIN_ID;
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
      // console.log("Tagging all members in group:", remoteJid);
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

    // if (messageText === "@" + myPhone) {
    //   await sendTaggedReply(remoteJid, sock, key);
    //   return;
    // }
    // console.log("mentions", mentions, "myId", myId);
    if (mentions.includes(myId)) {
      // const numberPattern = /\s\d+\s/;

      const doubleQuotesPattern = /“([^“]+)”|"([^"]+)"/; // Adjusted pattern to directly capture text inside quotes

      const newMessageText = messageText.replace(`@${myPhone}`, "");
      const extractedTextMatch = newMessageText.match(doubleQuotesPattern);
      // console.log("extractedTextMatch", extractedTextMatch);
      if (!extractedTextMatch) {
        //case to prevent err if the message is for getting "YEAH"
        await sendTaggedReply(remoteJid, sock, key);
        return;
      }
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
    const myId = process.env.ASTERIN_ID;
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

  // Match @<digits> optionally followed by a domain (e.g. @lid or @s.whatsapp.net)
  // capture digits in group 1
  const phoneNumberPattern = /@(\d+)(?:@[a-zA-Z0-9.\-]+)?/g;
  const phoneNumberMatches = [...extractedText.matchAll(phoneNumberPattern)]; //found a @tag in " "

    phoneNumberMatches.forEach((match) => {
      const phoneNumber = match[1]; // Extracted phone number
      if (mentionText.includes(phoneNumber)) {
        mentionIds.push(`${phoneNumber}@lid`);
      }
    });

    console.log("mentionIds:", mentionIds);

    let count = parseInt(extractedNumber);
    for (let i = 0; i < count; i++) {
      try {
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
      } catch (error) {
        console.log("Error while spamming:", error);
        if (error.data === 429) {
          console.log("Rate limit hit, pausing for a bit...");
          await new Promise((resolve) => setTimeout(resolve, 10000)); // 10-second delay before retrying
        }
      }
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
    // console.log("Tagging all members in group:", remoteJid);
    // console.log("messageKey:", messageKey);
    const groupMetadata = await sock.groupMetadata(remoteJid);
    // console.log("groupMetadata:", groupMetadata);
    const myId = process.env.ASTERIN_ID;
    // console.log("myId:", myId);
    const participants = groupMetadata.participants;
    // console.log("participants:", participants);
    const filteredParticipants = participants.filter(
      (participant) =>
        participant.id !== myId &&
        participant.id !== messageKey.participant
    );
    // console.log(filteredParticipants);
    const mentions = filteredParticipants.map((p) => p.id);
    // console.log("mentions:", mentions);
    //join is just joining all the elements of the array seperated by a space
    //logic check now 11th october
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
    const myId = process.env.ASTERIN_ID;
    const participants = groupMetadata.participants;
    const filteredParticipants = participants.filter(
      (participant) =>
        participant.id !== myId &&
        participant.id !== excludeId &&
        participant.id !== messageKey.participant
    );
    // console.log(filteredParticipants);
    const mentions = filteredParticipants.map((p) => p.id);
    const isSuhaniId = participants.find((p) => p.id === excludeId); // Check if suhani is in the group
    const addExtraMention =
      messageKey.participant === excludeId || !isSuhaniId ? "" : extraMention;
    //join is just joining all the elements of the array seperated by a space
    //logic check now 11th october
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

async function fetchNews() {
  try {
    const res = await axios.get(
      `https://newsapi.org/v2/everything?q=technology+AI&domains=techcrunch.com,thenextweb.com&apiKey=${process.env.NEWS_API_KEY}`
    );
    const articles = res.data.articles;
    let articleToSend = null;
    for (let article of articles) {
      if (
        !sentArticles.find((sentArticle) => sentArticle.url === article.url)
      ) {
        articleToSend = article;
        break;
      }
    }
    if (!articleToSend) {
      console.log("No new articles to send.");
      return "No new articles to send.";
    }
    console.log("Sending article:", articleToSend.title);

    sentArticles.push({
      url: articleToSend.url,
      timestamp: articleToSend.publishedAt,
    });

    if (sentArticles.length > MAX_SENT_ARTICLES) {
      sentArticles.shift(); // Remove the oldest article
    }

    console.log("Sent Articles:", sentArticles);
    return articleToSend;
  } catch (e) {
    console.log("Error fetching news", e);
    return "Unable to fetch news.";
  }
}

async function fetchQuotes() {
    try {
        const res = await axios.get("https://zenquotes.io/api/today");
        const quote = res.data[0];
        const message = `"`  + quote.q + `"` +  " — " + quote.a;
        console.log("Fetching quote:" + `"`  + quote.q + `"` +  " — " + quote.a);
        return message;
    } catch (e) {
        console.log("Error fetching quote", e);
        return "Unable to fetch quote.";
    }
}

async function sendDailyQuote(sock, jid) {
  try {
    const quote = await fetchQuotes();
    if (sock.ws?.readyState !== sock.ws.OPEN) {
      console.error("Socket is not open. Retrying in 5 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (sock.ws?.readyState !== sock.ws.OPEN) {
        console.error("Socket still not open. Skipping message send.");
        return;
      }
    }
    await sock.sendMessage(jid, { text: quote });
    console.log("Quote sent successfully!");
  } catch (error) {
    console.error("Error sending daily quote:", error);
    // Optionally, I will add retry logic here if needed 
  }
};

async function sendDailyNews(sock, jid) {
  try {
    const news = await fetchNews();
    const urlFromText = news.url;
    const message = news.title + " - " + news.url;

    let linkPreview = null;

  if (urlFromText) {
    try {
      // Fetch link preview
      linkPreview = await getUrlInfo(urlFromText, {
        thumbnailWidth: 1200,
        fetchOpts: {
          timeout: 5000, // 5-second timeout
        },
        uploadImage: sock.waUploadToServer,
      });
    } catch (error) {
      console.error("Error fetching link preview:", error);
    }
  }
  if (sock.ws?.readyState !== sock.ws.OPEN) {
    console.error("Socket is not open. Retrying in 5 seconds...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (sock.ws?.readyState !== sock.ws.OPEN) {
      console.error("Socket still not open. Skipping daily news send.");
      return;
    }
  }

  if(!linkPreview) {  // avoid sending the news when no link preview is available
    console.log("Link preview not available. Skipping news send.");
    return;
  }
  // Send the news message
  await sock.sendMessage(jid, {
    text: message,
    linkPreview,
  });
  console.log("News sent successfully!");
} catch (error) {
  console.error("Error sending daily news:", error);
}
}

connectToWhatsApp();

// Upload periodically to Firebase (in case the folder keeps getting updated)
setInterval(async () => {
  console.log("Periodic upload to Firebase...");
  await uploadToFirebase(bucket);
}, 60 * 60 * 1000); // Every hour

// if (localFolderPath) {

//   try {
//     chokidar.watch(localFolderPath, { persistent: true }).on('all', async (event, path) => {
//       console.log(`Change detected: ${event} on ${path}`);

//       if (['add', 'change'].includes(event)) {
//         console.log("Triggering upload to Firebase...");
//         await uploadToFirebase(bucket);
//       }
//     }); } catch(error) {
//     console.log("Error while watching auth_info_baileys: " + error);
//   }
// }

const url = `https://whatsapp-tagall.onrender.com/`; 
const interval = 30000; // Interval in milliseconds (30 seconds)

function reloadWebsite() {
  axios.get(url)
    .then(response => {
      console.log(`Reloaded at ${new Date().toISOString()}: Status Code ${response.status}`);
    })
    .catch(error => {
      console.error(`Error reloading at ${new Date().toISOString()}:`, error.message);
    });
}


setInterval(reloadWebsite, interval);

app.get("/", (req, res) => {
  res.send("WhatsApp bot is running");
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
