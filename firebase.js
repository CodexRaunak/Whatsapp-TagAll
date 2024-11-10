// Import the Firebase Admin SDK
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
// Initialize Firebase Admin SDK
const initializeFirebase = async () => {
    return new Promise((resolve, reject) => {
      try {
        // Initialize Firebase Admin SDK
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
          storageBucket: "asterin041.appspot.com", // Your Firebase Storage bucket
        });
  
        console.log("Firebase initialized successfully.");
        const bucket = admin.storage().bucket(); // Now, initialize bucket after Firebase is initialized
        resolve(bucket); // Resolve with bucket so it can be used later
      } catch (err) {
        console.error("Error initializing Firebase:", err);
        reject(err); // Reject the promise if initialization fails
      }
    });
  };

//
const uploadFolder = async (folderPath, storageFolder,bucket) => {
  try {
    const files = fs.readdirSync(folderPath); // Get all files in the folder
    files.forEach((file) => {
      const filePath = path.join(folderPath, file); // Full path to the file
      const storagePath = path.join(storageFolder, file); // Path in Firebase Storage

      // Upload each file
      bucket.upload(
        filePath,
        {
          destination: storagePath, // Path in Firebase Storage
          public: true, // Optional: Make the file publicly accessible
        },
        (err, file) => {
          if (err) {
            console.log("Error uploading file:", filePath, err);
          } else {
            console.log("File uploaded successfully:", file.name);
          }
        }
      );
    });
  } catch (error) {
    console.log("Error uploading files:", error);
  }
};


//   uploadFolder('./auth_info_baileys', 'auth_info_baileys');

const downloadFolder = async (storageFolder, localFolder,bucket) => {
  try {
    const [files] = await bucket.getFiles({ prefix: storageFolder }); // Get all files in the folder

    files.forEach((file) => {
      const localFilePath = path.join(localFolder, path.basename(file.name)); // Local path to save the file

      file.download({ destination: localFilePath }, (err) => {
        if (err) {
          console.log("Error downloading file:", file.name, err);
        } else {
          console.log("File downloaded successfully:", localFilePath);
        }
      });
    });
  } catch (error) {
    console.log("Error fetching files:", error);
  }
};

// downloadFolder("auth_info_baileys", "./auth_info_baileys");

module.exports = { uploadFolder,downloadFolder,initializeFirebase}
