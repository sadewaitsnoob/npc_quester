/**
 * quest_builder.js — Admin GUI: Quest Builder
 *
 * Menyediakan form untuk membuat, mengedit, menghapus,
 * dan melihat semua quest yang terdaftar di dunia.
 */

import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import * as db from "./database.js";

async function sleep(ticks) {
    return new Promise(resolve => system.runTimeout(resolve, ticks));
}

// ── Objective type labels ──────────────────────────────────────
const OBJECTIVE_LABELS = [
    "kill_entity — Bunuh Entity",
    "collect_item — Kumpulkan Item",
    "talk_to — Bicara dengan NPC",
    "go_to_location — Pergi ke Lokasi",
    "escort — Kawal NPC"
];
const OBJECTIVE_KEYS = ["kill_entity", "collect_item", "talk_to", "go_to_location", "escort"];

// ================================================================
//  Public — Main Menu
// ================================================================

export async function openQuestBuilderMenu(player) {
    const form = new ActionFormData()
        .title("§l§5✦ Quest Builder")
        .body("§7Kelola semua quest di dunia ini.")
        .button("§l§a✚ Buat Quest Baru\n§r§8Tambah quest baru")
        .button("§l§e✎ Edit Quest\n§r§8Ubah quest yang sudah ada")
        .button("§l§c✖ Hapus Quest\n§r§8Hapus quest dari daftar")
        .button("§l§b☰ Lihat Semua Quest\n§r§8Daftar lengkap quest");

    const res = await form.show(player);
    if (res.canceled) return;

    await sleep(2);

    switch (res.selection) {
        case 0: await createNewQuest(player); break;
        case 1: await selectQuestToEdit(player); break;
        case 2: await selectQuestToDelete(player); break;
        case 3: await viewAllQuests(player); break;
    }
}

// ================================================================
//  Create New Quest
// ================================================================

async function createNewQuest(player) {
    const form = new ModalFormData()
        .title("§l§aBuat Quest Baru")
        .textField("§eJudul Quest", "Masukkan judul quest…", { defaultValue: "" })
        .textField("§eDeskripsi", "Masukkan deskripsi quest…", { defaultValue: "" })
        .dropdown("§eTipe Objective", OBJECTIVE_LABELS, { defaultValueIndex: 0 })
        .textField(
            "§eTarget (Entity/Item ID / NPC Name / x,y,z,radius)",
            "Contoh: minecraft:zombie",
            { defaultValue: "minecraft:zombie" }
        )
        .slider("§eTarget Count", 1, 100, { valueStep: 1, defaultValue: 1 })
        .textField("§eReward Item ID", "Contoh: minecraft:diamond", { defaultValue: "minecraft:diamond" })
        .slider("§eReward Item Amount", 1, 64, { valueStep: 1, defaultValue: 1 })
        .slider("§eReward XP", 0, 1000, { valueStep: 10, defaultValue: 50 })
        .textField("§ePrerequisite Quest ID (kosongkan jika tidak ada)", "", { defaultValue: "" });

    const res = await form.show(player);
    if (res.canceled) return;

    const questId = db.generateQuestId();

    const objType = OBJECTIVE_KEYS[res.formValues[2]];
    const forceCountOne = (objType === "go_to_location" || objType === "talk_to");

    const questData = {
        id:            questId,
        title:         res.formValues[0] || "Quest Tanpa Judul",
        description:   res.formValues[1] || "Tidak ada deskripsi.",
        objectiveType: objType,
        target:        res.formValues[3] || "",
        targetCount:   forceCountOne ? 1 : (res.formValues[4] || 1),
        rewards: {
            items: res.formValues[5]
                ? [{ itemId: res.formValues[5], amount: res.formValues[6] || 1 }]
                : [],
            xp: res.formValues[7] || 0,
            triggerEvent: ""
        },
        prerequisite: res.formValues[8] || null,
        nextQuest:    null
    };

    db.saveQuest(questId, questData);

    const confirm = new MessageFormData()
        .title("✔ Quest Dibuat!")
        .body(
            `Quest "${questData.title}" berhasil dibuat!\n\n` +
            `ID: ${questId}\n` +
            `Tipe: ${questData.objectiveType}\n` +
            `Target: ${questData.target} x${questData.targetCount}`
        )
        .button1("OK")
        .button2("Buat Lagi");

    const cres = await confirm.show(player);
    if (cres.selection === 1) {
        await sleep(2);
        await createNewQuest(player);
    }


}

// ================================================================
//  Select Quest to Edit
// ================================================================

async function selectQuestToEdit(player) {
    const quests   = db.getAllQuests();
    const questIds = Object.keys(quests);

    if (questIds.length === 0) {
        const msg = new MessageFormData()
            .title("§l§eEdit Quest")
            .body("§cBelum ada quest yang dibuat.")
            .button1("§lOK")
            .button2("§lBuat Quest Baru");
        const res = await msg.show(player);
        if (res.selection === 1) await createNewQuest(player);
        return;
    }

    const form = new ActionFormData().title("§l§ePilih Quest untuk Diedit");
    for (const id of questIds) {
        const q = quests[id];
        form.button(`§l§e${q.title}\n§r§8${q.objectiveType} | ${q.target}`);
    }

    const res = await form.show(player);
    if (res.canceled) return;

    await editQuest(player, questIds[res.selection]);
}

// ================================================================
//  Edit Quest
// ================================================================

async function editQuest(player, questId) {
    const quest = db.getQuest(questId);
    if (!quest) return;

    const currentTypeIndex = Math.max(0, OBJECTIVE_KEYS.indexOf(quest.objectiveType));

    const form = new ModalFormData()
        .title(`§l§eEdit: ${quest.title}`)
        .textField("§eJudul Quest",          "Judul quest",     { defaultValue: quest.title })
        .textField("§eDeskripsi",            "Deskripsi quest", { defaultValue: quest.description })
        .dropdown("§eTipe Objective", OBJECTIVE_LABELS, { defaultValueIndex: currentTypeIndex })
        .textField("§eTarget",               "Entity/Item ID",  { defaultValue: quest.target })
        .slider("§eTarget Count", 1, 100, { valueStep: 1, defaultValue: quest.targetCount })
        .textField("§eReward Item ID",       "Item ID",         { defaultValue: quest.rewards?.items?.[0]?.itemId || "" })
        .slider("§eReward Item Amount", 1, 64, { valueStep: 1, defaultValue: quest.rewards?.items?.[0]?.amount || 1 })
        .slider("§eReward XP", 0, 1000, { valueStep: 10, defaultValue: quest.rewards?.xp || 0 })
        .textField("§ePrerequisite Quest ID", "Kosongkan jika tidak ada", { defaultValue: quest.prerequisite || "" })
        .textField("§eNext Quest ID (Chain)", "Kosongkan jika tidak ada", { defaultValue: quest.nextQuest || "" });

    const res = await form.show(player);
    if (res.canceled) return;

    quest.title         = res.formValues[0] || quest.title;
    quest.description   = res.formValues[1] || quest.description;
    quest.objectiveType = OBJECTIVE_KEYS[res.formValues[2]];
    quest.target        = res.formValues[3] || quest.target;
    quest.targetCount   = res.formValues[4] || quest.targetCount;
    quest.rewards = {
        items: res.formValues[5]
            ? [{ itemId: res.formValues[5], amount: res.formValues[6] || 1 }]
            : [],
        xp: res.formValues[7] || 0,
        triggerEvent: quest.rewards?.triggerEvent || ""
    };
    quest.prerequisite = res.formValues[8] || null;
    quest.nextQuest    = res.formValues[9] || null;

    db.saveQuest(questId, quest);
    player.sendMessage(`§a✔ Quest "${quest.title}" berhasil diupdate!`);
}

// ================================================================
//  Delete Quest
// ================================================================

async function selectQuestToDelete(player) {
    const quests   = db.getAllQuests();
    const questIds = Object.keys(quests);

    if (questIds.length === 0) {
        const msg = new MessageFormData()
            .title("§l§cHapus Quest")
            .body("§7Belum ada quest yang bisa dihapus.")
            .button1("§lOK")
            .button2("§lKembali");
        await msg.show(player);
        return;
    }

    const form = new ActionFormData().title("§l§cPilih Quest untuk Dihapus");
    for (const id of questIds) {
        const q = quests[id];
        form.button(`§l§c${q.title}\n§r§8${q.objectiveType}`);
    }

    const res = await form.show(player);
    if (res.canceled) return;

    const selectedId    = questIds[res.selection];
    const selectedQuest = quests[selectedId];

    const confirm = new MessageFormData()
        .title("§l§cKonfirmasi Hapus")
        .body(
            `§cApakah kamu yakin ingin menghapus quest:\n\n` +
            `§e"${selectedQuest.title}"§c?\n\n` +
            `§7Tindakan ini tidak bisa dibatalkan.`
        )
        .button1("§l§cYa, Hapus")
        .button2("§lBatal");

    const confirmRes = await confirm.show(player);
    if (confirmRes.selection === 0) {
        // Hapus quest dari registry utama
        db.deleteQuest(selectedId);

        // Bersihkan referensi dari semua NPC yang sedang loaded di dunia
        try {
            const npcEntities = [...world.getDimension("overworld").getEntities({ type: "custom:quest_npc" }),
                               ...world.getDimension("nether").getEntities({ type: "custom:quest_npc" }),
                               ...world.getDimension("the_end").getEntities({ type: "custom:quest_npc" })];
            db.cleanupQuestFromNpcs(selectedId, npcEntities);
        } catch {
            // Dimensi mungkin belum ter-load — skip
        }

        // Bersihkan referensi dari semua player yang sedang online
        db.cleanupQuestFromPlayers(selectedId, world.getAllPlayers());

        player.sendMessage(`§c✖ Quest "${selectedQuest.title}" telah dihapus dan dibersihkan dari semua NPC & player.`);
    }
}

// ================================================================
//  View All Quests
// ================================================================

async function viewAllQuests(player) {
    const quests   = db.getAllQuests();
    const questIds = Object.keys(quests);

    if (questIds.length === 0) {
        const msg = new MessageFormData()
            .title("§l§bDaftar Quest")
            .body("§7Belum ada quest yang terdaftar.")
            .button1("§lOK")
            .button2("§lBuat Quest");
        const res = await msg.show(player);
        if (res.selection === 1) await createNewQuest(player);
        return;
    }

    let body = "";
    for (const id of questIds) {
        const q = quests[id];
        body += `§e▸ ${q.title}\n`;
        body += `  §7ID: ${id}\n`;
        body += `  §7Tipe: ${q.objectiveType} | Target: ${q.target} x${q.targetCount}\n`;
        body += `  §7Prerequisite: ${q.prerequisite || "Tidak ada"}\n\n`;
    }

    const msg = new MessageFormData()
        .title(`§l§bDaftar Quest (${questIds.length})`)
        .body(body)
        .button1("§lOK")
        .button2("§lKembali ke Menu");

    const res = await msg.show(player);
    if (res.selection === 1) {
        await openQuestBuilderMenu(player);
    }
}
