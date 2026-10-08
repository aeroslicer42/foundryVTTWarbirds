import { SYSTEM_ID, systemPath } from "../config.mjs";
import { buildEnemyFlight, enemyGrades, SKILLS } from "./enemy-flight.mjs";

/**
 * Test Fight: a ready-made dogfight for trying the system out.
 *
 * Two sample pilots linked to their jets (Sparrow in an F-4 Phantom II, Hammer in an F-5 Freedom Fighter), an enemy
 * flight of three MiG-21s at the "Regular pilot" grade (Red 1–3), a small scene with the five tokens placed, and a
 * combat with all five combatants, not yet started. Everything lives in a "Warbirds Test Fight" folder; running it
 * again offers to delete the previous one first.
 */

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

export const TEST_FIGHT = {
  folder: "Warbirds Test Fight",
  scene: "Test Fight",
  pilots: [
    { pilot: "Dana “Sparrow” Cole", aircraft: "F-4 Phantom II", name: "Sparrow's Phantom" },
    { pilot: "Mike “Hammer” Kowalski", aircraft: "F-5 Freedom Fighter", name: "Hammer's Tiger" }
  ],
  enemy: { aircraft: "MiG-21 Fishbed", count: 3, prefix: "Red", grade: "regular" },
  grid: 100,
  size: { width: 1600, height: 1000 }
};

/**
 * The previous test fight's folder (marked with a flag), if any.
 * @returns {Folder|null}
 */
export function findTestFight() {
  return game.folders.find(f => (f.type === "Actor") && f.getFlag?.(SYSTEM_ID, "testFight")) ?? null;
}

/**
 * Delete a previous test fight: its actors, scene, combat and folders.
 * @param {Folder} folder
 */
export async function deleteTestFight(folder) {
  const info = folder.getFlag(SYSTEM_ID, "testFight") ?? {};
  const combat = info.combat ? game.combats.get(info.combat) : null;
  if ( combat ) await combat.delete();
  const scene = info.scene ? game.scenes.get(info.scene) : null;
  if ( scene ) await scene.delete();
  const sceneFolder = info.sceneFolder ? game.folders.get(info.sceneFolder) : null;
  if ( sceneFolder ) await sceneFolder.delete();
  const actorIds = game.actors.filter(a => a.folder?.id === folder.id).map(a => a.id);
  if ( actorIds.length ) await Actor.implementation.deleteDocuments(actorIds);
  await folder.delete();
}

/**
 * Import an actor from one of the system's compendiums.
 * @param {string} pack       Pack id (warbirds.samples, warbirds.aircraft).
 * @param {string} name
 * @param {object} changes    Data overrides (folder, name, prototype token).
 * @returns {Promise<Actor>}
 */
async function importActor(pack, name, changes) {
  const compendium = game.packs.get(pack);
  if ( !compendium ) throw new Error(`Compendium ${pack} not found`);
  const entry = (await compendium.getIndex()).find(e => e.name === name);
  if ( !entry ) throw new Error(`${name} not found in ${pack}`);
  return game.actors.importFromCompendium(compendium, entry._id, changes, { keepId: false });
}

/**
 * Build the test fight. GM only.
 * @param {object} [options]
 * @param {boolean} [options.confirm=true]   Ask before deleting a previous test fight.
 * @returns {Promise<{folder: Folder, pilots: Actor[], aircraft: Actor[], enemies: Actor[], scene: Scene, combat: Combat}|void>}
 */
export async function createTestFight({ confirm=true }={}) {
  if ( !game.user.isGM ) return ui.notifications.warn("WARBIRDS.TestFight.gmOnly", { localize: true });

  const previous = findTestFight();
  if ( previous ) {
    const ok = !confirm || await DialogV2.confirm({
      window: { title: game.i18n.localize("WARBIRDS.TestFight.title") },
      content: `<p>${game.i18n.localize("WARBIRDS.TestFight.replace")}</p>`,
      rejectClose: false,
      modal: true
    });
    if ( !ok ) return;
    await deleteTestFight(previous);
  }

  const folder = await Folder.implementation.create({ name: TEST_FIGHT.folder, type: "Actor", color: "#3f4a22" });
  const sceneFolder = await Folder.implementation.create({ name: TEST_FIGHT.folder, type: "Scene", color: "#3f4a22" });

  // Pilots and their jets, linked both ways.
  const pilots = [];
  const aircraft = [];
  for ( const p of TEST_FIGHT.pilots ) {
    const pilot = await importActor(`${SYSTEM_ID}.samples`, p.pilot, { folder: folder.id });
    const plane = await importActor(`${SYSTEM_ID}.aircraft`, p.aircraft, {
      folder: folder.id, name: p.name, prototypeToken: { name: p.name, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY }
    });
    await plane.update({ "system.pilot": pilot.uuid });
    await pilot.update({ "system.aircraft": plane.uuid });
    pilots.push(pilot);
    aircraft.push(plane);
  }

  // The enemy flight, through the generator's own code.
  const template = await importActor(`${SYSTEM_ID}.aircraft`, TEST_FIGHT.enemy.aircraft, { folder: folder.id });
  const grade = enemyGrades()[TEST_FIGHT.enemy.grade];
  const crew = { sa: grade.sa, ...Object.fromEntries(SKILLS.map(k => [k, grade[k]])) };
  const enemies = await buildEnemyFlight(template, {
    count: TEST_FIGHT.enemy.count, prefix: TEST_FIGHT.enemy.prefix, crew, folder: folder.id, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE
  });
  await template.delete();

  // Scene: friendlies on the left, Red flight on the right.
  const { grid, size } = TEST_FIGHT;
  const scene = await Scene.implementation.create({
    name: TEST_FIGHT.scene, folder: sceneFolder.id, width: size.width, height: size.height, padding: 0,
    grid: { type: CONST.GRID_TYPES.SQUARE, size: grid, distance: 1, units: "m" }, backgroundColor: "#7d9cb8"
  });
  const place = (actor, col, row) => actor.getTokenDocument({ x: col * grid, y: row * grid }).then(t => t.toObject());
  const tokenData = [];
  for ( const [i, plane] of aircraft.entries() ) tokenData.push(await place(plane, 3, 3 + i * 3));
  for ( const [i, enemy] of enemies.entries() ) tokenData.push(await place(enemy, 12, 2 + i * 3));
  const tokens = await scene.createEmbeddedDocuments("Token", tokenData);
  await scene.view?.();

  // Combat with all five, not started.
  const combat = await Combat.implementation.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", tokens.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));

  await folder.setFlag(SYSTEM_ID, "testFight", { scene: scene.id, combat: combat.id, sceneFolder: sceneFolder.id });

  const card = {
    title: game.i18n.localize("WARBIRDS.TestFight.title"),
    subtitle: TEST_FIGHT.scene,
    actor: { name: game.user.name, img: game.user.avatar ?? "icons/svg/mystery-man.svg" },
    icon: "fa-solid fa-jet-fighter-up",
    lines: [
      game.i18n.format("WARBIRDS.TestFight.created", {
        friendlies: aircraft.map((a, i) => `${a.name} (${pilots[i].name})`).join(", "),
        enemies: enemies.map(e => e.name).join(", ")
      }),
      game.i18n.localize("WARBIRDS.TestFight.next")
    ]
  };
  const content = await renderTemplate(systemPath("templates/chat/note.hbs"), card);
  await ChatMessage.create({ content, whisper: [game.user.id], flags: { warbirds: { type: "note", card } } });
  return { folder, pilots, aircraft, enemies, scene, combat };
}
