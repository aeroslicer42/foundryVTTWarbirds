import WarbirdsActorSheet from "./base-actor-sheet.mjs";
import { SYSTEM_ID, systemPath, WARBIRDS } from "../../config.mjs";
import { signed } from "../../utils.mjs";
import * as rolls from "../../dice/rolls.mjs";
import { createEnemyFlight } from "../enemy-flight.mjs";

/**
 * The aircraft sheet: a cockpit layout with the stat block, ratings, defences, structure track,
 * the weapon loadout and the trait list.
 */
export default class AircraftSheet extends WarbirdsActorSheet {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["aircraft"],
    position: { width: 820, height: 760 },
    window: {
      icon: "fa-solid fa-jet-fighter",
      controls: [{ icon: "fa-solid fa-jet-fighter-up", label: "WARBIRDS.EnemyFlight.title", action: "createEnemyFlight" }]
    },
    actions: {
      linkPilot: AircraftSheet.#onLinkPilot,
      bailOut: AircraftSheet.#onBailOut,
      rearm: AircraftSheet.#onRearm,
      createEnemyFlight: AircraftSheet.#onCreateEnemyFlight
    }
  };

  static ACCEPTED_ITEM_TYPES = ["weapon", "trait", "maneuver"];

  /** @inheritDoc */
  static TABS = {
    primary: {
      tabs: [
        { id: "cockpit", icon: "fa-solid fa-gauge-high" },
        { id: "loadout", icon: "fa-solid fa-rocket" },
        { id: "crew", icon: "fa-solid fa-user-pilot" },
        { id: "notes", icon: "fa-solid fa-book" }
      ],
      initial: "cockpit",
      labelPrefix: "WARBIRDS.Tabs"
    }
  };

  /** @inheritDoc */
  static PARTS = {
    header: { template: systemPath("templates/actor/aircraft/header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    cockpit: {
      template: systemPath("templates/actor/aircraft/cockpit.hbs"),
      templates: [systemPath("templates/shared/track.hbs"), systemPath("templates/shared/item-row.hbs")],
      scrollable: [""]
    },
    loadout: {
      template: systemPath("templates/actor/aircraft/loadout.hbs"),
      templates: [systemPath("templates/shared/item-row.hbs")],
      scrollable: [""]
    },
    crew: { template: systemPath("templates/actor/aircraft/crew.hbs"), scrollable: [""] },
    notes: { template: systemPath("templates/actor/aircraft/notes.hbs"), scrollable: [""] }
  };

  /* -------------------------------------------- */

  /** The enemy flight generator is a GM tool. @inheritDoc */
  _getHeaderControls() {
    return super._getHeaderControls().filter(c => (c.action !== "createEnemyFlight") || game.user.isGM);
  }

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if ( this.actor.limited ) {
      const { header, tabs, notes } = parts;
      return { header, tabs, notes };
    }
    return parts;
  }

  /** @inheritDoc */
  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if ( (group === "primary") && this.actor.limited ) for ( const id of ["cockpit", "loadout", "crew"] ) delete tabs[id];
    return tabs;
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    const pilot = system.pilotActor;
    // Show the callsign unless the pilot's name already carries it (Dana “Sparrow” Cole).
    const callsign = pilot?.system.callsign && !pilot.name.toLowerCase().includes(pilot.system.callsign.toLowerCase()) ? pilot.system.callsign : "";
    context.pilot = pilot ? { uuid: pilot.uuid, name: pilot.name, img: pilot.img, callsign } : null;
    context.flight = system.flightStats;
    return context;
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    const system = this.actor.system;
    const r = system.ratings;
    const t = system.totals;
    const enrich = async html => foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
      secrets: this.actor.isOwner, relativeTo: this.actor, rollData: this.actor.getRollData()
    });

    switch ( partId ) {
      case "cockpit":
        context.track = this._prepareTrack(t.penalties, system.damage, "damage");
        context.ratings = [
          { key: "dogfighting", label: "WARBIRDS.Ratings.dogfighting", value: signed(r.dogfighting), formula: "WARBIRDS.Formula.dogfighting", rollable: true },
          { key: "strafing", label: "WARBIRDS.Ratings.strafing", value: signed(r.strafing), formula: "WARBIRDS.Formula.strafing", rollable: true },
          { key: "gunnery", label: "WARBIRDS.Ratings.gunnery", value: signed(r.gunnery), formula: "WARBIRDS.Formula.gunnery", rollable: false },
          { key: "ordinance", label: "WARBIRDS.Ratings.ordinance", value: signed(r.ordinance), formula: "WARBIRDS.Formula.ordinance", rollable: false },
          { key: "ew", label: "WARBIRDS.Ratings.ew", value: signed(r.ew), formula: "WARBIRDS.Formula.ew", rollable: true }
        ];
        context.defences = [
          { key: "break", label: "WARBIRDS.Defence.break", value: r.breakDefence, formula: "WARBIRDS.Formula.breakDefence" },
          { key: "shoot", label: "WARBIRDS.Defence.shoot", value: r.shootDefence, formula: "WARBIRDS.Formula.shootDefence" },
          { key: "escape", label: "WARBIRDS.Defence.escape", value: r.escapeDefence, formula: "WARBIRDS.Formula.escapeDefence" },
          { key: "stunt", label: "WARBIRDS.Defence.stunt", value: `1d6 ${signed(r.stuntDefence)}`, formula: "WARBIRDS.Formula.stuntDefence" }
        ];
        context.weapons = this.#weaponRows().filter(w => w.system.mounted);
        context.traits = this._prepareItems("trait").filter(t => t.system.active);
        context.radarDisplay = system.radar.value === null ? "—" : signed(system.radar.value);
        context.canBailOut = ["crippled", "down"].includes(t.status);
        context.gritty = game.settings.get(SYSTEM_ID, "gritty");
        if ( context.canBailOut ) {
          const down = (t.status === "down") && !!system.pilotActor;
          const helo = down && t.helicopter;
          const roll = down && (context.gritty || t.helicopter);
          context.bailOut = {
            detail: helo ? game.i18n.localize("WARBIRDS.Roll.bailOutFormulaHelicopter") : (roll ? game.i18n.localize("WARBIRDS.Roll.bailOutFormula") : ""),
            hint: game.i18n.localize(helo ? "WARBIRDS.Aircraft.bailOutHintHelicopter" : roll ? "WARBIRDS.Aircraft.bailOutHintRoll" : (t.status === "down" ? "WARBIRDS.Aircraft.bailOutHintDown" : "WARBIRDS.Aircraft.bailOutHintCrippled"))
          };
        }
        break;

      case "loadout":
        context.weapons = this.#weaponRows();
        context.canRearm = this.actor.isOwner && this.actor.itemTypes.weapon.some(w => w.system.ammo.tracked && (w.system.ammo.value < w.system.ammo.max));
        context.traits = this._prepareItems("trait");
        context.maneuvers = this._prepareItems("maneuver");
        context.traitModifiers = WARBIRDS.traitModifiers.filter(key => system.traitMods[key]).map(key => ({
          label: game.i18n.localize(`WARBIRDS.TraitModifier.${key}`), value: signed(system.traitMods[key])
        }));
        if ( system.traitMods.grantsBVR ) context.traitModifiers.push({ label: game.i18n.localize("WARBIRDS.Trait.grantsBvr"), value: "" });
        break;

      case "crew":
        context.crewSkills = Object.entries(system.crew.flightSkills).map(([key, skill]) => ({
          key, label: game.i18n.localize(WARBIRDS.flightSkills[key]), ...skill
        }));
        break;

      case "notes":
        context.enriched = {
          description: await enrich(system.description),
          notes: await enrich(system.notes)
        };
        break;
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Weapon rows with a state badge while the weapon is cooling down (ready on round N of the active combat).
   * @returns {object[]}
   */
  #weaponRows() {
    return this._prepareItems("weapon").map(row => {
      const cooling = row.system.cooling;
      if ( cooling.active ) row.badge = { css: "wb-badge-cooling", label: game.i18n.format("WARBIRDS.Weapon.coolingBadge", { round: cooling.readyRound }) };
      return row;
    });
  }

  /**
   * Mounting ordinance or missiles beyond the airframe's hard points is allowed but flagged.
   * @inheritDoc
   */
  async _onDropItem(event, item) {
    const result = await super._onDropItem(event, item);
    if ( result && ["ordinance", "missile"].includes(item.system?.category) ) this.#checkHardpoints();
    return result;
  }

  /**
   * Warn when the mounted ordinance exceeds the airframe's hard points (the derived data is current once the drop resolves).
   */
  #checkHardpoints() {
    const hp = this.actor.system.hardpoints;
    if ( hp.over ) ui.notifications.warn("WARBIRDS.Notifications.hardpointsOver", { localize: true, format: { used: hp.used, total: hp.total } });
  }

  /**
   * Dropping a pilot actor on the aircraft assigns it as the pilot (and links the aircraft back).
   * @inheritDoc
   */
  async _onDropActor(event, actor) {
    if ( !this.actor.isOwner ) return null;
    if ( actor.type !== "pilot" ) {
      ui.notifications.warn("WARBIRDS.Notifications.dropPilotOnly", { localize: true });
      return null;
    }
    await this.#link(actor);
    return actor;
  }

  /**
   * Link a pilot to this aircraft in both directions.
   * @param {Actor} pilot
   */
  async #link(pilot) {
    await this.actor.update({ "system.pilot": pilot.uuid });
    if ( pilot.isOwner && (pilot.system.aircraft !== this.actor.uuid) ) {
      await pilot.update({ "system.aircraft": this.actor.uuid });
    }
  }

  /**
   * Bail out of a Crippled or Going Down aircraft.
   * @this {AircraftSheet}
   */
  static #onBailOut() {
    return rolls.bailOut(this.actor);
  }

  /**
   * GM: create an enemy flight of copies of this aircraft.
   * @this {AircraftSheet}
   */
  static #onCreateEnemyFlight() {
    return createEnemyFlight(this.actor);
  }

  /**
   * Between scenes: refill every tracked ammo counter (and recharge capacitor weapons) to its maximum.
   * @this {AircraftSheet}
   */
  static async #onRearm() {
    const updates = this.actor.itemTypes.weapon
      .filter(w => w.system.ammo.tracked && (w.system.ammo.value < w.system.ammo.max))
      .map(w => ({ _id: w.id, "system.ammo.value": w.system.ammo.max }));
    if ( !updates.length ) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("WARBIRDS.Dialog.rearmTitle") },
      content: `<p>${game.i18n.format("WARBIRDS.Dialog.rearmContent", { count: updates.length })}</p>`,
      rejectClose: false,
      modal: true
    });
    if ( !confirmed ) return;
    await this.actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * Pick a pilot from the world's actors.
   * @this {AircraftSheet}
   */
  static async #onLinkPilot(event, target) {
    const choices = game.actors.filter(a => a.type === "pilot" && a.isOwner);
    if ( !choices.length ) return ui.notifications.info("WARBIRDS.Notifications.noPilots", { localize: true });
    const options = choices.map(a => `<option value="${a.uuid}">${foundry.utils.escapeHTML(a.name)}${a.system.callsign ? ` “${foundry.utils.escapeHTML(a.system.callsign)}”` : ""}</option>`).join("");
    const uuid = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("WARBIRDS.Dialog.linkPilotTitle") },
      content: `<div class="form-group"><label>${game.i18n.localize("TYPES.Actor.pilot")}</label><div class="form-fields"><select name="uuid">${options}</select></div></div>`,
      ok: { label: "WARBIRDS.Dialog.link", callback: (event, button) => button.form.elements.uuid.value },
      rejectClose: false
    });
    if ( !uuid ) return;
    const pilot = await fromUuid(uuid);
    if ( pilot ) await this.#link(pilot);
  }
}
