const { Client } = require("discord.js-selfbot-v13");
const fs = require("fs").promises;

class PublicMessageCollector {
    constructor() {
        this.client = new Client();
        this.messages = new Map();
        this.members = new Map();
        this.roles = new Map();
        this.guildData = null;
        this.permissions = new Map();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.on("ready", () => {
            console.log("✅ Bot connecté pour la collecte de messages");
            this.collectInitialData();
        });

        this.client.on("messageCreate", (message) => {
            this.handleNewMessage(message);
        });

        this.client.on("messageUpdate", (oldMessage, newMessage) => {
            this.handleMessageUpdate(oldMessage, newMessage);
        });

        this.client.on("messageDelete", (message) => {
            this.handleMessageDelete(message);
        });

        this.client.on("guildMemberUpdate", (oldMember, newMember) => {
            this.updateMember(newMember);
        });

        this.client.on("roleUpdate", (oldRole, newRole) => {
            this.updateRole(newRole);
        });
    }

    async collectInitialData() {
        try {
            const TARGET_GUILD_ID = "1024713361985896508";
            const guilds = this.client.guilds.cache;

            console.log(
                `🔍 Recherche du serveur avec l'ID: ${TARGET_GUILD_ID}`,
            );

            const targetGuild = guilds.get(TARGET_GUILD_ID);

            if (!targetGuild) {
                console.error(`❌ Serveur ${TARGET_GUILD_ID} non trouvé!`);
                console.log(
                    `📊 Serveurs disponibles:`,
                    Array.from(guilds.values()).map(
                        (g) => `${g.name} (${g.id})`,
                    ),
                );
                return;
            }

            console.log(
                `✅ Serveur trouvé: ${targetGuild.name} (${targetGuild.id})`,
            );
            console.log(`🔄 Scan du serveur: ${targetGuild.name}`);

            // Collecter les données du serveur
            await this.collectGuildData(targetGuild);

            // Charger TOUTES les données existantes depuis les fichiers JSON
            await this.loadAllData();

            // Collecter tous les rôles
            await this.collectRoles(targetGuild);

            // Collecter tous les membres
            await this.collectMembers(targetGuild);

            // Collecter les permissions
            await this.collectPermissions(targetGuild);

            // Collecter les anciens messages
            await this.collectOldMessages(targetGuild);

            console.log("✅ Collecte initiale terminée");
        } catch (error) {
            console.error("❌ Erreur lors de la collecte initiale:", error);
        }
    }

    async collectGuildData(guild) {
        console.log("📊 Collecte des données du serveur...");

        this.guildData = {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ format: "png", size: 512 }),
            banner: guild.bannerURL({ format: "png", size: 2048 }),
            description: guild.description,
            memberCount: guild.memberCount,
            premiumTier: guild.premiumTier,
            premiumSubscriptionCount: guild.premiumSubscriptionCount,
            channels: [],
            categories: [],
        };

        // Collecter les canaux et catégories
        guild.channels.cache.forEach((channel) => {
            const channelData = {
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                parentId: channel.parentId,
                topic: channel.topic,
                nsfw: channel.nsfw,
            };

            if (channel.type === 4) {
                // Category
                this.guildData.categories.push(channelData);
            } else {
                this.guildData.channels.push(channelData);
            }
        });

        await this.saveGuildData();
    }

    async collectRoles(guild) {
        console.log("🏷️ Collecte des rôles...");

        guild.roles.cache.forEach((role) => {
            const roleData = {
                id: role.id,
                name: role.name,
                color: role.hexColor,
                position: role.position,
                permissions: role.permissions.toArray(),
                mentionable: role.mentionable,
                hoist: role.hoist,
                managed: role.managed,
                icon: role.icon
                    ? `https://cdn.discordapp.com/role-icons/${role.id}/${role.icon}.webp?size=64`
                    : null,
                unicodeEmoji: role.unicodeEmoji,
            };

            this.roles.set(role.id, roleData);
        });

        await this.saveRolesData();
    }

    async collectMembers(guild) {
        console.log("👥 Collecte des membres...");

        try {
            await guild.members.fetch();

            for (const member of guild.members.cache.values()) {
                await this.updateMember(member);
            }

            await this.saveMembersData();
        } catch (error) {
            console.error("❌ Erreur lors de la collecte des membres:", error);
        }
    }

    async updateMember(member) {
        const memberRoles = member.roles.cache
            .filter((role) => role.id !== member.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((role) => role.id);

        const memberData = {
            id: member.user.id,
            username: member.user.username,
            discriminator: member.user.discriminator,
            displayName: member.displayName,
            nickname: member.nickname,
            avatar: member.user.displayAvatarURL({ format: "png", size: 128 }),
            roles: memberRoles,
            joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
        };

        this.members.set(member.user.id, memberData);
        
        // Sauvegarder aussi les rôles de cet utilisateur dans role_data.json
        if (memberRoles.length > 0) {
            await this.saveUserRoles(member.user.id, member.user.username, memberRoles);
        }
    }

    async collectPermissions(guild) {
        console.log("🔐 Collecte des permissions...");

        const permissionsData = {
            roles: {},
            channels: {},
        };

        // Permissions des rôles
        guild.roles.cache.forEach((role) => {
            permissionsData.roles[role.id] = {
                name: role.name,
                permissions: role.permissions.toArray(),
            };
        });

        // Permissions des canaux
        guild.channels.cache.forEach((channel) => {
            if (channel.permissionOverwrites) {
                permissionsData.channels[channel.id] = {
                    name: channel.name,
                    overwrites: [],
                };

                channel.permissionOverwrites.cache.forEach((overwrite) => {
                    permissionsData.channels[channel.id].overwrites.push({
                        id: overwrite.id,
                        type: overwrite.type,
                        allow: overwrite.allow.toArray(),
                        deny: overwrite.deny.toArray(),
                    });
                });
            }
        });

        this.permissions = permissionsData;
        await this.savePermissionsData();
    }

    async collectOldMessages(guild) {
        console.log(
            "📜 Collecte COMPLÈTE des anciens messages (SANS LIMITE - MODE STREAMING)...",
        );

        // Vérifier que c'est le bon serveur
        if (!this.guildData || this.guildData.id !== guild.id) {
            console.log(`⚠️ Serveur ignoré: ${guild.name} (${guild.id})`);
            return;
        }

        const textChannels = guild.channels.cache.filter(
            (ch) =>
                (ch.type === "GUILD_TEXT" || ch.type === 0) &&
                ch.guild.id === guild.id,
        );

        console.log(
            `📊 ${textChannels.size} canaux texte trouvés dans ${guild.name}`,
        );
        console.log(
            `🔄 SCAN COMPLET EN PARALLÈLE - MODE STREAMING (écriture immédiate)`,
        );
        console.log(
            `💾 Chaque message est écrit dans le fichier puis retiré de la mémoire`,
        );
        console.log(
            `⚠️ Cela peut prendre plusieurs minutes selon la taille du serveur`,
        );

        const startTime = Date.now();

        // Scanner TOUS les canaux EN PARALLÈLE avec Promise.all
        const scanPromises = Array.from(textChannels.values()).map(
            async (channel, index) => {
                try {
                    console.log(
                        `  📂 [${index + 1}/${textChannels.size}] Démarrage scan streaming de #${channel.name}...`,
                    );
                    await this.collectAllChannelMessages(channel);
                    return true;
                } catch (error) {
                    console.log(
                        `  ⚠️ Erreur pour #${channel.name}: ${error.message}`,
                    );
                    return false;
                }
            },
        );

        // Attendre que TOUS les canaux soient scannés
        await Promise.all(scanPromises);

        // Compter le total de messages dans le fichier
        const totalInFile = await this.countTotalMessagesInFile();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ SCAN COMPLET TERMINÉ en ${duration} secondes !`);
        console.log(`📊 Statistiques finales:`);
        console.log(`   - Canaux scannés: ${textChannels.size}`);
        console.log(`   - Total messages dans le fichier: ${totalInFile}`);
        console.log(
            `   - Messages en mémoire (cache): ${Array.from(this.messages.values()).reduce((sum, msgs) => sum + msgs.length, 0)}`,
        );

        // Démarrer le scan permanent en arrière-plan
        this.startContinuousScan(guild);
    }

    async countTotalMessagesInFile() {
        try {
            const data = await fs.readFile("message_data.json", "utf8");
            const existingData = JSON.parse(data);
            const guildId = this.guildData?.id || "Unknown Server";

            let total = 0;
            if (existingData[guildId]) {
                for (const channelId in existingData[guildId]) {
                    total += Object.keys(
                        existingData[guildId][channelId],
                    ).length;
                }
            }
            return total;
        } catch (e) {
            return 0;
        }
    }

    startContinuousScan(guild) {
        console.log("🔄 Démarrage du scan permanent en arrière-plan...");

        // Scanner toutes les 5 minutes
        setInterval(
            async () => {
                try {
                    console.log("🔄 Scan périodique EN PARALLÈLE en cours...");
                    const textChannels = guild.channels.cache.filter(
                        (ch) =>
                            (ch.type === "GUILD_TEXT" || ch.type === 0) &&
                            ch.guild.id === guild.id,
                    );

                    // Scanner TOUS les canaux EN PARALLÈLE
                    const scanPromises = Array.from(textChannels.values()).map(
                        async (channel) => {
                            try {
                                const beforeCount =
                                    this.messages.get(channel.id)?.length || 0;
                                await this.collectAllChannelMessages(channel);
                                const afterCount =
                                    this.messages.get(channel.id)?.length || 0;
                                const newMessages = afterCount - beforeCount;

                                if (newMessages > 0) {
                                    console.log(
                                        `  ✅ #${channel.name}: ${newMessages} nouveaux messages`,
                                    );
                                }
                                return newMessages;
                            } catch (error) {
                                console.log(
                                    `  ⚠️ Erreur scan #${channel.name}: ${error.message}`,
                                );
                                return 0;
                            }
                        },
                    );

                    // Attendre que TOUS les canaux soient scannés
                    const results = await Promise.all(scanPromises);
                    const newMessagesTotal = results.reduce(
                        (sum, count) => sum + count,
                        0,
                    );

                    if (newMessagesTotal > 0) {
                        await this.saveMessagesToFile();
                        console.log(
                            `✅ Scan périodique terminé: ${newMessagesTotal} nouveaux messages ajoutés`,
                        );
                    } else {
                        console.log(
                            `✅ Scan périodique terminé: aucun nouveau message`,
                        );
                    }
                } catch (error) {
                    console.error("❌ Erreur lors du scan périodique:", error);
                }
            },
            5 * 60 * 1000,
        );

        console.log(
            "Scan permanent activé (intervalle: 5 minutes, EN PARALLÈLE)",
        );
    }

    async collectAllChannelMessages(channel) {
        try {
            let totalFetched = 0;
            let lastMessageId = null;
            let hasMore = true;
            let batchCount = 0;

            const existingIds = await this.loadExistingMessageIds(channel.id);

            console.log(
                `#${channel.name}: - ${existingIds.size} messages déjà en base`,
            );

            while (hasMore) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                let messages;
                try {
                    messages = await channel.messages.fetch(options);
                } catch (fetchError) {
                    if (
                        fetchError.message.includes("Missing Access") ||
                        fetchError.message.includes("Missing Permissions")
                    ) {
                        return;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    continue;
                }

                if (messages.size === 0) {
                    hasMore = false;
                    break;
                }

                batchCount++;

                // Traiter ce batch et l'écrire IMMÉDIATEMENT dans le fichier
                const newMessages = [];
                for (const message of messages.values()) {
                    if (!existingIds.has(message.id)) {
                        const formatted = await this.formatMessage(message);
                        newMessages.push(formatted);
                        existingIds.add(message.id);
                    }
                }

                // STREAMING: Écrire immédiatement dans le fichier et vider la mémoire
                if (newMessages.length > 0) {
                    await this.appendMessagesToFile(channel.id, newMessages);
                    console.log(
                        `  💾 #${channel.name}: Batch ${batchCount} - ${newMessages.length} messages écrits (total: ${existingIds.size})`,
                    );
                }

                totalFetched += messages.size;
                lastMessageId = messages.last().id;

                if (messages.size < 100) {
                    hasMore = false;
                }

                await new Promise((resolve) => setTimeout(resolve, 300));
            }

            // Garder seulement les 200 messages les plus récents EN MÉMOIRE pour l'affichage
            await this.loadRecentMessagesIntoMemory(channel.id, 200);

            console.log(
                `  ✅ #${channel.name}: SCAN COMPLET - ${existingIds.size} messages au total dans la base`,
            );
        } catch (error) {
            console.error(
                `❌ Erreur collecte #${channel.name}:`,
                error.message,
            );
        }
    }

    async collectChannelMessages(channel, limit = 100) {
        // Gardé pour compatibilité, utilise la nouvelle méthode
        await this.collectAllChannelMessages(channel);
    }

    async formatMessage(message) {
        const member =
            message.member ||
            (await message.guild.members
                .fetch(message.author.id)
                .catch(() => null));

        // Mise à jour du membre si nécessaire
        if (member && !this.members.has(member.user.id)) {
            this.updateMember(member);
            await this.saveMembersData();
        }

        // Sauvegarder les rôles de l'utilisateur dans role_data.json
        const userRoles = member
            ? member.roles.cache
                  .filter((role) => role.id !== message.guild.id)
                  .sort((a, b) => b.position - a.position)
                  .map((role) => role.id)
            : [];

        if (member && userRoles.length > 0) {
            await this.saveUserRoles(message.author.id, message.author.username, userRoles);
        }

        // Traiter les images
        const images = [];
        const files = [];

        message.attachments.forEach((attachment) => {
            const attachData = {
                id: attachment.id,
                name: attachment.name,
                url: attachment.url,
                size: attachment.size,
                contentType: attachment.contentType,
            };

            if (attachment.contentType?.startsWith("image/")) {
                images.push(attachData);
            } else {
                files.push(attachData);
            }
        });

        // Gérer les réponses
        let replyTo = null;
        if (message.reference && message.reference.messageId) {
            try {
                const referencedMessage = await message.channel.messages.fetch(
                    message.reference.messageId,
                );
                const referencedMember =
                    referencedMessage.member ||
                    (await message.guild.members
                        .fetch(referencedMessage.author.id)
                        .catch(() => null));

                replyTo = {
                    id: referencedMessage.id,
                    userId: referencedMessage.author.id,
                    username: referencedMessage.author.username,
                    displayName: referencedMember
                        ? referencedMember.displayName
                        : referencedMessage.author.username,
                    content: referencedMessage.content,
                };
            } catch (error) {
                replyTo = {
                    id: null,
                    userId: null,
                    username: "Message supprimé",
                    displayName: "Message supprimé",
                    content: "Message original supprimé",
                };
            }
        }

        // Préparer meta_data - NE PAS inclure owned_roles sauf pour les bots
        const meta_data = {
            avatar_url: message.author.displayAvatarURL({
                format: "png",
                size: 128,
            }),
            discriminator: message.author.discriminator,
            displayName: member
                ? member.displayName
                : message.author.username,
            isBot: message.author.bot,
            createdAt: message.createdAt.toISOString(),
            editedAt: message.editedAt
                ? message.editedAt.toISOString()
                : null,
            channelId: message.channel.id,
            guildId: message.guild.id,
            replyTo: replyTo,
            embeds:
                message.embeds.length > 0
                    ? message.embeds.map((e) => ({
                          title: e.title,
                          description: e.description,
                          color: e.color,
                          image: e.image?.url,
                      }))
                    : [],
        };

        // UNIQUEMENT pour les bots : conserver les rôles dans le message
        if (message.author.bot) {
            meta_data.owned_roles = userRoles;
        }

        return {
            id: message.id,
            user_id: message.author.id,
            username: message.author.username,
            content: {
                text: message.content || "",
                images: images,
                files: files,
            },
            meta_data: meta_data,
        };
    }

    async handleNewMessage(message) {
        const TARGET_GUILD_ID = "1024713361985896508";

        if (
            message.guild &&
            message.guild.id === TARGET_GUILD_ID &&
            (message.channel.type === "GUILD_TEXT" ||
                message.channel.type === 0)
        ) {
            console.log(
                `📨 Nouveau message de ${message.author.username} dans #${message.channel.name}`,
            );

            const formatted = await this.formatMessage(message);

            if (!this.messages.has(message.channel.id)) {
                this.messages.set(message.channel.id, []);
            }

            const channelMessages = this.messages.get(message.channel.id);
            channelMessages.push(formatted);

            // Écrire immédiatement dans le fichier (streaming)
            await this.appendMessagesToFile(message.channel.id, [formatted]);

            // Limiter à 200 messages en MÉMOIRE seulement (pas dans le fichier)
            if (channelMessages.length > 999999999) {
                channelMessages.shift();
            }

            this.notifyNewMessage(message.channel.id, formatted);
        }
    }

    async handleMessageUpdate(oldMessage, newMessage) {
        const TARGET_GUILD_ID = "1024713361985896508";

        if (
            newMessage.guild &&
            newMessage.guild.id === TARGET_GUILD_ID &&
            (newMessage.channel.type === "GUILD_TEXT" ||
                newMessage.channel.type === 0)
        ) {
            const channelMessages = this.messages.get(newMessage.channel.id);
            if (channelMessages) {
                const index = channelMessages.findIndex(
                    (msg) => msg.id === newMessage.id,
                );
                if (index !== -1) {
                    const formatted = await this.formatMessage(newMessage);
                    channelMessages[index] = formatted;
                    await this.saveMessagesToFile();
                }
            }
        }
    }

    handleMessageDelete(message) {
        const TARGET_GUILD_ID = "1024713361985896508";

        if (
            message.guild &&
            message.guild.id === TARGET_GUILD_ID &&
            (message.channel.type === "GUILD_TEXT" ||
                message.channel.type === 0)
        ) {
            const channelMessages = this.messages.get(message.channel.id);
            if (channelMessages) {
                const index = channelMessages.findIndex(
                    (msg) => msg.id === message.id,
                );
                if (index !== -1) {
                    channelMessages[index].meta_data.isDeleted = true;
                    channelMessages[index].meta_data.deletedAt =
                        new Date().toISOString();
                }
            }
        }
    }

    updateRole(role) {
        const roleData = {
            id: role.id,
            name: role.name,
            color: role.hexColor,
            position: role.position,
            permissions: role.permissions.toArray(),
            mentionable: role.mentionable,
            hoist: role.hoist,
            managed: role.managed,
            icon: role.icon
                ? `https://cdn.discordapp.com/role-icons/${role.id}/${role.icon}.webp?size=64`
                : null,
            unicodeEmoji: role.unicodeEmoji,
        };

        this.roles.set(role.id, roleData);
        this.saveRolesData();
    }

    notifyNewMessage(channelId, message) {
        if (global.broadcastNewMessage) {
            // Envoyer UNIQUEMENT le nouveau message (pas tous les messages)
            // Le frontend charge les messages existants depuis message_data.json
            global.broadcastNewMessage(channelId, message, null);
        }
    }

    async loadExistingMessageIds(channelId) {
        const existingIds = new Set();
        try {
            const data = await fs.readFile("message_data.json", "utf8");
            const existingData = JSON.parse(data);
            const guildId = this.guildData?.id || "Unknown Server";

            if (existingData[guildId] && existingData[guildId][channelId]) {
                Object.keys(existingData[guildId][channelId]).forEach((id) =>
                    existingIds.add(id),
                );
            }
        } catch (e) {
            // Fichier n'existe pas encore
        }
        return existingIds;
    }

    async appendMessagesToFile(channelId, newMessages) {
        try {
            // TOUJOURS charger les données existantes avant toute modification
            let existingData = {};
            try {
                const data = await fs.readFile("message_data.json", "utf8");
                existingData = JSON.parse(data);
            } catch (e) {
                console.log("ℹ️ Création d'un nouveau fichier message_data.json");
                existingData = {};
            }

            const guildId = this.guildData?.id || "Unknown Server";

            // Initialiser la structure si nécessaire - SANS ÉCRASER L'EXISTANT
            if (!existingData[guildId]) {
                existingData[guildId] = {};
            }

            if (!existingData[guildId][channelId]) {
                existingData[guildId][channelId] = {};
            }

            // Compter avant ajout
            const beforeCount = Object.keys(existingData[guildId][channelId]).length;

            // Ajouter SEULEMENT les nouveaux messages (ne jamais écraser ni supprimer)
            let addedCount = 0;
            newMessages.forEach((msg) => {
                if (!existingData[guildId][channelId][msg.id]) {
                    existingData[guildId][channelId][msg.id] = msg;
                    addedCount++;
                }
            });

            const afterCount = Object.keys(existingData[guildId][channelId]).length;

            // Vérification de sécurité - S'assurer qu'on n'a pas perdu de messages
            if (afterCount < beforeCount) {
                console.error(`🚨 ALERTE: Perte de messages détectée! Avant: ${beforeCount}, Après: ${afterCount}`);
                throw new Error("Tentative de suppression de messages détectée et bloquée");
            }

            await fs.writeFile("message_data.json", JSON.stringify(existingData, null, 2));
            
            if (addedCount > 0) {
                console.log(`✅ ${addedCount} nouveaux messages ajoutés au canal ${channelId} (total: ${afterCount})`);
            }
        } catch (error) {
            console.error("❌ Erreur écriture messages:", error);
            throw error; // Propager l'erreur pour éviter la corruption silencieuse
        }
    }

    async loadRecentMessagesIntoMemory(channelId, limit = 200) {
        try {
            const data = await fs.readFile("message_data.json", "utf8");
            const existingData = JSON.parse(data);
            const guildId = this.guildData?.id || "Unknown Server";

            if (existingData[guildId] && existingData[guildId][channelId]) {
                const allMessages = Object.values(
                    existingData[guildId][channelId],
                );
                // Trier par date et garder les plus récents EN MÉMOIRE SEULEMENT
                allMessages.sort(
                    (a, b) =>
                        new Date(a.meta_data.createdAt) -
                        new Date(b.meta_data.createdAt),
                );
                const recentMessages = allMessages.slice(-limit);
                this.messages.set(channelId, recentMessages);
            }
        } catch (e) {
            // Pas de messages existants
        }
    }

    async saveMessagesToFile() {
        try {
            // TOUJOURS charger les données existantes en premier
            let existingData = {};
            try {
                const data = await fs.readFile("message_data.json", "utf8");
                existingData = JSON.parse(data);
                console.log(`📂 Messages existants chargés: ${Object.keys(existingData).length} guildes`);
            } catch (e) {
                console.log("ℹ️ Nouveau fichier message_data.json créé");
            }

            const guildId = this.guildData?.id || "Unknown Server";

            // Initialiser seulement si nécessaire
            if (!existingData[guildId]) {
                existingData[guildId] = {};
            }

            // Compter avant fusion
            let totalBefore = 0;
            for (const channelId in existingData[guildId]) {
                totalBefore += Object.keys(existingData[guildId][channelId]).length;
            }

            // FUSION: ajouter uniquement les nouveaux messages
            let addedCount = 0;
            for (const [channelId, messages] of this.messages.entries()) {
                if (!existingData[guildId][channelId]) {
                    existingData[guildId][channelId] = {};
                }

                messages.forEach((msg) => {
                    if (!existingData[guildId][channelId][msg.id]) {
                        existingData[guildId][channelId][msg.id] = msg;
                        addedCount++;
                    }
                });
            }

            // Compter après fusion
            let totalAfter = 0;
            for (const channelId in existingData[guildId]) {
                totalAfter += Object.keys(existingData[guildId][channelId]).length;
            }

            // Vérification de sécurité
            if (totalAfter < totalBefore) {
                console.error(`🚨 ERREUR: Perte de données détectée! Avant: ${totalBefore}, Après: ${totalAfter}`);
                console.error("🚨 Sauvegarde annulée pour éviter la corruption");
                return;
            }

            await fs.writeFile("message_data.json", JSON.stringify(existingData, null, 2));
            console.log(`✅ Messages: ${totalBefore} → ${totalAfter} (+${addedCount} nouveaux)`);
        } catch (error) {
            console.error("❌ Erreur sauvegarde messages:", error);
        }
    }

    async saveMembersData() {
        try {
            // TOUJOURS charger d'abord
            let existingData = {};
            try {
                const data = await fs.readFile("member_data.json", "utf8");
                existingData = JSON.parse(data);
            } catch (e) {
                console.log("ℹ️ Nouveau fichier member_data.json créé");
            }

            const guildId = this.guildData?.id || "Unknown Server";
            
            if (!existingData[guildId]) {
                existingData[guildId] = {};
            }

            const totalBefore = Object.keys(existingData[guildId]).length;

            // FUSION: mettre à jour uniquement les membres en mémoire
            this.members.forEach((member, userId) => {
                existingData[guildId][userId] = {
                    id: member.id,
                    username: member.username,
                    discriminator: member.discriminator,
                    displayName: member.displayName,
                    nickname: member.nickname,
                    avatar: member.avatar,
                    joinedAt: member.joinedAt
                };
            });

            const totalAfter = Object.keys(existingData[guildId]).length;

            // Vérification
            if (totalAfter < totalBefore && this.members.size < totalBefore) {
                console.error(`🚨 ERREUR: Perte de membres détectée! Avant: ${totalBefore}, Après: ${totalAfter}`);
                console.error("🚨 Sauvegarde annulée");
                return;
            }

            await fs.writeFile("member_data.json", JSON.stringify(existingData, null, 2));
            console.log(`✅ Membres: ${totalBefore} → ${totalAfter} (${this.members.size} mis à jour)`);
        } catch (error) {
            console.error("❌ Erreur sauvegarde membres:", error);
        }
    }

    async saveUserRoles(userId, username, roles) {
        try {
            // Charger les données existantes
            let existingData = {};
            try {
                const data = await fs.readFile("role_member_data.json", "utf8");
                existingData = JSON.parse(data);
            } catch (e) {
                // Fichier n'existe pas encore
            }

            const guildId = this.guildData?.id || "Unknown Server";
            
            // Initialiser si nécessaire
            if (!existingData[guildId]) {
                existingData[guildId] = {};
            }

            // Mise à jour des rôles pour CET utilisateur uniquement (ne touche pas les autres)
            existingData[guildId][userId] = {
                username: username,
                roles: roles
            };

            await fs.writeFile("role_member_data.json", JSON.stringify(existingData, null, 2));
        } catch (error) {
            console.error("❌ Erreur sauvegarde rôles utilisateur:", error);
        }
    }

    async saveRolesData() {
        try {
            // TOUJOURS charger d'abord
            let existingData = {};
            try {
                const data = await fs.readFile("role_data.json", "utf8");
                existingData = JSON.parse(data);
            } catch (e) {
                console.log("ℹ️ Nouveau fichier role_data.json créé");
            }

            const guildId = this.guildData?.id || "Unknown Server";
            
            if (!existingData[guildId]) {
                existingData[guildId] = {};
            }

            const totalBefore = Object.keys(existingData[guildId]).length;

            // FUSION: mettre à jour les rôles en mémoire
            this.roles.forEach((role, roleId) => {
                existingData[guildId][roleId] = role;
            });

            const totalAfter = Object.keys(existingData[guildId]).length;

            await fs.writeFile("role_data.json", JSON.stringify(existingData, null, 2));
            console.log(`✅ Rôles: ${totalBefore} → ${totalAfter} (${this.roles.size} mis à jour)`);
        } catch (error) {
            console.error("❌ Erreur sauvegarde rôles:", error);
        }
    }

    async saveGuildData() {
        try {
            // TOUJOURS charger d'abord
            let existingData = {};
            try {
                const data = await fs.readFile("guild_data.json", "utf8");
                existingData = JSON.parse(data);
            } catch (e) {
                console.log("ℹ️ Nouveau fichier guild_data.json créé");
            }

            const guildId = this.guildData?.id || "Unknown Server";
            
            // FUSION avec les données existantes
            if (!existingData[guildId]) {
                existingData[guildId] = this.guildData;
            } else {
                existingData[guildId] = {
                    ...existingData[guildId],
                    ...this.guildData
                };
            }

            await fs.writeFile("guild_data.json", JSON.stringify(existingData, null, 2));
            console.log(`✅ Données serveur sauvegardées`);
        } catch (error) {
            console.error("❌ Erreur sauvegarde guild:", error);
        }
    }

    async savePermissionsData() {
        try {
            // TOUJOURS charger d'abord
            let existingData = {};
            try {
                const data = await fs.readFile("permission_data.json", "utf8");
                existingData = JSON.parse(data);
            } catch (e) {
                console.log("ℹ️ Nouveau fichier permission_data.json créé");
            }

            const guildId = this.guildData?.id || "Unknown Server";
            
            if (!existingData[guildId]) {
                existingData[guildId] = { roles: {}, channels: {} };
            }
            
            // FUSION des permissions
            if (this.permissions.roles) {
                if (!existingData[guildId].roles) {
                    existingData[guildId].roles = {};
                }
                Object.assign(existingData[guildId].roles, this.permissions.roles);
            }
            
            if (this.permissions.channels) {
                if (!existingData[guildId].channels) {
                    existingData[guildId].channels = {};
                }
                Object.assign(existingData[guildId].channels, this.permissions.channels);
            }

            await fs.writeFile("permission_data.json", JSON.stringify(existingData, null, 2));
            console.log(`✅ Permissions sauvegardées`);
        } catch (error) {
            console.error("❌ Erreur sauvegarde permissions:", error);
        }
    }

    async loadAllData() {
        try {
            const guildId = this.guildData?.id || "Unknown Server";

            // Charger les messages
            try {
                const msgData = await fs.readFile("message_data.json", "utf8");
                const parsed = JSON.parse(msgData);

                if (parsed[guildId]) {
                    for (const [channelId, messages] of Object.entries(
                        parsed[guildId],
                    )) {
                        this.messages.set(channelId, Object.values(messages));
                    }
                    console.log("📂 Messages chargés pour", guildId);
                }
            } catch (e) {
                console.log("ℹ️ Aucun message existant");
            }

            // Charger les membres
            try {
                const memberData = await fs.readFile(
                    "member_data.json",
                    "utf8",
                );
                const parsed = JSON.parse(memberData);

                if (parsed[guildId]) {
                    for (const [userId, member] of Object.entries(
                        parsed[guildId],
                    )) {
                        this.members.set(userId, member);
                    }
                    console.log("📂 Membres chargés pour", guildId);
                }
            } catch (e) {
                console.log("ℹ️ Aucun membre existant");
            }

            // Charger les rôles
            try {
                const roleData = await fs.readFile("role_data.json", "utf8");
                const parsed = JSON.parse(roleData);

                if (parsed[guildId]) {
                    for (const [roleId, role] of Object.entries(
                        parsed[guildId],
                    )) {
                        this.roles.set(roleId, role);
                    }
                    console.log("📂 Rôles chargés pour", guildId);
                }
            } catch (e) {
                console.log("ℹ️ Aucun rôle existant");
            }

            // Charger les données du serveur
            try {
                const guildDataFile = await fs.readFile(
                    "guild_data.json",
                    "utf8",
                );
                const parsed = JSON.parse(guildDataFile);

                if (parsed[guildId]) {
                    this.guildData = parsed[guildId];
                    console.log("📂 Données du serveur chargées pour", guildId);
                }
            } catch (e) {
                console.log("ℹ️ Aucune donnée de serveur existante");
            }

            // Charger les permissions
            try {
                const permData = await fs.readFile(
                    "permission_data.json",
                    "utf8",
                );
                const parsed = JSON.parse(permData);

                if (parsed[guildId]) {
                    this.permissions = parsed[guildId];
                    console.log("📂 Permissions chargées pour", guildId);
                }
            } catch (e) {
                console.log("ℹ️ Aucune permission existante");
            }
        } catch (error) {
            console.log("ℹ️ Démarrage avec données vides");
        }
    }

    getMessages(channelId, limit = 50) {
        const channelMessages = this.messages.get(channelId) || [];
        return channelMessages.slice(-limit);
    }

    getAllMessages() {
        const allMessages = {};
        for (const [channelId, messages] of this.messages.entries()) {
            allMessages[channelId] = messages;
        }
        return allMessages;
    }

    async start(token) {
        try {
            await this.client.login(token);

            setInterval(() => {
                this.saveMessagesToFile();
                this.saveMembersData();
                this.saveRolesData();
            }, 30000);
        } catch (error) {
            console.error("❌ Erreur de connexion Discord:", error);
        }
    }

    stop() {
        this.client.destroy();
    }

    exposeInterface() {
        global.messageCollectorInterface = {
            getMessages: this.getMessages.bind(this),
            getAllMessages: this.getAllMessages.bind(this),
            members: this.members,
            roles: this.roles,
            guildData: this.guildData,
        };

        if (typeof window !== "undefined") {
            window.messageCollectorInterface = global.messageCollectorInterface;
        }

        console.log("✅ Interface du collecteur exposée");
    }
}

module.exports = PublicMessageCollector;
