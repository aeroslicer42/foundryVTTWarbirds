/**
 * Warbirds — Jet Age
 * A Foundry VTT v14 game system for Outrider Studios' Warbirds RPG (Rapidfire rules).
 */
import { SYSTEM_ID, WARBIRDS, systemPath } from "./config.mjs";
import * as models from "./data/_module.mjs";
import WarbirdsActor from "./documents/actor.mjs";
import WarbirdsItem from "./documents/item.mjs";
import WarbirdsCombatant from "./documents/combatant.mjs";
import WarbirdsCombat from "./documents/combat.mjs";
import PilotSheet from "./applications/sheets/pilot-sheet.mjs";
import AircraftSheet from "./applications/sheets/aircraft-sheet.mjs";
import NpcSheet from "./applications/sheets/npc-sheet.mjs";
import VesselSheet from "./applications/sheets/vessel-sheet.mjs";
import WarbirdsItemSheet from "./applications/sheets/item-sheet.mjs";
import { buildPenaltyTrack, signed } from "./utils.mjs";
import * as rolls from "./dice/rolls.mjs";
import { registerStatusEffects, syncStatusEffects, syncAllStatusEffects } from "./status.mjs";
import { createEnemyFlight, registerEnemyFlightSettings } from "./applications/enemy-flight.mjs";
import { createTestFight } from "./applications/test-fight.mjs";

/* -------------------------------------------- */
/*  Init                                        */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialising the Warbirds system`);

  CONFIG.WARBIRDS = WARBIRDS;

  // Bundled font for the stencil lettering (Roboto Condensed, SIL OFL 1.1; see fonts/roboto-condensed/LICENSE).
  Object.assign(CONFIG.fontDefinitions, {
    "Roboto Condensed": {
      editor: true,
      fonts: [
        { urls: [systemPath("fonts/roboto-condensed/RobotoCondensed-Regular.woff2")] },
        { urls: [systemPath("fonts/roboto-condensed/RobotoCondensed-Bold.woff2")], weight: "bold" }
      ]
    }
  });

  game.warbirds = {
    models,
    documents: { WarbirdsActor, WarbirdsItem, WarbirdsCombat, WarbirdsCombatant },
    sheets: { PilotSheet, AircraftSheet, NpcSheet, VesselSheet, WarbirdsItemSheet },
    utils: { buildPenaltyTrack, signed },
    rolls,
    /** BVR helpers for macros: `game.warbirds.bvr.resolve("press", "crank")` → "dogfight"; `prompt()` opens the dialog. */
    bvr: { resolve: rolls.resolveBvrTactics, prompt: rolls.resolveBvr },
    /** Enemy flight generator (GM): `game.warbirds.createEnemyFlight(aircraftActor)`; without an actor it offers a picker. */
    createEnemyFlight,
    /** Test Fight (GM): two sample pilots in their jets against three MiG-21s, on a scene with a combat ready. */
    createTestFight
  };

  // Damage states shown on tokens (Trailing Smoke, Crippled, Going Down, Adrift, Destroyed, Down but Not Out...).
  registerStatusEffects();

  // Documents and data models.
  CONFIG.Actor.documentClass = WarbirdsActor;
  CONFIG.Item.documentClass = WarbirdsItem;
  CONFIG.Combat.documentClass = WarbirdsCombat;
  CONFIG.Combatant.documentClass = WarbirdsCombatant;
  Object.assign(CONFIG.Actor.dataModels, models.actor);
  Object.assign(CONFIG.Item.dataModels, models.item);

  // Type icons in the sidebar and create dialogs.
  Object.assign(CONFIG.Actor.typeIcons, {
    pilot: "fa-solid fa-user-pilot",
    aircraft: "fa-solid fa-jet-fighter",
    npc: "fa-solid fa-user-ninja",
    vessel: "fa-solid fa-ship"
  });
  Object.assign(CONFIG.Item.typeIcons, {
    weapon: "fa-solid fa-crosshairs",
    trait: "fa-solid fa-screwdriver-wrench",
    maneuver: "fa-solid fa-arrows-spin",
    sponsorship: "fa-solid fa-handshake",
    gear: "fa-solid fa-suitcase"
  });

  // Token bars: curated per actor type.
  CONFIG.Actor.trackableAttributes = Object.fromEntries(
    Object.entries(models.actor).map(([type, cls]) => [type, cls.trackableAttributes])
  );

  // Combat: initiative is 1d6 + @initiative (Mind + Awareness for people, Dogfighting for aircraft).
  CONFIG.Combat.initiative = { formula: "1d6 + @initiative", decimals: 0 };

  // Sheets.
  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, PilotSheet, { types: ["pilot"], makeDefault: true, label: "WARBIRDS.Sheet.pilot" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, AircraftSheet, { types: ["aircraft"], makeDefault: true, label: "WARBIRDS.Sheet.aircraft" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, NpcSheet, { types: ["npc"], makeDefault: true, label: "WARBIRDS.Sheet.npc" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, VesselSheet, { types: ["vessel"], makeDefault: true, label: "WARBIRDS.Sheet.vessel" });
  DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WarbirdsItemSheet, { makeDefault: true, label: "WARBIRDS.Sheet.item" });

  // Settings.
  game.settings.register(SYSTEM_ID, "standing", {
    name: "WARBIRDS.Settings.standing.name",
    hint: "WARBIRDS.Settings.standing.hint",
    scope: "world",
    config: true,
    type: String,
    choices: WARBIRDS.standingModes,
    default: "rank",
    onChange: () => {
      // Pilot sheets show different fields per mode; re-render anything open.
      for ( const app of foundry.applications.instances.values() ) {
        if ( app.document?.type === "pilot" ) app.render();
      }
    }
  });
  registerEnemyFlightSettings();
  game.settings.register(SYSTEM_ID, "gritty", {
    name: "WARBIRDS.Settings.gritty.name",
    hint: "WARBIRDS.Settings.gritty.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  registerHandlebarsHelpers();
});

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * Aircraft ratings depend on the linked pilot and vice versa. When one side changes, re-render the other side's
 * open sheet so the numbers stay in sync.
 */
Hooks.on("updateActor", (actor, changes, options, userId) => {
  let linkedUuid = null;
  if ( actor.type === "pilot" ) linkedUuid = actor.system.aircraft;
  else if ( actor.type === "aircraft" ) linkedUuid = actor.system.pilot;
  if ( !linkedUuid ) return;
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.document?.uuid === linkedUuid ) app.render();
  }
});

/** Chat card buttons: spend Reserve, apply damage. */
Hooks.on("renderChatMessageHTML", (message, html) => rolls.activateChatListeners(message, html));

/**
 * Damage states as token status effects, kept in step by the active GM's client: on any system change of an actor
 * (linked or a token's own copy), on new tokens, and once over everything when the world loads.
 */
Hooks.on("updateActor", (actor, changes) => {
  if ( !changes.system || !game.users.activeGM?.isSelf ) return;
  syncStatusEffects(actor).catch(err => console.error(err));
});
Hooks.on("updateToken", (token, changes) => {
  if ( !changes.delta || token.actorLink || !token.actor || !game.users.activeGM?.isSelf ) return;
  syncStatusEffects(token.actor).catch(err => console.error(err));
});
Hooks.on("createToken", token => {
  if ( !token.actor || !game.users.activeGM?.isSelf ) return;
  syncStatusEffects(token.actor).catch(err => console.error(err));
});
Hooks.once("ready", () => {
  if ( game.users.activeGM?.isSelf ) syncAllStatusEffects().catch(err => console.error(err));
});

/**
 * Dogfight round summary: once every aircraft has rolled, the GM's client posts the order / who-shoots-whom card for the
 * round and keeps it current as rolls, Reserve spends and defence choices come in.
 */
Hooks.on("updateCombatant", (combatant, changes, options, userId) => {
  if ( !game.users.activeGM?.isSelf ) return;
  if ( !("initiative" in changes) && !("defeated" in changes) && !foundry.utils.hasProperty(changes, "flags.warbirds") ) return;
  combatant.combat?.scheduleDogfightSummary?.();
});

/** Weapon cooldowns are read against the combat round: refresh open aircraft sheets when the round changes or combat ends. */
for ( const hook of ["combatRound", "combatStart", "deleteCombat"] ) {
  Hooks.on(hook, () => {
    for ( const app of foundry.applications.instances.values() ) {
      if ( app.document?.type === "aircraft" ) app.render();
    }
  });
}

/** Items on a pilot (gear) or aircraft (weapons, traits) also change linked numbers. */
for ( const hook of ["createItem", "updateItem", "deleteItem"] ) {
  Hooks.on(hook, item => {
    const actor = item.parent;
    if ( !(actor instanceof Actor) ) return;
    const linkedUuid = actor.type === "pilot" ? actor.system.aircraft : actor.type === "aircraft" ? actor.system.pilot : null;
    if ( !linkedUuid ) return;
    for ( const app of foundry.applications.instances.values() ) {
      if ( app.document?.uuid === linkedUuid ) app.render();
    }
  });
}

/* -------------------------------------------- */
/*  Handlebars                                  */
/* -------------------------------------------- */

function registerHandlebarsHelpers() {
  Handlebars.registerHelper("wbSigned", value => signed(value));
  Handlebars.registerHelper("wbRange", (from, to) => {
    const list = [];
    for ( let i = from; i <= to; i++ ) list.push(i);
    return list;
  });
}
