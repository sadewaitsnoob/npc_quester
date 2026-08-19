/**
 * database.js — Persistent Storage Layer
 *
 * Menyimpan dan mengambil data menggunakan Dynamic Properties:
 *   • NPC data   → disimpan di entity NPC itu sendiri
 *   • Quest data → disimpan di world
 *   • Player data → disimpan di player
 */

import { world } from "@minecraft/server";

// ── Key constants ──────────────────────────────────────────────
const QUEST_REGISTRY_KEY = "npcquest:quests";
const PLAYER_DATA_KEY    = "npcquest:playerdata";
const NPC_DATA_KEY       = "npcquest:data";

// ================================================================
//  NPC Data  (stored on each quest_npc entity)
// ================================================================

/**
 * Mengambil data NPC dari entity.
 * @param {import("@minecraft/server").Entity} entity
 * @returns {object|null}
 */
export function getNpcData(entity) {
    try {
        const raw = entity.getDynamicProperty(NPC_DATA_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Menyimpan data NPC ke entity.
 * @param {import("@minecraft/server").Entity} entity
 * @param {object} data
 */
export function setNpcData(entity, data) {
    entity.setDynamicProperty(NPC_DATA_KEY, JSON.stringify(data));
}

/**
 * Membuat data NPC default baru.
 * @param {string} name
 * @returns {object}
 */
export function createDefaultNpcData(name = "NPC") {
    return {
        name: name,
        skinVariant: 0,
        greeting: "Halo, ada yang bisa kubantu?",
        assignedQuests: [],
        dialogTree: {
            default: {
                pages: [
                    "Halo, selamat datang!",
                    "Ada yang bisa kubantu?"
                ],
                responses: [
                    { text: "Ada quest?", action: "show_quests" },
                    { text: "Tidak, terima kasih.", action: "close" }
                ]
            },
            quest_available: {
                pages: ["Aku punya tugas untukmu!"],
                responses: [
                    { text: "Aku siap!", action: "accept_quest" },
                    { text: "Nanti saja.", action: "close" }
                ]
            },
            quest_in_progress: {
                pages: ["Bagaimana progress tugasmu?"],
                responses: [
                    { text: "Masih dalam proses...", action: "close" }
                ]
            },
            quest_complete: {
                pages: [
                    "Kerja bagus! Terima kasih atas bantuanmu!",
                    "Ini hadiahmu."
                ],
                responses: [
                    { text: "Terima kasih!", action: "claim_reward" }
                ]
            }
        }
    };
}

// ================================================================
//  Quest Registry  (stored on world)
// ================================================================

/**
 * Mengambil semua quest yang terdaftar.
 * @returns {object}
 */
export function getAllQuests() {
    try {
        const raw = world.getDynamicProperty(QUEST_REGISTRY_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/**
 * Mengambil satu quest berdasarkan ID.
 * @param {string} questId
 * @returns {object|null}
 */
export function getQuest(questId) {
    const quests = getAllQuests();
    return quests[questId] || null;
}

/**
 * Menyimpan atau meng-update sebuah quest.
 * @param {string} questId
 * @param {object} questData
 */
export function saveQuest(questId, questData) {
    const quests = getAllQuests();
    quests[questId] = questData;
    world.setDynamicProperty(QUEST_REGISTRY_KEY, JSON.stringify(quests));
}

/**
 * Menghapus sebuah quest dari registry.
 * @param {string} questId
 */
export function deleteQuest(questId) {
    const quests = getAllQuests();
    delete quests[questId];
    world.setDynamicProperty(QUEST_REGISTRY_KEY, JSON.stringify(quests));
}

/**
 * Membersihkan referensi quest yang sudah dihapus dari semua NPC entities.
 * @param {string} questId
 * @param {import("@minecraft/server").Entity[]} npcEntities
 */
export function cleanupQuestFromNpcs(questId, npcEntities) {
    for (const entity of npcEntities) {
        try {
            const data = getNpcData(entity);
            if (!data) continue;
            const before = data.assignedQuests.length;
            data.assignedQuests = data.assignedQuests.filter(id => id !== questId);
            if (data.assignedQuests.length !== before) {
                setNpcData(entity, data);
            }
        } catch {
            // Entity tidak valid — skip
        }
    }
}

/**
 * Membersihkan referensi quest yang sudah dihapus dari data semua player.
 * @param {string} questId
 * @param {import("@minecraft/server").Player[]} players
 */
export function cleanupQuestFromPlayers(questId, players) {
    for (const player of players) {
        try {
            const data = getPlayerData(player);
            let dirty = false;

            if (questId in data.activeQuests) {
                delete data.activeQuests[questId];
                dirty = true;
            }

            const cidx = data.completedQuests.indexOf(questId);
            if (cidx !== -1) {
                data.completedQuests.splice(cidx, 1);
                dirty = true;
            }

            if (dirty) setPlayerData(player, data);
        } catch {
            // Player tidak valid — skip
        }
    }
}

/**
 * Generate unique quest ID.
 * @returns {string}
 */
export function generateQuestId() {
    return "quest_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 5);
}

// ================================================================
//  Player Quest Data  (stored on each player)
// ================================================================

/**
 * Mengambil data quest milik player.
 * @param {import("@minecraft/server").Player} player
 * @returns {{ activeQuests: object, completedQuests: string[] }}
 */
export function getPlayerData(player) {
    try {
        const raw = player.getDynamicProperty(PLAYER_DATA_KEY);
        if (!raw) return { activeQuests: {}, completedQuests: [] };
        return JSON.parse(raw);
    } catch {
        return { activeQuests: {}, completedQuests: [] };
    }
}

/**
 * Menyimpan data quest milik player.
 * @param {import("@minecraft/server").Player} player
 * @param {object} data
 */
export function setPlayerData(player, data) {
    player.setDynamicProperty(PLAYER_DATA_KEY, JSON.stringify(data));
}

/**
 * Cek apakah player sudah menyelesaikan quest tertentu.
 * @param {import("@minecraft/server").Player} player
 * @param {string} questId
 * @returns {boolean}
 */
export function isQuestCompleted(player, questId) {
    const data = getPlayerData(player);
    return data.completedQuests.includes(questId);
}

/**
 * Cek apakah quest sedang aktif untuk player.
 * @param {import("@minecraft/server").Player} player
 * @param {string} questId
 * @returns {boolean}
 */
export function isQuestActive(player, questId) {
    const data = getPlayerData(player);
    return questId in data.activeQuests;
}

/**
 * Mengambil progress quest aktif milik player.
 * @param {import("@minecraft/server").Player} player
 * @param {string} questId
 * @returns {object|null}
 */
export function getActiveQuestProgress(player, questId) {
    const data = getPlayerData(player);
    return data.activeQuests[questId] || null;
}
