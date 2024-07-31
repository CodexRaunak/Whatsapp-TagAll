import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys"); // this will be called as soon as the credentials are updated

  const sock = makeWASocket({
    //make connection to whatsapp backend
    // can provide additional config here
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("connection.update", (update) =>
    handleConnectionUpdate(update, sock)
  );

  sock.ev.on("creds.update", saveCreds);
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
  if(remoteJid !== "120363221844976622@g.us") return;
  const messageText = message?.conversation;
  // console.log("messageUpdate", messageUpdate);
  // console.log("remoteJid", remoteJid);
  // console.log("messageText", messageText);

  if (messageText === "!tagAll") {
    await tagAllMembers(remoteJid, sock);
  } else if (messageText === "!tag") {
    await tagAllExceptOne(
      remoteJid,
      sock,
      "919250626562@s.whatsapp.net",
      "@suhani"
    );
  }
}

async function tagAllMembers(remoteJid, sock) {
  try {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const myId = sock.user.id.split(":")[0];
    const participants = groupMetadata.participants;
    const filteredParticipants = participants.filter(
      (participant) => participant.id !== myId + "@s.whatsapp.net"
    );
    console.log(filteredParticipants);
    const mentions = filteredParticipants.map((p) => p.id);
    //join is just joining all the elements of the array seperated by a space
    const mentionText = filteredParticipants
      .map((p) => `@${p.id.split("@")[0]}`)
      .join(" ");
    await sock.sendMessage(remoteJid, {
      text: mentionText,
      mentions: mentions,
    });
    console.log("Tagged all members in the group, excluding yourself");
  } catch (error) {
    console.log("Error tagging all members:", error);
  }
}

async function tagAllExceptOne(remoteJid, sock, excludeId, extraMention) {
  try {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const myId = sock.user.id.split(":")[0];
    const participants = groupMetadata.participants;
    const filteredParticipants = participants.filter(
      (participant) =>
        participant.id !== myId + "@s.whatsapp.net" &&
        participant.id !== excludeId
    );
    console.log(filteredParticipants);
    const mentions = filteredParticipants.map((p) => p.id);
    //join is just joining all the elements of the array seperated by a space
    const mentionText =
      filteredParticipants.map((p) => `@${p.id.split("@")[0]}`).join(" ") +
      " " +
      extraMention;
    await sock.sendMessage(remoteJid, {
      text: mentionText,
      mentions: mentions,
    });
    console.log("Tagged all members in the group, excluding yourself");
  } catch (error) {
    console.log("Error tagging all members:", error);
  }
}
connectToWhatsApp();
