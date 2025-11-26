const { Client, Permissions } = require('discord.js-selfbot-v13');

const ALL_DISCORD_PERMISSIONS = {
    'CREATE_INSTANT_INVITE': BigInt(1) << BigInt(0),
    'KICK_MEMBERS': BigInt(1) << BigInt(1),
    'BAN_MEMBERS': BigInt(1) << BigInt(2),
    'ADMINISTRATOR': BigInt(1) << BigInt(3),
    'MANAGE_CHANNELS': BigInt(1) << BigInt(4),
    'MANAGE_GUILD': BigInt(1) << BigInt(5),
    'ADD_REACTIONS': BigInt(1) << BigInt(6),
    'VIEW_AUDIT_LOG': BigInt(1) << BigInt(7),
    'PRIORITY_SPEAKER': BigInt(1) << BigInt(8),
    'STREAM': BigInt(1) << BigInt(9),
    'VIEW_CHANNEL': BigInt(1) << BigInt(10),
    'SEND_MESSAGES': BigInt(1) << BigInt(11),
    'SEND_TTS_MESSAGES': BigInt(1) << BigInt(12),
    'MANAGE_MESSAGES': BigInt(1) << BigInt(13),
    'EMBED_LINKS': BigInt(1) << BigInt(14),
    'ATTACH_FILES': BigInt(1) << BigInt(15),
    'READ_MESSAGE_HISTORY': BigInt(1) << BigInt(16),
    'MENTION_EVERYONE': BigInt(1) << BigInt(17),
    'USE_EXTERNAL_EMOJIS': BigInt(1) << BigInt(18),
    'VIEW_GUILD_INSIGHTS': BigInt(1) << BigInt(19),
    'CONNECT': BigInt(1) << BigInt(20),
    'SPEAK': BigInt(1) << BigInt(21),
    'MUTE_MEMBERS': BigInt(1) << BigInt(22),
    'DEAFEN_MEMBERS': BigInt(1) << BigInt(23),
    'MOVE_MEMBERS': BigInt(1) << BigInt(24),
    'USE_VAD': BigInt(1) << BigInt(25),
    'CHANGE_NICKNAME': BigInt(1) << BigInt(26),
    'MANAGE_NICKNAMES': BigInt(1) << BigInt(27),
    'MANAGE_ROLES': BigInt(1) << BigInt(28),
    'MANAGE_WEBHOOKS': BigInt(1) << BigInt(29),
    'MANAGE_EMOJIS': BigInt(1) << BigInt(30),
    'MANAGE_EMOJIS_AND_STICKERS': BigInt(1) << BigInt(30),
    'USE_APPLICATION_COMMANDS': BigInt(1) << BigInt(31),
    'REQUEST_TO_SPEAK': BigInt(1) << BigInt(32),
    'MANAGE_EVENTS': BigInt(1) << BigInt(33),
    'MANAGE_THREADS': BigInt(1) << BigInt(34),
    'CREATE_PUBLIC_THREADS': BigInt(1) << BigInt(35),
    'CREATE_PRIVATE_THREADS': BigInt(1) << BigInt(36),
    'USE_EXTERNAL_STICKERS': BigInt(1) << BigInt(37),
    'SEND_MESSAGES_IN_THREADS': BigInt(1) << BigInt(38),
    'USE_EMBEDDED_ACTIVITIES': BigInt(1) << BigInt(39),
    'MODERATE_MEMBERS': BigInt(1) << BigInt(40),
    'VIEW_CREATOR_MONETIZATION_ANALYTICS': BigInt(1) << BigInt(41),
    'USE_SOUNDBOARD': BigInt(1) << BigInt(42),
    'CREATE_GUILD_EXPRESSIONS': BigInt(1) << BigInt(43),
    'CREATE_EVENTS': BigInt(1) << BigInt(44),
    'USE_EXTERNAL_SOUNDS': BigInt(1) << BigInt(45),
    'SEND_VOICE_MESSAGES': BigInt(1) << BigInt(46),
    'SEND_POLLS': BigInt(1) << BigInt(49),
    'USE_EXTERNAL_APPS': BigInt(1) << BigInt(50),
    'SET_VOICE_CHANNEL_STATUS': BigInt(1) << BigInt(48),
    'MANAGE_GUILD_EXPRESSIONS': BigInt(1) << BigInt(30),
    'VIEW_SUBSCRIPTIONS': BigInt(1) << BigInt(51),
    'CREATE_TAGS': BigInt(1) << BigInt(52)
};

try {
    Object.entries(ALL_DISCORD_PERMISSIONS).forEach(([name, value]) => {
        if (!Permissions.FLAGS[name]) {
            Permissions.FLAGS[name] = value;
        }
    });

    const PERMISSION_REVERSE_MAP = {};
    Object.entries(ALL_DISCORD_PERMISSIONS).forEach(([name, value]) => {
        PERMISSION_REVERSE_MAP[value.toString()] = name;
    });

    console.log('✅ All Discord Permissions added successfully');
} catch (error) {
    console.log('⚠️ Erreur lors du patch des permissions:', error.message);
}

class DiscordDataCollector {
    constructor(token, serverId) {
        this.client = new Client();
        this.token = token;
        this.serverId = serverId;
        this.serverData = {};
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.client.on('ready', () => {
                console.log(`✅ Discord Simulation is online!`);
                resolve();
            });

            this.client.on('error', (error) => {
                console.error('❌ Erreur de connexion:', error);
                reject(error);
            });

            this.client.login(this.token).catch(reject);
        });
    }

    checkPermission(permissions, permissionName) {
        if (!permissions || !permissionName) {
            console.log(`🔍 Permission check failed: permissions=${!!permissions}, permissionName=${permissionName}`);
            return false;
        }

        let result = false;
        let methodUsed = 'none';

        try {
            if (typeof permissions.has === 'function') {
                try {
                    result = permissions.has(permissionName);
                    methodUsed = 'has()';
                    return result;
                } catch (hasError) {
                    console.log(`⚠️ Méthode has() échouée pour ${permissionName}:`, hasError.message);
                }
            }

            const permissionValue = ALL_DISCORD_PERMISSIONS[permissionName];
            if (permissionValue && permissions.bitfield !== undefined) {
                try {
                    const bitfield = BigInt(permissions.bitfield);
                    result = (bitfield & permissionValue) !== BigInt(0);
                    methodUsed = 'bitfield';
                    return result;
                } catch (bitError) {
                    console.log(`⚠️ Méthode bitfield échouée pour ${permissionName}:`, bitError.message);
                }
            }

            if (typeof permissions.toArray === 'function') {
                try {
                    const permArray = permissions.toArray();
                    result = permArray.includes(permissionName);
                    methodUsed = 'toArray()';
                    return result;
                } catch (arrayError) {
                    console.log(`⚠️ Méthode toArray() échouée pour ${permissionName}:`, arrayError.message);
                }
            }

            if (Permissions.FLAGS && Permissions.FLAGS[permissionName]) {
                try {
                    const flagValue = Permissions.FLAGS[permissionName];
                    const bitfield = BigInt(permissions.bitfield || permissions);
                    result = (bitfield & BigInt(flagValue)) !== BigInt(0);
                    methodUsed = 'FLAGS';
                    return result;
                } catch (flagError) {
                    console.log(`⚠️ Méthode FLAGS échouée pour ${permissionName}:`, flagError.message);
                }
            }

            console.warn(`❌ Toutes les méthodes ont échoué pour ${permissionName}`);
            console.warn(`   - Permissions object:`, typeof permissions);
            console.warn(`   - Has bitfield:`, permissions.bitfield !== undefined);
            console.warn(`   - Has toArray:`, typeof permissions.toArray === 'function');
            console.warn(`   - Has has():`, typeof permissions.has === 'function');
            console.warn(`   - Permission mapping exists:`, !!ALL_DISCORD_PERMISSIONS[permissionName]);
            return false;

        } catch (error) {
            console.error(`❌ Erreur critique lors de la vérification de ${permissionName}:`, error);
            return false;
        }
    }

    getAllPermissions(permissions) {
        const rolePermissions = [];

        if (!permissions) {
            console.log('⚠️ Aucun objet permissions fourni');
            return rolePermissions;
        }

        try {
            if (typeof permissions.toArray === 'function') {
                const arrayResult = permissions.toArray();
                return arrayResult;
            }
        } catch (error) {
            console.log('⚠️ toArray() échoué:', error.message);
        }

        try {
            const bitfield = BigInt(permissions.bitfield || permissions);
            console.log(`🔍 Analyse bitfield: ${bitfield.toString()}`);

            let foundPermissions = 0;
            Object.entries(ALL_DISCORD_PERMISSIONS).forEach(([permName, permValue]) => {
                if ((bitfield & permValue) !== BigInt(0)) {
                    rolePermissions.push(permName);
                    foundPermissions++;
                }
            });

            console.log(`✅ Analyse bitfield terminée: ${foundPermissions} permissions trouvées`);
            console.log(`📋 Permissions détectées: ${rolePermissions.join(', ')}`);

        } catch (error) {
            console.error('❌ Erreur lors de l\'analyse bitfield:', error.message);
        }

        return rolePermissions;
    }

    async collectAllData() {
        try {
            const guild = this.client.guilds.cache.get(this.serverId);
            if (!guild) {
                throw new Error('Serveur non trouvé');
            }

            console.log('🔍 Récupération complète des données du serveur...');
            console.log(`📊 Serveur trouvé: ${guild.name} (ID: ${guild.id})`);
            console.log(`👥 Nombre de membres: ${guild.memberCount}`);
            console.log(`📁 Nombre de canaux total: ${guild.channels.cache.size}`);
            console.log(`🏷️ Nombre de rôles total: ${guild.roles.cache.size}`);

            // Informations de base du serveur
            this.serverData.guild = {
                id: guild.id,
                name: guild.name,
                description: guild.description,
                icon: guild.iconURL({ size: 512, dynamic: true }),
                iconHash: guild.icon,
                banner: guild.bannerURL({ size: 2048, dynamic: true }),
                bannerHash: guild.banner,
                splash: guild.splashURL({ size: 2048, dynamic: true }),
                splashHash: guild.splash,
                discoverySplash: guild.discoverySplashURL({ size: 2048, dynamic: true }),
                discoverySplashHash: guild.discoverySplash,
                createdAt: guild.createdAt,
                ownerId: guild.ownerId,
                memberCount: guild.memberCount,
                verificationLevel: guild.verificationLevel,
                premiumTier: guild.premiumTier,
                premiumSubscriptionCount: guild.premiumSubscriptionCount,
                features: guild.features,
                preferredLocale: guild.preferredLocale,
                defaultMessageNotifications: guild.defaultMessageNotifications,
                explicitContentFilter: guild.explicitContentFilter,
                afkTimeout: guild.afkTimeout,
                afkChannelId: guild.afkChannelId,
                systemChannelId: guild.systemChannelId,
                rulesChannelId: guild.rulesChannelId,
                publicUpdatesChannelId: guild.publicUpdatesChannelId,
                maximumMembers: guild.maximumMembers,
                maximumPresences: guild.maximumPresences,
                vanityURLCode: guild.vanityURLCode,
                vanityURLUses: guild.vanityURLUses,
                widgetEnabled: guild.widgetEnabled,
                widgetChannelId: guild.widgetChannelId,
                nsfwLevel: guild.nsfwLevel,
                large: guild.large,
                mfaLevel: guild.mfaLevel,
                joinedAt: guild.joinedAt,
                partnered: guild.partnered,
                verified: guild.verified,
                premiumProgressBarEnabled: guild.premiumProgressBarEnabled
            };

            await this.collectChannels(guild);

            await this.collectRoles(guild);

            await this.collectEmojis(guild);

            await this.collectRecentMessages(guild);

            await this.collectOtherData(guild);

            console.log('✅ Données principales récupérées avec succès');
            console.log(`📊 Résumé:`);
            console.log(`   - Catégories: ${this.serverData.channels?.categories?.length || 0}`);
            console.log(`   - Canaux texte: ${this.serverData.channels?.textChannels?.length || 0}`);
            console.log(`   - Canaux vocaux: ${this.serverData.channels?.voiceChannels?.length || 0}`);
            console.log(`   - Rôles: ${this.serverData.roles?.length || 0}`);
            console.log(`   - Emojis: ${this.serverData.emojis?.length || 0}`);
            
            this.collectMembers(guild).then(() => {
                console.log('✅ Membres récupérés en arrière-plan');
            }).catch((error) => {
                console.log('ℹ️ Impossible de récupérer tous les membres:', error.message);
            });

            console.log('✅ Interface prête à être utilisée');
            return this.serverData;

        } catch (error) {
            console.error('❌ Erreur lors de la récupération des données:', error);
            throw error;
        }
    }

    async collectChannels(guild) {
        console.log('📁 Récupération des canaux...');
        const channels = guild.channels.cache;
        console.log(`📊 ${channels.size} canaux trouvés dans le cache`);

        this.serverData.channels = {
            categories: [],
            textChannels: [],
            voiceChannels: [],
            forumChannels: [],
            stageChannels: [],
            threads: [],
            other: []
        };

        console.log('🔍 Analyse des types de canaux:');
        const typeCount = {};
        channels.forEach(channel => {
            typeCount[channel.type] = (typeCount[channel.type] || 0) + 1;
        });
        console.log('📊 Types trouvés:', typeCount);

        channels.forEach(channel => {
            let isPrivate = false;
            if (channel.permissionOverwrites) {
                const everyoneOverwrite = channel.permissionOverwrites.cache.find(overwrite => 
                    overwrite.id === guild.id
                );
                if (everyoneOverwrite && everyoneOverwrite.deny) {
                    try {
                        isPrivate = everyoneOverwrite.deny.has('VIEW_CHANNEL') || 
                                   everyoneOverwrite.deny.has('ViewChannel') ||
                                   (everyoneOverwrite.deny.bitfield && 
                                    (BigInt(everyoneOverwrite.deny.bitfield) & ALL_DISCORD_PERMISSIONS.VIEW_CHANNEL) !== BigInt(0));
                    } catch (error) {
                    }
                }
            }

            const channelData = {
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                parentId: channel.parentId,
                parentName: channel.parent?.name || null,
                topic: channel.topic,
                nsfw: channel.nsfw,
                isPrivate: isPrivate,
                rateLimitPerUser: channel.rateLimitPerUser,
                createdAt: channel.createdAt,
                permissionOverwrites: [],
                lastMessageId: channel.lastMessageId,
                lastPinTimestamp: channel.lastPinTimestamp
            };
            if (channel.permissionOverwrites) {
                channel.permissionOverwrites.cache.forEach(overwrite => {
                    channelData.permissionOverwrites.push({
                        id: overwrite.id,
                        type: overwrite.type,
                        allow: overwrite.allow.toArray(),
                        deny: overwrite.deny.toArray()
                    });
                });
            }
            if (channel.type === 2) {
                channelData.bitrate = channel.bitrate;
                channelData.userLimit = channel.userLimit;
                channelData.rtcRegion = channel.rtcRegion;
            }

            if (channel.type === 15) {
                channelData.defaultReactionEmoji = channel.defaultReactionEmoji;
                channelData.defaultThreadRateLimitPerUser = channel.defaultThreadRateLimitPerUser;
                channelData.availableTags = channel.availableTags;
            }

            const ChannelType = {
                GUILD_TEXT: 0,
                DM: 1,
                GUILD_VOICE: 2,
                GROUP_DM: 3,
                GUILD_CATEGORY: 4,
                GUILD_ANNOUNCEMENT: 5,
                ANNOUNCEMENT_THREAD: 10,
                PUBLIC_THREAD: 11,
                PRIVATE_THREAD: 12,
                GUILD_STAGE_VOICE: 13,
                GUILD_DIRECTORY: 14,
                GUILD_FORUM: 15
            };

            const channelType = typeof channel.type === 'string' ? 
                channel.type.replace('GUILD_', '').replace('_', '_') : 
                channel.type;

            if (channel.type === ChannelType.GUILD_CATEGORY || channel.type === 4 || channel.type === 'GUILD_CATEGORY') {
                this.serverData.channels.categories.push(channelData);
                
            } else if (channel.type === ChannelType.GUILD_TEXT || channel.type === 0 || channel.type === 'GUILD_TEXT' ||
                      channel.type === ChannelType.GUILD_ANNOUNCEMENT || channel.type === 5 || channel.type === 'GUILD_ANNOUNCEMENT' || channel.type === 'GUILD_NEWS') {
                this.serverData.channels.textChannels.push(channelData);
                
            } else if (channel.type === ChannelType.GUILD_VOICE || channel.type === 2 || channel.type === 'GUILD_VOICE') {
                this.serverData.channels.voiceChannels.push(channelData);
                
            } else if (channel.type === ChannelType.GUILD_FORUM || channel.type === 15 || channel.type === 'GUILD_FORUM') {
                this.serverData.channels.forumChannels.push(channelData);
                
            } else if (channel.type === ChannelType.GUILD_STAGE_VOICE || channel.type === 13 || channel.type === 'GUILD_STAGE_VOICE') {
                this.serverData.channels.stageChannels.push(channelData);
                
            } else if (channel.type === ChannelType.PUBLIC_THREAD || channel.type === 11 || channel.type === 'PUBLIC_THREAD' ||
                      channel.type === ChannelType.PRIVATE_THREAD || channel.type === 12 || channel.type === 'PRIVATE_THREAD' ||
                      channel.type === ChannelType.ANNOUNCEMENT_THREAD || channel.type === 10 || channel.type === 'ANNOUNCEMENT_THREAD') {
                this.serverData.channels.threads.push(channelData);
                console.log(`🧵 Ajouté à threads: ${channel.name}`);
            } else {
                this.serverData.channels.other.push(channelData);
            }
        });

        Object.keys(this.serverData.channels).forEach(key => {
            this.serverData.channels[key].sort((a, b) => (a.position || 0) - (b.position || 0));
        });

        console.log('✅ Canaux organisés:');
        console.log(`   - Catégories: ${this.serverData.channels.categories.length}`);
        console.log(`   - Canaux texte: ${this.serverData.channels.textChannels.length}`);
        console.log(`   - Canaux vocaux: ${this.serverData.channels.voiceChannels.length}`);
        console.log(`   - Canaux forum: ${this.serverData.channels.forumChannels.length}`);
        console.log(`   - Canaux stage: ${this.serverData.channels.stageChannels.length}`);
        console.log(`   - Threads: ${this.serverData.channels.threads.length}`);
        console.log(`   - Autres: ${this.serverData.channels.other.length}`);

        // Log détaillé des catégories
        if (this.serverData.channels.categories.length > 0) {
            console.log('📂 Catégories trouvées:');
            this.serverData.channels.categories.forEach(cat => {
                console.log(`   - ${cat.name} (ID: ${cat.id})`);
            });
        }

        // Log détaillé des canaux texte
        if (this.serverData.channels.textChannels.length > 0) {
            console.log('💬 Canaux texte trouvés:');
            this.serverData.channels.textChannels.forEach(ch => {
                console.log(`   - #${ch.name} (Parent: ${ch.parentName || 'Aucun'})`);
            });
        }
    }

    async collectRoles(guild) {
        console.log('🏷️ Récupération des rôles...');
        const roles = guild.roles.cache;

        // Diagnostic des permissions disponibles
        // console.log('🔍 Diagnostic complet des permissions Discord...');
        // console.log(`📊 Permissions disponibles dans discord.js: ${Object.keys(Permissions.FLAGS || {}).length}`);
        // console.log(`📊 Permissions dans notre mapping: ${Object.keys(ALL_DISCORD_PERMISSIONS).length}`);

        // Afficher les permissions disponibles dans discord.js
        if (Permissions.FLAGS) {
            // console.log('📋 Permissions discord.js:', Object.keys(Permissions.FLAGS).slice(0, 10).join(', '), '...');
        }

        // Test de détection sur plusieurs rôles
        // console.log('🧪 Tests de détection des permissions:');
        roles.forEach((testRole, index) => {
            if (index < 3) { // Tester les 3 premiers rôles
                console.log(`\n🔍 Test rôle "${testRole.name}" (${testRole.id}):`);
                console.log(`   - Type permissions: ${typeof testRole.permissions}`);
                console.log(`   - Bitfield: ${testRole.permissions.bitfield}`);
                console.log(`   - Has toArray: ${typeof testRole.permissions.toArray === 'function'}`);
                console.log(`   - Has has(): ${typeof testRole.permissions.has === 'function'}`);

                const detectedPermissions = this.getAllPermissions(testRole.permissions);
                console.log(`   - Permissions détectées: ${detectedPermissions.length}`);

                // Tester quelques permissions spécifiques
                const testPerms = ['ADMINISTRATOR', 'MANAGE_ROLES', 'SEND_MESSAGES', 'VIEW_CHANNEL'];
                testPerms.forEach(perm => {
                    const result = this.checkPermission(testRole.permissions, perm);
                    console.log(`   - ${perm}: ${result}`);
                });
            }
        });

        this.serverData.roles = [];

        roles.forEach(role => {
            if (role.name !== '@everyone') {
                const roleData = {
                    id: role.id,
                    name: role.name,
                    color: role.hexColor || '#000000',
                    colorInt: role.color,
                    position: role.position,
                    permissions: this.getAllPermissions(role.permissions),
                    permissionsRaw: role.permissions.bitfield.toString(),
                    mentionable: role.mentionable,
                    hoist: role.hoist,
                    managed: role.managed,
                    createdAt: role.createdAt,
                    memberCount: role.members.size,
                    members: [],
                    icon: role.iconURL({ size: 256 }),
                    unicodeEmoji: role.unicodeEmoji,
                    tags: {
                        botId: role.tags?.botId || null,
                        integrationId: role.tags?.integrationId || null,
                        premiumSubscriberRole: role.tags?.premiumSubscriberRole || null,
                        subscriptionListingId: role.tags?.subscriptionListingId || null,
                        availableForPurchase: role.tags?.availableForPurchase || null,
                        guildConnections: role.tags?.guildConnections || null
                    },
                    rawPosition: role.rawPosition,
                    editable: role.editable,
                    flags: role.flags?.toArray() || [],
                    permissionDetails: {
                        // General Server Permissions
                        VIEW_CHANNEL: this.checkPermission(role.permissions, 'VIEW_CHANNEL'),
                        MANAGE_CHANNELS: this.checkPermission(role.permissions, 'MANAGE_CHANNELS'),
                        MANAGE_ROLES: this.checkPermission(role.permissions, 'MANAGE_ROLES'),
                        CREATE_GUILD_EXPRESSIONS: this.checkPermission(role.permissions, 'CREATE_GUILD_EXPRESSIONS'),
                        MANAGE_GUILD_EXPRESSIONS: this.checkPermission(role.permissions, 'MANAGE_GUILD_EXPRESSIONS'),
                        MANAGE_EMOJIS_AND_STICKERS: this.checkPermission(role.permissions, 'MANAGE_EMOJIS_AND_STICKERS'),
                        VIEW_AUDIT_LOG: this.checkPermission(role.permissions, 'VIEW_AUDIT_LOG'),
                        VIEW_GUILD_INSIGHTS: this.checkPermission(role.permissions, 'VIEW_GUILD_INSIGHTS'),
                        MANAGE_WEBHOOKS: this.checkPermission(role.permissions, 'MANAGE_WEBHOOKS'),
                        MANAGE_GUILD: this.checkPermission(role.permissions, 'MANAGE_GUILD'),

                        // Member Permissions
                        CREATE_INSTANT_INVITE: this.checkPermission(role.permissions, 'CREATE_INSTANT_INVITE'),
                        CHANGE_NICKNAME: this.checkPermission(role.permissions, 'CHANGE_NICKNAME'),
                        MANAGE_NICKNAMES: this.checkPermission(role.permissions, 'MANAGE_NICKNAMES'),
                        KICK_MEMBERS: this.checkPermission(role.permissions, 'KICK_MEMBERS'),
                        BAN_MEMBERS: this.checkPermission(role.permissions, 'BAN_MEMBERS'),
                        MODERATE_MEMBERS: this.checkPermission(role.permissions, 'MODERATE_MEMBERS'),

                        // Text Channel Permissions
                        SEND_MESSAGES: this.checkPermission(role.permissions, 'SEND_MESSAGES'),
                        SEND_MESSAGES_IN_THREADS: this.checkPermission(role.permissions, 'SEND_MESSAGES_IN_THREADS'),
                        CREATE_PUBLIC_THREADS: this.checkPermission(role.permissions, 'CREATE_PUBLIC_THREADS'),
                        CREATE_PRIVATE_THREADS: this.checkPermission(role.permissions, 'CREATE_PRIVATE_THREADS'),
                        EMBED_LINKS: this.checkPermission(role.permissions, 'EMBED_LINKS'),
                        ATTACH_FILES: this.checkPermission(role.permissions, 'ATTACH_FILES'),
                        ADD_REACTIONS: this.checkPermission(role.permissions, 'ADD_REACTIONS'),
                        USE_EXTERNAL_EMOJIS: this.checkPermission(role.permissions, 'USE_EXTERNAL_EMOJIS'),
                        USE_EXTERNAL_STICKERS: this.checkPermission(role.permissions, 'USE_EXTERNAL_STICKERS'),
                        MENTION_EVERYONE: this.checkPermission(role.permissions, 'MENTION_EVERYONE'),
                        MANAGE_MESSAGES: this.checkPermission(role.permissions, 'MANAGE_MESSAGES'),
                        MANAGE_THREADS: this.checkPermission(role.permissions, 'MANAGE_THREADS'),
                        READ_MESSAGE_HISTORY: this.checkPermission(role.permissions, 'READ_MESSAGE_HISTORY'),
                        SEND_TTS_MESSAGES: this.checkPermission(role.permissions, 'SEND_TTS_MESSAGES'),
                        USE_APPLICATION_COMMANDS: this.checkPermission(role.permissions, 'USE_APPLICATION_COMMANDS'),
                        SEND_VOICE_MESSAGES: this.checkPermission(role.permissions, 'SEND_VOICE_MESSAGES'),

                        // Voice Channel Permissions
                        CONNECT: this.checkPermission(role.permissions, 'CONNECT'),
                        SPEAK: this.checkPermission(role.permissions, 'SPEAK'),
                        STREAM: this.checkPermission(role.permissions, 'STREAM'),
                        USE_SOUNDBOARD: this.checkPermission(role.permissions, 'USE_SOUNDBOARD'),
                        USE_EXTERNAL_SOUNDS: this.checkPermission(role.permissions, 'USE_EXTERNAL_SOUNDS'),
                        USE_VAD: this.checkPermission(role.permissions, 'USE_VAD'),
                        PRIORITY_SPEAKER: this.checkPermission(role.permissions, 'PRIORITY_SPEAKER'),
                        MUTE_MEMBERS: this.checkPermission(role.permissions, 'MUTE_MEMBERS'),
                        DEAFEN_MEMBERS: this.checkPermission(role.permissions, 'DEAFEN_MEMBERS'),
                        MOVE_MEMBERS: this.checkPermission(role.permissions, 'MOVE_MEMBERS'),
                        SET_VOICE_CHANNEL_STATUS: this.checkPermission(role.permissions, 'SET_VOICE_CHANNEL_STATUS'),

                        // Applications Permissions
                        USE_EMBEDDED_ACTIVITIES: this.checkPermission(role.permissions, 'USE_EMBEDDED_ACTIVITIES'),

                        // Stage Channel Permissions
                        REQUEST_TO_SPEAK: this.checkPermission(role.permissions, 'REQUEST_TO_SPEAK'),

                        // Events Permissions
                        CREATE_EVENTS: this.checkPermission(role.permissions, 'CREATE_EVENTS'),
                        MANAGE_EVENTS: this.checkPermission(role.permissions, 'MANAGE_EVENTS'),

                        // Advanced Permissions
                        ADMINISTRATOR: this.checkPermission(role.permissions, 'ADMINISTRATOR')
                    },
                    // Ajout de la logique pour les dégradés ici
                    gradient: null // Initialisation de la propriété gradient
                };

                // Récupérer la couleur principale
                roleData.color = role.hexColor || '#000000';

                // Détecter et récupérer les informations de dégradé si disponibles
                roleData.gradient = null;
                if (role.tags && role.tags.premium_subscriber) {
                    // Rôle Nitro Booster - utilise souvent des dégradés
                    roleData.gradient = {
                        type: 'nitro_booster',
                        colors: ['#ff73fa', '#b968c7'],
                        css: 'linear-gradient(45deg, #ff73fa 0%, #b968c7 100%)'
                    };
                } else if (role.tags && role.tags.integration_id) {
                    // Rôle de bot - peut avoir des couleurs spéciales
                    roleData.gradient = {
                        type: 'bot_role',
                        colors: [role.hexColor || '#5865f2'],
                        css: role.hexColor || '#5865f2'
                    };
                } else if (role.name.toLowerCase().includes('owner') || role.name.toLowerCase().includes('founder')) {
                    // Rôle propriétaire - dégradé doré
                    roleData.gradient = {
                        type: 'owner',
                        colors: ['#ffd700', '#ffed4e', '#fff700'],
                        css: 'linear-gradient(45deg, #ffd700 0%, #ffed4e 50%, #fff700 100%)'
                    };
                } else if (role.name.toLowerCase().includes('admin') || role.name.toLowerCase().includes('moderator')) {
                    // Rôles d'administration - dégradé bleu/violet
                    roleData.gradient = {
                        type: 'admin',
                        colors: ['#5865f2', '#4752c4'],
                        css: 'linear-gradient(45deg, #5865f2 0%, #4752c4 100%)'
                    };
                } else if (role.hexColor && role.hexColor !== '#000000') {
                    // Créer un dégradé subtil basé sur la couleur du rôle
                    const baseColor = role.hexColor;
                    const lighterColor = this.lightenColor(baseColor, 20);
                    const darkerColor = this.darkenColor(baseColor, 20);

                    roleData.gradient = {
                        type: 'custom',
                        colors: [lighterColor, baseColor, darkerColor],
                        css: `linear-gradient(45deg, ${lighterColor} 0%, ${baseColor} 50%, ${darkerColor} 100%)`
                    };
                }


                // Récupérer les membres ayant ce rôle avec plus de détails
                role.members.forEach(member => {
                    roleData.members.push({
                        id: member.id,
                        username: member.user.username,
                        globalName: member.user.globalName,
                        displayName: member.displayName,
                        nickname: member.nickname,
                        avatar: member.displayAvatarURL({ size: 256 }),
                        banner: member.user.banner ? member.user.bannerURL({ size: 1024 }) : null,
                        joinedAt: member.joinedAt,
                        premiumSince: member.premiumSince,
                        bot: member.user.bot,
                        system: member.user.system
                    });
                });

                // Trier les membres par date d'arrivée
                roleData.members.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

                this.serverData.roles.push(roleData);
            }
        });

        // Inclure aussi le rôle @everyone pour les statistiques
        const everyoneRole = roles.find(role => role.name === '@everyone');
        if (everyoneRole) {
            this.serverData.everyoneRole = {
                id: everyoneRole.id,
                name: everyoneRole.name,
                color: everyoneRole.hexColor || '#000000',
                permissions: this.getAllPermissions(everyoneRole.permissions),
                position: everyoneRole.position,
                memberCount: guild.memberCount,
                permissionDetails: {
                    // General Server Permissions
                    VIEW_CHANNEL: this.checkPermission(everyoneRole.permissions, 'VIEW_CHANNEL'),
                    MANAGE_CHANNELS: this.checkPermission(everyoneRole.permissions, 'MANAGE_CHANNELS'),
                    MANAGE_ROLES: this.checkPermission(everyoneRole.permissions, 'MANAGE_ROLES'),
                    CREATE_GUILD_EXPRESSIONS: this.checkPermission(everyoneRole.permissions, 'CREATE_GUILD_EXPRESSIONS'),
                    MANAGE_GUILD_EXPRESSIONS: this.checkPermission(everyoneRole.permissions, 'MANAGE_GUILD_EXPRESSIONS'),
                    MANAGE_EMOJIS_AND_STICKERS: this.checkPermission(everyoneRole.permissions, 'MANAGE_EMOJIS_AND_STICKERS'),
                    VIEW_AUDIT_LOG: this.checkPermission(everyoneRole.permissions, 'VIEW_AUDIT_LOG'),
                    VIEW_GUILD_INSIGHTS: this.checkPermission(everyoneRole.permissions, 'VIEW_GUILD_INSIGHTS'),
                    MANAGE_WEBHOOKS: this.checkPermission(everyoneRole.permissions, 'MANAGE_WEBHOOKS'),
                    MANAGE_GUILD: this.checkPermission(everyoneRole.permissions, 'MANAGE_GUILD'),

                    // Member Permissions
                    CREATE_INSTANT_INVITE: this.checkPermission(everyoneRole.permissions, 'CREATE_INSTANT_INVITE'),
                    CHANGE_NICKNAME: this.checkPermission(everyoneRole.permissions, 'CHANGE_NICKNAME'),
                    MANAGE_NICKNAMES: this.checkPermission(everyoneRole.permissions, 'MANAGE_NICKNAMES'),
                    KICK_MEMBERS: this.checkPermission(everyoneRole.permissions, 'KICK_MEMBERS'),
                    BAN_MEMBERS: this.checkPermission(everyoneRole.permissions, 'BAN_MEMBERS'),
                    MODERATE_MEMBERS: this.checkPermission(everyoneRole.permissions, 'MODERATE_MEMBERS'),

                    // Text Channel Permissions
                    SEND_MESSAGES: this.checkPermission(everyoneRole.permissions, 'SEND_MESSAGES'),
                    SEND_MESSAGES_IN_THREADS: this.checkPermission(everyoneRole.permissions, 'SEND_MESSAGES_IN_THREADS'),
                    CREATE_PUBLIC_THREADS: this.checkPermission(everyoneRole.permissions, 'CREATE_PUBLIC_THREADS'),
                    CREATE_PRIVATE_THREADS: this.checkPermission(everyoneRole.permissions, 'CREATE_PRIVATE_THREADS'),
                    EMBED_LINKS: this.checkPermission(everyoneRole.permissions, 'EMBED_LINKS'),
                    ATTACH_FILES: this.checkPermission(everyoneRole.permissions, 'ATTACH_FILES'),
                    ADD_REACTIONS: this.checkPermission(everyoneRole.permissions, 'ADD_REACTIONS'),
                    USE_EXTERNAL_EMOJIS: this.checkPermission(everyoneRole.permissions, 'USE_EXTERNAL_EMOJIS'),
                    USE_EXTERNAL_STICKERS: this.checkPermission(everyoneRole.permissions, 'USE_EXTERNAL_STICKERS'),
                    MENTION_EVERYONE: this.checkPermission(everyoneRole.permissions, 'MENTION_EVERYONE'),
                    MANAGE_MESSAGES: this.checkPermission(everyoneRole.permissions, 'MANAGE_MESSAGES'),
                    MANAGE_THREADS: this.checkPermission(everyoneRole.permissions, 'MANAGE_THREADS'),
                    READ_MESSAGE_HISTORY: this.checkPermission(everyoneRole.permissions, 'READ_MESSAGE_HISTORY'),
                    SEND_TTS_MESSAGES: this.checkPermission(everyoneRole.permissions, 'SEND_TTS_MESSAGES'),
                    USE_APPLICATION_COMMANDS: this.checkPermission(everyoneRole.permissions, 'USE_APPLICATION_COMMANDS'),
                    SEND_VOICE_MESSAGES: this.checkPermission(everyoneRole.permissions, 'SEND_VOICE_MESSAGES'),

                    // Voice Channel Permissions
                    CONNECT: this.checkPermission(everyoneRole.permissions, 'CONNECT'),
                    SPEAK: this.checkPermission(everyoneRole.permissions, 'SPEAK'),
                    STREAM: this.checkPermission(everyoneRole.permissions, 'STREAM'),
                    USE_SOUNDBOARD: this.checkPermission(everyoneRole.permissions, 'USE_SOUNDBOARD'),
                    USE_EXTERNAL_SOUNDS: this.checkPermission(everyoneRole.permissions, 'USE_EXTERNAL_SOUNDS'),
                    USE_VAD: this.checkPermission(everyoneRole.permissions, 'USE_VAD'),
                    PRIORITY_SPEAKER: this.checkPermission(everyoneRole.permissions, 'PRIORITY_SPEAKER'),
                    MUTE_MEMBERS: this.checkPermission(everyoneRole.permissions, 'MUTE_MEMBERS'),
                    DEAFEN_MEMBERS: this.checkPermission(everyoneRole.permissions, 'DEAFEN_MEMBERS'),
                    MOVE_MEMBERS: this.checkPermission(everyoneRole.permissions, 'MOVE_MEMBERS'),
                    SET_VOICE_CHANNEL_STATUS: this.checkPermission(everyoneRole.permissions, 'SET_VOICE_CHANNEL_STATUS'),

                    // Applications Permissions
                    USE_EMBEDDED_ACTIVITIES: this.checkPermission(everyoneRole.permissions, 'USE_EMBEDDED_ACTIVITIES'),

                    // Stage Channel Permissions
                    REQUEST_TO_SPEAK: this.checkPermission(everyoneRole.permissions, 'REQUEST_TO_SPEAK'),

                    // Events Permissions
                    CREATE_EVENTS: this.checkPermission(everyoneRole.permissions, 'CREATE_EVENTS'),
                    MANAGE_EVENTS: this.checkPermission(everyoneRole.permissions, 'MANAGE_EVENTS'),

                    // Advanced Permissions
                    ADMINISTRATOR: this.checkPermission(everyoneRole.permissions, 'ADMINISTRATOR')
                }
            };
        }

        // Trier par position (plus haute en premier)
        this.serverData.roles.sort((a, b) => b.position - a.position);
    }

    async collectMembers(guild) {
        console.log('👥 Récupération de tous les membres...');
        try {
            // Récupérer TOUS les membres du serveur
            const members = await guild.members.fetch();
            this.serverData.members = [];
            console.log(`✅ ${members.size} membres récupérés`);

            members.forEach(member => {
                const memberData = {
                    id: member.id,
                    username: member.user.username,
                    discriminator: member.user.discriminator,
                    displayName: member.displayName,
                    nickname: member.nickname,
                    avatar: member.displayAvatarURL({ size: 512 }),
                    banner: member.user.banner ? member.user.bannerURL({ size: 2048 }) : null,
                    accentColor: member.user.accentColor,
                    bot: member.user.bot,
                    joinedAt: member.joinedAt,
                    premiumSince: member.premiumSince,
                    roles: [],
                    highestRole: {
                        id: member.roles.highest.id,
                        name: member.roles.highest.name,
                        color: member.roles.highest.hexColor
                    },
                    presence: {
                        status: member.presence?.status || 'offline',
                        activities: member.presence?.activities?.map(activity => ({
                            name: activity.name,
                            type: activity.type,
                            details: activity.details,
                            state: activity.state,
                            url: activity.url,
                            timestamps: activity.timestamps
                        })) || []
                    },
                    permissions: this.getAllPermissions(member.permissions),
                permissionsCount: this.getAllPermissions(member.permissions).length,
                    communicationDisabledUntil: member.communicationDisabledUntil,
                    flags: member.user.flags?.toArray() || []
                };

                // Rôles du membre
                member.roles.cache.forEach(role => {
                    if (role.name !== '@everyone') {
                        memberData.roles.push({
                            id: role.id,
                            name: role.name,
                            color: role.hexColor,
                            position: role.position
                        });
                    }
                });

                // Trier les rôles par position
                memberData.roles.sort((a, b) => b.position - a.position);

                this.serverData.members.push(memberData);
            });

        } catch (error) {
            console.log('ℹ️ Impossible de récupérer tous les membres:', error.message);
            this.serverData.members = [];
        }
    }

    async collectEmojis(guild) {
        console.log('😀 Récupération des emojis...');
        const emojis = guild.emojis.cache;

        this.serverData.emojis = [];

        emojis.forEach(emoji => {
            this.serverData.emojis.push({
                id: emoji.id,
                name: emoji.name,
                animated: emoji.animated,
                url: emoji.url,
                available: emoji.available,
                managed: emoji.managed,
                requireColons: emoji.requireColons,
                createdAt: emoji.createdAt,
                author: emoji.author ? {
                    id: emoji.author.id,
                    username: emoji.author.username,
                    avatar: emoji.author.displayAvatarURL()
                } : null
            });
        });
    }

    async collectRecentMessages(guild) {
        console.log('💬 Récupération des messages récents...');
        this.serverData.messages = {};

        const textChannels = guild.channels.cache.filter(c => c.type === 0 && c.viewable);

        for (const [channelId, channel] of textChannels) {
            try {
                const messages = await channel.messages.fetch({ limit: 20 });
                this.serverData.messages[channelId] = [];

                messages.forEach(message => {
                    const messageData = {
                        id: message.id,
                        content: message.content,
                        author: {
                            id: message.author.id,
                            username: message.author.username,
                            discriminator: message.author.discriminator,
                            avatar: message.author.displayAvatarURL({ size: 256 }),
                            banner: message.author.banner ? message.author.bannerURL({ size: 2048 }) : null,
                            bot: message.author.bot,
                            accentColor: message.author.accentColor,
                            flags: message.author.flags?.toArray() || []
                        },
                        member: message.member ? {
                            nickname: message.member.nickname,
                            displayName: message.member.displayName,
                            roles: message.member.roles.cache.map(role => ({
                                id: role.id,
                                name: role.name,
                                color: role.hexColor,
                                position: role.position
                            })).filter(role => role.name !== '@everyone').sort((a, b) => b.position - a.position),
                            joinedAt: message.member.joinedAt,
                            premiumSince: message.member.premiumSince
                        } : null,
                        createdAt: message.createdAt,
                        editedAt: message.editedAt,
                        pinned: message.pinned,
                        tts: message.tts,
                        type: message.type,
                        system: message.system,
                        attachments: message.attachments.map(att => ({
                            id: att.id,
                            name: att.name,
                            url: att.url,
                            proxyURL: att.proxyURL,
                            size: att.size,
                            width: att.width,
                            height: att.height,
                            contentType: att.contentType
                        })),
                        embeds: message.embeds.map(embed => ({
                            title: embed.title,
                            description: embed.description,
                            color: embed.color,
                            timestamp: embed.timestamp,
                            url: embed.url,
                            author: embed.author,
                            footer: embed.footer,
                            thumbnail: embed.thumbnail,
                            image: embed.image,
                            fields: embed.fields
                        })),
                        reactions: message.reactions.cache.map(reaction => ({
                            emoji: {
                                id: reaction.emoji.id,
                                name: reaction.emoji.name,
                                animated: reaction.emoji.animated
                            },
                            count: reaction.count,
                            me: reaction.me
                        })),
                        mentions: {
                            users: message.mentions.users.map(user => ({
                                id: user.id,
                                username: user.username,
                                avatar: user.displayAvatarURL()
                            })),
                            roles: message.mentions.roles.map(role => ({
                                id: role.id,
                                name: role.name,
                                color: role.hexColor
                            })),
                            channels: message.mentions.channels.map(channel => ({
                                id: channel.id,
                                name: channel.name,
                                type: channel.type
                            }))
                        },
                        webhookId: message.webhookId,
                        applicationId: message.applicationId,
                        flags: message.flags?.toArray() || []
                    };

                    this.serverData.messages[channelId].push(messageData);
                });

                // Trier par date (plus récent en premier)
                this.serverData.messages[channelId].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                // console.log(`📝 ${messages.size} messages récupérés de #${channel.name}`);

            } catch (error) {
                console.log(`ℹ️ Impossible de récupérer les messages de #${channel.name}:`, error.message);
            }
        }
    }

    async collectOtherData(guild) {
        console.log('🔧 Récupération des données supplémentaires...');

        // Invitations
        try {
            const invites = await guild.invites.fetch();
            this.serverData.invites = invites.map(invite => ({
                code: invite.code,
                url: invite.url,
                uses: invite.uses,
                maxUses: invite.maxUses,
                maxAge: invite.maxAge,
                temporary: invite.temporary,
                createdAt: invite.createdAt,
                expiresAt: invite.expiresAt,
                inviter: invite.inviter ? {
                    id: invite.inviter.id,
                    username: invite.inviter.username,
                    avatar: invite.inviter.displayAvatarURL()
                } : null,
                channel: {
                    id: invite.channel.id,
                    name: invite.channel.name,
                    type: invite.channel.type
                }
            }));
        } catch (error) {
            this.serverData.invites = [];
        }

        // Webhooks
        try {
            const webhooks = await guild.fetchWebhooks();
            this.serverData.webhooks = webhooks.map(webhook => ({
                id: webhook.id,
                name: webhook.name,
                avatar: webhook.avatarURL(),
                channelId: webhook.channelId,
                guildId: webhook.guildId,
                url: webhook.url,
                token: webhook.token ? '[HIDDEN]' : null,
                owner: webhook.owner ? {
                    id: webhook.owner.id,
                    username: webhook.owner.username,
                    avatar: webhook.owner.displayAvatarURL()
                } : null
            }));
        } catch (error) {
            this.serverData.webhooks = [];
        }

        // Bans
        try {
            const bans = await guild.bans.fetch();
            this.serverData.bans = bans.map(ban => ({
                user: {
                    id: ban.user.id,
                    username: ban.user.username,
                    discriminator: ban.user.discriminator,
                    avatar: ban.user.displayAvatarURL()
                },
                reason: ban.reason
            }));
        } catch (error) {
            this.serverData.bans = [];
        }

        // Statistiques détaillées
        this.serverData.statistics = {
            totalChannels: guild.channels.cache.size,
            textChannels: guild.channels.cache.filter(c => c.type === 0).size,
            voiceChannels: guild.channels.cache.filter(c => c.type === 2).size,
            categories: guild.channels.cache.filter(c => c.type === 4).size,
            announcementChannels: guild.channels.cache.filter(c => c.type === 5).size,
            forumChannels: guild.channels.cache.filter(c => c.type === 15).size,
            threads: guild.channels.cache.filter(c => c.type === 11 || c.type === 12).size,
            stageChannels: guild.channels.cache.filter(c => c.type === 13).size,
            totalRoles: guild.roles.cache.size,
            totalEmojis: guild.emojis.cache.size,
            animatedEmojis: guild.emojis.cache.filter(e => e.animated).size,
            staticEmojis: guild.emojis.cache.filter(e => !e.animated).size
        };
    }

    // Fonctions utilitaires pour la manipulation des couleurs (nécessaires pour les dégradés custom)
    lightenColor(hex, percent) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        const nr = Math.min(255, Math.round(r + (255 - r) * percent / 100));
        const ng = Math.min(255, Math.round(g + (255 - g) * percent / 100));
        const nb = Math.min(255, Math.round(b + (255 - b) * percent / 100));

        const toHex = (c) => {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
    }

    darkenColor(hex, percent) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        const nr = Math.max(0, Math.round(r - r * percent / 100));
        const ng = Math.max(0, Math.round(g - g * percent / 100));
        const nb = Math.max(0, Math.round(b - b * percent / 100));

        const toHex = (c) => {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
    }

    getData() {
        return this.serverData;
    }

    destroy() {
        this.client.destroy();
    }
}

module.exports = DiscordDataCollector;