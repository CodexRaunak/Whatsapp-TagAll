# Asterin041 WhatsApp Group Bot

Asterin041 is a customized WhatsApp bot designed to enhance group interactions and automate tasks. The bot is capable of tagging all group members, reacting to specific phrases, and performing group spam based on user commands. This README provides details on how to use, contribute to, and extend the bot.

## Features

Asterin041 can assist with the following commands:

### Tag All Members:

- **Command:** `!tagAll` or `!TagAll`
- **Description:** Tags all members in the group.
 ![image tag](https://i.ibb.co/DDz9nH0/IMG-3264.jpg)

### Good Morning / Good Night Reactions:

- **Command:** Just type "Good morning" or "Good night".
- **Description:** The bot will respond with a flower emoji 🌸.

### Spam the Group:

- **Command:** `@Asterin041 Spam "<text to spam>" <number>`
- **Description:** Tag the bot and specify a message in double quotes, along with a number, to spam the group with the provided message.\n
![help](https://i.ibb.co/xHsVPn0/image.png)

### Stop Spam:

- **Command:** `Stop @Asterin041`
- **Description:** The spam will stop only if the person who initiated the spam uses this command.

### Help:

- **Command:** `!help`
- **Description:** It will display all the commands and do they do.

![help](https://i.ibb.co/b1fHm73/image.png)

## Installation

To set up the bot locally, follow these steps:

### Clone the Repository:

```bash
git clone https://github.com/CodexRaunak/Whatsapp-TagAll
cd Whatsapp-TagAll
```

### Set Up Firebase
1. Create a Firebase project:
- Go to Firebase Console.
- Create a new project and set up the required configurations.
2. Generate Firebase Admin SDK Credentials:
- Go to Project Settings -> Service accounts.
- Generate a new private key and download the JSON file.
- Use the information from the JSON to set the following environment variables:

```bash
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key
```

### Authorization Configuration
- Ensure only specific users can access and use the bot by updating the authorizedParticipants array in your code:
``` bash
const authorizedParticipants = [
  process.env.yourname_ID,
  process.env.KEVIN_ID,
  // Add more participant environment variables as needed
]
```
- Configure env variables for the same 
``` bash
BOT_ID = "<phonenumber>@s.whatsapp.net"
```
### Run the Bot
Start the bot using:

``` bash
node index.js
```

