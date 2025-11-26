// Données du serveur Discord
let discordData = null;
let currentSelectedRole = null;

// Cache optimisé pour les lookups rapides
let userLookupMap = null;
let roleLookupMap = null;
let channelLookupMap = null;

// Fonction d'échappement HTML pour éviter les injections XSS
function escapeHtmlForMention(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Fonction pour construire les maps de lookup (une seule fois au chargement)
function buildLookupMaps() {
    userLookupMap = new Map();
    roleLookupMap = new Map();
    channelLookupMap = new Map();

    // Map des utilisateurs depuis userRoles ET members (avec échappement)
    if (discordData?.userRoles) {
        for (const [userId, userData] of Object.entries(
            discordData.userRoles,
        )) {
            userLookupMap.set(userId, escapeHtmlForMention(userData.username));
        }
    }
    if (discordData?.members) {
        for (const [userId, memberData] of Object.entries(
            discordData.members,
        )) {
            if (!userLookupMap.has(userId)) {
                userLookupMap.set(
                    userId,
                    escapeHtmlForMention(
                        memberData.displayName || memberData.username,
                    ),
                );
            }
        }
    }

    // Map des rôles (avec la NOUVELLE structure et échappement)
    if (discordData?.roles) {
        // Gestion de l'ancienne structure (array)
        if (Array.isArray(discordData.roles)) {
            discordData.roles.forEach((role) => {
                roleLookupMap.set(role.id, {
                    name: escapeHtmlForMention(role.name),
                    color:
                        role.color && role.color !== "#000000"
                            ? role.color
                            : "#5865f2",
                    // Ajouter les nouvelles propriétés pour le style de rôle
                    roleStyle: role.roleStyle || "solid", // 'solid', 'gradient', 'holographic'
                    primaryColor: role.primaryColor,
                    secondaryColor: role.secondaryColor,
                    tertiaryColor: role.tertiaryColor,
                });
            });
        }
        // Gestion de la nouvelle structure (objet)
        else if (typeof discordData.roles === "object") {
            for (const [roleId, roleData] of Object.entries(
                discordData.roles,
            )) {
                roleLookupMap.set(roleId, {
                    name: escapeHtmlForMention(roleData.name),
                    color:
                        roleData.color && roleData.color !== "#000000"
                            ? roleData.color
                            : "#5865f2",
                    // Ajouter les nouvelles propriétés pour le style de rôle
                    roleStyle: roleData.roleStyle || "solid", // 'solid', 'gradient', 'holographic'
                    primaryColor: roleData.primaryColor,
                    secondaryColor: roleData.secondaryColor,
                    tertiaryColor: roleData.tertiaryColor,
                });
            }
        }
    }

    // Map des canaux (TOUS les types de canaux avec échappement)
    if (discordData?.channels) {
        const allChannels = [
            ...(discordData.channels.textChannels || []),
            ...(discordData.channels.voiceChannels || []),
            ...(discordData.channels.forumChannels || []),
            ...(discordData.channels.stageChannels || []),
            ...(discordData.channels.threads || []),
            ...(discordData.channels.other || []),
            ...(discordData.channels.categories || []),
        ];
        allChannels.forEach((channel) => {
            if (channel && channel.id && channel.name) {
                channelLookupMap.set(
                    channel.id,
                    escapeHtmlForMention(channel.name),
                );
            }
        });
    }

    console.log("📊 Lookup maps construites (avec échappement sécurisé):", {
        users: userLookupMap.size,
        roles: roleLookupMap.size,
        channels: channelLookupMap.size,
    });
}

// Normalize a color value coming from discord data to a hex string like "#rrggbb".
// Accepts numbers (e.g. 0x4854e9), hex strings with or without '#', and falls
// back to an optional fallback value. Returns null if unable to resolve.
function normalizeColor(value, fallback) {
    const raw = value ?? fallback;
    if (!raw && raw !== 0) return null;

    if (typeof raw === "number") {
        return "#" + raw.toString(16).padStart(6, "0");
    }

    if (typeof raw === "string") {
        let s = raw.trim();
        if (s === "") return null;
        if (s.startsWith("#") && (s.length === 7 || s.length === 4)) return s;
        if (s.startsWith("0x") || s.startsWith("0X")) s = s.slice(2);
        if (/^[0-9a-fA-F]{6}$/.test(s)) return "#" + s.toLowerCase();
        if (/^[0-9a-fA-F]{3}$/.test(s)) return "#" + s.toLowerCase();
        const asNum = parseInt(s, 10);
        if (!isNaN(asNum)) return "#" + asNum.toString(16).padStart(6, "0");
    }

    return null;
}

// Retourne les propriétés de style effectives pour un rôle (utilisée par l'éditeur de rôle)
// Renvoie: { effectiveStyle: 'solid'|'gradient'|'holographic', primary, secondary, tertiary, solidColor }
function getRoleStyleProps(role) {
    if (!role) return { effectiveStyle: 'solid', primary: null, secondary: null, tertiary: null, solidColor: '#99aab5' };

    // Prioriser role.roleStyle si présent
    let effectiveStyle = role.roleStyle || 'solid';

    // Normaliser les couleurs (même logique que l'éditeur de rôle)
    const roleColor = role.color && role.color !== "#000000" ? role.color : "#99aab5";
    const primary = normalizeColor(role.primaryColor, roleColor) || normalizeColor(roleColor) || "#99aab5";
    const secondary = normalizeColor(role.secondaryColor, primary) || primary;
    const tertiary = normalizeColor(role.tertiaryColor, primary) || primary;
    const solidColor = normalizeColor(role.color) || primary;

    // Si roleStyle absent, inférer depuis les couleurs
    if (!role.roleStyle) {
        if (role.primaryColor && role.secondaryColor) effectiveStyle = 'gradient';
        else if (role.holographic || role.isHolographic) effectiveStyle = 'holographic';
        else effectiveStyle = 'solid';
    }

    return { effectiveStyle, primary, secondary, tertiary, solidColor };
}

// Helper function to format message timestamp
function formatMessageTimestamp(timestamp) {
    if (!timestamp) return "";

    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return "";

        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // Format time HH:MM
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const timeStr = `${hours}:${minutes}`;

        // Si c'est aujourd'hui
        if (diffDays === 0) {
            return `Aujourd'hui à ${timeStr}`;
        }
        // Si c'était hier
        else if (diffDays === 1) {
            return `Hier à ${timeStr}`;
        }
        // Sinon afficher la date complète
        else {
            const day = date.getDate().toString().padStart(2, "0");
            const month = (date.getMonth() + 1).toString().padStart(2, "0");
            const year = date.getFullYear();
            return `${day}/${month}/${year} à ${timeStr}`;
        }
    } catch (error) {
        return "";
    }
}

// Helper function to process message content, including emojis, GIFs, stickers, Markdown and mentions
function processMessageContent(content) {
    if (!content) return "<em>Message sans contenu</em>";

    // S'assurer que content est une chaîne
    if (typeof content !== "string") {
        if (content.text) {
            content = content.text;
        } else {
            return "<em>Message sans contenu</em>";
        }
    }

    // Échapper le HTML pour éviter les injections
    content = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Protéger les blocs de code (```) avant le formatage
    const codeBlocks = [];
    content = content.replace(
        /```([a-z]*)\n?([\s\S]*?)```/g,
        (match, lang, code) => {
            const index = codeBlocks.length;
            codeBlocks.push(
                `<pre class="code-block"><code class="language-${lang || "text"}">${code}</code></pre>`,
            );
            return `__CODE_BLOCK_${index}__`;
        },
    );

    // Protéger le code inline (`)
    const inlineCode = [];
    content = content.replace(/`([^`]+)`/g, (match, code) => {
        const index = inlineCode.length;
        inlineCode.push(`<code class="inline-code">${code}</code>`);
        return `__INLINE_CODE_${index}__`;
    });

    // Remplacer @everyone et @here
    content = content.replace(
        /@everyone/g,
        '<span class="mention mention-everyone">@everyone</span>',
    );
    content = content.replace(
        /@here/g,
        '<span class="mention mention-here">@here</span>',
    );

    // Remplacer les mentions d'utilisateurs <@userId> ou <@!userId> (lookup optimisé)
    content = content.replace(/&lt;@!?(\d+)&gt;/g, (match, userId) => {
        const displayName = userLookupMap?.get(userId) || "unknown-user";
        return `<span class="mention mention-user" data-user-id="${userId}">@${displayName}</span>`;
    });

    // Remplacer les mentions de canaux <#channelId> (lookup optimisé)
    content = content.replace(/&lt;#(\d+)&gt;/g, (match, channelId) => {
        const channelName =
            channelLookupMap?.get(channelId) || "unknown-channel";
        return `<span class="mention mention-channel" data-channel-id="${channelId}">#${channelName}</span>`;
    });

    // Remplacer les mentions de rôles <@&roleId> (lookup optimisé avec couleur de fond)
    content = content.replace(/&lt;@&amp;(\d+)&gt;/g, (match, roleId) => {
        const roleData = roleLookupMap?.get(roleId);
        const roleName = roleData?.name || "unknown-role";
        const roleColor = roleData?.color || "#5865f2";

        // Convertir la couleur hex en rgba avec transparence pour le fond
        const hexToRgba = (hex, alpha = 0.3) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        return `<span class="mention mention-role" data-role-id="${roleId}" style="background-color: ${hexToRgba(roleColor)}; color: ${roleColor}; border: 1px solid ${roleColor};">@${roleName}</span>`;
    });

    // Remplacer les emojis personnalisés <:name:id> ou <a:name:id>
    content = content.replace(
        /&lt;(a?):(\w+):(\d+)&gt;/g,
        (match, animated, name, id) => {
            const isAnimated = animated === "a";
            const url = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? "gif" : "png"}`;
            return `<img src="${url}" alt=":${name}:" class="message-emoji" style="vertical-align: middle; height: 24px; width: 24px; margin: 0 2px;">`;
        },
    );

    // Formatage Markdown Discord (ordre correct pour éviter double-traitement)
    // Spoiler ||texte|| (traiter EN PREMIER pour protéger le contenu)
    content = content.replace(
        /\|\|(.+?)\|\|/g,
        '<span class="spoiler">$1</span>',
    );

    // Barré ~~texte~~
    content = content.replace(/~~(.+?)~~/g, "<s>$1</s>");

    // Gras italique souligné (combinaisons complexes d'abord)
    content = content.replace(
        /\*\*\*__(.+?)__\*\*\*/g,
        "<strong><em><u>$1</u></em></strong>",
    );
    content = content.replace(
        /__\*\*\*(.+?)\*\*\*__/g,
        "<u><strong><em>$1</em></strong></u>",
    );

    // Gras italique ***texte***
    content = content.replace(
        /\*\*\*(.+?)\*\*\*/g,
        "<strong><em>$1</em></strong>",
    );

    // Gras souligné
    content = content.replace(
        /__\*\*(.+?)\*\*__/g,
        "<u><strong>$1</strong></u>",
    );
    content = content.replace(
        /\*\*__(.+?)__\*\*/g,
        "<strong><u>$1</u></strong>",
    );

    // Italique souligné
    content = content.replace(/__\*(.+?)\*__/g, "<u><em>$1</u></em>");
    content = content.replace(/\*__(.+?)__\*/g, "<em><u>$1</u></em>");

    // Gras **texte**
    content = content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Souligné __texte__
    content = content.replace(/__(.+?)__/g, "<u>$1</u>");

    // Italique *texte* (non-greedy)
    content = content.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Italique _texte_ (seulement si entouré d'espaces ou début/fin)
    content = content.replace(
        /(^|\s)_([^\s_].*?[^\s_])_(\s|$)/g,
        "$1<em>$2</em>$3",
    );

    // Bloc de citation multi-lignes >>> (doit être traité avant >)
    content = content.replace(
        /^&gt;&gt;&gt;\s*([\s\S]*?)(?=\n(?!&gt;)|$)/gm,
        function (match, text) {
            return '<div class="quote-block">' + text.trim() + "</div>";
        },
    );

    // Bloc de citation simple > (une ligne seulement)
    content = content.replace(/^&gt;\s*(.+)$/gm, '<div class="quote">$1</div>');

    // Restaurer les blocs de code
    codeBlocks.forEach((block, index) => {
        content = content.replace(`__CODE_BLOCK_${index}__`, block);
    });

    // Restaurer le code inline
    inlineCode.forEach((code, index) => {
        content = content.replace(`__INLINE_CODE_${index}__`, code);
    });

    // Conversion des retours à la ligne
    content = content.replace(/\n/g, "<br>");

    return content;
}

// Récupérer les données du serveur
async function loadDiscordData() {
    try {
        const response = await fetch("/api/discord-data");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        discordData = await response.json();

        console.log("✅ Données Discord chargées:", discordData);

        // Vérifier si les données sont valides
        if (!discordData || !discordData.guild) {
            console.error(
                "❌ Données du serveur manquantes, réessai dans 5s...",
            );
            setTimeout(loadDiscordData, 5000);
            return;
        }

        // Diagnostic détaillé
        if (discordData.channels) {
            console.log("📊 Diagnostic des canaux récupérés:");
            console.log(
                `   - Total trouvés: ${Object.values(discordData.channels).flat().length}`,
            );
            console.log(
                `   - Catégories: ${discordData.channels.categories?.length || 0}`,
            );
            console.log(
                `   - Canaux texte: ${discordData.channels.textChannels?.length || 0}`,
            );
            console.log(
                `   - Canaux vocaux: ${discordData.channels.voiceChannels?.length || 0}`,
            );
            console.log(
                `   - Forums: ${discordData.channels.forumChannels?.length || 0}`,
            );
            console.log(
                `   - Stages: ${discordData.channels.stageChannels?.length || 0}`,
            );
            console.log(
                `   - Threads: ${discordData.channels.threads?.length || 0}`,
            );
            console.log(
                `   - Autres: ${discordData.channels.other?.length || 0}`,
            );
        }

        if (discordData.roles) {
            const roleCount = Array.isArray(discordData.roles)
                ? discordData.roles.length
                : Object.keys(discordData.roles).length;
            console.log(`🏷️ Rôles récupérés: ${roleCount}`);
        }

        if (discordData.emojis) {
            console.log(`😀 Emojis récupérés: ${discordData.emojis.length}`);
        }

        // Construire les maps de lookup pour les mentions (IMPORTANT)
        buildLookupMaps();

        // Mettre à jour l'interface si les données sont disponibles
        if (discordData.guild) {
            console.log(
                "📊 Mise à jour de l'interface avec les données du serveur",
            );
            updateServerHeader(discordData.guild);
            updateServerBanner(discordData.guild);
            addServerBanner();
            addBoostGoalBar();
            loadChannelsInSidebar();
            updateServerInfo();

            console.log("✅ Interface Discord mise à jour avec succès");

            // Charger les membres après avoir récupéré les données principales
            loadMembers();

            // Écouter les nouveaux messages en temps réel
            listenForNewMessages();
        } else {
            console.error("❌ Aucune donnée de serveur trouvée");
        }
    } catch (error) {
        console.error("❌ Erreur lors du chargement des données:", error);
    }
}

// Mettre à jour les informations du serveur dans l'interface
function updateServerInfo() {
    if (!discordData.guild) return;

    // Mettre à jour le nom du serveur
    const serverName = document.querySelector(".server-header h3");
    if (serverName) {
        serverName.textContent = discordData.guild.name;
    }

    // Mettre à jour le titre de la catégorie dans les paramètres
    const categoryTitle = document.getElementById("serverCategoryTitle");
    if (categoryTitle) {
        categoryTitle.textContent = discordData.guild.name.toUpperCase();
    }

    // Ajouter la bannière si elle existe
    if (discordData.guild.banner) {
        addServerBanner();
    } else {
        // Même sans bannière, ajouter la barre de boost
        addBoostGoalBar();
    }

    // Charger les canaux automatiquement
    loadChannelsInSidebar();

    // Mettre à jour l'icône du serveur dans la sidebar
    const serverIcon = document.querySelector(".server-icon.active");
    if (serverIcon && discordData.guild.icon) {
        serverIcon.innerHTML = `<img src="${discordData.guild.icon}" alt="${discordData.guild.name}" style="width: 100%; height: 100%; border-radius: inherit;">`;
    } else if (serverIcon) {
        // Afficher les initiales si pas d'icône
        const initials = discordData.guild.name
            .split(" ")
            .map((word) => word[0])
            .join("")
            .substring(0, 2);
        serverIcon.textContent = initials;
    }

    // Mettre à jour l'icône dans le header des channels
    const headerIcon = document.querySelector(
        ".server-header .server-icon img, .server-header .server-icon",
    );
    if (headerIcon && discordData.guild.icon) {
        if (headerIcon.tagName === "IMG") {
            headerIcon.src = discordData.guild.icon;
        } else {
            headerIcon.innerHTML = `<img src="${discordData.guild.icon}" alt="${discordData.guild.name}" style="width: 20px; height: 20px; border-radius: 50%; margin-right: 8px;">`;
        }
    }
}

// Ajouter la bannière du serveur
function addServerBanner() {
    if (!discordData.guild.banner) return;

    // Vérifier si la bannière existe déjà
    let existingBanner = document.querySelector(".server-banner");
    if (existingBanner) {
        existingBanner.remove();
    }

    // Créer l'élément bannière
    const bannerDiv = document.createElement("div");
    bannerDiv.className = "server-banner";

    // Précharger l'image pour un affichage plus rapide
    const img = new Image();
    img.onload = function () {
        bannerDiv.innerHTML = `<img src="${discordData.guild.banner}" alt="Server Banner">`;
    };
    img.src = discordData.guild.banner;

    // Insérer après le header
    const serverHeader = document.querySelector(".server-header");
    if (serverHeader) {
        serverHeader.insertAdjacentElement("afterend", bannerDiv);
    }
}

// Fonction pour ajouter la barre de boost goal
function addBoostGoalBar() {
    // Créer la barre de boost
    const boostBar = document.createElement("div");
    boostBar.className = "boost-goal-bar";

    // Utiliser les données réelles du serveur si disponibles
    const currentBoosts = discordData?.guild?.premiumSubscriptionCount || 0;
    const boostLevel = discordData?.guild?.premiumTier || 0;
    const serverName = discordData?.guild?.name || "Server";

    // Déterminer l'objectif et le texte selon le niveau actuel
    let goalBoosts, goalText;
    if (boostLevel === 0) {
        goalBoosts = 2;
        goalText = "Boost Goal 🎉";
    } else if (boostLevel === 1) {
        goalBoosts = 7;
        goalText = "Boost Goal 🎉";
    } else if (boostLevel === 2) {
        goalBoosts = 14;
        goalText = "Boost Goal 🎉";
    } else if (boostLevel >= 3) {
        goalBoosts = currentBoosts;
        goalText = `${serverName} Boosted`;
    } else {
        goalText = "Boost Goal 🎉";
    }

    // Texte de progression plus précis
    let progressText;
    if (boostLevel >= 3) {
        progressText = `Level ${boostLevel}`;
    } else {
        progressText = `${currentBoosts} Boosts`;
    }

    boostBar.innerHTML = `
        <div class="boost-info">
            <div class="boost-text">
                <span>${goalText}</span>
            </div>
        </div>
        <div class="boost-progress">
            <span>${progressText}</span>
            <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M9.29 6.71a1 1 0 0 1 1.42 0L15 11l-4.29 4.29a1 1 0 1 1-1.42-1.42L12.17 11 9.29 8.12a1 1 0 0 1 0-1.41z"></path>
            </svg>
        </div>
    `;

    // Insérer la barre de boost directement dans le container des channels, en première position
    const channelsContainer = document.querySelector(".channels-container");
    if (channelsContainer) {
        // Supprimer toute barre de boost existante d'abord
        const existingBoost =
            channelsContainer.querySelector(".boost-goal-bar");
        if (existingBoost) {
            existingBoost.remove();
        }

        // Insérer la nouvelle barre en première position
        channelsContainer.insertBefore(boostBar, channelsContainer.firstChild);
        console.log(
            "✅ Barre de boost insérée en première position dans channels-container",
        );

        // Ajouter l'événement de scroll pour le déploiement progressif
        channelsContainer.addEventListener("scroll", function () {
            const scrollTop = this.scrollTop;
            const deploymentThreshold = 20;
            const serverHeader = document.querySelector(".server-header");

            // Gestion du déploiement progressif des canaux
            if (scrollTop > deploymentThreshold) {
                channelsContainer.classList.add("scrolling");

                // Effet de déploiement progressif basé sur le scroll
                const maxScroll = 80;
                const scrollProgress = Math.min(
                    (scrollTop - deploymentThreshold) / maxScroll,
                    1,
                );
                const initialMargin = 70;
                const finalMargin = -21;
                const currentMargin =
                    initialMargin -
                    (initialMargin - finalMargin) * scrollProgress;

                // Application fluide de la marge
                channelsContainer.style.marginTop = `${Math.max(currentMargin, finalMargin)}px`;

                // Changer le fond du header quand le déploiement est complet
                if (scrollProgress >= 1 && serverHeader) {
                    serverHeader.classList.add("scrolled");
                } else if (serverHeader) {
                    serverHeader.classList.remove("scrolled");
                }
            } else {
                channelsContainer.classList.remove("scrolling");
                // Revenir à la position initiale quand on est en haut
                channelsContainer.style.marginTop = "70px";

                // Retirer la classe scrolled quand on revient en haut
                if (serverHeader) {
                    serverHeader.classList.remove("scrolled");
                }
            }
        });
    } else {
        console.warn(
            "⚠️ channelsContainer introuvable pour l'écouteur de scroll",
        );
    }
}

// Rafraîchir les données
async function refreshData() {
    try {
        const response = await fetch("/api/refresh-data");
        const result = await response.json();
        if (result.status === "refresh_started") {
            console.log("Rafraîchissement des données en cours...");
            // Recharger les données après un délai
            setTimeout(loadDiscordData, 5000);
        }
    } catch (error) {
        console.error("Erreur lors du rafraîchissement:", error);
    }
}

// Gestion du menu déroulant du serveur
function showServerDropdown(event) {
    if (event) {
        event.stopPropagation();
    }
    const dropdown = document.getElementById("serverDropdown");
    if (!dropdown) {
        console.error("Dropdown element not found");
        return;
    }
    dropdown.classList.toggle("hidden");

    // Fermer si on clique ailleurs
    if (!dropdown.classList.contains("hidden")) {
        document.addEventListener("click", closeDropdown);
    }
}

// Expose function globally (doit être après la définition de la fonction)
window.showServerDropdown = showServerDropdown;

function closeDropdown() {
    document.getElementById("serverDropdown").classList.add("hidden");
    document.removeEventListener("click", closeDropdown);
}

// Gestion des paramètres du serveur
function showServerSettings() {
    document.getElementById("serverSettings").classList.remove("hidden");
    closeDropdown();
}

function hideServerSettings() {
    document.getElementById("serverSettings").classList.add("hidden");
}

function showServerProfile() {
    // Masquer tous les panels
    document.querySelectorAll(".settings-panel").forEach((panel) => {
        panel.classList.add("hidden");
    });

    // Afficher le panel du profil serveur
    document.getElementById("serverProfileContent").classList.remove("hidden");

    // Mettre à jour la navigation
    document.querySelectorAll(".settings-item").forEach((item) => {
        item.classList.remove("active");
    });
    event.target.classList.add("active");
}

function showRoles() {
    // Masquer tous les panels
    document.querySelectorAll(".settings-panel").forEach((panel) => {
        panel.classList.add("hidden");
    });

    // Afficher le panel des rôles
    document.getElementById("rolesContent").classList.remove("hidden");

    // Mettre à jour la navigation
    document.querySelectorAll(".settings-item").forEach((item) => {
        item.classList.remove("active");
    });
    event.target.classList.add("active");

    // Charger les rôles
    loadRoles();

    // Mettre à jour le compteur de rôles
    const roleHeader = document.querySelector(
        ".roles-table-header .header-roles",
    );
    if (roleHeader && discordData.roles) {
        roleHeader.textContent = `ROLES — ${discordData.roles.length}`;
    }
}

async function loadRoles() {
    const rolesList = document.getElementById("rolesList");
    if (!rolesList) return;

    rolesList.innerHTML = "";

    if (!discordData || !discordData.roles) {
        rolesList.innerHTML = `
            <div class="discord-loading-icon">
                <img src="assets/discord_loading.gif" alt="Loading...">
            </div>
            `;
        return;
    }

    console.log("Loading roles:", discordData.roles);

    // Charger les membres depuis l'API GitHub
    try {
        const response = await fetch("/api/members");
        const memberData = await response.json();

        const memberCountByRole = {};
        const usersByRole = {};

        // Compter depuis member_list
        if (memberData.members) {
            Object.keys(memberData.members).forEach((userId) => {
                const member = memberData.members[userId];
                if (member.roles && Array.isArray(member.roles)) {
                    member.roles.forEach((roleId) => {
                        if (!usersByRole[roleId])
                            usersByRole[roleId] = new Set();
                        usersByRole[roleId].add(userId);
                    });
                }
            });
        }

        // Convertir les Sets en nombres
        Object.keys(usersByRole).forEach((roleId) => {
            memberCountByRole[roleId] = usersByRole[roleId].size;
        });

        // Afficher les rôles avec les comptages
        displayRolesWithCounts(memberCountByRole);
    } catch (error) {
        console.error("Erreur chargement membres:", error);
        displayRolesWithCounts({});
    }
}

function displayRolesWithCounts(memberCountByRole) {
    const rolesList = document.getElementById("rolesList");
    if (!rolesList) return;

    // S'assurer que discordData.roles est un tableau
    let rolesArray = discordData.roles;
    if (!Array.isArray(rolesArray)) {
        // Si c'est un objet, convertir en tableau
        rolesArray = Object.values(rolesArray);
    }

    // Fragment pour optimiser les performances
    const fragment = document.createDocumentFragment();

    // Les rôles sont déjà triés par position dans get_info.js
    discordData.roles.forEach((role, index) => {
        const roleItem = document.createElement("div");
        roleItem.className = "role-item";
        roleItem.dataset.roleId = role.id; // Utiliser dataset pour stocker l'ID

        // Utiliser le comptage depuis member_data.json
        const actualMemberCount = memberCountByRole[role.id] || 0;

        // Déterminer l'icône à afficher (priorité : icône personnalisée > emoji > icône par défaut)
        let roleIconHTML = "";
        if (role.icon) {
            // Icône personnalisée du rôle
            roleIconHTML = `<img class="role-icon" src="${role.icon}" alt="Role icon" loading="lazy">`;
        } else if (role.unicodeEmoji) {
            // Emoji du rôle
            roleIconHTML = `<span class="role-emoji">${role.unicodeEmoji}</span>`;
        } else {
            // Icône par défaut avec couleur du rôle appliquée via SVG filter
            const roleColor =
                role.color && role.color !== "#000000" ? role.color : "#99aab5";
            // Convertir hex en RGB pour le filtre
            const r = parseInt(roleColor.slice(1, 3), 16);
            const g = parseInt(roleColor.slice(3, 5), 16);
            const b = parseInt(roleColor.slice(5, 7), 16);

            roleIconHTML = `<svg width="20" height="20" style="margin-right: 8px; flex-shrink: 0;">
                <defs>
                    <filter id="role-color-${role.id}">
                        <feFlood flood-color="${roleColor}" result="flood"/>
                        <feComposite in="SourceGraphic" in2="flood" operator="in"/>
                    </filter>
                </defs>
                <image href="assets/default-role-icon.png" width="20" height="20" filter="url(#role-color-${role.id})"/>
            </svg>`;
        }

        const roleColor =
            role.color && role.color !== "#000000" ? role.color : "#99aab5";

        roleItem.innerHTML = `
            <div class="role-info">
                <div class="role-name-container">
                    <div class="role-color" style="background-color: ${roleColor}"></div>
                    ${roleIconHTML}
                    <span class="role-name">${role.name}</span>
                </div>
            </div>
            <div class="role-members">
                ${actualMemberCount}
                <img class="role-members-icon" src="assets/member-icon.png" alt="Members">
            </div>
            <div class="role-actions">
                <button class="role-action" title="Edit Role" onclick="editRole('${role.id}')">
                    <img class="role-action" src="assets/edit-role-icon.png" alt="Edit Roles">
                </button>
                <button class="role-action" title="More Options" onclick="showRoleContextMenu(event, '${role.id}')">
                    <img class="role-members-icon" src="assets/role-other-icon.png" alt="Other">
                </button>
            </div>
        `;

        // Ajouter l'événement de clic droit
        roleItem.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            showRoleContextMenu(e, role.id);
        });

        fragment.appendChild(roleItem);
    });

    // Ajouter tous les éléments en une seule fois
    rolesList.appendChild(fragment);
    updateRoleActions(); // Mettre à jour les listeners pour les actions des rôles

    // Mettre à jour le compteur de rôles dans le header
    const roleHeader = document.querySelector(
        ".roles-table-header .header-roles",
    );
    if (roleHeader && discordData.roles) {
        roleHeader.textContent = `ROLES — ${discordData.roles.length}`;
    }
}

function showRoleContextMenu(event, roleId) {
    event.stopPropagation();

    const contextMenu = document.getElementById("roleContextMenu");
    currentSelectedRole = roleId;

    // Positionner le menu contextuel
    contextMenu.style.left = event.pageX + "px";
    contextMenu.style.top = event.pageY + "px";
    contextMenu.classList.remove("hidden");

    // Fermer si on clique ailleurs
    document.addEventListener("click", closeContextMenu);
}

function closeContextMenu() {
    document.getElementById("roleContextMenu").classList.add("hidden");
    document.removeEventListener("click", closeContextMenu);
    currentSelectedRole = null;
}

function selectRoleStyle() {
    // Fonction désactivée - le style est maintenant détecté automatiquement par le selfbot
    // Les icônes sont gérées automatiquement dans populateRoleData()
    console.log(
        "ℹ️ Style de rôle détecté automatiquement - sélection manuelle désactivée",
    );
}

// Ne plus ajouter d'événements de clic au chargement
// document.addEventListener("DOMContentLoaded", selectRoleStyle);

function copyRoleId() {
    if (currentSelectedRole) {
        navigator.clipboard.writeText(currentSelectedRole).then(() => {});
    }
    closeContextMenu();
}

// Fermer les menus quand on clique sur Escape
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closeDropdown();
        closeContextMenu();
        hideServerSettings();
    }
});

// Empêcher la propagation des clics dans les menus
const serverDropdown = document.getElementById("serverDropdown");
if (serverDropdown) {
    serverDropdown.addEventListener("click", function (event) {
        event.stopPropagation();
    });
}

const roleContextMenu = document.getElementById("roleContextMenu");
if (roleContextMenu) {
    roleContextMenu.addEventListener("click", function (event) {
        event.stopPropagation();
    });
}

// Afficher les canaux
function showChannels() {
    // Masquer tous les panels
    document.querySelectorAll(".settings-panel").forEach((panel) => {
        panel.classList.add("hidden");
    });

    // Créer le panel des canaux s'il n'existe pas
    let channelsPanel = document.getElementById("channelsContent");
    if (!channelsPanel) {
        channelsPanel = document.createElement("div");
        channelsPanel.id = "channelsContent";
        channelsPanel.className = "settings-panel";
        channelsPanel.innerHTML = `
            <div class="channels-header">
                <h2>Channels</h2>
                <button class="refresh-btn" onclick="refreshData()">Refresh</button>
            </div>
            <div class="channels-container" id="channelsContainer">
                <!-- Les canaux seront ajoutés ici -->
            </div>
        `;
        document.querySelector(".settings-content").appendChild(channelsPanel);
    }

    channelsPanel.classList.remove("hidden");
    loadChannels();
}

function loadChannels() {
    const container = document.getElementById("channelsContainer");
    if (!discordData || !discordData.channels) {
        container.innerHTML =
            '<div class="no-data">Aucune donnée de canaux disponible</div>';
        return;
    }

    container.innerHTML = "";

    // Afficher les catégories et leurs canaux
    discordData.channels.categories.forEach((category) => {
        const categoryDiv = document.createElement("div");
        categoryDiv.className = "channel-category";
        categoryDiv.innerHTML = `
            <h3 class="category-name">${category.name.toUpperCase()}</h3>
            <div class="category-channels" id="category-${category.id}"></div>
        `;
        container.appendChild(categoryDiv);

        // Ajouter les canaux de cette catégorie

        const categoryChannels = document.getElementById(
            `category-${category.id}`,
        );

        // Canaux texte de cette catégorie
        discordData.channels.textChannels
            .filter((ch) => ch.parentId === category.id)
            .forEach((channel) => {
                const channelDiv = createChannelElement(channel, "text");
                categoryChannels.appendChild(channelDiv);
            });

        // Canaux vocaux de cette catégorie
        discordData.channels.voiceChannels
            .filter((ch) => ch.parentId === category.id)
            .forEach((channel) => {
                const channelDiv = createChannelElement(channel, "voice");
                categoryChannels.appendChild(channelDiv);
            });
    });

    // Canaux sans catégorie
    const orphanChannels = document.createElement("div");
    orphanChannels.className = "channel-category";
    orphanChannels.innerHTML =
        '<h3 class="category-name">CHANNELS WITHOUT CATEGORY</h3><div class="category-channels" id="orphan-channels"></div>';
    container.appendChild(orphanChannels);

    const orphanContainer = document.getElementById("orphan-channels");

    [
        ...discordData.channels.textChannels,
        ...discordData.channels.voiceChannels,
    ]
        .filter((ch) => !ch.parentId)
        .forEach((channel) => {
            const channelDiv = createChannelElement(
                channel,
                channel.type === 0 ? "text" : "voice",
            );
            orphanContainer.appendChild(channelDiv);
        });
}

function createChannelElement(channel, type) {
    const channelDiv = document.createElement("div");
    channelDiv.className = "channel-item";
    channelDiv.setAttribute("data-channel-id", channel.id);

    // Définir le type de canal pour les icônes CSS
    let channelType = "text";
    if (channel.type === 2) channelType = "voice";
    else if (channel.type === 5) channelType = "announcement";
    else if (channel.type === 15) channelType = "forum";
    else if (channel.type === 13) channelType = "stage";

    channelDiv.setAttribute("data-type", channelType);

    // Vérifier si c'est un canal privé en vérifiant les permissions
    const isPrivate =
        channel.permissionOverwrites &&
        channel.permissionOverwrites.some(
            (overwrite) =>
                overwrite.deny &&
                (overwrite.deny.includes("VIEW_CHANNEL") ||
                    overwrite.deny.includes("1024") || // VIEW_CHANNEL permission value
                    overwrite.type === "role"),
        );

    if (isPrivate) {
        channelDiv.setAttribute("data-private", "true");
    }

    const channelName = document.createElement("span");
    channelName.className = "channel-name";
    channelName.textContent = channel.name;

    channelDiv.appendChild(channelName);

    // Ajouter l'événement de clic pour charger le canal
    channelDiv.addEventListener("click", function () {
        selectChannel(channel.id, channel.name, type);
    });

    return channelDiv;
}

// Voir les messages d'un canal
function viewChannelMessages(channelId, channelName) {
    if (!discordData.messages || !discordData.messages[channelId]) {
        alert("Aucun message disponible pour ce canal");
        return;
    }

    // Créer une fenêtre modale pour afficher les messages
    const modal = document.createElement("div");
    modal.className = "messages-modal";
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Messages de #${channelName}</h3>
                <button class="close-modal" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="messages-container" id="messages-${channelId}">
                <!-- Messages -->
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const messagesContainer = document.getElementById(`messages-${channelId}`);
    const messages = discordData.messages[channelId];

    messages.forEach((message) => {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message-item";

        const userRoles = message.member?.roles || [];
        const highestRole = userRoles.length > 0 ? userRoles[0] : null;
        const roleColor =
            highestRole?.color && highestRole.color !== "#000000"
                ? highestRole.color
                : "#ffffff";

        // Utiliser la fonction de formatage du timestamp
        const timestamp = formatMessageTimestamp(message.createdAt);

        // Obtenir l'icône du rôle le plus élevé (qui a une icône)
        const roleWithIcon = userRoles.find(
            (role) => role.icon || role.unicodeEmoji,
        );
        let roleIconHtml = "";
        if (roleWithIcon) {
            if (roleWithIcon.icon) {
                roleIconHtml = `<img class="role-icon" src="${roleWithIcon.icon}" alt="${roleWithIcon.name}" style="width: 16px; height: 16px; margin: 0 4px;">`;
            } else if (roleWithIcon.unicodeEmoji) {
                roleIconHtml = `<span class="role-emoji" style="font-size: 16px; margin: 0 4px;">${roleWithIcon.unicodeEmoji}</span>`;
            }
        }

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <img src="${message.author.avatar}" alt="${message.author.username}" loading="lazy" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username">${message.member?.displayName || message.author.username}</span>
                    ${roleIconHtml}
                    <span class="message-timestamp">${timestamp}</span>
                </div>
                ${
                    message.meta_data?.replyTo
                        ? `
                    <div class="message-reply-container">
                        <div class="message-reply">
                            <svg width="16" height="16" viewBox="0 0 24 24" style="margin-right: 4px;">
                                <path fill="currentColor" d="M10 8.26667V4L3 11.4667L10 18.9333V14.56C15 14.56 18.5 16.2667 21 20C20 14.6667 17 9.33333 10 8.26667Z"/>
                            </svg>
                            <span class="reply-username">${message.meta_data.replyTo.displayName || message.meta_data.replyTo.username}</span>
                            <span class="reply-content">${message.meta_data.replyTo.content ? processMessageContent(message.meta_data.replyTo.content).substring(0, 100) : "<em>Cliquez pour voir le message</em>"}</span>
                        </div>
                    </div>
                `
                        : ""
                }
                <div class="message-text">${processMessageContent(message.content)}</div>
                ${
                    message.attachments && message.attachments.length > 0
                        ? `
                    <div class="message-attachments">
                        ${message.attachments
                            .map(
                                (att) => `
                            <div class="attachment">
                                ${att.contentType?.startsWith("image/") ? `<img src="${att.url}" alt="${att.name}" style="max-width: 400px; border-radius: 8px;">` : `<a href="${att.url}">${att.name}</a>`}
                            </div>
                        `,
                            )
                            .join("")}
                    </div>
                `
                        : ""
                }
                ${
                    message.embeds && message.embeds.length > 0
                        ? `
                    <div class="message-embeds">
                        ${message.embeds
                            .map(
                                (embed) => `
                            <div class="embed" style="border-left-color: ${embed.color ? "#" + embed.color.toString(16).padStart(6, "0") : "#000000"}">
                                ${embed.title ? `<div class="embed-title">${embed.title}</div>` : ""}
                                ${embed.description ? `<div class="embed-description">${embed.description}</div>` : ""}
                                ${embed.image ? `<img src="${embed.image.url}" alt="Embed image">` : ""}
                            </div>
                        `,
                            )
                            .join("")}
                    </div>
                `
                        : ""
                }
                ${
                    message.stickers && message.stickers.length > 0
                        ? `
                    <div class="message-stickers">
                        ${message.stickers
                            .map(
                                (sticker) => `
                            <img src="https://media.discordapp.net/stickers/${sticker.id}.${sticker.format_type === 1 ? "png" : sticker.format_type === 2 ? "png" : "gif"}"
                                 alt="${sticker.name}"
                                 style="max-width: 160px; max-height: 160px; border-radius: 8px; margin: 4px;"
                                 loading="lazy">
                        `,
                            )
                            .join("")}
                    </div>
                `
                        : ""
                }
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
    });
}

// Charger les canaux dans la sidebar
function loadChannelsInSidebar() {
    const channelsSidebar = document.querySelector(".channels-sidebar");
    if (!channelsSidebar) {
        console.warn("⚠️ Le conteneur channels-sidebar n'a pas été trouvé");
        return;
    }

    if (!discordData || !discordData.channels) {
        console.error("❌ Données des canaux manquantes:", discordData);
        return;
    }

    console.log("📋 Chargement des canaux:", discordData.channels);

    // Vérifier si le serveur a une bannière pour ajouter la classe appropriée
    const hasBanner =
        discordData?.guild?.banner !== null &&
        discordData?.guild?.banner !== undefined;
    if (hasBanner) {
        channelsSidebar.classList.add("has-banner");
    } else {
        channelsSidebar.classList.remove("has-banner");
    }

    const channelsContainer = document.querySelector(".channels-container");
    if (!channelsContainer) return;

    // Vider le container mais préserver la barre de boost
    const existingBoostBar = channelsContainer.querySelector(".boost-goal-bar");
    const otherElements = Array.from(channelsContainer.children).filter(
        (child) => !child.classList.contains("boost-goal-bar"),
    );

    // Supprimer seulement les éléments qui ne sont pas la barre de boost
    otherElements.forEach((element) => element.remove());

    // Organiser les canaux par catégories
    const categorizedChannels = new Map();
    const orphanChannels = [];

    // Ajouter les catégories
    if (discordData.channels.categories) {
        discordData.channels.categories.forEach((category) => {
            categorizedChannels.set(category.id, {
                category: category,
                textChannels: [],
                voiceChannels: [],
                forumChannels: [],
                stageChannels: [],
            });
        });
    }

    // Distribuer les canaux dans leurs catégories (en excluant les threads)
    if (discordData.channels.textChannels) {
        discordData.channels.textChannels.forEach((channel) => {
            // Ignorer les threads (type 11, 12, 10)
            if (
                channel.type === 11 ||
                channel.type === 12 ||
                channel.type === 10
            ) {
                return;
            }

            if (channel.parentId && categorizedChannels.has(channel.parentId)) {
                categorizedChannels
                    .get(channel.parentId)
                    .textChannels.push(channel);
            } else {
                orphanChannels.push({ ...channel, type: "text" });
            }
        });
    }

    if (discordData.channels.voiceChannels) {
        discordData.channels.voiceChannels.forEach((channel) => {
            // Ignorer les threads
            if (
                channel.type === 11 ||
                channel.type === 12 ||
                channel.type === 10
            ) {
                return;
            }

            if (channel.parentId && categorizedChannels.has(channel.parentId)) {
                categorizedChannels
                    .get(channel.parentId)
                    .voiceChannels.push(channel);
            } else {
                orphanChannels.push({ ...channel, type: "voice" });
            }
        });
    }

    if (discordData.channels.forumChannels) {
        discordData.channels.forumChannels.forEach((channel) => {
            // Ignorer les threads
            if (
                channel.type === 11 ||
                channel.type === 12 ||
                channel.type === 10
            ) {
                return;
            }

            if (channel.parentId && categorizedChannels.has(channel.parentId)) {
                categorizedChannels
                    .get(channel.parentId)
                    .forumChannels.push(channel);
            } else {
                orphanChannels.push({ ...channel, type: "forum" });
            }
        });
    }

    if (discordData.channels.stageChannels) {
        discordData.channels.stageChannels.forEach((channel) => {
            // Ignorer les threads
            if (
                channel.type === 11 ||
                channel.type === 12 ||
                channel.type === 10
            ) {
                return;
            }

            if (channel.parentId && categorizedChannels.has(channel.parentId)) {
                categorizedChannels
                    .get(channel.parentId)
                    .stageChannels.push(channel);
            } else {
                orphanChannels.push({ ...channel, type: "stage" });
            }
        });
    }

    // Trier tous les canaux par position dans chaque catégorie
    categorizedChannels.forEach((categoryData) => {
        categoryData.textChannels.sort(
            (a, b) => (a.position || 0) - (b.position || 0),
        );
        categoryData.voiceChannels.sort(
            (a, b) => (a.position || 0) - (b.position || 0),
        );
        categoryData.forumChannels.sort(
            (a, b) => (a.position || 0) - (b.position || 0),
        );
        categoryData.stageChannels.sort(
            (a, b) => (a.position || 0) - (b.position || 0),
        );
    });

    // Trier les canaux orphelins par position
    orphanChannels.sort((a, b) => (a.position || 0) - (b.position || 0));

    // Afficher les catégories avec leurs canaux
    categorizedChannels.forEach((categoryData, categoryId) => {
        const hasChannels =
            categoryData.textChannels.length > 0 ||
            categoryData.voiceChannels.length > 0 ||
            categoryData.forumChannels.length > 0 ||
            categoryData.stageChannels.length > 0;

        // Ne créer la catégorie que si elle a des canaux
        if (hasChannels) {
            const categoryDiv = document.createElement("div");
            categoryDiv.className = "channel-category";

            categoryDiv.innerHTML = `
                <div class="category-header" onclick="toggleCategory('${categoryId}')">
                    <span>${categoryData.category.name.toUpperCase()}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" class="category-arrow">
                        <path fill="currentColor" d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/>
                    </svg>
                </div>
                <div class="channel-list" id="channels-${categoryId}"></div>
            `;

            // Restaurer l'état de la catégorie si elle était fermée
            const channelList = categoryDiv.querySelector(".channel-list");
            const arrow = categoryDiv.querySelector(".category-arrow");

            if (categoryStates[categoryId] === "closed") {
                channelList.style.display = "none";
                if (arrow) {
                    arrow.style.transform = "rotate(0deg)";
                }
            } else {
                channelList.style.display = "block";
                if (arrow) {
                    arrow.style.transform = "rotate(90deg)";
                }
            }

            // Ajouter les canaux texte
            categoryData.textChannels.forEach((channel) => {
                const channelElement = createChannelItem(channel, "text");
                channelList.appendChild(channelElement);
            });

            // Ajouter les canaux vocaux
            categoryData.voiceChannels.forEach((channel) => {
                const channelElement = createChannelItem(channel, "voice");
                channelList.appendChild(channelElement);
            });

            // Ajouter les canaux forum avec leurs threads
            categoryData.forumChannels.forEach((channel) => {
                const channelElement = createChannelItem(channel, "forum");
                channelList.appendChild(channelElement);

                // Ajouter les threads du forum (chercher dans textChannels aussi)
                const forumThreads = [];

                // Chercher dans threads
                if (discordData.channels.threads) {
                    const threads = discordData.channels.threads.filter(
                        (thread) => thread.parentId === channel.id,
                    );
                    forumThreads.push(...threads);
                }

                // Chercher dans textChannels (parfois les threads y sont)
                if (discordData.channels.textChannels) {
                    const textThreads =
                        discordData.channels.textChannels.filter(
                            (ch) =>
                                ch.parentId === channel.id &&
                                (ch.type === 11 ||
                                    ch.type === 12 ||
                                    ch.type === 10 ||
                                    ch.type === "PUBLIC_THREAD" ||
                                    ch.type === "PRIVATE_THREAD" ||
                                    ch.type === "ANNOUNCEMENT_THREAD"),
                        );
                    forumThreads.push(...textThreads);
                }

                // Trier par date de création (plus récent en premier)
                forumThreads.sort(
                    (a, b) =>
                        (b.createdTimestamp || 0) - (a.createdTimestamp || 0),
                );

                if (forumThreads.length > 0) {
                    const threadsContainer = document.createElement("div");
                    threadsContainer.className = "forum-threads-container";

                    forumThreads.forEach((thread) => {
                        const threadElement = createForumThreadItem(thread);
                        threadsContainer.appendChild(threadElement);
                    });

                    channelList.appendChild(threadsContainer);
                }
            });

            // Ajouter les canaux stage
            categoryData.stageChannels.forEach((channel) => {
                const channelElement = createChannelItem(channel, "stage");
                channelList.appendChild(channelElement);
            });

            channelsContainer.appendChild(categoryDiv);
        }
    });

    // Ajouter les canaux sans catégorie s'il y en a
    if (orphanChannels.length > 0) {
        const orphanDiv = document.createElement("div");
        orphanDiv.className = "channel-category";
        const orphanCategoryId = "orphan-channels";
        orphanDiv.innerHTML = `
            <div class="category-header" onclick="toggleCategory('${orphanCategoryId}')">
                <span>AUTRES CANAUX</span>
                <svg width="12" height="12" viewBox="0 0 24 24" class="category-arrow">
                    <path fill="currentColor" d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/>
                </svg>
            </div>
            <div class="channel-list" id="channels-${orphanCategoryId}"></div>
        `;

        // Restaurer l'état de la catégorie orpheline
        const orphanChannelList = orphanDiv.querySelector(".channel-list");
        const arrow = orphanDiv.querySelector(".category-arrow");

        if (categoryStates[orphanCategoryId] === "closed") {
            orphanChannelList.style.display = "none";
            if (arrow) {
                arrow.style.transform = "rotate(0deg)";
            }
        } else {
            orphanChannelList.style.display = "block";
            if (arrow) {
                arrow.style.transform = "rotate(90deg)";
            }
        }
        orphanChannels.forEach((channel) => {
            const channelElement = createChannelItem(channel, channel.type);
            orphanChannelList.appendChild(channelElement);
        });

        channelsContainer.appendChild(orphanDiv);
    }

    // Si aucun canal n'est trouvé dans les catégories mais qu'il y en a dans "other"
    if (categorizedChannels.size === 0 && orphanChannels.length === 0) {
        console.log("⚠️ Aucun canal correctement classé trouvé");

        // Essayer de reclasser les canaux mal classés
        if (
            discordData.channels &&
            discordData.channels.other &&
            discordData.channels.other.length > 0
        ) {
            console.log(
                `🔧 Tentative de reclassification de ${discordData.channels.other.length} canaux mal classés`,
            );

            discordData.channels.other.forEach((channel) => {
                const reclassifiedType = reclassifyChannel(channel);
                if (reclassifiedType !== "other") {
                    orphanChannels.push({ ...channel, type: reclassifiedType });
                }
            });
        }

        if (orphanChannels.length === 0) {
            console.log("📋 Affichage des canaux par défaut");
            createDefaultChannels();
        }
    }
}

function createDefaultChannels() {
    const channelsContainer = document.querySelector(".channels-container");
    if (!channelsContainer) return;

    channelsContainer.innerHTML = `
        <div class="channel-category">
            <div class="category-header">
                <svg width="12" height="12" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/>
                </svg>
                <span>TEXT CHANNELS</span>
            </div>
            <div class="channel-list">
                <div class="channel-item" onclick="selectDefaultChannel('general', 'text')">
                    <span class="channel-icon"><img src="assets/channel-icon.png" alt="Text" class="channel-icon-img"></span>
                    <span class="channel-name">general</span>
                </div>
                <div class="channel-item" onclick="selectDefaultChannel('commands', 'text')">
                    <span class="channel-icon"><img src="assets/channel-icon.png" alt="Text" class="channel-icon-img"></span>
                    <span class="channel-name">commands</span>
                </div>
                <div class="channel-item" onclick="selectDefaultChannel('forums', 'text')">
                    <span class="channel-icon"><img src="assets/forum-icon.png" alt="Forum" class="channel-icon-img"></span>
                    <span class="channel-name">forums</span>
                </div>
            </div>
        </div>

        <div class="channel-category">
            <div class="category-header">
                <svg width="12" height="12" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/>
                </svg>
                <span>VOICE CHANNELS</span>
            </div>
            <div class="channel-list">
                <div class="channel-item" onclick="selectDefaultChannel('General', 'voice')">
                    <span class="channel-icon"><img src="assets/vocalchat-icon.png" alt="Voice" class="channel-icon-img"></span>
                    <span class="channel-name">General</span>
                </div>
            </div>
        </div>
    `;
}

function selectDefaultChannel(channelName, type) {
    // Désélectionner tous les canaux
    document.querySelectorAll(".channel-item").forEach((item) => {
        item.classList.remove("active");
    });

    // Sélectionner le canal actuel
    event.target.closest(".channel-item").classList.add("active");

    // Mettre à jour le header du chat
    const chatHeader = document.querySelector(".chat-header");
    if (chatHeader) {
        const icon = type === "voice" ? "🔊" : "#";
        let description = "";
        if (channelName === "general") {
            description = "Canal général pour discuter de tout et de rien";
        } else if (channelName === "commands") {
            description = "Canal pour utiliser les commandes du bot";
        } else if (channelName === "forums") {
            description = "Espace de discussion et de questions-réponses";
        }

        chatHeader.innerHTML = `
            <div class="chat-header-main">
                <span class="channel-icon">${icon}</span>
                <span class="channel-name">${channelName}</span>
            </div>
            ${description ? `<div class="chat-header-description">${description}</div>` : ""}
        `;
    }

    // Afficher le message de bienvenue
    const chatMessages = document.querySelector(".chat-messages");
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div class="welcome-message">
                <h3>Bienvenue dans ${type === "voice" ? "🔊" : "#"}${channelName}</h3>
                <p>Ceci est le début du canal ${type === "voice" ? "🔊" : "#"}${channelName}.</p>
            </div>
        `;
    }
}

function createForumThreadItem(thread) {
    const threadItem = document.createElement("div");
    threadItem.className = "forum-thread-item";
    threadItem.dataset.threadId = thread.id;

    // Récupérer les tags du thread
    const tags = thread.appliedTags || [];
    const tagsHTML = tags
        .map((tagId) => {
            const tag = thread.availableTags?.find((t) => t.id === tagId);
            if (tag) {
                return `<span class="thread-tag" style="background-color: ${tag.emoji ? "transparent" : "#4e5058"}; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-right: 4px;">${tag.emoji || tag.name}</span>`;
            }
            return "";
        })
        .join("");

    threadItem.innerHTML = `
        <div class="thread-content">
            <div class="thread-header">
                <span class="thread-icon">💬</span>
                <span class="thread-name">${thread.name}</span>
            </div>
            ${tagsHTML ? `<div class="thread-tags">${tagsHTML}</div>` : ""}
            ${
                thread.messageCount
                    ? `<div class="thread-stats">
                <span class="thread-messages">${thread.messageCount} messages</span>
            </div>`
                    : ""
            }
        </div>
    `;

    threadItem.onclick = () => selectChannel(thread.id, thread.name, "thread");

    return threadItem;
}

function createChannelItem(channel, type) {
    const channelItem = document.createElement("div");
    channelItem.className = "channel-item";
    channelItem.onclick = () => selectChannel(channel.id, channel.name, type);
    channelItem.dataset.channelId = channel.id; // Add data-channel-id for easy selection

    let icon = "";
    const channelType = reclassifyChannel(channel);

    // Vérifier si le canal est privé - utiliser directement la propriété isPrivate du canal
    const isPrivate = channel.isPrivate || false;

    // Déterminer l'icône selon le type et si c'est privé
    if (channelType === "text") {
        icon = isPrivate
            ? '<img src="assets/privatechannel-icon.png" alt="Private Text" class="channel-icon-img">'
            : '<img src="assets/channel-icon.png" alt="Text" class="channel-icon-img">';
    } else if (channelType === "voice") {
        icon = isPrivate
            ? '<img src="assets/privatevocalchat-icon.png" alt="Private Voice" class="channel-icon-img">'
            : '<img src="assets/vocalchat-icon.png" alt="Voice" class="channel-icon-img">';
    } else if (channelType === "forum") {
        icon = isPrivate
            ? '<img src="assets/privateforum-icon.png" alt="Private Forum" class="channel-icon-img">'
            : '<img src="assets/forum-icon.png" alt="Forum" class="channel-icon-img">';
    } else if (
        channel.type === 5 ||
        channel.type === "GUILD_NEWS" ||
        channel.type === "GUILD_ANNOUNCEMENT"
    ) {
        icon = isPrivate
            ? '<img src="assets/privateannouncement-icon.png" alt="Private Announcement" class="channel-icon-img">'
            : '<img src="assets/announcement-icon.png" alt="Announcement" class="channel-icon-img">';
    } else if (channelType === "stage") {
        icon = isPrivate
            ? '<img src="assets/privatestage-icon.png" alt="Private Stage" class="channel-icon-img">'
            : '<img src="assets/stage-icon.png" alt="Stage" class="channel-icon-img">';
    } else if (channel.nsfw) {
        icon = "🔞";
    } else {
        icon =
            '<img src="assets/channel-icon.png" alt="Text" class="channel-icon-img">';
    }

    // Ajouter une classe pour les canaux privés
    if (isPrivate) {
        channelItem.classList.add("private");
    }

    // Vérifier s'il y a des messages dans ce canal
    let hasMessages = false;
    let messageCount = 0;
    if (
        discordData &&
        discordData.messages &&
        discordData.messages[channel.id]
    ) {
        messageCount = discordData.messages[channel.id].length;
        hasMessages = messageCount > 0;
    }

    // Ajouter une classe pour les canaux avec des messages
    if (hasMessages) {
        channelItem.classList.add("has-messages");
    }

    // Indicateur visuel pour les nouveaux messages (optionnel)
    let messageIndicator = "";
    if (
        hasMessages &&
        (channelType === "text" ||
            channelType === "forum" ||
            channel.type === 5)
    ) {
        messageIndicator = `<span class="message-indicator" title="${messageCount} messages">•</span>`;
    }

    channelItem.innerHTML = `
        <span class="channel-icon">${icon}</span>
        <span class="channel-name">${channel.name}</span>
        ${messageIndicator}
    `;

    return channelItem;
}

function findChannelById(channelId) {
    if (!discordData || !discordData.channels) return null;

    const allChannels = [
        ...(discordData.channels.textChannels || []),
        ...(discordData.channels.voiceChannels || []),
        ...(discordData.channels.forumChannels || []),
        ...(discordData.channels.stageChannels || []),
        ...(discordData.channels.other || []),
    ];

    return allChannels.find((channel) => channel.id === channelId);
}

function selectChannel(channelId, channelName, type) {
    // Désélectionner tous les canaux
    document.querySelectorAll(".channel-item").forEach((item) => {
        item.classList.remove("active");
    });

    // Sélectionner le canal actuel
    const selectedChannel = document.querySelector(
        `[data-channel-id="${channelId}"]`,
    );
    if (selectedChannel) {
        selectedChannel.classList.add("active");
    }

    // Stocker le canal actuel
    window.currentSelectedChannelId = channelId;

    // Mettre à jour le header du chat
    const chatHeader = document.querySelector(".chat-header");
    if (chatHeader) {
        let icon =
            type === "voice"
                ? "🔊"
                : type === "forum"
                  ? "💬"
                  : type === "stage"
                    ? "🎙️"
                    : "#";

        // Récupérer les informations du canal
        const channelData = findChannelById(channelId);
        const description = channelData?.topic || "";

        chatHeader.innerHTML = `
            <div class="chat-header-main">
                <span class="channel-icon">${icon}</span>
                <span class="channel-name">${channelName}</span>
                ${description ? `<span class="chat-header-description">${description}</span>` : ""}
            </div>
            <div class="chat-header-tools">
                <button class="header-tool-btn" title="Threads">
                    <img
                        src="assets/threadicon.png"
                        class="header-tool-btn"
                        alt="Threads"
                    />
                </button>

                <button class="header-tool-btn" title="Notifications">
                    <img
                        src="assets/notificationonicon.png"
                        class="header-tool-btn"
                        alt="Notifications"
                    />
                </button>
                <button class="header-tool-btn" title="Pinned Messages">
                    <img
                        src="assets/messagepinnedicon.png"
                        class="header-tool-btn"
                        alt="Pinned Messages"
                    />
                </button>

                <button
                    class="header-tool-btn"
                    title="Members"
                    id="members-toggle-btn"
                >
                    <img
                        src="assets/showmembericon.png"
                        class="header-tool-btn"
                        alt="Member Toggle"
                    />
                </button>

                <div class="members-search-bar">
                    <input
                        type="text"
                        placeholder="Search"
                        class="members-search-input"
                    />
                    <img
                        src="assets/searchbaricon.png"
                        class="members-search-icon"
                        alt="Search Bar Icon"
                    />
                </div>
            </div>
        `;

        // Réattacher l'événement pour le bouton membres
        const membersToggleBtn = document.getElementById("members-toggle-btn");
        if (membersToggleBtn) {
            membersToggleBtn.onclick = toggleMembersSidebar;
        }
    }

    // Essayer de charger les messages du canal
    const chatMessages = document.querySelector(".chat-messages");
    if (chatMessages) {
        chatMessages.innerHTML =
            '<div class="loading-message">Chargement des messages...</div>';

        // Charger depuis l'API
        fetch(`/api/messages/${channelId}`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Erreur lors du chargement");
                }
                return response.json();
            })
            .then((data) => {
                const messagesArray = data.messages || [];

                if (messagesArray.length > 0) {
                    console.log(
                        `✅ ${messagesArray.length} messages totaux pour #${channelName}`,
                    );

                    // Stocker tous les messages
                    window.currentChannelMessages = messagesArray;
                    window.currentChannelId = channelId;

                    // Vider le container
                    chatMessages.innerHTML = "";

                    // Arrêter tout chargement progressif en cours
                    if (window.messageLoadInterval) {
                        clearInterval(window.messageLoadInterval);
                    }

                    // Chargement progressif automatique: 50 messages par seconde
                    let currentIndex = Math.max(0, messagesArray.length - 50);

                    // Charger les 50 derniers messages immédiatement
                    const initialFragment = document.createDocumentFragment();
                    for (let i = currentIndex; i < messagesArray.length; i++) {
                        try {
                            const messageDiv = createMessageElement(
                                messagesArray[i],
                            );
                            initialFragment.appendChild(messageDiv);
                        } catch (error) {
                            console.error(`❌ Erreur création message:`, error);
                        }
                    }
                    chatMessages.appendChild(initialFragment);

                    // Scroller vers le bas
                    setTimeout(() => {
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }, 50);

                    // Si il reste des messages à charger, les charger progressivement
                    if (currentIndex > 0) {
                        console.log(
                            `📥 Chargement progressif: ${currentIndex} messages restants`,
                        );

                        window.messageLoadInterval = setInterval(() => {
                            const batchSize = 50;
                            const startIdx = Math.max(
                                0,
                                currentIndex - batchSize,
                            );

                            if (startIdx >= currentIndex) {
                                clearInterval(window.messageLoadInterval);
                                console.log("✅ Tous les messages chargés");
                                return;
                            }

                            const oldScrollHeight = chatMessages.scrollHeight;
                            const oldScrollTop = chatMessages.scrollTop;

                            const fragment = document.createDocumentFragment();
                            for (let i = startIdx; i < currentIndex; i++) {
                                try {
                                    const messageDiv = createMessageElement(
                                        messagesArray[i],
                                    );
                                    fragment.appendChild(messageDiv);
                                } catch (error) {
                                    console.error(
                                        `❌ Erreur création message:`,
                                        error,
                                    );
                                }
                            }

                            // Insérer en haut
                            if (chatMessages.firstChild) {
                                chatMessages.insertBefore(
                                    fragment,
                                    chatMessages.firstChild,
                                );
                            } else {
                                chatMessages.appendChild(fragment);
                            }

                            // Restaurer la position de scroll
                            const newScrollHeight = chatMessages.scrollHeight;
                            chatMessages.scrollTop =
                                oldScrollTop +
                                (newScrollHeight - oldScrollHeight);

                            console.log(
                                `📥 ${batchSize} messages chargés (${startIdx}/${messagesArray.length})`,
                            );

                            currentIndex = startIdx;

                            if (currentIndex <= 0) {
                                clearInterval(window.messageLoadInterval);
                                console.log("✅ Tous les messages chargés");
                            }
                        }, 1000); // 1 seconde par batch de 50
                    }
                } else {
                    // Aucun message dans ce canal
                    showWelcomeMessage(chatMessages, channelName, type);
                }
            })
            .catch((error) => {
                console.error(
                    "❌ Erreur lors du chargement des messages:",
                    error,
                );
                showWelcomeMessage(chatMessages, channelName, type);
            });
    }
}

function handleChatScroll(event) {
    const chatMessages = event.target;

    if (!window.currentChannelMessages || window.isLoadingMessages) return;

    // Calculer la position de scroll
    const scrollTop = chatMessages.scrollTop;
    const scrollThreshold = 300; // Charger quand on est à 300px du haut

    // Si on scroll vers le haut et qu'on approche du début
    if (scrollTop < scrollThreshold) {
        loadMoreMessagesVirtualized(chatMessages);
    }
}

function loadMoreMessagesVirtualized(chatMessages) {
    if (window.isLoadingMessages) {
        console.log("⏸️ Chargement déjà en cours...");
        return;
    }

    const allMessages = window.currentChannelMessages;
    if (!allMessages || allMessages.length === 0) {
        console.warn("⚠️ Pas de messages disponibles");
        return;
    }

    // Compter combien de messages sont déjà affichés
    const currentDisplayedCount =
        chatMessages.querySelectorAll(".message").length;

    // Calculer combien de messages on peut encore charger
    const totalMessages = allMessages.length;

    if (currentDisplayedCount >= totalMessages) {
        console.log("📭 Tous les messages sont déjà affichés");
        return;
    }

    window.isLoadingMessages = true;
    console.log(
        `📥 Messages actuels: ${currentDisplayedCount}/${totalMessages}`,
    );

    // Sauvegarder la position actuelle
    const oldScrollHeight = chatMessages.scrollHeight;
    const oldScrollTop = chatMessages.scrollTop;

    // Calculer l'index de départ pour les nouveaux messages
    const batchSize = 30; // Charger 30 messages à la fois
    const startIndex = Math.max(
        0,
        totalMessages - currentDisplayedCount - batchSize,
    );
    const endIndex = totalMessages - currentDisplayedCount;

    console.log(
        `📥 Chargement messages ${startIndex} à ${endIndex} sur ${totalMessages}`,
    );

    // Créer les éléments pour les messages plus anciens
    const fragment = document.createDocumentFragment();
    let messagesAdded = 0;

    for (let i = startIndex; i < endIndex; i++) {
        try {
            const messageDiv = createMessageElement(allMessages[i]);
            fragment.appendChild(messageDiv);
            messagesAdded++;
        } catch (error) {
            console.error(
                `❌ Erreur création message ${allMessages[i]?.id}:`,
                error,
            );
        }
    }

    // Insérer en HAUT de la liste
    if (chatMessages.firstChild) {
        chatMessages.insertBefore(fragment, chatMessages.firstChild);
    } else {
        chatMessages.appendChild(fragment);
    }

    // Restaurer la position de scroll (compenser le nouveau contenu)
    const newScrollHeight = chatMessages.scrollHeight;
    chatMessages.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);

    console.log(
        `✅ ${messagesAdded} messages ajoutés (${currentDisplayedCount + messagesAdded}/${totalMessages})`,
    );

    window.isLoadingMessages = false;
}

function showWelcomeMessage(chatMessages, channelName, type) {
    let welcomeIcon = "";
    let channelTypeText = "";

    if (type === "voice") {
        welcomeIcon =
            '<img src="assets/vocalchat-icon.png" alt="Voice" class="welcome-icon">';
        channelTypeText = "Canal vocal";
    } else if (type === "stage") {
        welcomeIcon = "🎤";
        channelTypeText = "Salon scénique";
    } else if (type === "forum") {
        welcomeIcon =
            '<img src="assets/forum-icon.png" alt="Forum" class="welcome-icon">';
        channelTypeText = "Forum";
    } else {
        welcomeIcon = "#";
        channelTypeText = "Canal";
    }

    chatMessages.innerHTML = `
        <div class="welcome-message">
            <h3>Bienvenue dans ${welcomeIcon}${channelName}</h3>
            <p>${channelTypeText}</p>
            <p style="color: #72767d; margin-top: 8px;">Aucun message pour le moment.</p>
        </div>
    `;
}

function createMessageElement(message) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message";
    messageDiv.dataset.messageId = message.id;

    // Support des deux formats de messages
    let userRoles = [];
    let contentText = "";
    let createdAt = "";
    let displayName = "";
    let avatarUrl = "";
    let isBot = false;
    let replyTo = null;
    let embeds = [];
    let roleStyle = "gradient"; // Default style
    let primaryColor = null;
    let secondaryColor = null;

    if (message.meta_data) {
        userRoles = message.meta_data.owned_roles || [];
        displayName = message.meta_data.displayName || message.username;
        avatarUrl =
            message.meta_data.avatar_url ||
            "https://cdn.discordapp.com/embed/avatars/0.png";
        isBot = message.meta_data.isBot || false;
        contentText =
            typeof message.content === "string"
                ? message.content
                : message.content?.text || "";
        createdAt = message.meta_data.createdAt;
        replyTo = message.referenced_message || null;
        embeds = message.meta_data.embeds || [];

        // Récupérer les informations de rôle pour le style
        if (userRoles.length > 0) {
            const highestRole = userRoles[0]; // Assuming roles are sorted by hierarchy
            if (highestRole && highestRole.roleStyle) {
                roleStyle = highestRole.roleStyle;
                primaryColor = highestRole.primaryColor;
                secondaryColor = highestRole.secondaryColor;
            }
        }
    } else if (message.author) {
        userRoles = message.member?.roles || [];
        displayName = message.member?.displayName || message.author.username;
        avatarUrl =
            message.author.avatar ||
            "https://cdn.discordapp.com/embed/avatars/0.png";
        isBot = message.author.bot || false;
        contentText =
            typeof message.content === "string" ? message.content : "";
        createdAt = message.createdAt;
        replyTo = message.referencedMessage || message.replyTo || null;
        embeds = message.embeds || [];

        // Récupérer les informations de rôle pour le style
        if (userRoles.length > 0 && discordData?.roles) {
            // Trouver le rôle le plus élevé avec les propriétés de style
            const memberRoleObjects = userRoles
                .map((roleId) =>
                    discordData.roles.find(
                        (r) => String(r.id) === String(roleId),
                    ),
                )
                .filter((role) => role != null);

            // Trier les rôles par position si disponible
            memberRoleObjects.sort(
                (a, b) => (b.position || 0) - (a.position || 0),
            );

            const highestRole = memberRoleObjects[0];
            if (highestRole && highestRole.roleStyle) {
                roleStyle = highestRole.roleStyle;
                primaryColor = highestRole.primaryColor;
                secondaryColor = highestRole.secondaryColor;
            }
        }
    }

    const isRoleObjectArray =
        userRoles.length > 0 &&
        typeof userRoles[0] === "object" &&
        userRoles[0].id;
    const highestRole = userRoles.length > 0 ? userRoles[0] : null;

    let roleColor = "#ffffff";
    if (highestRole) {
        if (isRoleObjectArray) {
            if (highestRole.color && highestRole.color !== "#000000") {
                roleColor = highestRole.color;
            }
        } else if (discordData?.roles) {
            const roleData = discordData.roles.find(
                (r) => String(r.id) === String(highestRole),
            );
            if (roleData && roleData.color && roleData.color !== "#000000") {
                roleColor = roleData.color;
            }
        }
    }

    let roleIconHtml = "";
    if (userRoles.length > 0) {
        let fullRoles = [];
        if (isRoleObjectArray) {
            fullRoles = userRoles;
        } else if (discordData?.roles) {
            fullRoles = userRoles
                .map((roleId) => discordData.roles.find((r) => r.id === roleId))
                .filter((role) => role != null);
        }
        const roleWithIcon = fullRoles.find(
            (role) => role.icon || role.unicodeEmoji,
        );
        if (roleWithIcon) {
            if (roleWithIcon.icon) {
                roleIconHtml = `<span class="user-role"><img src="${roleWithIcon.icon}" alt="${roleWithIcon.name}" class="role-icon"></span>`;
            } else if (roleWithIcon.unicodeEmoji) {
                roleIconHtml = `<span class="user-role"><span class="role-emoji">${roleWithIcon.unicodeEmoji}</span></span>`;
            }
        }
    }

    const timestamp = formatMessageTimestamp(
        createdAt || new Date().toISOString(),
    );

    // Si c'est un message de bot avec embeds, utiliser la structure spéciale
    if (isBot && embeds && embeds.length > 0) {
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <img src="${avatarUrl}" alt="${displayName}" loading="lazy" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="username">${displayName}</span>
                    <span class="bot-tag">BOT</span>
                    ${roleIconHtml}
                    <span class="timestamp">${timestamp}</span>
                </div>
                ${embeds && embeds.length > 0 ? createEmbedsHTML(embeds) : ""}
            </div>
        `;
    } else {
        // Message normal (avec ou sans reply)
        let messageHTML = "";

        if (replyTo) {
            const replyAuthor =
                replyTo.author?.displayName ||
                replyTo.author?.username ||
                "Unknown";
            const replyContent =
                typeof replyTo.content === "string"
                    ? replyTo.content
                    : replyTo.content?.text || "Message original supprimé";
            const replyAvatar =
                replyTo.author?.avatar ||
                "https://cdn.discordapp.com/embed/avatars/0.png";

            messageHTML += `
                <div class="message-reply-container">
                    <div class="reply-line"></div>
                    <div class="reply-content">
                        <img src="${replyAvatar}" alt="${replyAuthor}" class="reply-avatar" loading="lazy">
                        <div class="reply-info">
                            <span class="reply-author">${replyAuthor}</span>
                            <span class="reply-text">${replyContent.substring(0, 100)}${replyContent.length > 100 ? "..." : ""}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        messageHTML += `
            <div class="message-avatar">
                <img src="${avatarUrl}" alt="${displayName}" loading="lazy" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="username">${displayName}</span>
                    ${isBot ? '<span class="bot-tag">BOT</span>' : ""}
                    ${roleIconHtml}
                    <span class="timestamp">${timestamp}</span>
                </div>
                ${contentText ? `<div class="message-text">${processMessageContent(contentText)}</div>` : ""}
                ${
                    message.content?.images && message.content.images.length > 0
                        ? `
                    <div class="message-attachments">
                        ${message.content.images.map((img) => `<img src="${img.url}" alt="${img.name}" style="max-width: 400px; border-radius: 8px; margin-top: 4px;">`).join("")}
                    </div>
                `
                        : ""
                }
            </div>
        `;

        messageDiv.innerHTML = messageHTML;
    }

    // Apply resolved role style directly on the created element so callers don't need to
    try {
        let highestRoleObj = null;
        if (highestRole) {
            if (isRoleObjectArray) highestRoleObj = highestRole;
            else if (discordData?.roles) {
                if (Array.isArray(discordData.roles)) {
                    highestRoleObj = discordData.roles.find((r) => String(r.id) === String(highestRole));
                } else {
                    highestRoleObj = discordData.roles[highestRole] || null;
                }
            }
        }

        const nameEl = messageDiv.querySelector('.username, .message-username');
        if (nameEl) {
            const props = getRoleStyleProps(highestRoleObj);
            if (props.effectiveStyle === 'gradient') {
                nameEl.style.setProperty('background', `linear-gradient(90deg, ${props.primary} 0%, ${props.secondary} 100%)`, 'important');
                nameEl.style.setProperty('background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                nameEl.style.setProperty('color', 'transparent', 'important');
                nameEl.style.setProperty('background-size', '200% 100%', 'important');
            } else if (props.effectiveStyle === 'holographic') {
                nameEl.style.setProperty('background', 'linear-gradient(90deg, #ff73fa 0%, #b968c7 20%, #00d4aa 40%, #00ffff 60%, #b968c7 80%, #ff73fa 100%)', 'important');
                nameEl.style.setProperty('background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                nameEl.style.setProperty('color', 'transparent', 'important');
                nameEl.style.setProperty('background-size', '300% 100%', 'important');
            } else {
                const c = props.solidColor || '#99aab5';
                nameEl.style.setProperty('background', `linear-gradient(90deg, ${c} 0%, ${c} 100%)`, 'important');
                nameEl.style.setProperty('background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                nameEl.style.setProperty('color', 'transparent', 'important');
                nameEl.style.setProperty('background-size', '100% 100%', 'important');
            }
        }
    } catch (e) {
        console.warn('Erreur application style au message (création):', e);
    }

    return messageDiv;
}

function createEmbedsHTML(embeds) {
    if (!embeds || embeds.length === 0) return "";

    return embeds
        .map((embed) => {
            const borderColor = embed.color
                ? `#${embed.color.toString(16).padStart(6, "0")}`
                : "#202225";

            let embedHTML = `<div class="message-embed" style="border-left: 4px solid ${borderColor};">`;

            // Container pour thumbnail
            const hasThumbnail =
                embed.thumbnail &&
                (embed.thumbnail.url ||
                    embed.thumbnail.proxyURL ||
                    embed.thumbnail.proxy_url);
            if (hasThumbnail) {
                embedHTML += `<div class="embed-content-wrapper">`;
            }

            // Author
            if (embed.author) {
                embedHTML += `<div class="embed-author">`;
                if (embed.author.iconURL || embed.author.icon_url) {
                    embedHTML += `<img src="${embed.author.iconURL || embed.author.icon_url}" alt="" class="embed-author-icon" loading="lazy">`;
                }
                if (embed.author.url) {
                    embedHTML += `<a href="${embed.author.url}" class="embed-author-name" target="_blank" rel="noopener noreferrer">${escapeHtmlForMention(embed.author.name)}</a>`;
                } else {
                    embedHTML += `<span class="embed-author-name">${escapeHtmlForMention(embed.author.name)}</span>`;
                }
                embedHTML += `</div>`;
            }

            // Title
            if (embed.title) {
                if (embed.url) {
                    embedHTML += `<a href="${embed.url}" class="embed-title" target="_blank" rel="noopener noreferrer">${escapeHtmlForMention(embed.title)}</a>`;
                } else {
                    embedHTML += `<div class="embed-title">${escapeHtmlForMention(embed.title)}</div>`;
                }
            }

            // Description (avec formatage Markdown)
            if (embed.description) {
                embedHTML += `<div class="embed-description">${processMessageContent(embed.description)}</div>`;
            }

            // Fields
            if (embed.fields && embed.fields.length > 0) {
                embedHTML += `<div class="embed-fields">`;
                embed.fields.forEach((field) => {
                    const fieldClass = field.inline
                        ? "embed-field embed-field-inline"
                        : "embed-field";
                    embedHTML += `
                    <div class="${fieldClass}">
                        <div class="embed-field-name">${escapeHtmlForMention(field.name)}</div>
                        <div class="embed-field-value">${processMessageContent(field.value)}</div>
                    </div>
                `;
                });
                embedHTML += `</div>`;
            }

            // Thumbnail (positionné à droite)
            if (hasThumbnail) {
                embedHTML += `</div>`; // Fermer embed-content-wrapper
                const thumbUrl =
                    embed.thumbnail.url ||
                    embed.thumbnail.proxyURL ||
                    embed.thumbnail.proxy_url;
                embedHTML += `<img src="${thumbUrl}" alt="" class="embed-thumbnail" loading="lazy">`;
            }

            // Image (pleine largeur)
            if (embed.image) {
                const imageUrl =
                    embed.image.url ||
                    embed.image.proxyURL ||
                    embed.image.proxy_url;
                if (imageUrl) {
                    embedHTML += `<img src="${imageUrl}" alt="" class="embed-image" loading="lazy">`;
                }
            }

            // Video
            if (embed.video) {
                const videoUrl =
                    embed.video.url ||
                    embed.video.proxyURL ||
                    embed.video.proxy_url;
                if (videoUrl) {
                    embedHTML += `<video src="${videoUrl}" class="embed-video" controls></video>`;
                }
            }

            // Footer
            if (embed.footer || embed.timestamp) {
                embedHTML += `<div class="embed-footer">`;
                if (embed.footer) {
                    if (embed.footer.iconURL || embed.footer.icon_url) {
                        embedHTML += `<img src="${embed.footer.iconURL || embed.footer.icon_url}" alt="" class="embed-footer-icon" loading="lazy">`;
                    }
                    embedHTML += `<span class="embed-footer-text">${escapeHtmlForMention(embed.footer.text)}</span>`;
                    if (embed.timestamp) {
                        embedHTML += `<span class="embed-footer-separator">•</span>`;
                    }
                }
                if (embed.timestamp) {
                    const date = new Date(embed.timestamp);
                    const formattedDate =
                        date.toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                        }) +
                        " à " +
                        date.toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                        });
                    embedHTML += `<span class="embed-footer-text">${formattedDate}</span>`;
                }
                embedHTML += `</div>`;
            }

            embedHTML += `</div>`;
            return embedHTML;
        })
        .join("");
}

// Role editing functions
async function editRole(roleId) {
    const role = discordData.roles.find((r) => r.id === roleId);
    if (!role) {
        console.error("❌ Rôle non trouvé:", roleId);
        return;
    }

    console.log("🔧 Édition du rôle:", role.name);
    console.log("📊 Structure complète du rôle:", role);

    const modal = document.getElementById("roleEditModal");
    const title = document.getElementById("roleEditTitle");
    title.textContent = `EDIT ROLE — ${role.name}`;

    // Populate role sidebar
    populateRoleEditSidebar(roleId);

    // Mettre à jour le compteur de membres
    try {
        const response = await fetch("/api/members");
        const memberData = await response.json();
        let memberCount = 0;

        if (memberData.members) {
            Object.values(memberData.members).forEach((member) => {
                if (member.roles && member.roles.includes(roleId)) {
                    memberCount++;
                }
            });
        }

        const manageMembersBtn = document.getElementById("manageMembersBtn");
        if (manageMembersBtn) {
            manageMembersBtn.textContent = `Manage Members (${memberCount})`;
        }
    } catch (error) {
        console.error("Erreur comptage membres:", error);
    }

    // Conserver l'onglet actif actuel ou afficher display par défaut
    const currentActiveTab = document.querySelector(
        ".role-tab-content:not(.hidden)",
    );
    let activeTabName = "display";
    if (currentActiveTab) {
        const tabId = currentActiveTab.id;
        activeTabName = tabId.replace("Tab", "");
    }

    // Show the current active tab (or display by default)
    showRoleTab(activeTabName);

    // Populate role data in the display tab
    await populateRoleData(role);

    // Always populate permissions when editing a role
    populatePermissions(role);

    modal.classList.remove("hidden");
}

function closeRoleEditModal() {
    document.getElementById("roleEditModal").classList.add("hidden");
}

async function showRoleTab(tabName) {
    // Hide all tabs
    document.querySelectorAll(".role-tab-content").forEach((tab) => {
        tab.classList.add("hidden");
    });

    // Remove active class from all buttons
    document.querySelectorAll(".tab-button").forEach((btn) => {
        btn.classList.remove("active");
    });

    // Show selected tab
    const selectedTab = document.getElementById(tabName + "Tab");
    if (selectedTab) {
        selectedTab.classList.remove("hidden");
    }

    // Add active class to clicked button
    if (event && event.target) {
        event.target.classList.add("active");
    } else {
        // Fallback for programmatic calls
        const targetButton = document.querySelector(
            `[onclick="showRoleTab('${tabName}')"]`,
        );
        if (targetButton) {
            targetButton.classList.add("active");
        }
    }

    const currentRoleId = getCurrentSelectedRoleId();

    // If switching to permissions tab, refresh permissions for current role
    if (tabName === "permissions") {
        if (currentRoleId) {
            const role = discordData.roles.find((r) => r.id === currentRoleId);
            if (role) {
                populatePermissions(role);
            }
        }
    }

    // If switching to members tab, load role members
    if (tabName === "members") {
        if (currentRoleId) {
            await loadRoleMembers(currentRoleId);
        }
    }
}

function getCurrentSelectedRoleId() {
    const selectedRoleItem = document.querySelector(".role-edit-item.selected");
    if (selectedRoleItem) {
        // Extract role ID from the onclick attribute or data attribute
        const onclick = selectedRoleItem.getAttribute("onclick");
        if (onclick) {
            const match = onclick.match(/editRole\('([^']+)'\)/);
            if (match) {
                return match[1];
            }
        }
    }
    return null;
}

let roleMembersLoadInterval = null;

async function loadRoleMembers(roleId) {
    console.log("🔄 Chargement des membres pour le rôle:", roleId);

    // Arrêter tout chargement en cours
    if (roleMembersLoadInterval) {
        clearInterval(roleMembersLoadInterval);
        roleMembersLoadInterval = null;
    }

    const membersTab = document.getElementById("membersTab");
    if (!membersTab) return;

    // Charger le rôle
    const role = discordData.roles.find((r) => r.id === roleId);
    if (!role) return;

    // Créer l'interface
    membersTab.innerHTML = `
        <div class="role-members-search">
            <img src="assets/searchbaricon.png" alt="Search" class="role-members-search-icon">
            <input type="text" placeholder="Search Members" class="role-members-search-input" id="searchRoleMembers">
            <button class="add-members-btn">Add Members</button>
        </div>
        <div class="role-members-list" id="roleMembersList">
            <div class="loading-members">Chargement des membres...</div>
        </div>
    `;

    try {
        // Charger les membres depuis l'API
        const response = await fetch("/api/members");
        const memberData = await response.json();

        // Filtrer les membres qui ont ce rôle
        const roleMembers = [];
        if (memberData.members) {
            Object.entries(memberData.members).forEach(([userId, member]) => {
                if (member.roles && member.roles.includes(roleId)) {
                    roleMembers.push({
                        id: userId,
                        ...member,
                    });
                }
            });
        }

        console.log(
            `📊 ${roleMembers.length} membres trouvés pour le rôle ${role.name}`,
        );

        const membersList = document.getElementById("roleMembersList");
        if (!membersList) return;

        membersList.innerHTML = "";

        if (roleMembers.length === 0) {
            membersList.innerHTML =
                '<div class="no-role-members">Aucun membre n\'a ce rôle</div>';
            return;
        }

        // Fonction pour afficher les membres
        let currentIndex = 0;
        const batchSize = 100;

        function displayNextBatch() {
            const endIndex = Math.min(
                currentIndex + batchSize,
                roleMembers.length,
            );
            const fragment = document.createDocumentFragment();

            for (let i = currentIndex; i < endIndex; i++) {
                const member = roleMembers[i];
                const memberDiv = document.createElement("div");
                memberDiv.className = "role-member-item";
                memberDiv.innerHTML = `
                    <img src="${member.avatar || "https://cdn.discordapp.com/embed/avatars/0.png"}" alt="${member.displayName}" class="role-member-avatar">
                    <div class="role-member-info">
                        <div class="role-member-name">${member.displayName || member.username}</div>
                        <div class="role-member-username">@${member.username}</div>
                    </div>
                    <button class="remove-role-member" onclick="removeRoleMember('${roleId}', '${member.id}')">✕</button>
                `;
                fragment.appendChild(memberDiv);
            }

            membersList.appendChild(fragment);
            currentIndex = endIndex;

            console.log(
                `📥 ${currentIndex}/${roleMembers.length} membres affichés`,
            );
        }

        // Afficher le premier batch immédiatement
        displayNextBatch();

        // Charger le reste progressivement
        if (currentIndex < roleMembers.length) {
            roleMembersLoadInterval = setInterval(() => {
                if (currentIndex >= roleMembers.length) {
                    clearInterval(roleMembersLoadInterval);
                    roleMembersLoadInterval = null;
                    console.log("✅ Tous les membres chargés");
                    return;
                }
                displayNextBatch();
            }, 1000); // Toutes les 1 seconde
        }

        // Gérer la recherche
        const searchInput = document.getElementById("searchRoleMembers");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const memberItems =
                    membersList.querySelectorAll(".role-member-item");

                memberItems.forEach((item) => {
                    const name = item
                        .querySelector(".role-member-name")
                        .textContent.toLowerCase();
                    const username = item
                        .querySelector(".role-member-username")
                        .textContent.toLowerCase();

                    if (
                        name.includes(searchTerm) ||
                        username.includes(searchTerm)
                    ) {
                        item.style.display = "flex";
                    } else {
                        item.style.display = "none";
                    }
                });
            });
        }
    } catch (error) {
        console.error("❌ Erreur chargement membres du rôle:", error);
        const membersList = document.getElementById("roleMembersList");
        if (membersList) {
            membersList.innerHTML =
                '<div class="error-message">Erreur lors du chargement des membres</div>';
        }
    }
}

function removeRoleMember(roleId, userId) {
    console.log(`Retirer le rôle ${roleId} de l'utilisateur ${userId}`);
    // Cette fonction pourrait être implémentée pour retirer le rôle
}

// Nettoyer l'intervalle quand on quitte l'onglet members
document.addEventListener("DOMContentLoaded", () => {
    const membersTab = document.querySelector(
        "[onclick=\"showRoleTab('members')\"]",
    );
    if (membersTab) {
        const originalShowRoleTab = window.showRoleTab;
        window.showRoleTab = function (tabName) {
            if (tabName !== "members" && roleMembersLoadInterval) {
                clearInterval(roleMembersLoadInterval);
                roleMembersLoadInterval = null;
            }
            return originalShowRoleTab.call(this, tabName);
        };
    }
});

function populateRoleEditSidebar(selectedRoleId) {
    const sidebar = document.querySelector(".role-list-edit");
    sidebar.innerHTML = "";

    discordData.roles.forEach((role) => {
        const roleItem = document.createElement("div");
        roleItem.className = `role-edit-item ${role.id === selectedRoleId ? "selected" : ""}`;
        roleItem.dataset.roleId = role.id;

        const roleColor =
            role.color && role.color !== "#000000" ? role.color : "#99aab5";

        roleItem.innerHTML = `
            <div class="role-color" style="background-color: ${roleColor}; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; flex-shrink: 0;"></div>
            <span class="role-name">${role.name}</span>
        `;
        roleItem.onclick = () => editRole(role.id);
        sidebar.appendChild(roleItem);
    });
}

function populatePermissions(role) {
    const permissionsList = document.getElementById("permissionsList");
    if (!permissionsList) {
        console.error("❌ Element permissionsList non trouvé dans le DOM");
        return;
    }

    console.log("🔧 Population des permissions pour le rôle:", role.name);
    console.log("📋 Permissions du rôle:", role.permissions);
    console.log("📊 Détails des permissions:", role.permissionDetails);

    // Vérifier que les permissions existent
    if (!role.permissions && !role.permissionDetails) {
        console.warn("⚠️ Aucune permission trouvée pour le rôle:", role.name);
        permissionsList.innerHTML =
            '<div class="error-message">Aucune permission disponible pour ce rôle</div>';
        return;
    }

    const permissions = [
        // General Server Permissions
        {
            name: "View Audit Log",
            description:
                "Allows members to view a log of users who have made changes on this server.",
            key: "VIEW_AUDIT_LOG",
            category: "general",
        },
        {
            name: "View Server Insights",
            description:
                "Allows members to view Server Insights, which show data about community growth, engagement, and more.",
            key: "VIEW_GUILD_INSIGHTS",
            category: "general",
        },
        {
            name: "Manage Server",
            description:
                "Allows members to change this server's name, description, region, and other server settings.",
            key: "MANAGE_GUILD",
            category: "general",
        },
        {
            name: "Manage Roles",
            description:
                "Allows members to create new roles and edit or delete roles lower than their highest role.",
            key: "MANAGE_ROLES",
            category: "general",
        },
        {
            name: "Manage Channels",
            description: "Allows members to create, edit, or delete channels.",
            key: "MANAGE_CHANNELS",
            category: "general",
        },
        {
            name: "Kick Members",
            description:
                "Allows members to remove other members from this server. They cannot kick members with a role higher than or equal to their highest role.",
            key: "KICK_MEMBERS",
            category: "general",
        },
        {
            name: "Ban Members",
            description:
                "Allows members to permanently ban other members from this server. They cannot ban members with a role higher than or equal to their highest role.",
            key: "BAN_MEMBERS",
            category: "general",
        },
        {
            name: "Timeout Members",
            description:
                "Allows members to disable another member's ability to send messages, add reactions, speak in voice, or join stage channels for a set amount of time.",
            key: "MODERATE_MEMBERS",
            category: "general",
        },
        {
            name: "Send Messages in Threads",
            description: "Allows members to send messages in threads.",
            key: "SEND_MESSAGES_IN_THREADS",
            category: "general",
        },
        {
            name: "Create Public Threads",
            description: "Allows members to create public threads.",
            key: "CREATE_PUBLIC_THREADS",
            category: "general",
        },
        {
            name: "Create Private Threads",
            description: "Allows members to create private threads.",
            key: "CREATE_PRIVATE_THREADS",
            category: "general",
        },
        {
            name: "Use External Stickers",
            description: "Allows members to use stickers from other servers.",
            key: "USE_EXTERNAL_STICKERS",
            category: "general",
        },
        {
            name: "Manage Threads",
            description:
                "Allows members to rename, delete, close/open, and turn on slow mode for threads.",
            key: "MANAGE_THREADS",
            category: "general",
        },
        {
            name: "Manage Webhooks",
            description: "Allows members to create, edit, or delete webhooks.",
            key: "MANAGE_WEBHOOKS",
            category: "general",
        },
        {
            name: "Manage Expressions",
            description:
                "Allows members to edit or delete custom emojis, stickers, and sounds on this server.",
            key: "MANAGE_EMOJIS_AND_STICKERS",
            category: "general",
        },
        {
            name: "Use Application Commands",
            description:
                "Allows members to use commands from applications, including slash commands and context menu commands.",
            key: "USE_APPLICATION_COMMANDS",
            category: "general",
        },
        {
            name: "Request to Speak",
            description:
                "Allows members to request to speak in stage channels.",
            key: "REQUEST_TO_SPEAK",
            category: "general",
        },
        {
            name: "Manage Events",
            description: "Allows members to create, edit, and cancel events.",
            key: "MANAGE_EVENTS",
            category: "general",
        },
        {
            name: "Create Events",
            description: "Allows members to create events.",
            key: "CREATE_EVENTS",
            category: "general",
        },
        {
            name: "Create Guild Expressions",
            description:
                "Allows members to upload custom emojis, stickers, and sounds to this server.",
            key: "CREATE_GUILD_EXPRESSIONS",
            category: "general",
        },
        {
            name: "View Creator Monetization Analytics",
            description:
                "Allows members to view creator monetization analytics.",
            key: "VIEW_CREATOR_MONETIZATION_ANALYTICS",
            category: "general",
        },
        {
            name: "Use Soundboard",
            description:
                "Allows members to play sounds from the server soundboard.",
            key: "USE_SOUNDBOARD",
            category: "general",
        },
        {
            name: "Use External Sounds",
            description: "Allows members to use sounds from other servers.",
            key: "USE_EXTERNAL_SOUNDS",
            category: "general",
        },
        {
            name: "Send Voice Messages",
            description: "Allows members to send voice messages.",
            key: "SEND_VOICE_MESSAGES",
            category: "general",
        },

        // Membership Permissions
        {
            name: "Create Instant Invite",
            description: "Allows members to invite new people to this server.",
            key: "CREATE_INSTANT_INVITE",
            category: "membership",
        },
        {
            name: "Change Nickname",
            description:
                "Allows members to change their own nickname, a custom name for just this server.",
            key: "CHANGE_NICKNAME",
            category: "membership",
        },
        {
            name: "Manage Nicknames",
            description:
                "Allows members to change the nicknames of other members.",
            key: "MANAGE_NICKNAMES",
            category: "membership",
        },

        // Text Channel Permissions
        {
            name: "View Channels",
            description:
                "Allows members to view channels by default (excluding private channels).",
            key: "VIEW_CHANNEL",
            category: "text",
        },
        {
            name: "Send Messages",
            description: "Allows members to send messages in text channels.",
            key: "SEND_MESSAGES",
            category: "text",
        },
        {
            name: "Send TTS Messages",
            description: "Allows members to send text-to-speech messages.",
            key: "SEND_TTS_MESSAGES",
            category: "text",
        },
        {
            name: "Manage Messages",
            description:
                "Allows members to delete messages by other members or pin any message.",
            key: "MANAGE_MESSAGES",
            category: "text",
        },
        {
            name: "Embed Links",
            description:
                "Allows members to post links that display embedded content in text channels.",
            key: "EMBED_LINKS",
            category: "text",
        },
        {
            name: "Attach Files",
            description:
                "Allows members to upload files or media in text channels.",
            key: "ATTACH_FILES",
            category: "text",
        },
        {
            name: "Read Message History",
            description:
                "Allows members to read previous messages sent in channels.",
            key: "READ_MESSAGE_HISTORY",
            category: "text",
        },
        {
            name: "Mention @everyone, @everyone, and All Roles",
            description:
                "Allows members to use @everyone (everyone in the server) and @here (only online members in the channel).",
            key: "MENTION_EVERYONE",
            category: "text",
        },
        {
            name: "Use External Emojis",
            description: "Allows members to use emojis from other servers.",
            key: "USE_EXTERNAL_EMOJIS",
            category: "text",
        },
        {
            name: "Add Reactions",
            description:
                "Allows members to add new emoji reactions to a message.",
            key: "ADD_REACTIONS",
            category: "text",
        },
        {
            name: "Use Slash Commands",
            description: "Allows members to use slash commands.",
            key: "USE_APPLICATION_COMMANDS",
            category: "text",
        },

        // Voice Channel Permissions
        {
            name: "Connect",
            description:
                "Allows members to join voice channels and hear others.",
            key: "CONNECT",
            category: "voice",
        },
        {
            name: "Speak",
            description: "Allows members to talk in voice channels.",
            key: "SPEAK",
            category: "voice",
        },
        {
            name: "Video",
            description:
                "Allows members to share their video, screen share, or stream a game in this server.",
            key: "STREAM",
            category: "voice",
        },
        {
            name: "Use Voice Activity",
            description:
                "Allows members to use voice activity detection in voice channels.",
            key: "USE_VAD",
            category: "voice",
        },
        {
            name: "Priority Speaker",
            description:
                "Allows members to be more easily heard. When activated, the volume of others without this permission will be lowered.",
            key: "PRIORITY_SPEAKER",
            category: "voice",
        },
        {
            name: "Mute Members",
            description:
                "Allows members to mute other members in voice channels.",
            key: "MUTE_MEMBERS",
            category: "voice",
        },
        {
            name: "Deafen Members",
            description:
                "Allows members to deafen other members in voice channels.",
            key: "DEAFEN_MEMBERS",
            category: "voice",
        },
        {
            name: "Move Members",
            description:
                "Allows members to move other members between voice channels.",
            key: "MOVE_MEMBERS",
            category: "voice",
        },
        {
            name: "Set Voice Channel Status",
            description: "Allows members to set the status of a voice channel.",
            key: "SET_VOICE_CHANNEL_STATUS",
            category: "voice",
        },

        // Apps Permissions
        {
            name: "Use Activities",
            description: "Allows members to use Activities in voice channels.",
            key: "USE_EMBEDDED_ACTIVITIES",
            category: "apps",
        },
        {
            name: "Use External Apps",
            description: "Allows members to use external apps in this server.",
            key: "USE_EXTERNAL_APPS",
            category: "apps",
        },

        {
            name: "Administrator",
            description:
                "Members with this permission will have every permission and will also bypass all channel specific permissions or restrictions (for example, these members would get access to all private channels). This is a dangerous permission to grant.",
            key: "ADMINISTRATOR",
            category: "advanced",
        },
    ];

    permissionsList.innerHTML = "";

    // Organiser par catégories
    const categories = {
        general: "General Server Permissions",
        membership: "Membership Permissions",
        text: "Text Channel Permissions",
        voice: "Voice Channel Permissions",
        apps: "Apps Permissions",
        advanced: "Advanced Permissions",
    };

    Object.keys(categories).forEach((categoryKey) => {
        const categoryPermissions = permissions.filter(
            (p) => p.category === categoryKey,
        );
        if (categoryPermissions.length === 0) return;

        const categorySection = document.createElement("div");
        categorySection.className = "permissions-category";
        categorySection.innerHTML = `
            <div class="permissions-category-header">
                <h3>${categories[categoryKey]}</h3>
                <button class="clear-permissions-category" onclick="clearCategoryPermissions('${categoryKey}')">
                    Clear permissions
                </button>
            </div>
        `;

        categoryPermissions.forEach((permission) => {
            // Vérification multiple des permissions
            let hasPermission = false;

            if (
                role.permissionDetails &&
                typeof role.permissionDetails === "object"
            ) {
                hasPermission = role.permissionDetails[permission.key] === true;
            } else if (role.permissions && Array.isArray(role.permissions)) {
                hasPermission = role.permissions.includes(permission.key);
            } else if (
                role.permissions &&
                typeof role.permissions === "string"
            ) {
                hasPermission = role.permissions
                    .split(",")
                    .includes(permission.key);
            }

            // console.log(`🔍 Permission ${permission.key} pour ${role.name}: ${hasPermission}`);

            const permissionItem = document.createElement("div");
            permissionItem.className = "permission-item";
            permissionItem.innerHTML = `
                <div class="permission-info">
                    <div class="permission-name">${permission.name}</div>
                    <div class="permission-description">${permission.description}</div>
                </div>
                <div class="permission-toggle">
                    <div class="toggle-switch ${hasPermission ? "active" : ""}" onclick="togglePermission('${permission.key}', this)">
                        <div class="toggle-slider"></div>
                    </div>
                </div>
            `;

            categorySection.appendChild(permissionItem);
        });

        permissionsList.appendChild(categorySection);
    });

    // console.log('✅ Permissions populées:', permissionsList.children.length, 'catégories ajoutées');

    // Vérifier que les éléments ont bien été ajoutés
    if (permissionsList.children.length === 0) {
        console.error("❌ Aucune permission n'a été ajoutée au DOM");
        permissionsList.innerHTML =
            '<div class="error-message">Erreur lors du chargement des permissions</div>';
    } else {
        // console.log('✅ Permissions affichées avec succès');
    }
}

// Function to populate role data in display tab
async function populateRoleData(role) {
    // Charger les données complètes du rôle depuis GitHub si nécessaire
    let fullRoleData = role;

    const roleNameInput = document.getElementById("roleNameInput");
    if (roleNameInput) {
        roleNameInput.value = role.name;
    }

    // Gérer l'icône du rôle
    const chooseImageBlock = document.querySelector(".choose-image-block");
    const roleIconDisplay = document.getElementById("roleIconDisplay");

    if (chooseImageBlock) {
        chooseImageBlock.innerHTML = "";

        if (role.icon) {
            // Afficher l'icône du rôle
            const iconImg = document.createElement("img");
            iconImg.src = role.icon;
            iconImg.className = "choose-image-icon";
            iconImg.style.height = "25px";
            iconImg.style.width = "25px";
            iconImg.style.objectFit = "contain";
            chooseImageBlock.appendChild(iconImg);
        } else if (role.unicodeEmoji) {
            // Afficher l'emoji
            const emojiSpan = document.createElement("span");
            emojiSpan.textContent = role.unicodeEmoji;
            emojiSpan.style.fontSize = "40px";
            chooseImageBlock.appendChild(emojiSpan);
        } else {
            // Afficher l'icône par défaut
            const defaultIcon = document.createElement("img");
            defaultIcon.src = "assets/add-picture-icon.png";
            defaultIcon.alt = "Add Picture";
            defaultIcon.className = "choose-image-icon";
            defaultIcon.style.height = "25px";
            defaultIcon.style.width = "25px";
            defaultIcon.style.objectFit = "contain";
            chooseImageBlock.appendChild(defaultIcon);
        }
    }

    // Afficher l'icône dans le placeholder du nom aussi
    if (roleIconDisplay) {
        if (role.icon) {
            roleIconDisplay.innerHTML = `<img src="${role.icon}" style="width: 16px; height: 16px; border-radius: 3px;">`;
        } else if (role.unicodeEmoji) {
            roleIconDisplay.textContent = role.unicodeEmoji;
        } else {
            roleIconDisplay.textContent = "";
        }
    }

    // Gérer le style de rôle (solid, gradient, holographic)
    const roleStyle = role.roleStyle || "solid";

    // Masquer tous les modes de couleur
    document.getElementById("solidColorMode")?.classList.add("hidden");
    document.getElementById("gradientColorMode")?.classList.add("hidden");
    document.getElementById("holographicColorMode")?.classList.add("hidden");

    // Afficher le bon mode
    if (roleStyle === "solid") {
        const solidMode = document.getElementById("solidColorMode");
        if (solidMode) {
            solidMode.classList.remove("hidden");

            // Mettre à jour la couleur du bloc sélecteur
            const colorSelectorBlock = solidMode.querySelector(
                ".color-selector-block",
            );
            if (colorSelectorBlock && role.color && role.color !== "#000000") {
                colorSelectorBlock.style.backgroundColor = role.color;
            } else if (colorSelectorBlock) {
                colorSelectorBlock.style.backgroundColor = "#99aab5";
            }
        }
    } else if (roleStyle === "gradient") {
        const gradientMode = document.getElementById("gradientColorMode");
        if (gradientMode) {
            gradientMode.classList.remove("hidden");

            // Appliquer les couleurs du gradient
            const gradientPreview = document.getElementById("gradientPreview");
            if (gradientPreview) {
                const color1 = normalizeColor(role.primaryColor, role.color) || normalizeColor(role.color) || "#99aab5";
                const color2 = normalizeColor(role.secondaryColor, color1) || color1;
                gradientPreview.style.background = `linear-gradient(90deg, ${color1} 0%, ${color2} 100%)`;
            }
        }
    } else if (roleStyle === "holographic") {
        const holographicMode = document.getElementById("holographicColorMode");
        if (holographicMode) {
            holographicMode.classList.remove("hidden");
        }
    }

    // Gérer les toggles
    const displaySeparatelyToggle = document.getElementById(
        "displaySeparatelyToggle",
    );
    if (displaySeparatelyToggle) {
        if (role.hoist) {
            displaySeparatelyToggle.classList.add("active");
        } else {
            displaySeparatelyToggle.classList.remove("active");
        }
    }

    const mentionableToggle = document.getElementById("mentionableToggle");
    if (mentionableToggle) {
        if (role.mentionable) {
            mentionableToggle.classList.add("active");
        } else {
            mentionableToggle.classList.remove("active");
        }
    }
}

// Ancienne fonction pour compatibilité
function populateRoleData_old(role) {
    // Populate role name (read-only display)
    const roleNameInput = document.getElementById("roleNameInput");
    if (roleNameInput) {
        roleNameInput.value = role.name;
        roleNameInput.readOnly = true;
        roleNameInput.style.cursor = "not-allowed";
    }

    // Set role icon if available
    const roleIconDisplay = document.getElementById("roleIconDisplay");
    if (roleIconDisplay) {
        if (role.icon) {
            roleIconDisplay.innerHTML = `<img src="${role.icon}" alt="Role icon" style="width: 16px; height: 16px;">`;
        } else if (role.unicodeEmoji) {
            roleIconDisplay.textContent = role.unicodeEmoji;
        }
    }

    // Mise à jour de l'icône choose-image-icon avec l'icône du rôle si disponible
    const chooseImageIcon = document.querySelector(".choose-image-icon");
    if (chooseImageIcon) {
        if (role.icon) {
            chooseImageIcon.src = role.icon;
            chooseImageIcon.alt = "Role icon";
        } else if (role.unicodeEmoji) {
            // Pour les emojis, on change l'élément img en span
            const parent = chooseImageIcon.parentElement;
            parent.innerHTML = `<span class="choose-image-icon" style="font-size: 32px;">${role.unicodeEmoji}</span>`;
        } else {
            // Remettre l'icône par défaut
            chooseImageIcon.src = "assets/add-picture-icon.png";
            chooseImageIcon.alt = "Add Picture";
        }
    }

    // Déterminer le style de rôle (solid, gradient, ou holographic)
    const roleStyle = role.roleStyle || "solid";
    const roleColor =
        role.color && role.color !== "#000000" ? role.color : "#99aab5";

    // Masquer tous les color-mode-container
    document.querySelectorAll(".color-mode-container").forEach((container) => {
        container.classList.add("hidden");
    });

    // Afficher le bon container selon le style
    if (roleStyle === "gradient") {
        const gradientMode = document.getElementById("gradientColorMode");
        if (gradientMode) {
            gradientMode.classList.remove("hidden");
            // Définir les couleurs du gradient si disponibles
            const primary = normalizeColor(role.primaryColor, role.color) || normalizeColor(role.color) || "#99aab5";
            const secondary = normalizeColor(role.secondaryColor, primary) || primary;
            const gradientPreview = document.getElementById("gradientPreview");
            if (gradientPreview) {
                gradientPreview.style.background = `linear-gradient(90deg, ${primary} 0%, ${secondary} 100%)`;
            }
        }
    } else if (roleStyle === "holographic") {
        const holographicMode = document.getElementById("holographicColorMode");
        if (holographicMode) {
            holographicMode.classList.remove("hidden");
        }
    } else {
        // Mode solid par défaut
        const solidMode = document.getElementById("solidColorMode");
        if (solidMode) {
            solidMode.classList.remove("hidden");

            // Mise à jour du color-selector-block avec la couleur du rôle
            const colorSelectorBlock = document.querySelector(
                ".color-selector-block",
            );
            if (colorSelectorBlock) {
                colorSelectorBlock.style.backgroundColor = roleColor;
            }
        }
    }

    // Sélection automatique du style de rôle basé sur les données scannées
    const roleStyleIcons = document.querySelectorAll(".role-style-icon");
    if (roleStyleIcons.length > 0) {
        roleStyleIcons.forEach((icon) => {
            icon.classList.remove("selected");
            // Désactiver les clics sur toutes les icônes
            icon.style.pointerEvents = "none";
            icon.style.opacity = "1";
        });

        // Déterminer quelle icône sélectionner en fonction du style
        let selectedIndex = 0; // Par défaut: Solid
        if (roleStyle === "gradient") {
            selectedIndex = 1; // Gradient
        } else if (roleStyle === "holographic") {
            selectedIndex = 2; // Holographic
        }

        // Sélectionner et réactiver uniquement l'icône correspondante
        if (roleStyleIcons[selectedIndex]) {
            roleStyleIcons[selectedIndex].classList.add("selected");
            roleStyleIcons[selectedIndex].style.opacity = "1";
        }

        console.log(`🎨 Style de rôle détecté pour ${role.name}: ${roleStyle}`);
    }

    // Set role color with better visual feedback
    const colorSwatches = document.querySelectorAll(".color-swatch");
    colorSwatches.forEach((swatch) => {
        swatch.classList.remove("active");
        const swatchColor = swatch.style.backgroundColor;
        const roleColorRgb = hexToRgb(role.color);
        const swatchColorRgb = swatchColor ? swatchColor : null;

        if (
            (role.color === "#000000" || role.color === "#99aab5") &&
            swatch.classList.contains("default-color")
        ) {
            swatch.classList.add("active");
        } else if (
            swatchColorRgb &&
            roleColorRgb &&
            colorsMatch(swatchColorRgb, roleColorRgb)
        ) {
            swatch.classList.add("active");
        }
    });

    // Set hoist toggle with real data (Display role members separately)
    const hoistToggle = document.getElementById("displaySeparatelyToggle");
    if (hoistToggle) {
        if (role.hoist) {
            hoistToggle.classList.add("active");
        } else {
            hoistToggle.classList.remove("active");
        }
        console.log(`🔧 Display separately pour ${role.name}: ${role.hoist}`);
    }

    // Set mentionable toggle with real data (Allow anyone to @mention this role)
    const mentionableToggle = document.getElementById("mentionableToggle");
    if (mentionableToggle) {
        if (role.mentionable) {
            mentionableToggle.classList.add("active");
        } else {
            mentionableToggle.classList.remove("active");
        }
        console.log(`🔧 Mentionable pour ${role.name}: ${role.mentionable}`);
    }

    // Mettre à jour le bouton "Manage Members" avec le comptage
    updateManageMembersButton(role.id);
}

// Fonction pour mettre à jour le bouton Manage Members avec le comptage
function updateManageMembersButton(roleId) {
    let memberCount = 0;

    // Compter depuis discordData.userRoles et discordData.members
    const userIds = new Set();

    // Ajouter depuis userRoles
    if (discordData?.userRoles) {
        Object.keys(discordData.userRoles).forEach((userId) => {
            const userData = discordData.userRoles[userId];
            if (userData.roles && userData.roles.includes(roleId)) {
                userIds.add(userId);
            }
        });
    }

    // Ajouter depuis members pour s'assurer qu'on n'oublie personne
    if (discordData?.members) {
        Object.keys(discordData.members).forEach((userId) => {
            const memberData = discordData.members[userId];
            if (memberData.roles && memberData.roles.includes(roleId)) {
                userIds.add(userId);
            }
        });
    }

    memberCount = userIds.size;

    // Mettre à jour le texte du bouton
    const manageMembersBtn = document.querySelector(
        "button[onclick=\"showRoleTab('members')\"]",
    );
    if (manageMembersBtn) {
        manageMembersBtn.textContent = `Manage Members (${memberCount})`;
    }

    console.log(`👥 ${memberCount} membres avec le rôle ${roleId}`);
}

// Variables globales pour le chargement progressif des membres du rôle

// Fonction pour charger les membres d'un rôle avec chargement progressif
function loadRoleMembers(roleId) {
    console.log(`🔄 Chargement des membres pour le rôle ${roleId}...`);

    // Arrêter tout chargement en cours
    if (roleMembersLoadInterval) {
        clearInterval(roleMembersLoadInterval);
        roleMembersLoadInterval = null;
    }

    // Créer ou récupérer le conteneur membersTab
    let membersTab = document.getElementById("membersTab");
    if (!membersTab) {
        // Créer le conteneur s'il n'existe pas
        const roleEditMain = document.querySelector(".role-edit-main");
        membersTab = document.createElement("div");
        membersTab.id = "membersTab";
        membersTab.className = "role-tab-content hidden";
        roleEditMain.appendChild(membersTab);
    }

    // Afficher un message de chargement initial
    membersTab.innerHTML = `
        <div class="role-members-search">
            <img src="assets/searchbaricon.png" class="role-members-search-icon" alt="Search Icon" />
            <input type="text" placeholder="Search Members" class="role-members-search-input" />
            <button class="add-members-btn">Add Members</button>
        </div>
        <div class="role-members-list" id="roleMembersList">
            <div class="loading-members">Chargement des membres...</div>
        </div>
    `;

    // Vérifier que les données sont disponibles
    if (!discordData?.userRoles && !discordData?.members) {
        const roleMembersList = document.getElementById("roleMembersList");
        if (roleMembersList) {
            roleMembersList.innerHTML =
                '<div class="no-role-members">Données des membres non disponibles</div>';
        }
        return;
    }

    // Collecter tous les membres qui ont ce rôle (depuis userRoles ET members)
    const userIdsWithRole = new Set();

    if (discordData.userRoles) {
        Object.keys(discordData.userRoles).forEach((userId) => {
            const userData = discordData.userRoles[userId];
            if (userData.roles && userData.roles.includes(roleId)) {
                userIdsWithRole.add(userId);
            }
        });
    }

    if (discordData.members) {
        Object.keys(discordData.members).forEach((userId) => {
            const memberData = discordData.members[userId];
            if (memberData.roles && memberData.roles.includes(roleId)) {
                userIdsWithRole.add(userId);
            }
        });
    }

    // Hydrater les informations des membres depuis discordData.members (priorité) ou userRoles
    const roleMembersArray = Array.from(userIdsWithRole)
        .map((userId) => {
            // Prendre les infos depuis members en priorité, sinon userRoles
            const memberData = discordData.members?.[userId];
            const userData = discordData.userRoles?.[userId];

            if (!memberData && !userData) return null;

            const source = memberData || userData;

            return {
                userId,
                username: source.username || source.globalName || "Unknown",
                displayName:
                    source.displayName ||
                    source.globalName ||
                    source.username ||
                    "Unknown",
                avatar:
                    source.avatar ||
                    `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`,
                discriminator: source.discriminator || "0",
                status: source.status || "offline",
                joinedAt: source.joinedAt || null,
            };
        })
        .filter((member) => member !== null)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const roleMembersList = document.getElementById("roleMembersList");
    if (roleMembersArray.length === 0) {
        roleMembersList.innerHTML =
            '<div class="no-role-members">Aucun membre avec ce rôle</div>';
        return;
    }

    console.log(`👥 ${roleMembersArray.length} membres trouvés pour ce rôle`);

    // Charger immédiatement les 100 premiers membres
    roleMembersList.innerHTML = "";
    const initialBatch = roleMembersArray.slice(0, 100);
    const fragment = document.createDocumentFragment();

    initialBatch.forEach((member) => {
        const memberDiv = createRoleMemberElement(member, roleId);
        fragment.appendChild(memberDiv);
    });

    roleMembersList.appendChild(fragment);
    console.log(`✅ ${initialBatch.length} membres chargés immédiatement`);

    // Si il y a plus de 100 membres, charger le reste progressivement (100 par seconde)
    if (roleMembersArray.length > 100) {
        let currentIndex = 100;
        const remainingMembers = roleMembersArray.length - 100;
        console.log(
            `📥 ${remainingMembers} membres restants à charger progressivement...`,
        );

        roleMembersLoadInterval = setInterval(() => {
            const batchSize = 100;
            const batch = roleMembersArray.slice(
                currentIndex,
                currentIndex + batchSize,
            );

            if (batch.length === 0) {
                clearInterval(roleMembersLoadInterval);
                roleMembersLoadInterval = null;
                console.log("✅ Tous les membres chargés");
                return;
            }

            const batchFragment = document.createDocumentFragment();
            batch.forEach((member) => {
                const memberDiv = createRoleMemberElement(member, roleId);
                batchFragment.appendChild(memberDiv);
            });

            roleMembersList.appendChild(batchFragment);
            currentIndex += batchSize;
            console.log(
                `📥 ${Math.min(currentIndex, roleMembersArray.length)}/${roleMembersArray.length} membres chargés`,
            );
        }, 1000); // 1 seconde par batch de 100
    }
}

// Fonction pour créer l'élément d'un membre dans la liste de gestion
function createRoleMemberElement(member, roleId) {
    const memberDiv = document.createElement("div");
    memberDiv.className = "role-member-item";
    const avatarUrl =
        member.avatar ||
        `https://cdn.discordapp.com/embed/avatars/${member.discriminator % 5}.png`;
    const displayName = member.displayName || member.username || "Unknown User";
    const username = member.username || "unknown";

    // Determine role styling for this roleId
    const roleData = discordData?.roles
        ? Array.isArray(discordData.roles)
            ? discordData.roles.find((r) => String(r.id) === String(roleId))
            : discordData.roles[roleId] || null
        : null;

    memberDiv.innerHTML = `
        <img src="${avatarUrl}" alt="${displayName}" class="role-member-avatar" loading="lazy" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div class="role-member-info">
            <div class="role-member-name">${displayName}</div>
            <div class="role-member-username">@${username}</div>
        </div>
        <button class="remove-role-member" onclick="removeMemberFromRole('${member.userId}', '${roleId}')" title="Retirer ce rôle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
            </svg>
        </button>
    `;

    // Apply role-derived style programmatically to ensure gradients/holographic/solid are rendered consistently
    try {
        const nameEl = memberDiv.querySelector('.role-member-name');
        if (nameEl) {
            const props = getRoleStyleProps(roleData);
            if (props.effectiveStyle === 'gradient') {
                nameEl.style.setProperty('background', `linear-gradient(90deg, ${props.primary} 0%, ${props.secondary} 100%)`, 'important');
                nameEl.style.setProperty('background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                nameEl.style.setProperty('color', 'transparent', 'important');
                nameEl.style.setProperty('background-size', '200% 100%', 'important');
            } else if (props.effectiveStyle === 'holographic') {
                nameEl.style.setProperty('background', 'linear-gradient(90deg, #ff73fa 0%, #b968c7 20%, #00d4aa 40%, #00ffff 60%, #b968c7 80%, #ff73fa 100%)', 'important');
                nameEl.style.setProperty('background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                nameEl.style.setProperty('color', 'transparent', 'important');
                nameEl.style.setProperty('background-size', '300% 100%', 'important');
            } else {
                const c = props.solidColor || '#99aab5';
                nameEl.style.setProperty('background', `linear-gradient(90deg, ${c} 0%, ${c} 100%)`, 'important');
                nameEl.style.setProperty('background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
                nameEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                nameEl.style.setProperty('color', 'transparent', 'important');
                nameEl.style.setProperty('background-size', '100% 100%', 'important');
            }
        }
    } catch (e) {
        console.warn('Erreur application style au membre du rôle:', e);
    }

    return memberDiv;
}

// Fonction pour retirer un membre d'un rôle (placeholder - pas d'action réelle)
function removeMemberFromRole(userId, roleId) {
    console.log(
        `ℹ️ Fonction removeMemberFromRole appelée pour ${userId} et ${roleId}`,
    );
    console.log("⚠️ Cette action n'est pas disponible en mode lecture seule");
}

// Helper functions for color matching
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : null;
}

function colorsMatch(color1, color2) {
    if (!color1 || !color2) return false;
    return (
        Math.abs(color1.r - color2.r) < 10 &&
        Math.abs(color1.g - color2.g) < 10 &&
        Math.abs(color1.b - color2.b) < 10
    );
}

// Update role action to use edit function
function updateRoleActions() {
    document
        .querySelectorAll('.role-action[title="Edit Role"]')
        .forEach((button) => {
            button.onclick = function (event) {
                event.stopPropagation();
                const roleItem = event.target.closest(".role-item");
                const roleId = roleItem.dataset.roleId;
                editRole(roleId);
            };
        });
}

// Fonction pour reclassifier un canal mal classé
function reclassifyChannel(channel) {
    // Reclassification basée sur le type numérique ou string
    if (channel.type === 4 || channel.type === "GUILD_CATEGORY") {
        return "category";
    } else if (
        channel.type === 0 ||
        channel.type === "GUILD_TEXT" ||
        channel.type === 5 ||
        channel.type === "GUILD_NEWS" ||
        channel.type === "GUILD_ANNOUNCEMENT"
    ) {
        return "text";
    } else if (channel.type === 2 || channel.type === "GUILD_VOICE") {
        return "voice";
    } else if (channel.type === 15 || channel.type === "GUILD_FORUM") {
        return "forum";
    } else if (channel.type === 13 || channel.type === "GUILD_STAGE_VOICE") {
        return "stage";
    } else if (
        channel.type === 11 ||
        channel.type === "PUBLIC_THREAD" ||
        channel.type === 12 ||
        channel.type === "PRIVATE_THREAD" ||
        channel.type === 10 ||
        channel.type === "ANNOUNCEMENT_THREAD"
    ) {
        return "thread";
    }
    return "other";
}

// Variables globales pour le scroll infini des membres
let currentMemberIndex = 0;
let allMembersData = [];
let isLoadingMembers = false;
const MEMBERS_BATCH_SIZE = 50;
let memberStatusUpdateInterval = null;
// Stockage local des états de chargement (en mémoire seulement)
let memberLoadingState = {
    roleGroups: {},
};

// Fonction pour basculer la visibilité de la sidebar des membres
function toggleMembersSidebar() {
    const membersSidebar = document.querySelector(".members-sidebar");
    const toggleBtn = document.getElementById("members-toggle-btn");

    if (membersSidebar && toggleBtn) {
        membersSidebar.classList.toggle("hidden");
        toggleBtn.classList.toggle("active");
    }
}

// Fonction pour mettre à jour les statuts des membres visibles
async function updateMemberStatuses() {
    try {
        const response = await fetch("/api/members");
        if (!response.ok) return;

        const data = await response.json();
        const guildId = discordData.guild.id;
        const guildMembers = data.members?.[guildId] || {};

        // Mettre à jour les statuts des membres visibles dans le DOM
        document.querySelectorAll(".member-item").forEach((memberItem) => {
            const avatar = memberItem.querySelector(".member-avatar");
            if (!avatar) return;

            // Extraire l'ID du membre depuis l'avatar URL
            const avatarSrc = avatar.src;
            const userIdMatch = avatarSrc.match(/avatars\/(\d+)\//);
            if (!userIdMatch) return;

            const userId = userIdMatch[1];
            const member = guildMembers[userId];
            if (!member || !member.presence) return;

            // Mettre à jour l'icône de statut
            const statusIcon = memberItem.querySelector(".member-status-icon");
            if (statusIcon) {
                const status = member.presence.status || "offline";
                const statusIconMap = {
                    online: "OnlineStatus.png",
                    idle: "IdleStatus.png",
                    dnd: "DoNotDisturbStatus.png",
                    offline: "OfflineStatus.png",
                };
                statusIcon.src = `assets/${statusIconMap[status] || "OfflineStatus.png"}`;
            }
        });
    } catch (error) {
        console.error("❌ Erreur mise à jour statuts:", error);
    }
}

// Charger les membres organisés par rôles avec scroll infini
async function loadMembers() {
    console.log("🔄 Chargement de la liste des membres...");
    const membersContainer = document.getElementById("membersContainer");
    if (!membersContainer) return;

    const guildId = discordData?.guild?.id;
    if (!guildId) {
        console.warn("⚠️ Guild ID non disponible");
        return;
    }

    // Démarrer le scan périodique des statuts (toutes les 30 secondes)
    if (memberStatusUpdateInterval) {
        clearInterval(memberStatusUpdateInterval);
    }
    memberStatusUpdateInterval = setInterval(() => {
        console.log("🔄 Mise à jour périodique des statuts...");
        updateMemberStatuses();
    }, 30000); // 30 secondes

    try {
        const response = await fetch("/api/members");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const guildId = discordData.guild.id;

        // Récupérer les membres depuis la structure du fichier
        const guildMembers = data.members?.[guildId] || {};
        const guildRoleMembers = data.roleMembers?.[guildId] || {};
        const guildRolesRaw = data.roles?.[guildId] || {};

        // Normalize roles into a lookup map keyed by role id (some data sources return an array)
        const guildRoles = {};
        if (Array.isArray(guildRolesRaw)) {
            guildRolesRaw.forEach((r) => {
                if (r && r.id) guildRoles[r.id] = r;
            });
        } else if (typeof guildRolesRaw === "object") {
            // already an object keyed by id
            Object.assign(guildRoles, guildRolesRaw);
        }

        if (Object.keys(guildMembers).length === 0) {
            console.warn("⚠️ Aucun membre trouvé pour ce serveur");
            membersContainer.innerHTML =
                '<div class="no-members">Aucun membre trouvé</div>';
            return;
        }

        console.log(`👥 ${Object.keys(guildMembers).length} membres chargés`);

        // Convertir les membres en tableau avec leurs rôles
        const membersArray = Object.entries(guildMembers).map(
            ([userId, member]) => {
                const userRoles = guildRoleMembers[userId]?.roles || [];
                const roleObjects = userRoles
                    .map((roleId) => guildRoles[roleId])
                    .filter(Boolean);

                return {
                    ...member,
                    roles: roleObjects,
                };
            },
        );

        if (membersArray.length === 0) {
            console.warn("⚠️ Aucun membre à afficher");
            membersContainer.innerHTML =
                '<div class="no-members">Aucun membre trouvé</div>';
            return;
        }

        // Créer une map des positions des rôles pour le tri
        const rolePositions = new Map();
        if (discordData?.roles) {
            discordData.roles.forEach((role) => {
                rolePositions.set(role.id, role.position || 0);
            });
        }

        // Créer une structure pour regrouper les membres par rôle
        const membersByRole = new Map();

        membersArray.forEach((member) => {
            const memberRoles = member.roles || [];
            if (memberRoles.length === 0) {
                // Membres sans rôle assigné
                if (!membersByRole.has("no-role")) {
                    membersByRole.set("no-role", {
                        id: "no-role",
                        name: "Aucun rôle",
                        color: "#99aab5",
                        icon: null,
                        unicodeEmoji: null,
                        members: [],
                    });
                }
                membersByRole.get("no-role").members.push(member);
                return;
            }

            // Trier les rôles du membre par position (plus élevé d'abord)
            const sortedMemberRoles = memberRoles
                .slice() // Copie pour ne pas modifier l'original
                .sort(
                    (a, b) =>
                        (rolePositions.get(b.id) || 0) -
                        (rolePositions.get(a.id) || 0),
                );

            // Utiliser le rôle le plus élevé trouvé
            const highestRole = sortedMemberRoles[0];
            if (highestRole) {
                if (!membersByRole.has(highestRole.id)) {
                    membersByRole.set(highestRole.id, {
                        id: highestRole.id,
                        name: highestRole.name,
                        color: highestRole.color,
                        icon: highestRole.icon,
                        unicodeEmoji: highestRole.unicodeEmoji,
                        members: [],
                    });
                }
                membersByRole.get(highestRole.id).members.push(member);
            }
        });

        // Convertir la map en tableau et trier par position de rôle (plus élevé d'abord)
        const sortedRoles = Array.from(membersByRole.values()).sort((a, b) => {
            const posA =
                rolePositions.get(
                    discordData.roles.find((r) => r.id === a.id)?.id,
                ) || -1;
            const posB =
                rolePositions.get(
                    discordData.roles.find((r) => r.id === b.id)?.id,
                ) || -1;
            // Gérer le cas "No Role" pour qu'il soit en bas
            if (a.name === "No Role") return 1;
            if (b.name === "No Role") return -1;
            return posB - posA;
        });

        // Stocker toutes les données pour la virtualisation
        window.allMembersData = sortedRoles;

        // Arrêter tout chargement progressif en cours
        if (window.memberLoadInterval) {
            clearInterval(window.memberLoadInterval);
        }

        // Afficher les membres groupés par rôle
        membersContainer.innerHTML = "";
        const fragment = document.createDocumentFragment();

        // Compteur global de membres à charger progressivement
        let totalMembersToLoad = 0;
        const memberLoadQueue = [];

        sortedRoles.forEach((roleData) => {
            // Créer le header du groupe de rôle
            const roleGroup = document.createElement("div");
            roleGroup.className = "member-role-group";
            roleGroup.id = `role-group-${roleData.id || "no-role"}`;

            const roleHeader = document.createElement("div");
            roleHeader.className = "member-role-header";

            // Icône du rôle si disponible
            let roleIconHtml = "";
            if (roleData.icon) {
                roleIconHtml = `<img src="${roleData.icon}" alt="${roleData.name}" class="member-role-icon">`;
            } else if (roleData.unicodeEmoji) {
                roleIconHtml = `<span class="member-role-emoji">${roleData.unicodeEmoji}</span>`;
            }

            const roleColorHeader = roleData.color || "#99aab5";
            roleHeader.innerHTML = `
                ${roleIconHtml}
                <span style="color: ${roleColorHeader}">${roleData.name}</span>
                <span class="member-count">— ${roleData.members.length}</span>
            `;

            roleGroup.appendChild(roleHeader);

            // Trier les membres alphabétiquement dans ce rôle
            const sortedMembers = roleData.members.sort((a, b) =>
                (a.displayName || a.username).localeCompare(
                    b.displayName || b.username,
                ),
            );

            // Afficher immédiatement les 20 premiers membres
            const initialBatchSize = 20;
            const initialMembers = sortedMembers.slice(0, initialBatchSize);
            initialMembers.forEach((member) => {
                const memberDiv = createMemberElement(member, roleData);
                roleGroup.appendChild(memberDiv);
            });

            // Ajouter les membres restants à la file d'attente
            if (sortedMembers.length > initialBatchSize) {
                const remainingMembers = sortedMembers.slice(initialBatchSize);
                memberLoadQueue.push({
                    roleGroupId: roleGroup.id,
                    roleData: roleData,
                    members: remainingMembers,
                });
                totalMembersToLoad += remainingMembers.length;
            }

            fragment.appendChild(roleGroup);
        });

        membersContainer.appendChild(fragment);
        console.log(`✅ ${sortedRoles.length} groupes de rôles affichés`);

        // Chargement progressif automatique: 100 membres par seconde
        if (totalMembersToLoad > 0) {
            console.log(
                `📥 Chargement progressif: ${totalMembersToLoad} membres restants`,
            );

            window.memberLoadInterval = setInterval(() => {
                const batchSize = 100;
                let loadedInBatch = 0;

                // Charger jusqu'à 100 membres depuis la file d'attente
                while (
                    loadedInBatch < batchSize &&
                    memberLoadQueue.length > 0
                ) {
                    const currentRoleQueue = memberLoadQueue[0];
                    const roleGroup = document.getElementById(
                        currentRoleQueue.roleGroupId,
                    );

                    if (!roleGroup) {
                        memberLoadQueue.shift();
                        continue;
                    }

                    // Charger autant de membres que possible pour atteindre 100
                    const membersToLoad = Math.min(
                        batchSize - loadedInBatch,
                        currentRoleQueue.members.length,
                    );

                    const membersFragment = document.createDocumentFragment();
                    for (let i = 0; i < membersToLoad; i++) {
                        const member = currentRoleQueue.members.shift();
                        const memberDiv = createMemberElement(
                            member,
                            currentRoleQueue.roleData,
                        );
                        membersFragment.appendChild(memberDiv);
                        loadedInBatch++;
                    }

                    roleGroup.appendChild(membersFragment);

                    // Si tous les membres de ce rôle ont été chargés, passer au suivant
                    if (currentRoleQueue.members.length === 0) {
                        memberLoadQueue.shift();
                    }
                }

                console.log(`📥 ${loadedInBatch} membres chargés`);

                // Si tous les membres sont chargés, arrêter l'intervalle
                if (memberLoadQueue.length === 0) {
                    clearInterval(window.memberLoadInterval);
                    console.log("✅ Tous les membres chargés");
                    // Scanner les statuts après chargement complet
                    setTimeout(() => updateMemberStatuses(), 500);
                }
            }, 1000); // 1 seconde par batch de 100
        }
    } catch (error) {
        console.error("❌ Erreur lors du chargement des membres:", error);
        membersContainer.innerHTML =
            '<div class="no-members">Erreur de chargement</div>';
    }
}

// Gérer le scroll pour charger plus de membres
function handleMembersScroll(event) {
    const membersContainer = event.target;

    // Si on est proche du bas (200px), charger plus de membres
    if (
        membersContainer.scrollHeight -
            membersContainer.scrollTop -
            membersContainer.clientHeight <
            200 &&
        !isLoadingMembers
    ) {
        loadMoreMembers();
    }
}

// Fonction pour créer l'élément d'un membre
function createMemberElement(member, roleData) {
    const memberDiv = document.createElement("div");
    memberDiv.className = "member-item";

    // Récupérer le vrai statut du membre depuis presence
    const status = member.presence?.status || member.status || "offline";
    const statusIcon =
        status === "online"
            ? "OnlineStatus.png"
            : status === "idle"
              ? "IdleStatus.png"
              : status === "dnd"
                ? "DoNotDisturbStatus.png"
                : "OfflineStatus.png";

    // Résoudre l'URL de l'avatar en prenant en charge plusieurs schémas de données
    const avatarCandidates = [
        member.avatar_url,
        member.avatar,
        member.avatarURL,
        member.avatarUrl,
        member.displayAvatarURL,
        member.display_avatar,
        member.user?.avatar,
        member.user?.avatar_url,
        member.user?.avatarURL,
    ];
    const avatarSrc = avatarCandidates.find((v) => v && typeof v === "string") || "https://cdn.discordapp.com/embed/avatars/0.png";

    // Nom d'affichage
    const displayName = member.displayName || member.display_name || member.username || (member.user && (member.user.username || member.user.name)) || "Unknown";

    // Créer le HTML de base
    memberDiv.innerHTML = `
        <div class="member-avatar-wrapper">
            <img src="${avatarSrc}"
                 alt="${displayName}"
                 class="member-avatar"
                 loading="lazy"
                 onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            <img src="assets/${statusIcon}" alt="${status}" class="member-status-icon">
        </div>
        <div class="member-info">
            <div class="member-name">${displayName}</div>
        </div>
    `;

    // Appliquer le style de couleur après création du DOM — utiliser la même logique que l'éditeur de rôle
    const memberNameElement = memberDiv.querySelector(".member-name");
    if (memberNameElement) {
        try {
            const props = getRoleStyleProps(roleData);
            if (props.effectiveStyle === 'gradient') {
                memberNameElement.style.setProperty('background', `linear-gradient(90deg, ${props.primary} 0%, ${props.secondary} 100%)`, 'important');
                memberNameElement.style.setProperty('background-clip', 'text', 'important');
                memberNameElement.style.setProperty('-webkit-background-clip', 'text', 'important');
                memberNameElement.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                memberNameElement.style.setProperty('color', 'transparent', 'important');
                memberNameElement.style.setProperty('background-size', '200% 100%', 'important');
            } else if (props.effectiveStyle === 'holographic') {
                memberNameElement.style.setProperty('background', 'linear-gradient(90deg, #ff73fa 0%, #b968c7 20%, #00d4aa 40%, #00ffff 60%, #b968c7 80%, #ff73fa 100%)', 'important');
                memberNameElement.style.setProperty('background-clip', 'text', 'important');
                memberNameElement.style.setProperty('-webkit-background-clip', 'text', 'important');
                memberNameElement.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                memberNameElement.style.setProperty('color', 'transparent', 'important');
                memberNameElement.style.setProperty('background-size', '300% 100%', 'important');
            } else {
                const c = props.solidColor || '#99aab5';
                memberNameElement.style.setProperty('background', `linear-gradient(90deg, ${c} 0%, ${c} 100%)`, 'important');
                memberNameElement.style.setProperty('background-clip', 'text', 'important');
                memberNameElement.style.setProperty('-webkit-background-clip', 'text', 'important');
                memberNameElement.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                memberNameElement.style.setProperty('color', 'transparent', 'important');
                memberNameElement.style.setProperty('background-size', '100% 100%', 'important');
            }
        } catch (e) {
            console.warn('Erreur application style membre:', e);
        }
    }

    return memberDiv;
}

// Fonction pour charger plus de membres (virtualisation progressive)
function loadMoreMembers() {
    if (isLoadingMembers) return;

    const membersContainer = document.getElementById("membersContainer");
    if (!membersContainer || !window.allMembersData) {
        console.warn("⚠️ Container ou données manquantes");
        return;
    }

    isLoadingMembers = true;

    let membersAdded = 0;

    // Pour chaque groupe de rôle visible
    const roleGroups = membersContainer.querySelectorAll(".member-role-group");

    roleGroups.forEach((roleGroup) => {
        const roleId = roleGroup.id.replace("role-group-", "");
        const currentDisplayed =
            roleGroup.querySelectorAll(".member-item").length;

        // Trouver les données de ce rôle dans window.allMembersData
        const roleData = window.allMembersData.find(
            (r) => String(r.id || "no-role") === String(roleId),
        );

        if (!roleData) {
            return;
        }

        const totalMembers = roleData.members.length;

        // Vérifier si tous les membres sont déjà affichés
        if (currentDisplayed >= totalMembers) {
            // Marquer ce groupe comme complètement chargé (en mémoire)
            if (!memberLoadingState.roleGroups[roleId]) {
                memberLoadingState.roleGroups[roleId] = {};
            }
            memberLoadingState.roleGroups[roleId].fullyLoaded = true;
            return;
        }

        // Ne pas charger si déjà marqué comme complètement chargé
        if (memberLoadingState.roleGroups[roleId]?.fullyLoaded) {
            return;
        }

        // Charger les prochains membres (par batch)
        const batchSize = 20;
        const endIndex = Math.min(currentDisplayed + batchSize, totalMembers);

        console.log(
            `📥 ${roleData.name}: Chargement ${currentDisplayed} à ${endIndex} sur ${totalMembers}`,
        );

        for (let i = currentDisplayed; i < endIndex; i++) {
            const member = roleData.members[i];
            const memberDiv = createMemberElement(member, roleData);
            roleGroup.appendChild(memberDiv);
            membersAdded++;
        }

        // Mettre à jour le compteur en mémoire
        if (!memberLoadingState.roleGroups[roleId]) {
            memberLoadingState.roleGroups[roleId] = {};
        }
        memberLoadingState.roleGroups[roleId].loaded = endIndex;
        memberLoadingState.roleGroups[roleId].total = totalMembers;

        // Si tout est chargé, marquer comme complet
        if (endIndex >= totalMembers) {
            memberLoadingState.roleGroups[roleId].fullyLoaded = true;
        }

        // Mettre à jour le compteur (afficher le total réel)
        const countElement = roleGroup.querySelector(".member-count");
        if (countElement) {
            countElement.textContent = `— ${totalMembers}`;
        }
    });

    if (membersAdded > 0) {
        console.log(`✅ ${membersAdded} membres ajoutés progressivement`);
        // Scanner les statuts après chargement
        setTimeout(() => updateMemberStatuses(), 500);
    }

    isLoadingMembers = false;
}

// Toggle de la sidebar des membres (dans DOMContentLoaded)
function initMembersToggle() {
    const membersToggleBtn = document.getElementById("members-toggle-btn");
    const membersSidebar = document.querySelector(".members-sidebar");

    if (membersToggleBtn && membersSidebar) {
        // Par défaut, le bouton est actif (sidebar visible)
        membersToggleBtn.classList.add("active");

        membersToggleBtn.addEventListener("click", function () {
            membersSidebar.classList.toggle("hidden");
            this.classList.toggle("active");
        });
    }
}

// Fonction pour mettre à jour le header du serveur
function updateServerHeader(guild) {
    if (!guild) {
        console.warn("⚠️ Aucune donnée de guild fournie");
        return;
    }

    const serverHeader = document.querySelector(".server-header h3");
    if (serverHeader) {
        serverHeader.textContent = guild.name || "Serveur inconnu";
        // console.log(`✅ Header mis à jour: ${guild.name}`);
    }

    // Mettre à jour le titre de la catégorie dans les paramètres
    const serverCategoryTitle = document.getElementById("serverCategoryTitle");
    if (serverCategoryTitle) {
        serverCategoryTitle.textContent =
            guild.name?.toUpperCase() || "SERVEUR INCONNU";
    }

    // Mettre à jour l'icône du serveur dans la sidebar
    const serverIcon = document.querySelector(".server-icon.active");
    if (serverIcon && guild.icon) {
        serverIcon.style.backgroundImage = `url("${guild.icon}")`;
        serverIcon.style.backgroundSize = "cover";
        serverIcon.style.backgroundPosition = "center";
        serverIcon.textContent = "";
    } else if (serverIcon) {
        // Utiliser la première lettre du nom du serveur si pas d'icône
        serverIcon.textContent = guild.name
            ? guild.name.charAt(0).toUpperCase()
            : "S";
        serverIcon.style.backgroundImage = "none";
    }
}

// Fonction pour mettre à jour la bannière du serveur
function updateServerBanner(guild) {
    if (!guild) {
        console.warn("⚠️ Aucune donnée de guild fournie pour la bannière");
        return;
    }

    // Supprimer l'ancienne bannière s'elle existe
    let existingBanner = document.querySelector(".server-banner");
    if (existingBanner) {
        existingBanner.remove();
    }

    if (guild.banner) {
        // Créer la nouvelle bannière
        const bannerDiv = document.createElement("div");
        bannerDiv.className = "server-banner";
        bannerDiv.innerHTML = `<img src="${guild.banner}" alt="Server Banner">`;

        // Insérer après le header
        const serverHeader = document.querySelector(".server-header");
        if (serverHeader) {
            serverHeader.insertAdjacentElement("afterend", bannerDiv);
        }
        // console.log(`✅ Bannière mise à jour: ${guild.banner}`);
    } else {
        // Retirer classe has-banner s'il n'y a pas de bannière
        const channelsSidebar = document.querySelector(".channels-sidebar");
        if (channelsSidebar) {
            channelsSidebar.classList.remove("has-banner");
        }
    }
}

// État des catégories (ouvertes/fermées)
let categoryStates = {};

function toggleCategory(categoryId) {
    const channelList = document.getElementById(`channels-${categoryId}`);
    const categoryHeader = event.target.closest(".category-header");
    const arrow = categoryHeader.querySelector(".category-arrow");

    if (channelList) {
        const isCollapsed = channelList.style.display === "none";
        const newState = isCollapsed ? "open" : "closed";

        // Sauvegarder l'état
        categoryStates[categoryId] = newState;

        channelList.style.display = isCollapsed ? "block" : "none";

        // Rotation de la flèche
        if (arrow) {
            arrow.style.transform = isCollapsed
                ? "rotate(90deg)"
                : "rotate(0deg)";
        }

        console.log(
            `📁 Catégorie ${categoryId} ${isCollapsed ? "ouverte" : "fermée"}`,
        );
    }
}

// Initialisation
document.addEventListener("DOMContentLoaded", async function () {
    console.log("Discord clone initialized");

    // Initialiser le toggle des membres
    initMembersToggle();

    // Charger les données initiales
    loadDiscordData();

    // Rafraîchir les données toutes les 30 secondes (réduit la fréquence)
    setInterval(loadDiscordData, 30000);

    // Connexion aux événements en temps réel
    connectToRealTimeEvents();

    // Optimisation: précharger les images importantes
    if (discordData && discordData.guild) {
        if (discordData.guild.icon) {
            const iconImg = new Image();
            iconImg.src = discordData.guild.icon;
        }
        if (discordData.guild.banner) {
            const bannerImg = new Image();
            bannerImg.src = discordData.guild.banner;
        }
    }
    try {
        // Charger l'interface du collecteur de messages depuis l'API
        const script = document.createElement("script");
        script.src = "/api/message-collector-interface";
        script.onload = function () {
            console.log("✅ Interface du collecteur de messages chargée");
        };
        script.onerror = function () {
            console.error(
                "❌ Erreur lors du chargement de l'interface du collecteur",
            );
        };
        document.head.appendChild(script);
    } catch (error) {
        console.error("❌ Erreur lors du chargement de l'interface:", error);
    }
});

// Connexion aux événements en temps réel
function connectToRealTimeEvents() {
    if (typeof EventSource === "undefined") {
        console.warn("⚠️ EventSource non supporté par ce navigateur");
        return;
    }

    const eventSource = new EventSource("/api/events");

    eventSource.onopen = function () {
        console.log(
            "✅ Connexion temps réel établie pour les nouveaux messages",
        );
    };

    eventSource.onmessage = function (event) {
        try {
            if (!event || !event.data) {
                console.warn("⚠️ Événement sans données reçu");
                return;
            }

            const data = JSON.parse(event.data);

            if (data.type === "newMessage" && data.channelId && data.message) {
                // Vérifier que le message a les données nécessaires
                if (
                    !data.message.meta_data ||
                    !data.message.meta_data.avatar_url
                ) {
                    console.warn("⚠️ Message incomplet reçu, ignoré");
                    return;
                }

                // Si on a tous les messages, recharger tout l'historique du canal
                if (
                    data.allMessages &&
                    data.allMessages.length > 0 &&
                    typeof window !== "undefined" &&
                    window.currentSelectedChannelId === data.channelId
                ) {
                    reloadAllChannelMessages(data.channelId, data.allMessages);
                } else if (
                    typeof window !== "undefined" &&
                    window.currentSelectedChannelId === data.channelId
                ) {
                    // Sinon, juste ajouter le nouveau message (comportement par défaut)
                    addNewMessage(data.channelId, data.message);
                }

                // Mettre à jour l'indicateur de nouveaux messages sur le canal
                updateChannelNewMessageIndicator(data.channelId);
            }
        } catch (error) {
            console.error(
                "❌ Erreur lors du traitement de l'événement:",
                error.message,
            );
        }
    };

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    eventSource.onerror = function (error) {
        console.warn("⚠️ Connexion temps réel interrompue");
        eventSource.close();

        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(
                1000 * Math.pow(2, reconnectAttempts),
                30000,
            );
            console.log(
                `🔄 Reconnexion dans ${delay / 1000}s (tentative ${reconnectAttempts}/${maxReconnectAttempts})`,
            );
            setTimeout(function () {
                connectToRealTimeEvents();
            }, delay);
        } else {
            console.error(
                "❌ Nombre maximum de tentatives de reconnexion atteint",
            );
        }
    };
}

// Recharger TOUS les messages du canal en temps réel
function reloadAllChannelMessages(channelId, allMessages) {
    if (typeof window === "undefined" || typeof document === "undefined")
        return;

    // Si le canal est sélectionné, recharger tous les messages
    if (window.currentSelectedChannelId === channelId) {
        const chatMessages = document.querySelector(".chat-messages");
        if (chatMessages) {
            // Vider le conteneur et recharger tous les messages
            chatMessages.innerHTML = "";

            // Ajouter chaque message
            allMessages.forEach((message) => {
                const messageDiv = createMessageElement(message);
                chatMessages.appendChild(messageDiv);
            });

            // Faire défiler vers le bas
            chatMessages.scrollTop = chatMessages.scrollHeight;

            console.log(
                `🔄 ${allMessages.length} messages rechargés pour #${channelId}`,
            );
        }
    }
}

// Ajouter un nouveau message en temps réel
function addNewMessage(channelId, message) {
    if (typeof window === "undefined" || typeof document === "undefined")
        return;

    // Si le canal est sélectionné, ajouter le message à l'interface
    if (window.currentSelectedChannelId === channelId) {
        const chatMessages = document.querySelector(".chat-messages");
        if (chatMessages) {
            const messageDiv = createMessageElement(message);
            chatMessages.appendChild(messageDiv);

            // Faire défiler vers le bas
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }
}

// Fonction pour mettre à jour l'indicateur de nouveaux messages sur un canal
function updateChannelNewMessageIndicator(channelId) {
    const channelElement = document.querySelector(
        `.channel-item[data-channel-id="${channelId}"]`,
    );
    if (
        channelElement &&
        !channelElement.classList.contains("active") &&
        !channelElement.classList.contains("has-messages")
    ) {
        channelElement.classList.add("has-messages");
        console.log(
            `🔵 Indicateur de nouveaux messages ajouté au canal ${channelId}`,
        );

        // Ajouter un point pour les messages non lus
        const messageIndicator = document.createElement("span");
        messageIndicator.className = "message-indicator";
        messageIndicator.innerHTML = "•";
        channelElement.appendChild(messageIndicator);
    }
}

// Écouter les nouveaux messages en temps réel
function listenForNewMessages() {
    const eventSource = new EventSource("/api/events");

    eventSource.addEventListener("message", (event) => {
        try {
            const data = JSON.parse(event.data);

            if (
                data.type === "newMessage" &&
                window.currentChannelId === data.channelId
            ) {
                // Ajouter le nouveau message au chat
                const chatMessages = document.querySelector(".chat-messages");
                if (chatMessages) {
                    const messageDiv = createMessageElement(data.message);
                    chatMessages.appendChild(messageDiv);

                    // Auto-scroll si on est proche du bas
                    const isNearBottom =
                        chatMessages.scrollHeight -
                            chatMessages.scrollTop -
                            chatMessages.clientHeight <
                        100;
                    if (isNearBottom) {
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                }
            }
        } catch (error) {
            console.error("Erreur traitement nouveau message:", error);
        }
    });

    eventSource.addEventListener("error", (error) => {
        console.warn("Connexion SSE perdue, reconnexion...");
        // Note: La reconnexion automatique est gérée par le navigateur pour EventSource
    });
}
