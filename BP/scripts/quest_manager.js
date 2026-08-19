/**
 * quest_manager.js — Quest Tracking & Auto-detection
 *
 * Mendengarkan event kill, mengecek inventory & lokasi secara
 * periodik, dan menyediakan Quest Tracker GUI untuk player.
 */

import { world, system } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import * as db from "./database.js";

// ── Objective labels for display ───────────────────────────────
const OBJ_LABELS = {
    kill_entity:    "Bunuh",
    collect_item:   "Kumpulkan",
    talk_to:        "Bicara dengan",
    go_to_location: "Pergi ke",
    escort:         "Kawal"
};

// ================================================================
//  Public — Bootstrap event listeners
// ================================================================

export function initQuestTracking() {
    // ── Kill tracking ──────────────────────────────────────────
    world.afterEvents.entityDie.subscribe((event) => {
        try {
            const killer = event.damageSource?.damagingEntity;
            if (!killer || killer.typeId !== "minecraft:player") return;
            updateKillProgress(killer, event.deadEntity.typeId);
        } catch {
            // Entity might already be removed — ignore
        }
    });

    // ── Periodic checks (collect_item & go_to_location) ────────
    system.runInterval(() => {
        for (const player of world.getAllPlayers()) {
            try {
                checkCollectItemProgress(player);
                checkLocationProgress(player);
            } catch {
                // Silent fail per player
            }
        }
    }, 60); // every 3 seconds
}

// ================================================================
//  Public — Talk-to objective helper
// ================================================================

/**
 * Dipanggil oleh dialog_system saat player bicara ke NPC.
 */
export function checkTalkToProgress(player, npcName) {
    const playerData = db.getPlayerData(player);
    let updated = false;

    for (const [questId, progress] of Object.entries(playerData.activeQuests)) {
        if (progress.status !== "in_progress") continue;

        const quest = db.getQuest(questId);
        if (!quest || quest.objectiveType !== "talk_to") continue;
        if (quest.target !== npcName) continue;

        progress.progress = (progress.progress || 0) + 1;

        if (progress.progress >= quest.targetCount) {
            progress.status = "ready_to_complete";
            player.sendMessage(`§a§l✦ Quest "${quest.title}" selesai! §r§7Kembali ke NPC pemberi quest.`);
            try { player.onScreenDisplay.setActionBar(`§a✔ ${quest.title}: Selesai!`); } catch {}
        }
        updated = true;
    }

    if (updated) db.setPlayerData(player, playerData);
}

// ================================================================
//  Kill Progress
// ================================================================

function updateKillProgress(player, killedType) {
    const playerData = db.getPlayerData(player);
    let updated = false;

    for (const [questId, progress] of Object.entries(playerData.activeQuests)) {
        if (progress.status !== "in_progress") continue;

        const quest = db.getQuest(questId);
        if (!quest || quest.objectiveType !== "kill_entity") continue;
        
        const tClean = quest.target.replace("minecraft:", "").toLowerCase();
        const kClean = killedType.replace("minecraft:", "").toLowerCase();
        if (tClean !== kClean) continue;

        progress.progress = (progress.progress || 0) + 1;

        if (progress.progress >= quest.targetCount) {
            progress.status = "ready_to_complete";
            player.sendMessage(`§a§l✦ Quest "${quest.title}" selesai! §r§7Kembali ke NPC untuk klaim hadiah.`);
            try { player.onScreenDisplay.setActionBar(`§a✔ ${quest.title}: Selesai! Kembali ke NPC.`); } catch {}
        } else {
            try { player.onScreenDisplay.setActionBar(`§e${quest.title}: §f${progress.progress}/${quest.targetCount}`); } catch {}
        }
        updated = true;
    }

    if (updated) db.setPlayerData(player, playerData);
}

// ================================================================
//  Collect-item Progress
// ================================================================

function checkCollectItemProgress(player) {
    const playerData = db.getPlayerData(player);
    let updated = false;

    const inventory = player.getComponent("minecraft:inventory");
    if (!inventory || !inventory.container) return;

    for (const [questId, progress] of Object.entries(playerData.activeQuests)) {
        if (progress.status !== "in_progress") continue;

        const quest = db.getQuest(questId);
        if (!quest || quest.objectiveType !== "collect_item") continue;

        // Count matching items in inventory
        let count = 0;
        const container = inventory.container;
        const tClean = quest.target.replace("minecraft:", "").toLowerCase();

        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i);
            if (item) {
                const iClean = item.typeId.replace("minecraft:", "").toLowerCase();
                if (iClean === tClean) {
                    count += item.amount;
                }
            }
        }

        const oldProgress = progress.progress || 0;
        progress.progress = Math.min(count, quest.targetCount);

        if (progress.progress !== oldProgress) {
            updated = true;
            if (progress.progress >= quest.targetCount) {
                progress.status = "ready_to_complete";
                player.sendMessage(`§a§l✦ Quest "${quest.title}" selesai! §r§7Kembali ke NPC untuk klaim hadiah.`);
                try { player.onScreenDisplay.setActionBar(`§a✔ ${quest.title}: Selesai!`); } catch {}
            } else if (progress.progress > oldProgress) {
                try { player.onScreenDisplay.setActionBar(`§e${quest.title}: §f${progress.progress}/${quest.targetCount}`); } catch {}
            }
        }
    }

    if (updated) db.setPlayerData(player, playerData);
}

// ================================================================
//  Location Progress
// ================================================================

function checkLocationProgress(player) {
    const playerData = db.getPlayerData(player);
    let updated = false;

    for (const [questId, progress] of Object.entries(playerData.activeQuests)) {
        if (progress.status !== "in_progress") continue;

        const quest = db.getQuest(questId);
        if (!quest || quest.objectiveType !== "go_to_location") continue;

        // Target format: "x,y,z,radius"  e.g.  "100,64,-200,10"
        const parts = quest.target.split(",").map(s => s.trim());
        if (parts.length < 3) continue;

        const tx     = parseFloat(parts[0]);
        const ty     = parseFloat(parts[1]);
        const tz     = parseFloat(parts[2]);
        const radius = parseFloat(parts[3]) || 5;

        const loc = player.location;
        const dx  = loc.x - tx;
        const dy  = loc.y - ty;
        const dz  = loc.z - tz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist <= radius) {
            progress.progress = quest.targetCount;
            progress.status   = "ready_to_complete";
            updated = true;
            player.sendMessage(`§a§l✦ Quest "${quest.title}" selesai! §r§7Lokasi tercapai!`);
            try { player.onScreenDisplay.setActionBar(`§a✔ ${quest.title}: Lokasi tercapai!`); } catch {}
        }
    }

    if (updated) db.setPlayerData(player, playerData);
}

// ================================================================
//  Public — Quest Tracker GUI
// ================================================================

export async function showQuestTracker(player) {
    const playerData    = db.getPlayerData(player);
    const activeIds     = Object.keys(playerData.activeQuests || {});
    const completedList = playerData.completedQuests || [];

    if (activeIds.length === 0 && completedList.length === 0) {
        const msg = new MessageFormData()
            .title("§l§e📋 Quest Tracker")
            .body("§7Kamu belum memiliki quest.\n\n§7Bicaralah dengan NPC untuk mendapatkan quest!")
            .button1("§lOK")
            .button2("§lKembali");
        await msg.show(player);
        return;
    }

    const form       = new ActionFormData().title("§l§e📋 Quest Tracker");
    const buttonData = [];

    // Active quests
    for (const qId of activeIds) {
        const quest    = db.getQuest(qId);
        const progress = playerData.activeQuests[qId];
        if (!quest) continue;

        const prog  = progress.progress || 0;
        const total = quest.targetCount || 1;
        const icon  = progress.status === "ready_to_complete" ? "§a✔" : "§e⚡";
        const text  = progress.status === "ready_to_complete" ? "Siap diklaim!" : `${prog}/${total}`;

        form.button(`${icon} §l${quest.title}\n§r§8${text}`);
        buttonData.push({ type: "active", questId: qId, quest, progress });
    }

    // Completed quests section
    if (completedList.length > 0) {
        form.button(`§l§8══ Quest Selesai (${completedList.length}) ══\n§r§8Tekan untuk melihat`);
        buttonData.push({ type: "completed_header" });
    }

    const res = await form.show(player);
    if (res.canceled) return;

    const sel = buttonData[res.selection];
    if (!sel) return;

    if (sel.type === "active") {
        await showActiveQuestDetail(player, sel.questId, sel.quest, sel.progress);
    } else if (sel.type === "completed_header") {
        await showCompletedQuests(player, playerData);
    }
}

// ================================================================
//  Active Quest Detail
// ================================================================

async function showActiveQuestDetail(player, questId, quest, progress) {
    const prog  = progress.progress || 0;
    const total = quest.targetCount || 1;
    const pct   = Math.floor((prog / total) * 100);

    // Progress bar
    const barLen = 20;
    const filled = Math.floor((prog / total) * barLen);
    const bar    = "§a" + "█".repeat(filled) + "§7" + "░".repeat(barLen - filled);

    const body =
        `§l§e${quest.title}\n\n` +
        `§r§f${quest.description}\n\n` +
        `§l§7Objective:\n` +
        `§r  ${OBJ_LABELS[quest.objectiveType] || quest.objectiveType}: §e${quest.target}\n\n` +
        `§l§7Progress:\n` +
        `  ${bar} §f${pct}%\n` +
        `  §e${prog} §f/ §e${total}\n\n` +
        `§l§7Status: §r${progress.status === "ready_to_complete" ? "§a✔ Siap diklaim!" : "§eSedang berjalan…"}`;

    const msg = new MessageFormData()
        .title("§l§eDetail Quest")
        .body(body)
        .button1("§lOK")
        .button2("§l§cAbandon Quest");

    const res = await msg.show(player);
    if (res.selection === 1) await abandonQuest(player, questId, quest);
}

// ================================================================
//  Abandon Quest
// ================================================================

async function abandonQuest(player, questId, quest) {
    const confirm = new MessageFormData()
        .title("§l§cAbandon Quest")
        .body(
            `§cApakah kamu yakin ingin membatalkan quest:\n\n` +
            `§e"${quest.title}"§c?\n\n§7Progress akan hilang.`
        )
        .button1("§l§cYa, Batalkan")
        .button2("§lTidak");

    const res = await confirm.show(player);
    if (res.selection === 0) {
        const playerData = db.getPlayerData(player);
        delete playerData.activeQuests[questId];
        db.setPlayerData(player, playerData);
        player.sendMessage(`§c✖ Quest "${quest.title}" telah dibatalkan.`);
    }
}

// ================================================================
//  Completed Quests
// ================================================================

async function showCompletedQuests(player, playerData) {
    let body = "";
    for (const qId of playerData.completedQuests) {
        const quest = db.getQuest(qId);
        body += quest
            ? `§a✔ §f${quest.title}\n§7  ${quest.description}\n\n`
            : `§a✔ §7Quest #${qId} (data dihapus)\n\n`;
    }

    const msg = new MessageFormData()
        .title(`§l§8Quest Selesai (${playerData.completedQuests.length})`)
        .body(body)
        .button1("§lOK")
        .button2("§lKembali ke Tracker");

    const res = await msg.show(player);
    if (res.selection === 1) await showQuestTracker(player);
}
