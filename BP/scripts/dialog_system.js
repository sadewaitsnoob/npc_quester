/**
 * dialog_system.js — Player ↔ NPC Dialog System
 *
 * Menampilkan dialog bertahap (halaman per halaman) berdasarkan
 * quest-state player.  Menangani aksi respon: show_quests,
 * accept_quest, claim_reward, dll.
 */

import { world, system } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import * as db from "./database.js";
import { checkTalkToProgress } from "./quest_manager.js";

// ── Objective labels for quest detail popup ────────────────────
const OBJ_LABELS = {
    kill_entity:    "Bunuh",
    collect_item:   "Kumpulkan",
    talk_to:        "Bicara dengan",
    go_to_location: "Pergi ke",
    escort:         "Kawal"
};

// ================================================================
//  Public — Handle interaction (player clicks NPC)
// ================================================================

export async function handleNpcInteraction(player, npcEntity) {
    const npcData = db.getNpcData(npcEntity);
    if (!npcData) return;

    // Track talk_to objectives
    checkTalkToProgress(player, npcData.name);

    const playerData  = db.getPlayerData(player);
    const dialogState = determineDialogState(npcData, playerData);
    const dialog      = npcData.dialogTree?.[dialogState];

    if (!dialog || !dialog.pages || dialog.pages.length === 0) {
        // Fallback: just send greeting as chat message
        player.sendMessage(`§b${npcData.name}§7: §f${npcData.greeting}`);
        return;
    }

    await showDialogPages(player, npcEntity, npcData, dialog, 0, playerData);
}

// ================================================================
//  Determine which dialog state to show
// ================================================================

function determineDialogState(npcData, playerData) {
    const assigned = npcData.assignedQuests;
    if (!assigned || assigned.length === 0) return "default";

    // 1) Any quest ready to claim?
    for (const qId of assigned) {
        const active = playerData.activeQuests?.[qId];
        if (active && active.status === "ready_to_complete") return "quest_complete";
    }

    // 2) Any quest in progress?
    for (const qId of assigned) {
        if (playerData.activeQuests?.[qId]) return "quest_in_progress";
    }

    // 3) Any quest available (not completed, not active, prerequisite met)?
    for (const qId of assigned) {
        if (playerData.completedQuests?.includes(qId)) continue;
        if (playerData.activeQuests?.[qId]) continue;

        const quest = db.getQuest(qId);
        if (!quest) continue;
        if (quest.prerequisite && !playerData.completedQuests?.includes(quest.prerequisite)) continue;

        return "quest_available";
    }

    return "default";
}

// ================================================================
//  Show dialog pages one by one
// ================================================================

async function showDialogPages(player, npcEntity, npcData, dialog, pageIdx, playerData) {
    const pages      = dialog.pages;
    const isLastPage = pageIdx >= pages.length - 1;

    if (isLastPage) {
        // ── Last page → show response buttons ─────────────────
        const form = new ActionFormData()
            .title(`§l§b${npcData.name}`)
            .body(`§f${pages[pageIdx]}`);

        const responses = dialog.responses?.length ? dialog.responses : [{ text: "OK", action: "close" }];
        for (const r of responses) form.button(`§l${r.text}`);

        const res = await form.show(player);
        if (res.canceled) return;

        const chosen = responses[res.selection];
        if (chosen) {
            await handleDialogAction(player, npcEntity, npcData, chosen.action, playerData);
        }
    } else {
        // ── Middle page → "Lanjutkan" ─────────────────────────
        const form = new ActionFormData()
            .title(`§l§b${npcData.name}`)
            .body(`§f${pages[pageIdx]}`)
            .button("§l§aLanjutkan ▸")
            .button("§7Tutup");

        const res = await form.show(player);
        if (res.canceled || res.selection === 1) return;

        await showDialogPages(player, npcEntity, npcData, dialog, pageIdx + 1, playerData);
    }
}

// ================================================================
//  Handle response action
// ================================================================

async function handleDialogAction(player, npcEntity, npcData, action, playerData) {
    switch (action) {
        case "close":
            break;
        case "show_quests":
            await showAvailableQuests(player, npcEntity, npcData, playerData);
            break;
        case "accept_quest":
            await acceptFirstAvailableQuest(player, npcEntity, npcData, playerData);
            break;
        case "claim_reward":
            await claimQuestReward(player, npcEntity, npcData, playerData);
            break;
        default:
            break;
    }
}

// ================================================================
//  Show available quests from this NPC
// ================================================================

async function showAvailableQuests(player, npcEntity, npcData, playerData) {
    const available = [];
    const active    = [];

    for (const qId of npcData.assignedQuests) {
        const quest = db.getQuest(qId);
        if (!quest) continue;

        if (playerData.activeQuests?.[qId]) {
            active.push({ id: qId, quest, progress: playerData.activeQuests[qId] });
        } else if (!playerData.completedQuests?.includes(qId)) {
            if (quest.prerequisite && !playerData.completedQuests?.includes(quest.prerequisite)) continue;
            available.push({ id: qId, quest });
        }
    }

    if (available.length === 0 && active.length === 0) {
        const msg = new MessageFormData()
            .title(`§l§6${npcData.name}`)
            .body("§7Tidak ada quest yang tersedia saat ini.")
            .button1("§lOK")
            .button2("§lKembali");
        await msg.show(player);
        return;
    }

    const form = new ActionFormData().title(`§l§6Quest dari ${npcData.name}`);
    const btns = [];

    for (const { id, quest } of available) {
        form.button(`§l§a✦ ${quest.title}\n§r§8${quest.description}`);
        btns.push({ type: "avail", id, quest });
    }

    for (const { id, quest, progress } of active) {
        const prog  = progress.progress || 0;
        const total = quest.targetCount || 1;
        const txt   = progress.status === "ready_to_complete" ? "§a✔ Selesai!" : `§e${prog}/${total}`;
        form.button(`§l§e⚡ ${quest.title}\n§r§8Progress: ${txt}`);
        btns.push({ type: "active", id, quest, progress });
    }

    const res = await form.show(player);
    if (res.canceled) return;

    const sel = btns[res.selection];
    if (!sel) return;

    if (sel.type === "avail") {
        await showQuestDetails(player, npcEntity, npcData, sel.id, sel.quest, playerData);
    } else if (sel.type === "active" && sel.progress.status === "ready_to_complete") {
        await claimSpecificReward(player, sel.id, sel.quest, playerData);
    } else if (sel.type === "active") {
        await showActiveQuestPopup(player, sel.quest, sel.progress);
    }
}

// ================================================================
//  Quest details popup & accept
// ================================================================

async function showQuestDetails(player, npcEntity, npcData, questId, quest, playerData) {
    const rewards = [];
    if (quest.rewards?.items?.length) {
        for (const r of quest.rewards.items) rewards.push(`§e${r.itemId} x${r.amount}`);
    }
    if (quest.rewards?.xp > 0) rewards.push(`§a${quest.rewards.xp} XP`);

    const body =
        `§l§e${quest.title}\n\n` +
        `§r§f${quest.description}\n\n` +
        `§l§7Objective:\n` +
        `  §f${OBJ_LABELS[quest.objectiveType] || quest.objectiveType}: §e${quest.target} §fx${quest.targetCount}\n\n` +
        `§l§7Reward:\n` +
        `  §f${rewards.join(", ") || "Tidak ada"}`;

    const form = new MessageFormData()
        .title("§l§6Detail Quest")
        .body(body)
        .button1("§l§aTerima Quest!")
        .button2("§lNanti Saja");

    const res = await form.show(player);
    if (res.selection === 1) {
        playerData.activeQuests[questId] = {
            npcId:    npcEntity.id,
            progress: 0,
            status:   "in_progress"
        };
        db.setPlayerData(player, playerData);
        player.sendMessage(`§a§l✦ Quest diterima: §e${quest.title}`);
        player.sendMessage(`§7${quest.description}`);
        try { player.onScreenDisplay.setActionBar(`§eQuest Baru: §f${quest.title}`); } catch {}
    }
}

// ================================================================
//  Active quest info popup
// ================================================================

async function showActiveQuestPopup(player, quest, progress) {
    const prog  = progress.progress || 0;
    const total = quest.targetCount || 1;

    const body =
        `§l§e${quest.title}\n\n` +
        `§r§f${quest.description}\n\n` +
        `§l§7Progress: §e${prog}§f/§e${total}\n\n` +
        `§l§7Status: §r${progress.status === "ready_to_complete" ? "§aSiap diklaim!" : "§eSedang berjalan…"}`;

    await new MessageFormData()
        .title("§l§eQuest Progress")
        .body(body)
        .button1("§lOK")
        .button2("§lKembali")
        .show(player);
}

// ================================================================
//  Accept first available quest (shortcut action)
// ================================================================

async function acceptFirstAvailableQuest(player, npcEntity, npcData, playerData) {
    for (const qId of npcData.assignedQuests) {
        if (playerData.completedQuests?.includes(qId)) continue;
        if (playerData.activeQuests?.[qId]) continue;

        const quest = db.getQuest(qId);
        if (!quest) continue;
        if (quest.prerequisite && !playerData.completedQuests?.includes(quest.prerequisite)) continue;

        await showQuestDetails(player, npcEntity, npcData, qId, quest, playerData);
        return;
    }
    player.sendMessage("§7Tidak ada quest baru yang tersedia.");
}

// ================================================================
//  Claim reward (first ready quest from this NPC)
// ================================================================

async function claimQuestReward(player, npcEntity, npcData, playerData) {
    for (const qId of npcData.assignedQuests) {
        const active = playerData.activeQuests?.[qId];
        if (active && active.status === "ready_to_complete") {
            const quest = db.getQuest(qId);
            if (quest) {
                await claimSpecificReward(player, qId, quest, playerData);
                return;
            }
        }
    }
    player.sendMessage("§7Tidak ada quest yang siap diklaim.");
}

// ================================================================
//  Claim specific reward
// ================================================================

async function claimSpecificReward(player, questId, quest, playerData) {
    // ── Give rewards ───────────────────────────────────────────
    try {
        if (quest.rewards?.items) {
            for (const reward of quest.rewards.items) {
                player.runCommand(`give @s ${reward.itemId} ${reward.amount}`);
            }
        }
        if (quest.rewards?.xp > 0) {
            player.runCommand(`xp ${quest.rewards.xp} @s`);
        }
        if (quest.rewards?.triggerEvent) {
            player.runCommand(quest.rewards.triggerEvent);
        }
    } catch (e) {
        player.sendMessage(`§cError memberikan reward: ${e.message || e}`);
    }

    // ── Update player data ─────────────────────────────────────
    delete playerData.activeQuests[questId];
    if (!playerData.completedQuests) playerData.completedQuests = [];
    playerData.completedQuests.push(questId);
    db.setPlayerData(player, playerData);

    player.sendMessage(`§a§l✦ Quest selesai: §e${quest.title}`);
    player.sendMessage("§7Reward telah diberikan!");
    try { player.onScreenDisplay.setActionBar(`§a✔ Quest Selesai: §f${quest.title}`); } catch {}

    // ── Quest chaining — notify next quest ─────────────────────
    if (quest.nextQuest) {
        const next = db.getQuest(quest.nextQuest);
        if (next) {
            system.runTimeout(() => {
                player.sendMessage(`§6§l✦ Quest baru tersedia: §e${next.title}`);
            }, 40); // 2-second delay
        }
    }
}
