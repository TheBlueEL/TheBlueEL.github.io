const https = require("https");

class GitHubDataManager {
    constructor(token, owner, repo, serverId) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
        this.serverId = serverId;
        this.cache = {};
        this.updateQueue = new Map(); // Queue pour éviter les conflits
    }

    async initialize() {
        // Charger toutes les données depuis GitHub
        await this.loadAllData();

        // Fusionner les recent_messages dans messages
        await this.mergeRecentMessages();
    }

    async mergeRecentMessages() {
        console.log("🔄 Fusion des messages récents...");

        try {
            const recentMessages = await this.getFile(
                `recent_messages.json`,
            ).catch(() => ({}));

            if (!recentMessages || Object.keys(recentMessages).length === 0) {
                console.log("✅ Aucun message récent à fusionner");
                return;
            }

            // Pour chaque canal dans recent_messages
            for (const [channelId, messages] of Object.entries(
                recentMessages,
            )) {
                if (!messages || Object.keys(messages).length === 0) continue;

                console.log(
                    `📥 Fusion de ${Object.keys(messages).length} messages pour le canal ${channelId}`,
                );

                // Ajouter chaque message au système principal
                for (const [messageId, message] of Object.entries(messages)) {
                    await this.addMessage(channelId, message);
                }
            }

            // Vider le fichier recent_messages après fusion
            await this.updateFile(`recent_messages.json`, {});
            console.log("✅ Messages récents fusionnés et fichier vidé");
        } catch (error) {
            console.error("⚠️ Erreur fusion recent_messages:", error.message);
        }
    }

    async addRecentMessage(channelId, message) {
        // Charger les recent_messages existants
        let recentMessages = {};
        try {
            recentMessages = await this.getFile(`recent_messages.json`);
        } catch {
            recentMessages = {};
        }

        if (!recentMessages[channelId]) {
            recentMessages[channelId] = {};
        }

        recentMessages[channelId][message.id] = message;

        // Sauvegarder immédiatement (sans queue pour les nouveaux messages)
        await this.updateFile(`recent_messages.json`, recentMessages);
        console.log(
            `✅ Message ${message.id} ajouté à recent_messages pour le canal ${channelId}`,
        );
    }

    async syncToGitHub() {
        // Forcer l'écriture de toutes les données en attente vers GitHub
        const pendingUpdates = Array.from(this.updateQueue.keys());

        for (const key of pendingUpdates) {
            clearTimeout(this.updateQueue.get(key));
            this.updateQueue.delete(key);

            const [folder, filename] = key.split("/");
            try {
                await this.updateFile(
                    `${key}.json`,
                    this.cache[folder][filename],
                );
                console.log(`✅ ${key} synchronisé`);
            } catch (err) {
                console.error(`⚠️ Erreur sync ${key}:`, err.message);
            }
        }
    }

    async loadAllData() {
        const structure = [
            "permissions/category_permissions.json",
            "permissions/channel_permissions.json",
            "permissions/role_permissions.json",
            "info/guild_info.json",
            "info/channel_info.json",
            "info/category_info.json",
            "info/role_info.json",
        ];

        for (const file of structure) {
            try {
                const data = await this.getFile(file);
                const [folder, filename] = file.split("/");
                if (!this.cache[folder]) this.cache[folder] = {};
                this.cache[folder][filename.replace(".json", "")] = data;
            } catch (error) {
                // Fichier n'existe pas encore, initialiser vide
                const [folder, filename] = file.split("/");
                if (!this.cache[folder]) this.cache[folder] = {};
                this.cache[folder][filename.replace(".json", "")] = {};
            }
        }

        // Initialiser les membres et messages vides (seront chargés par scan)
        if (!this.cache.members) this.cache.members = {};
        if (!this.cache.messages) this.cache.messages = {};

        console.log("✅ Données chargées depuis GitHub");
    }

    async getFile(path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: "raw.githubusercontent.com",
                path: `/${this.owner}/${this.repo}/main/${this.serverId}/${path}`,
                method: "GET",
                headers: {
                    "User-Agent": "Discord-Bot",
                    Authorization: `token ${this.token}`,
                },
            };

            https
                .request(options, (res) => {
                    let data = "";
                    res.on("data", (chunk) => (data += chunk));
                    res.on("end", () => {
                        if (res.statusCode === 200) {
                            try {
                                if (!data || data.trim() === "") {
                                    resolve({});
                                    return;
                                }
                                resolve(JSON.parse(data));
                            } catch (error) {
                                console.warn(
                                    `⚠️ Erreur parsing ${path}, initialisation vide`,
                                );
                                resolve({});
                            }
                        } else if (res.statusCode === 404) {
                            resolve({});
                        } else {
                            reject(
                                new Error(
                                    `GitHub API error: ${res.statusCode}`,
                                ),
                            );
                        }
                    });
                })
                .on("error", reject)
                .end();
        });
    }

    async updateFile(path, data, retryCount = 0) {
        const maxRetries = 3;
        const content = Buffer.from(JSON.stringify(data, null, 2)).toString(
            "base64",
        );

        return new Promise((resolve, reject) => {
            // D'abord récupérer le SHA du fichier s'il existe
            const getOptions = {
                hostname: "api.github.com",
                path: `/repos/${this.owner}/${this.repo}/contents/${this.serverId}/${path}`,
                method: "GET",
                headers: {
                    "User-Agent": "Discord-Bot",
                    Authorization: `token ${this.token}`,
                    Accept: "application/vnd.github.v3+json",
                },
            };

            https
                .request(getOptions, (res) => {
                    let responseData = "";
                    res.on("data", (chunk) => (responseData += chunk));
                    res.on("end", async () => {
                        let sha = null;
                        if (res.statusCode === 200) {
                            try {
                                sha = JSON.parse(responseData).sha;
                            } catch (e) {
                                return reject(
                                    new Error("Invalid GitHub response"),
                                );
                            }
                        }

                        // Maintenant mettre à jour le fichier
                        const putData = JSON.stringify({
                            message: `Update ${path}`,
                            content: content,
                            sha: sha,
                        });

                        const putOptions = {
                            hostname: "api.github.com",
                            path: `/repos/${this.owner}/${this.repo}/contents/${this.serverId}/${path}`,
                            method: "PUT",
                            headers: {
                                "User-Agent": "Discord-Bot",
                                Authorization: `token ${this.token}`,
                                "Content-Type": "application/json",
                                "Content-Length": putData.length,
                            },
                        };

                        const req = https.request(putOptions, (putRes) => {
                            let putResponseData = "";
                            putRes.on(
                                "data",
                                (chunk) => (putResponseData += chunk),
                            );
                            putRes.on("end", async () => {
                                if (
                                    putRes.statusCode === 200 ||
                                    putRes.statusCode === 201
                                ) {
                                    resolve();
                                } else if (
                                    putRes.statusCode === 409 &&
                                    retryCount < maxRetries
                                ) {
                                    // Conflit détecté, attendre un délai aléatoire et réessayer
                                    const delay = 500 + Math.random() * 1000; // 500ms à 1500ms
                                    console.log(
                                        `⚠️ Conflit sur ${path}, retry ${retryCount + 1}/${maxRetries} dans ${Math.round(delay)}ms`,
                                    );
                                    setTimeout(async () => {
                                        try {
                                            await this.updateFile(
                                                path,
                                                data,
                                                retryCount + 1,
                                            );
                                            resolve();
                                        } catch (err) {
                                            reject(err);
                                        }
                                    }, delay);
                                } else {
                                    reject(
                                        new Error(
                                            `GitHub update failed: ${putRes.statusCode}`,
                                        ),
                                    );
                                }
                            });
                        });

                        req.on("error", reject);
                        req.write(putData);
                        req.end();
                    });
                })
                .on("error", reject)
                .end();
        });
    }

    getData(folder, file) {
        return this.cache[folder]?.[file] || {};
    }

    async setData(folder, file, data) {
        if (!this.cache[folder]) this.cache[folder] = {};

        // Merger avec les données existantes (ne jamais supprimer)
        this.cache[folder][file] = { ...this.cache[folder][file], ...data };

        const key = `${folder}/${file}`;

        // Annuler la mise à jour en attente si elle existe
        if (this.updateQueue.has(key)) {
            clearTimeout(this.updateQueue.get(key));
        }

        // Planifier la mise à jour avec un délai aléatoire pour éviter les conflits
        // 3 à 5 secondes avec jitter aléatoire
        const baseDelay = 3000;
        const jitter = Math.random() * 2000;
        const delay = baseDelay + jitter;

        const timeoutId = setTimeout(async () => {
            this.updateQueue.delete(key);
            try {
                await this.updateFile(`${key}.json`, this.cache[folder][file]);
                console.log(`✅ ${key} mis à jour sur GitHub`);
            } catch (err) {
                console.error(`⚠️ Erreur mise à jour ${key}:`, err.message);
            }
        }, delay);

        this.updateQueue.set(key, timeoutId);
    }

    async addMessage(channelId, message) {
        // Déterminer si c'est un message de bot ou de membre
        const isBot = message.isBot || message.meta_data?.isBot || false;
        const messageType = isBot ? "bot_messages" : "member_messages";

        // Initialiser le cache si nécessaire
        if (!this.cache.messages) this.cache.messages = {};
        if (!this.cache.messages[channelId]) {
            this.cache.messages[channelId] = {
                member_messages: {},
                bot_messages: {},
            };
        }

        // Charger depuis le cache ou GitHub si pas encore chargé
        if (
            !this.cache.messages[channelId][messageType] ||
            Object.keys(this.cache.messages[channelId][messageType]).length ===
                0
        ) {
            try {
                this.cache.messages[channelId][messageType] =
                    await this.getFile(
                        `messages/${channelId}/${messageType}.json`,
                    );
            } catch {
                this.cache.messages[channelId][messageType] = {};
            }
        }

        // Ajouter le message dans le cache
        this.cache.messages[channelId][messageType][message.id] = message;

        // Planifier la sauvegarde avec le système de queue (pour éviter les rate-limits)
        const key = `messages/${channelId}/${messageType}`;

        // Annuler la mise à jour en attente si elle existe
        if (this.updateQueue.has(key)) {
            clearTimeout(this.updateQueue.get(key));
        }

        // Planifier la mise à jour avec un délai pour batcher les messages
        const baseDelay = 5000; // 5 secondes
        const jitter = Math.random() * 2000; // 0-2 secondes de jitter
        const delay = baseDelay + jitter;

        const timeoutId = setTimeout(async () => {
            this.updateQueue.delete(key);
            try {
                await this.updateFile(
                    `${key}.json`,
                    this.cache.messages[channelId][messageType],
                );
                console.log(
                    `✅ ${key} mis à jour sur GitHub (${Object.keys(this.cache.messages[channelId][messageType]).length} messages)`,
                );
            } catch (err) {
                console.error(`⚠️ Erreur mise à jour ${key}:`, err.message);
            }
        }, delay);

        this.updateQueue.set(key, timeoutId);
    }

    async getChannelMessages(channelId) {
        try {
            // Retourner tous les messages (membres + bots) du cache
            if (this.cache.messages?.[channelId]) {
                const memberMessages =
                    this.cache.messages[channelId].member_messages || {};
                const botMessages =
                    this.cache.messages[channelId].bot_messages || {};

                // Fusionner les deux types de messages
                return { ...memberMessages, ...botMessages };
            }

            // Charger depuis GitHub si pas en cache
            const memberMessages = await this.getFile(
                `messages/${channelId}/member_messages.json`,
            ).catch(() => ({}));
            const botMessages = await this.getFile(
                `messages/${channelId}/bot_messages.json`,
            ).catch(() => ({}));

            return { ...memberMessages, ...botMessages };
        } catch {
            return {};
        }
    }

    async getMemberMessages(channelId) {
        try {
            if (this.cache.messages?.[channelId]?.member_messages) {
                return this.cache.messages[channelId].member_messages;
            }
            return await this.getFile(
                `messages/${channelId}/member_messages.json`,
            );
        } catch {
            return {};
        }
    }

    async getBotMessages(channelId) {
        try {
            if (this.cache.messages?.[channelId]?.bot_messages) {
                return this.cache.messages[channelId].bot_messages;
            }
            return await this.getFile(
                `messages/${channelId}/bot_messages.json`,
            );
        } catch {
            return {};
        }
    }

    async getLastMessageId(channelId) {
        try {
            const metadata = await this.getFile(
                `messages/${channelId}/metadata.json`,
            );
            return metadata.lastMessageId || null;
        } catch {
            return null;
        }
    }

    async setLastMessageId(channelId, messageId) {
        await this.updateFile(`messages/${channelId}/metadata.json`, {
            lastMessageId: messageId,
            lastUpdate: new Date().toISOString(),
        });
    }
}

module.exports = GitHubDataManager;
