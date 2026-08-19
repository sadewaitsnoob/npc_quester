/**
 * npc_manager.js — Admin GUI: NPC Management
 */

import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import * as db from "./database.js";

// Helper delay to prevent Bedrock from instantly cancelling consecutive UI forms
async function sleep(ticks) {
    return new Promise(resolve => system.runTimeout(resolve, ticks));
}

// ── Action labels for dialog responses ─────────────────────────
const ACTION_LABELS = [
    "close — Tutup dialog",
    "show_quests — Tampilkan quest",
    "accept_quest — Terima quest",
    "claim_reward — Klaim hadiah",
    "next_page — Halaman berikutnya"
];
const ACTION_KEYS = ["close", "show_quests", "accept_quest", "claim_reward", "next_page"];

function getActionIndex(action) {
    const idx = ACTION_KEYS.indexOf(action);
    return idx >= 0 ? idx : 0;
}

// ================================================================
//  Public — Admin Panel  (when admin clicks an NPC)
// ================================================================

export async function openNpcAdminPanel(player, npcEntity) {
    let npcData = db.getNpcData(npcEntity);
    if (!npcData) {
        npcData = db.createDefaultNpcData("NPC Baru");
        db.setNpcData(npcEntity, npcData);
        npcEntity.nameTag = `§b${npcData.name}`;
    }

    const form = new ActionFormData()
        .title(`§l§d⚙ Admin: ${npcData.name || "NPC"}`)
        .body("§7Kelola NPC ini.")
        .button("§l§e✎ Ganti Nama\n§r§8Ubah nama tampilan NPC")
        .button("§l§a🎨 Set Skin Variant\n§r§8Ubah tampilan NPC")
        .button("§l§b💬 Atur Dialog Greeting\n§r§8Edit dialog greeting")
        .button("§l§6📜 Assign Quest\n§r§8Hubungkan quest ke NPC")
        .button("§l§5🌳 Edit Dialog Tree\n§r§8Atur pohon percakapan")
        .button("§l§c✖ Hapus NPC\n§r§8Hapus NPC dari dunia")
        .button("§l§8📋 Info NPC\n§r§8Lihat detail NPC ini");

    const res = await form.show(player);
    if (res.canceled) return;

    // Tunggu sejenak agar form sebelumnya ditutup dengan sempurna oleh engine
    await sleep(2);

    switch (res.selection) {
        case 0: await editNpcName(player, npcEntity); break;
        case 1: await editNpcSkin(player, npcEntity); break;
        case 2: await editNpcGreeting(player, npcEntity); break;
        case 3: await assignQuestToNpc(player, npcEntity); break;
        case 4: await editDialogTree(player, npcEntity); break;
        case 5: await deleteNpc(player, npcEntity); break;
        case 6: await viewNpcInfo(player, npcEntity); break;
    }
}

// ================================================================
//  Edit NPC Name
// ================================================================

async function editNpcName(player, npcEntity) {
    const npcData = db.getNpcData(npcEntity);

    const form = new ModalFormData()
        .title("§l§eGanti Nama NPC")
        .textField("Nama baru:", "Masukkan nama…", { defaultValue: npcData.name || "" });

    const res = await form.show(player);
    if (res.canceled) return;

    npcData.name = res.formValues[0] || npcData.name || "NPC";
    db.setNpcData(npcEntity, npcData);
    npcEntity.nameTag = `§b${npcData.name}`;
    player.sendMessage(`§a✔ Nama NPC diubah menjadi: §b${npcData.name}`);
}

// ================================================================
//  Edit Skin Variant
// ================================================================

async function editNpcSkin(player, npcEntity) {
    const npcData = db.getNpcData(npcEntity);

    const variants = [];
    for (let i = 0; i < 10; i++) {
        variants.push(`Variant ${i}${i === 0 ? " (Default)" : ""}`);
    }

    const form = new ModalFormData()
        .title("§l§aSkin Variant")
        .dropdown("Pilih variant skin:", variants, { defaultValueIndex: Number(npcData.skinVariant) || 0 });

    const res = await form.show(player);
    if (res.canceled) return;

    npcData.skinVariant = res.formValues[0];
    db.setNpcData(npcEntity, npcData);

    try {
        npcEntity.setProperty("custom:skin_variant", npcData.skinVariant);
    } catch {
        // Property belum didefinisikan di entity — skip
    }

    player.sendMessage(`§a✔ Skin variant diubah ke: §e${npcData.skinVariant}`);
}

// ================================================================
//  Edit Greeting Dialog
// ================================================================

async function editNpcGreeting(player, npcEntity) {
    const npcData = db.getNpcData(npcEntity);
    const defaultPages = npcData.dialogTree?.default?.pages || [];

    const form = new ModalFormData()
        .title("§l§bAtur Dialog Greeting")
        .textField("Halaman 1", "Dialog pertama…", { defaultValue: defaultPages[0] || npcData.greeting || "" })
        .textField("Halaman 2 (opsional)", "Dialog kedua…", { defaultValue: defaultPages[1] || "" })
        .textField("Halaman 3 (opsional)", "Dialog ketiga…", { defaultValue: defaultPages[2] || "" });

    const res = await form.show(player);
    if (res.canceled) return;

    const pages = [res.formValues[0] || npcData.greeting].concat(
        [res.formValues[1], res.formValues[2]].filter(p => p && p.trim() !== "")
    );

    npcData.greeting = pages[0];
    if (!npcData.dialogTree) npcData.dialogTree = {};
    if (!npcData.dialogTree.default) npcData.dialogTree.default = { pages: [], responses: [] };
    npcData.dialogTree.default.pages = pages;
    db.setNpcData(npcEntity, npcData);
    player.sendMessage(`§a✔ Dialog greeting NPC telah diupdate.`);
}

// ================================================================
//  Assign Quest to NPC
// ================================================================

async function assignQuestToNpc(player, npcEntity) {
    const npcData  = db.getNpcData(npcEntity);
    const allQuests = db.getAllQuests();
    const questIds  = Object.keys(allQuests);

    if (questIds.length === 0) {
        const msg = new MessageFormData()
            .title("§l§6Assign Quest")
            .body("§cBelum ada quest yang dibuat.\n§7Buat quest terlebih dahulu di Quest Builder (§f!npc builder§7).")
            .button1("§lOK")
            .button2("§lKembali");
        await msg.show(player);
        return;
    }

    const form = new ModalFormData().title("§l§6Assign Quest ke NPC");

    for (const id of questIds) {
        const q = allQuests[id];
        const isAssigned = npcData.assignedQuests.includes(id);
        form.toggle(`§e${q.title} §7(${id})`, { defaultValue: isAssigned });
    }

    const res = await form.show(player);
    if (res.canceled) return;

    npcData.assignedQuests = [];
    for (let i = 0; i < questIds.length; i++) {
        if (res.formValues[i]) {
            npcData.assignedQuests.push(questIds[i]);
        }
    }

    db.setNpcData(npcEntity, npcData);
    player.sendMessage(`§a✔ ${npcData.assignedQuests.length} quest di-assign ke §b${npcData.name}§a.`);
}

// ================================================================
//  Edit Dialog Tree
// ================================================================

export async function editDialogTree(player, npcEntity) {
    const npcData = db.getNpcData(npcEntity);
    const states  = ["default", "quest_available", "quest_in_progress", "quest_complete"];
    const labels  = [
        "Default (tidak ada quest)",
        "Quest Tersedia",
        "Quest Sedang Berjalan",
        "Quest Selesai"
    ];

    const form = new ActionFormData()
        .title("§l§5🌳 Edit Dialog Tree")
        .body("§7Pilih state dialog yang ingin diedit:");

    for (let i = 0; i < states.length; i++) {
        const pageCount = npcData.dialogTree?.[states[i]]?.pages?.length || 0;
        form.button(`§l§d${labels[i]}\n§r§8${pageCount} halaman dialog`);
    }

    const res = await form.show(player);
    if (res.canceled) return;
    
    await sleep(2);

    await editDialogState(player, npcEntity, states[res.selection], labels[res.selection]);
}

// ================================================================
//  Edit Single Dialog State
// ================================================================

async function editDialogState(player, npcEntity, state, label) {
    const npcData     = db.getNpcData(npcEntity);
    const dialogState = npcData.dialogTree?.[state] || { pages: [], responses: [] };

    const form = new ModalFormData()
        .title(`§l§dEdit: ${label}`)
        .textField("Halaman 1",              "Dialog pertama…",     { defaultValue: dialogState.pages?.[0] || "" })
        .textField("Halaman 2 (opsional)",    "Dialog kedua…",      { defaultValue: dialogState.pages?.[1] || "" })
        .textField("Halaman 3 (opsional)",    "Dialog ketiga…",     { defaultValue: dialogState.pages?.[2] || "" })
        .textField("Respon Pilihan 1",        "Teks tombol 1…",     { defaultValue: dialogState.responses?.[0]?.text || "" })
        .dropdown("Aksi Respon 1",            ACTION_LABELS,        { defaultValueIndex: Number(getActionIndex(dialogState.responses?.[0]?.action)) || 0 })
        .textField("Respon Pilihan 2 (opsional)", "Teks tombol 2…", { defaultValue: dialogState.responses?.[1]?.text || "" })
        .dropdown("Aksi Respon 2",            ACTION_LABELS,        { defaultValueIndex: Number(getActionIndex(dialogState.responses?.[1]?.action)) || 0 });

    const res = await form.show(player);
    if (res.canceled) return;

    // --- Build pages ---
    const pages = [res.formValues[0]].concat(
        [res.formValues[1], res.formValues[2]].filter(p => p && p.trim() !== "")
    );
    if (pages.length === 0 || !pages[0]) pages[0] = "…";

    // --- Build responses ---
    const responses = [];
    if (res.formValues[3] && res.formValues[3].trim() !== "") {
        responses.push({ text: res.formValues[3], action: ACTION_KEYS[res.formValues[4]] });
    }
    if (res.formValues[5] && res.formValues[5].trim() !== "") {
        responses.push({ text: res.formValues[5], action: ACTION_KEYS[res.formValues[6]] });
    }
    if (responses.length === 0) {
        responses.push({ text: "OK", action: "close" });
    }

    if (!npcData.dialogTree) npcData.dialogTree = {};
    npcData.dialogTree[state] = { pages, responses };
    db.setNpcData(npcEntity, npcData);
    player.sendMessage(`§a✔ Dialog "${label}" berhasil diupdate.`);
}

// ================================================================
//  Delete NPC
// ================================================================

async function deleteNpc(player, npcEntity) {
    const npcData = db.getNpcData(npcEntity);
    const name    = npcData?.name || "NPC";

    const confirm = new MessageFormData()
        .title("§l§cHapus NPC")
        .body(
            `§cApakah kamu yakin ingin menghapus NPC "§e${name}§c"?\n\n` +
            `§7NPC akan dihilangkan dari dunia.`
        )
        .button1("§l§cYa, Hapus")
        .button2("§lBatal");

    const res = await confirm.show(player);
    if (res.selection === 0) {
        npcEntity.remove();
        player.sendMessage(`§c✖ NPC "${name}" telah dihapus.`);
    }
}

// ================================================================
//  View NPC Info
// ================================================================

async function viewNpcInfo(player, npcEntity) {
    const npcData = db.getNpcData(npcEntity);
    if (!npcData) return;

    const allQuests = db.getAllQuests();
    let questList   = "";
    for (const qId of npcData.assignedQuests) {
        const q = allQuests[qId];
        questList += q
            ? `  §e▸ ${q.title} §7(${qId})\n`
            : `  §c▸ [Data Hilang] §7(${qId})\n`;
    }
    if (!questList) questList = "  §7Tidak ada quest.\n";

    const body =
        `§l§bNama: §r§f${npcData.name}\n` +
        `§l§bSkin Variant: §r§f${npcData.skinVariant}\n` +
        `§l§bGreeting: §r§f${npcData.greeting}\n\n` +
        `§l§6Quest di-assign:\n${questList}\n` +
        `§l§dDialog Tree:\n` +
        `  §7Default: ${npcData.dialogTree?.default?.pages?.length || 0} halaman\n` +
        `  §7Quest Available: ${npcData.dialogTree?.quest_available?.pages?.length || 0} halaman\n` +
        `  §7In Progress: ${npcData.dialogTree?.quest_in_progress?.pages?.length || 0} halaman\n` +
        `  §7Complete: ${npcData.dialogTree?.quest_complete?.pages?.length || 0} halaman`;

    const msg = new MessageFormData()
        .title(`§l§b📋 ${npcData.name}`)
        .body(body)
        .button1("§lOK")
        .button2("§lKembali ke Admin Panel");

    const res = await msg.show(player);
    if (res.selection === 1) {
        await openNpcAdminPanel(player, npcEntity);
    }
}

// ================================================================
//  Public — Spawn NPC at player's location
// ================================================================

export function spawnNpcAtPlayer(player) {
    const loc = player.location;
    const dim = player.dimension;

    try {
        const npc = dim.spawnEntity("custom:quest_npc", {
            x: Math.floor(loc.x) + 0.5,
            y: loc.y,
            z: Math.floor(loc.z) + 0.5
        });

        const npcData = db.createDefaultNpcData("NPC Baru");
        db.setNpcData(npc, npcData);
        npc.nameTag = `§b${npcData.name}`;

        player.sendMessage("§a✔ NPC berhasil di-spawn di posisimu!");
        return npc;
    } catch (e) {
        player.sendMessage(`§cGagal spawn NPC: ${e.message || e}`);
        return null;
    }
}