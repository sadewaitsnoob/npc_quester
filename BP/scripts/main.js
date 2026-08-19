/**
 * main.js — Entry Point
 *
 * Menginisialisasi quest tracking, menangani chat commands,
 * dan menghubungkan interaksi player–NPC ke modul yang sesuai
 * (Admin Panel vs Dialog System).
 *
 * CARA PAKAI:
 *   1.  /tag @s add admin          → jadikan dirimu admin
 *   2.  !npc spawn                 → spawn NPC di posisimu
 *   3.  Klik NPC (sebagai admin)   → buka Admin Panel
 *   4.  !npc builder               → buka Quest Builder
 *   5.  /tag @s remove admin       → kembali jadi player biasa
 *   6.  Klik NPC (sebagai player)  → lihat dialog & quest
 *   7.  !quest tracker             → lihat quest aktif
 */

import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import * as db from "./database.js";
import { openNpcAdminPanel, spawnNpcAtPlayer } from "./npc_manager.js";
import { openQuestBuilderMenu } from "./quest_builder.js";
import { handleNpcInteraction } from "./dialog_system.js";
import { initQuestTracking, showQuestTracker } from "./quest_manager.js";

// ================================================================
//  Initialization
// ================================================================

initQuestTracking();

system.runTimeout(() => {
    world.sendMessage("§b§l[NPC Quest] §r§aAdd-on berhasil dimuat!");
}, 20);

// ================================================================
//  Menu Item — Auto-give on join
// ================================================================

const MENU_ITEM_ID  = "custom:npc_menu";
const MENU_SLOT     = 8; // Hotbar slot 9 (0-indexed)

world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    // Jangan beri item kepada admin
    if (player.hasTag("admin")) return;
    // Tunda sedikit agar inventory sudah siap
    system.runTimeout(() => {
        try { ensureMenuItemInInventory(player); } catch {}
    }, 40);
});

// Cek & restore item setiap 5 detik untuk semua player non-admin
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (!player.hasTag("admin")) {
            try { ensureMenuItemInInventory(player); } catch {}
        }
    }
}, 100);

function ensureMenuItemInInventory(player) {
    const inv = player.getComponent("minecraft:inventory");
    if (!inv || !inv.container) return;
    const container = inv.container;

    // Cek apakah item sudah ada di hotbar (slot 0–8)
    let foundSlot = -1;
    for (let i = 0; i < 9; i++) {
        const item = container.getItem(i);
        if (item?.typeId === MENU_ITEM_ID) {
            foundSlot = i;
            break;
        }
    }

    if (foundSlot === -1) {
        // Belum ada — taruh di slot 8
        container.setItem(MENU_SLOT, new ItemStack(MENU_ITEM_ID, 1));
    } else if (foundSlot !== MENU_SLOT) {
        // Ada tapi bukan di slot 8 — pindahkan
        const existing = container.getItem(foundSlot);
        container.setItem(foundSlot, container.getItem(MENU_SLOT));
        container.setItem(MENU_SLOT, existing);
    }
}

// ================================================================
//  Menu Item — itemUse listener
// ================================================================

world.afterEvents.itemUse.subscribe((event) => {
    if (event.itemStack?.typeId !== MENU_ITEM_ID) return;
    const player = event.source;
    if (!player) return;

    system.run(async () => {
        try {
            await openPlayerMenu(player);
        } catch (e) {
            player.sendMessage(`§cError: ${e.message || e}`);
        }
    });
});

async function openPlayerMenu(player) {
    const form = new ActionFormData()
        .title("§l§b📋 Menu")
        .body("§7Selamat datang! Pilih menu yang kamu inginkan:")
        .button("§l§e📋 Quest Tracker\n§r§7Lihat progress quest kamu")
        .button("§lℹ Bantuan\n§r§7Panduan cara bermain");

    const res = await form.show(player);
    if (res.canceled) return;

    if (res.selection === 0) {
        await showQuestTracker(player);
    } else if (res.selection === 1) {
        showHelp(player, false);
    }
}

// ================================================================
//  Script Event Handler (Replaces Chat/Item Commands)
// ================================================================

system.afterEvents.scriptEventReceive.subscribe((event) => {
    const { id, sourceEntity, message } = event;
    
    // Hanya proses jika yang memicu adalah player
    if (sourceEntity?.typeId !== "minecraft:player") return;
    
    const player = sourceEntity;
    const isAdmin = player.hasTag("admin");

    system.run(async () => {
        try {
            switch (id) {
                case "npc:admin":
                case "npc:panel":
                    if (!isAdmin) return player.sendMessage("§c✖ Izin admin ditolak! Gunakan: /tag @s add admin");
                    await openAdminMainPanel(player);
                    break;
                
                case "npc:spawn":
                    if (!isAdmin) return player.sendMessage("§c✖ Izin admin ditolak!");
                    spawnNpcAtPlayer(player);
                    break;
                
                case "npc:builder":
                    if (!isAdmin) return player.sendMessage("§c✖ Izin admin ditolak!");
                    await openQuestBuilderMenu(player);
                    break;
                
                case "npc:tracker":
                case "npc:quest":
                    await showQuestTracker(player);
                    break;
                
                case "npc:help":
                default:
                    showHelp(player, isAdmin);
                    break;
            }
        } catch (e) {
            player.sendMessage(`§cError: ${e.message || e}`);
        }
    });
}, { namespaces: ["npc"] });

// ================================================================
//  Admin Main Panel
// ================================================================

async function openAdminMainPanel(player) {
    const form = new ActionFormData()
        .title("§l§d⚙ Admin Panel")
        .body("§7Panel utama untuk mengelola NPC & Quest.")
        .button("§l§a✚ Spawn NPC\n§r§8Buat NPC baru di posisimu")
        .button("§l§5📜 Quest Builder\n§r§8Buat & kelola quest")
        .button("§l§e📋 Quest Tracker\n§r§8Preview sebagai player")
        .button("§l§b🔧 Kelola NPC Terdekat\n§r§8Edit NPC di sekitarmu")
        .button("§l§8ℹ Bantuan\n§r§8Lihat daftar command");

    const res = await form.show(player);
    if (res.canceled) return;

    switch (res.selection) {
        case 0: spawnNpcAtPlayer(player);        break;
        case 1: await openQuestBuilderMenu(player); break;
        case 2: await showQuestTracker(player);     break;
        case 3: await manageNearbyNpcs(player);     break;
        case 4: showHelp(player, true);             break;
    }
}

// ================================================================
//  Manage Nearby NPCs
// ================================================================

async function manageNearbyNpcs(player) {
    const entities = player.dimension.getEntities({
        type: "custom:quest_npc",
        location: player.location,
        maxDistance: 30
    });

    if (entities.length === 0) {
        const msg = new MessageFormData()
            .title("§l§bKelola NPC Terdekat")
            .body("§7Tidak ada NPC dalam radius 30 blok.\n\nGunakan §f!npc spawn §7untuk membuat NPC baru.")
            .button1("§lOK")
            .button2("§lSpawn NPC");

        const res = await msg.show(player);
        if (res.selection === 1) spawnNpcAtPlayer(player);
        return;
    }

    const form = new ActionFormData().title("§l§bNPC Terdekat");

    for (const entity of entities) {
        const npcData    = db.getNpcData(entity);
        const name       = npcData?.name || "NPC Tanpa Nama";
        const questCount = npcData?.assignedQuests?.length || 0;
        form.button(`§l§b${name}\n§r§8${questCount} quest di-assign`);
    }

    const res = await form.show(player);
    if (res.canceled) return;

    await openNpcAdminPanel(player, entities[res.selection]);
}

// ================================================================
//  Player Interact with NPC  (entity click)
// ================================================================

world.afterEvents.playerInteractWithEntity.subscribe((event) => {
    const player = event.player;
    const target = event.target;

    if (target.typeId !== "custom:quest_npc") return;

    system.run(async () => {
        try {
            if (player.hasTag("admin")) {
                await openNpcAdminPanel(player, target);
            } else {
                await handleNpcInteraction(player, target);
            }
        } catch (e) {
            player.sendMessage(`§cError: ${e.message || e}`);
        }
    });
});

// ================================================================
//  Help Command
// ================================================================

function showHelp(player, isAdmin) {
    player.sendMessage("§b§l═════════════════════════════════");
    player.sendMessage("§b§l    NPC Quest System — Bantuan");
    player.sendMessage("§b§l═════════════════════════════════");
    player.sendMessage("");
    player.sendMessage("§l§ePlayer Commands:");
    player.sendMessage("  §a/scriptevent npc:tracker §7— Lihat quest aktif & progress");
    player.sendMessage("");

    if (isAdmin) {
        player.sendMessage("§l§dAdmin Commands:");
        player.sendMessage("  §a/scriptevent npc:admin   §7— Buka Admin Panel Utama");
        player.sendMessage("  §a/scriptevent npc:spawn   §7— Buat NPC baru di posisimu");
        player.sendMessage("  §a/scriptevent npc:builder §7— Buka Quest Builder");
        player.sendMessage("");
        player.sendMessage("§l§dCara Pakai (Sebagai Admin):");
        player.sendMessage("  §71. Pastikan punya tag: §f/tag @s add admin");
        player.sendMessage("  §72. Ketik §f/scriptevent npc:spawn §7untuk memunculkan NPC");
        player.sendMessage("  §73. Klik NPC langsung untuk Edit NPC tersebut");
    }

    player.sendMessage("");
    player.sendMessage("§b§l═════════════════════════════════");
}
