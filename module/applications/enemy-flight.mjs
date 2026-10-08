import { SYSTEM_ID, systemPath, WARBIRDS } from "../config.mjs";

/**
 * Enemy flight generator: copies of one aircraft with the crew block filled in from a pilot grade, created as
 * their own (linked) actors in a folder, optionally placed next to a selected token.
 *
 * Grades come from the core book where it gives numbers (p166: "most pilots have SA 0, one or two skills — usually
 * Piloting and Gunnery — at level 2, and the remainder at level 1"; the Jamaican Squadron Leader and Mayan Strafing
 * Ace examples). The rest are neutral defaults the GM can change in the generator, which stores them as a world
 * setting.
 */

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** Skill keys in the order they are shown. */
export const SKILLS = ["piloting", "gunnery", "strafing", "ordinance", "ew"];

/** Default grade table. `source` says where the numbers come from. */
export const DEFAULT_GRADES = {
  rookie: { label: "WARBIRDS.EnemyFlight.grades.rookie", sa: 0, piloting: 1, gunnery: 1, strafing: 1, ordinance: 1, ew: 1, source: "default" },
  regular: { label: "WARBIRDS.EnemyFlight.grades.regular", sa: 0, piloting: 2, gunnery: 2, strafing: 1, ordinance: 1, ew: 1, source: "core p166" },
  leader: { label: "WARBIRDS.EnemyFlight.grades.leader", sa: 0, piloting: 3, gunnery: 2, strafing: 2, ordinance: 0, ew: 1, source: "core p162 (Jamaican Squadron Leader)" },
  strafer: { label: "WARBIRDS.EnemyFlight.grades.strafer", sa: 0, piloting: 2, gunnery: 1, strafing: 4, ordinance: 1, ew: 1, source: "core p162 (Mayan Strafing Ace)" },
  ace: { label: "WARBIRDS.EnemyFlight.grades.ace", sa: 1, piloting: 3, gunnery: 3, strafing: 2, ordinance: 2, ew: 2, source: "default" }
};

/** Register the editable grade table. */
export function registerEnemyFlightSettings() {
  game.settings.register(SYSTEM_ID, "enemyGrades", {
    name: "WARBIRDS.Settings.enemyGrades.name",
    hint: "WARBIRDS.Settings.enemyGrades.hint",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
}

/**
 * The grade table: defaults overlaid with the GM's saved changes.
 * @returns {Record<string, object>}
 */
export function enemyGrades() {
  const saved = game.settings.get(SYSTEM_ID, "enemyGrades") ?? {};
  const out = {};
  for ( const [key, grade] of Object.entries(DEFAULT_GRADES) ) out[key] = { ...grade, ...(saved[key] ?? {}) };
  return out;
}

/**
 * Build the actor data for one enemy copy of an aircraft.
 * @param {Actor} source
 * @param {object} options
 * @param {string} options.name
 * @param {object} options.crew       {sa, piloting, gunnery, strafing, ordinance, ew}
 * @param {string|null} options.folder
 * @param {number} options.disposition
 * @returns {object}
 */
export function enemyActorData(source, { name, crew, folder=null, disposition=-1 }) {
  const data = source.toObject();
  delete data._id;
  delete data.folder;
  data.name = name;
  data.folder = folder;
  data.ownership = { default: 0 };
  data.system.pilot = null;
  data.system.damage = 0;
  data.system.crew = {
    name,
    sa: crew.sa,
    flightSkills: Object.fromEntries(SKILLS.map(k => [k, { level: crew[k], xp: 0, knack: false }])),
    reserve: { value: 0, max: 0 },
    lifeOnTheLine: false
  };
  data.prototypeToken = { ...(data.prototypeToken ?? {}), name, actorLink: true, disposition };
  return data;
}

/**
 * Open the generator for an aircraft (or let the GM pick one from the world) and create the flight.
 * @param {Actor|null} [aircraft]
 * @returns {Promise<Actor[]|void>}
 */
export async function createEnemyFlight(aircraft=null) {
  if ( !game.user.isGM ) return ui.notifications.warn("WARBIRDS.EnemyFlight.gmOnly", { localize: true });
  const sources = game.actors.filter(a => a.type === "aircraft").sort((a, b) => a.name.localeCompare(b.name));
  if ( !aircraft && !sources.length ) return ui.notifications.warn("WARBIRDS.EnemyFlight.noAircraft", { localize: true });
  const grades = enemyGrades();
  const selectedToken = canvas?.ready ? (canvas.tokens?.controlled?.[0] ?? null) : null;
  const context = {
    sources: aircraft ? null : sources.map(a => ({ id: a.id, name: a.name })),
    sourceName: aircraft?.name ?? "",
    grades: Object.entries(grades).map(([key, g]) => ({ key, label: game.i18n.localize(g.label), selected: key === "regular", source: g.source })),
    gradesJson: JSON.stringify(Object.fromEntries(Object.entries(grades).map(([k, g]) => [k, { sa: g.sa, ...Object.fromEntries(SKILLS.map(s => [s, g[s]])) }]))),
    skills: SKILLS.map(k => ({ key: k, label: game.i18n.localize(WARBIRDS.flightSkills[k]), value: grades.regular[k] })),
    sa: grades.regular.sa,
    canPlace: !!selectedToken,
    placeName: selectedToken?.name ?? "",
    dispositions: [["-1", "HOSTILE"], ["0", "NEUTRAL"], ["1", "FRIENDLY"], ["-2", "SECRET"]].map(([value, key]) => ({ value, label: game.i18n.localize(`TOKEN.DISPOSITION.${key}`), selected: value === "-1" }))
  };
  const content = await renderTemplate(systemPath("templates/dialog/enemy-flight.hbs"), context);
  const div = document.createElement("div");
  div.innerHTML = content;
  const result = await DialogV2.prompt({
    window: { title: game.i18n.localize("WARBIRDS.EnemyFlight.title"), icon: "fa-solid fa-jet-fighter" },
    classes: ["warbirds", "wb-dialog"],
    position: { width: 460 },
    content: div,
    rejectClose: false,
    render: (event, dialog) => {
      // Picking a grade fills in its numbers; they stay editable.
      const table = JSON.parse(dialog.element.querySelector("[name=gradesJson]").value);
      const select = dialog.element.querySelector("[name=grade]");
      select?.addEventListener("change", () => {
        const g = table[select.value];
        if ( !g ) return;
        for ( const [k, v] of Object.entries(g) ) {
          const input = dialog.element.querySelector(`[name=crew-${k}]`);
          if ( input ) input.value = v;
        }
      });
    },
    ok: {
      label: "WARBIRDS.EnemyFlight.create",
      icon: "fa-solid fa-jet-fighter",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }
  });
  if ( !result ) return;

  const source = aircraft ?? game.actors.get(result.source);
  if ( !source ) return;
  const count = Math.clamp ? Math.clamp(Number(result.count) || 1, 1, 12) : Math.min(12, Math.max(1, Number(result.count) || 1));
  const prefix = (result.prefix || game.i18n.localize("WARBIRDS.EnemyFlight.defaultPrefix")).trim();
  const start = Number(result.start) || 1;
  const crew = { sa: Number(result["crew-sa"]) || 0 };
  for ( const k of SKILLS ) crew[k] = Math.min(6, Math.max(0, Number(result[`crew-${k}`]) || 0));
  if ( result.saveGrade && result.grade ) {
    const saved = foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "enemyGrades") ?? {});
    saved[result.grade] = { ...crew };
    await game.settings.set(SYSTEM_ID, "enemyGrades", saved);
  }
  const disposition = Number(result.disposition);
  const folder = await enemyFolder();
  const actors = await buildEnemyFlight(source, { count, prefix, start, crew, folder: folder?.id ?? null, disposition: Number.isNaN(disposition) ? -1 : disposition });
  if ( result.place && selectedToken && canvas?.scene ) await placeFlight(actors, selectedToken);
  ui.notifications.info("WARBIRDS.EnemyFlight.created", { localize: true, format: { count: actors.length, prefix } });
  return actors;
}

/**
 * Create a flight of enemy copies without a dialog (used by the generator and the test fight).
 * @param {Actor} source                 The aircraft to copy.
 * @param {object} options
 * @param {number} options.count
 * @param {string} options.prefix        Names are prefix + number.
 * @param {number} [options.start=1]
 * @param {object} options.crew          {sa, piloting, gunnery, strafing, ordinance, ew}, e.g. enemyGrades().regular.
 * @param {string|null} [options.folder]
 * @param {number} [options.disposition=-1]
 * @returns {Promise<Actor[]>}
 */
export async function buildEnemyFlight(source, { count, prefix, start=1, crew, folder=null, disposition=-1 }) {
  const docs = [];
  for ( let i = 0; i < count; i++ ) docs.push(enemyActorData(source, { name: `${prefix} ${start + i}`, crew, folder, disposition }));
  return Actor.implementation.createDocuments(docs);
}

/**
 * The "Enemy Flights" actor folder, created on first use.
 * @returns {Promise<Folder|null>}
 */
async function enemyFolder() {
  const name = game.i18n.localize("WARBIRDS.EnemyFlight.folder");
  let folder = game.folders.find(f => (f.type === "Actor") && (f.name === name));
  if ( !folder ) folder = await Folder.implementation.create({ name, type: "Actor", color: "#5a1e1e" });
  return folder;
}

/**
 * Drop the flight's tokens in a line next to a token on the scene.
 * @param {Actor[]} actors
 * @param {Token} anchor
 */
async function placeFlight(actors, anchor) {
  const scene = canvas.scene;
  const size = scene.grid.size;
  const docs = [];
  for ( let i = 0; i < actors.length; i++ ) {
    const data = await actors[i].getTokenDocument({ x: anchor.document.x + (i + 1) * size, y: anchor.document.y });
    docs.push(data.toObject());
  }
  return scene.createEmbeddedDocuments("Token", docs);
}
