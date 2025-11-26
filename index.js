const http = require("http");
const path = require("path");
const fs = require("fs");

const PORT = 5000;
const SERVER_ID = "905907220477255740";

// Import du module GitHub Data Manager
const GitHubDataManager = require("./github-data-manager.js");

let dataManager;
let serverData = null;

const connectedClients = new Set();

global.broadcastNewMessage = function (channelId, message) {
    const messageData = JSON.stringify({
        type: "newMessage",
        channelId: channelId,
        message: message,
        timestamp: new Date().toISOString(),
    });

    connectedClients.forEach((client) => {
        try {
            client.write(`data: ${messageData}\n\n`);
        } catch (error) {
            connectedClients.delete(client);
        }
    });
};

const server = http.createServer((req, res) => {
    if (req.url === "/api/discord-data") {
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify(serverData || {}));
        return;
    }

    if (req.url.startsWith("/api/messages/")) {
        const channelId = req.url.split("/")[3];
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        });

        res.end(JSON.stringify({ messages: [] }));
        return;
    }

    if (req.url === "/api/members") {
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        });

        if (!serverData || !serverData.members) {
            return res.end(
                JSON.stringify({
                    members: {},
                    roleMembers: {},
                }),
            );
        }

        return res.end(
            JSON.stringify({
                members: serverData.members,
                roleMembers: serverData.roleMembers || {},
            }),
        );
    }

    if (req.url === "/api/events") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
        });

        connectedClients.add(res);
        res.write(
            'data: {"type":"connected","message":"Connexion établie"}\n\n',
        );

        req.on("close", () => {
            connectedClients.delete(res);
        });
        return;
    }

    let filePath = req.url === "/" ? "/discord-ui.html" : req.url;
    filePath = path.join(__dirname, filePath);

    const extname = path.extname(filePath);
    const contentTypes = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".ttf": "font/ttf",
    };

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end("Page non trouvée");
        } else {
            res.writeHead(200, {
                "Content-Type": contentTypes[extname] || "text/plain",
            });
            res.end(content);
        }
    });
});

async function initialize() {
    try {
        console.log("🚀 Démarrage du système Discord...");

        dataManager = new GitHubDataManager(
            process.env.TOKEN_GITHUB,
            "TheBlueEL",
            "Discord_Website_Data",
            SERVER_ID,
        );

        console.log("📂 Chargement des données depuis GitHub...");
        await dataManager.initialize();

        serverData = await prepareServerData();

        console.log("✅ Système prêt !");
    } catch (error) {
        console.error("❌ Erreur d'initialisation:", error.message);
    }
}

async function prepareServerData() {
    const guildInfo = dataManager.getData("info", "guild_info");
    const channelInfo = dataManager.getData("info", "channel_info");
    const categoryInfo = dataManager.getData("info", "category_info");
    const roleInfo = dataManager.getData("info", "role_info");

    if (!guildInfo || Object.keys(guildInfo).length === 0) {
        console.warn("⚠️ Aucune donnée de guild dans GitHub");
        return {
            guild: {},
            channels: {
                textChannels: [],
                voiceChannels: [],
                categories: [],
                forumChannels: [],
                stageChannels: [],
                threads: [],
                other: [],
            },
            roles: [],
            members: {},
        };
    }

    const allChannels = Object.values(channelInfo || {});
    const allCategories = Object.values(categoryInfo || {});

    console.log(
        `📊 Données chargées: ${allChannels.length} canaux, ${allCategories.length} catégories`,
    );

    // Charger les membres depuis GitHub
    let members = {};
    try {
        const memberListData = await dataManager.getFile(
            `members/member_list.json`,
        );
        members = memberListData[SERVER_ID] || {};
        console.log(
            `✅ ${Object.keys(members).length} membres chargés depuis GitHub`,
        );
    } catch (error) {
        console.error("⚠️ Erreur chargement membres:", error.message);
    }

    return {
        guild: guildInfo,
        channels: {
            textChannels: allChannels.filter((ch) => ch.type === 0),
            voiceChannels: allChannels.filter((ch) => ch.type === 2),
            categories: allCategories,
            forumChannels: allChannels.filter((ch) => ch.type === 15),
            stageChannels: allChannels.filter((ch) => ch.type === 13),
            threads: allChannels.filter(
                (ch) => ch.type === 11 || ch.type === 12 || ch.type === 10,
            ),
            other: allChannels.filter(
                (ch) => ![0, 2, 4, 13, 15, 11, 12, 10].includes(ch.type),
            ),
        },
        roles: Object.values(roleInfo || {}).sort(
            (a, b) => b.position - a.position,
        ),
        members: members,
    };
}

setInterval(async () => {
    try {
        console.log("📤 Synchronisation avec GitHub...");
        await dataManager.syncToGitHub();
        console.log("✅ Données synchronisées avec GitHub");
    } catch (error) {
        console.error("❌ Erreur synchronisation GitHub:", error.message);
    }
}, 30000);

setInterval(async () => {
    serverData = await prepareServerData();
}, 10000);

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Interface web sur http://0.0.0.0:${PORT}`);
});

initialize();

process.on("SIGINT", () => {
    console.log("\nArrêt...");
    server.close();
    process.exit(0);
});
