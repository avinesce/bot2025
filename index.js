const {
    default: makeWaSocket,
    DisconnectReason,
    useMultiFileAuthState,
    Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const inquirer = require("inquirer");
let useCode = {
    isTrue: true
};

const reactedStatuses = new Map();

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("Session");
    const sock = makeWaSocket({
        logger: pino({ level: "fatal" }),
        auth: state,
        printQRInTerminal: !useCode.isTrue,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 30000,
        browser: Browsers.macOS("Edge"),
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: true
    });

    if (useCode.isTrue && !sock.authState.creds.registered) {
        useCode = await inquirer.prompt({
            type: "confirm",
            name: "isTrue",
            message: "Terhubung pairing Code?",
            default: true
        });
        if (useCode.isTrue) {
            const waNumber = await inquirer.prompt({
                type: "number",
                name: "res",
                message: "Masukan Nomor WA Anda:"
            });
            const code = await sock.requestPairingCode(waNumber.res);
            console.log(`Code: ${code}`);
        } else {
            useCode.isTrue = false;
            connectToWhatsApp();
        }
    }

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("Menghubungkan ulang...");
                connectToWhatsApp();
            }
        }
        if (connection === "open") {
            console.log("Berhasil terhubung!");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async chatUpdate => {
        try {
            const message = chatUpdate.messages[0];
            if (!message) return;

            if (message.key && message.key.remoteJid === "status@broadcast") {
                if (!reactedStatuses.has(message.key)) {
                    const maxTime = 5 * 60 * 1000; // 5 minutes
                    const currentTime = Date.now();
                    const messageTime = message.messageTimestamp * 1000;
                    const timeDiff = currentTime - messageTime;

                    if (timeDiff <= maxTime) {
                        const emojis = [
                            "😱",
                            "💥",
                            "🚀",
                            "🌟",
                            "🐦",
                            "🎉",
                            "🐣",
                            "😺"
                        ];
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

                        try {
                            await sock.readMessages([message.key]);
                            await sock.sendMessage("status@broadcast", {
                                react: { 
                                    text: randomEmoji, 
                                    key: message.key 
                                },
                            }, { 
                                statusJidList: [message.key.participant] 
                            });
                            reactedStatuses.add(message.key);
                        } catch (error) {
                            console.error(
                                "Gagal memberi reaksi ke status",
                                error
                            );
                        }
                    }
                }
            }

        } catch (err) {
            console.log(err);
        }
    });
}

connectToWhatsApp()