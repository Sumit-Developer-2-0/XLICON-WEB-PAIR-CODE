const express = require('express');
const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const { upload } = require('./mega');
const { Mutex } = require('async-mutex');
const config = require('./config'); // Ensure sensitive data is in ENV variables
const rateLimit = require('express-rate-limit'); // Import rateLimit

const app = express();
const port = process.env.PORT || 3000; // Use process.env.PORT for flexibility
const SESSION_DIR = config.sessionDir || './session'; // Default session directory
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after an hour'
});

app.use(limiter); // Apply the rate limiter to all routes
app.use(express.json()); // Parse JSON request bodies

async function createWhatsAppSession(phoneNumber, res) {
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true }); // Ensure recursive creation
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const session = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
        },
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
        browser: Browsers.macOS("Safari"),
        markOnlineOnConnect: true,
        msgRetryCounterCache
    });

    session.ev.on('creds.update', saveCreds);

    session.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('Connected successfully');
            try {
                await delay(5000);
                const welcomeMessage = "Thank you for using our bot. Don't share your session ID.";
                const myr = await session.sendMessage(session.user.id, { text: welcomeMessage });

                const credsFilePath = `${SESSION_DIR}/creds.json`;
                const megaUploadURL = await uploadToMega(credsFilePath);

                if (megaUploadURL) {
                    const sessionID = config.PREFIX + megaUploadURL.split("https://mega.nz/file/")[1];
                    const sessionMessage = `*Session ID*\n\n${sessionID}`;
                    await session.sendMessage(session.user.id, { image: { url: "https://cdn.ironman.my.id/i/2iceb4.jpeg" }, caption: sessionMessage }, { quoted: myr });
                    console.log('Session ID sent successfully');
                } else {
                    console.error('Failed to upload session file to Mega.nz');
                }
            } catch (error) {
                console.error('Error during connection open:', error);
            } finally {
                await delay(1000);
                try {
                    fs.rmdirSync(SESSION_DIR, { recursive: true });
                    console.log('Session directory removed');
                } catch (rmdirError) {
                    console.error('Error removing session directory:', rmdirError);
                }
            }
        } else if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`Connection closed. Reason: ${reason}`);
            reconnect(reason, session); // Pass the session object
        } else if (connection === 'connecting') {
            console.log('Connecting to WhatsApp...');
        }
    });

    return session;
}

async function uploadToMega(filePath) {
    try {
        const megaURL = await upload(filePath);
        if (megaURL && megaURL.includes("https://mega.nz/file/")) {
            return megaURL;
        } else {
            console.warn(`Upload failed.  URL: ${megaURL}`);
            return null;
        }
    } catch (error) {
        console.error('Mega.nz upload failed:', error);
        return null;
    }
}

function reconnect(reason, session) { // Accept the session object
    const shouldReconnect = [
        DisconnectReason.connectionLost,
        DisconnectReason.connectionClosed,
        DisconnectReason.restartRequired
    ].includes(reason);

    if (shouldReconnect) {
        console.log('Connection lost, reconnecting...');
        createWhatsAppSession();
    } else {
        console.log(`Disconnected! Reason: ${reason}`);
        session.ws.close(); // Explicitly close the WebSocket connection
    }
}

app.get('/pair', async (req, res) => {
    const phoneNumber = req.query.code;

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    // Basic phone number validation (you can use a more robust regex)
    if (!/^\d+$/.test(phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const release = await mutex.acquire();

    try {
        const session = await createWhatsAppSession(phoneNumber, res);

        if (!session.authState.creds.registered) {
            await delay(1500);
            const normalizedPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            try {
                const code = await session.requestPairingCode(normalizedPhoneNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-');
                if (!res.headersSent) {
                    res.status(200).json({ code: formattedCode });
                } else {
                    console.warn('Headers already sent, cannot send pairing code');
                }
            } catch (pairingError) {
                console.error('Error requesting pairing code:', pairingError);
                res.status(500).json({ error: 'Failed to request pairing code' });
            }
        } else {
            console.log("Already Registered");
        }
    } catch (error) {
        console.error('Error in /pair route:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        release();
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
