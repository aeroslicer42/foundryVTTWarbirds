import { rollDogfightingInitiative } from "../dice/rolls.mjs";
import { summarizeDogfight, sideOf, outnumberBonus } from "../dice/dogfight.mjs";
import { systemPath } from "../config.mjs";

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Combat for Warbirds.
 *
 * Aircraft have no initiative of their own: every round, every pilot rolls Dogfighting and the highest roll shoots
 * first (core p70). So an aircraft combatant's initiative *is* its Dogfighting roll, rolled through the Dogfighting
 * card (with the roll breakdown and Reserve spending), and it is rolled again at the start of every round. Ground
 * people keep their 1d6 + Mind + Awareness for the whole fight, as the book says.
 *
 * Capacitor weapons (pulse lasers) regain one shot at the end of every round in which they did not fire. Cooldowns
 * need no bookkeeping here: a weapon stores the round it last fired and compares it with the combat round.
 */
export default class WarbirdsCombat extends Combat {

  /**
   * Aircraft roll Dogfighting through the system's own card; everything else uses the core formula.
   * @inheritDoc
   */
  async rollInitiative(ids, { formula=null, updateTurn=true, messageOptions={}, ...options }={}) {
    ids = typeof ids === "string" ? [ids] : Array.from(ids ?? []);
    const aircraft = [];
    const others = [];
    for ( const id of ids ) {
      const combatant = this.combatants.get(id);
      if ( (combatant?.actor?.type === "aircraft") && !formula ) aircraft.push(combatant);
      else others.push(id);
    }
    const currentId = this.combatant?.id;
    if ( others.length ) await super.rollInitiative(others, { formula, updateTurn, messageOptions, ...options });
    for ( const combatant of aircraft ) await rollDogfightingInitiative(combatant, { round: this.round, outnumber: this.outnumberBonusFor(combatant) });
    // Keep the same combatant's turn after the order changed, as the core method does.
    if ( aircraft.length && updateTurn && currentId ) {
      const turn = this.turns.findIndex(t => t.id === currentId);
      if ( (turn >= 0) && (turn !== this.turn) ) await this.update({ turn });
    }
    return this;
  }

  /** @inheritDoc */
  async _onStartRound(context) {
    await super._onStartRound(context);
    // Last round's defence choices are over.
    for ( const combatant of this.combatants ) {
      if ( combatant.flags?.warbirds?.defence ) await combatant.update({ "flags.warbirds.-=defence": null });
    }
    await this.rollDogfighting(context.round);
    await this.refreshDogfightSummary();
  }

  /**
   * Aircraft and SA tie-breaks: higher initiative first, then higher Situational Awareness (core p70), then name.
   * @inheritDoc
   */
  _sortCombatants(a, b) {
    const ia = typeof a.initiative === "number" ? a.initiative : -Infinity;
    const ib = typeof b.initiative === "number" ? b.initiative : -Infinity;
    if ( ib !== ia ) return ib - ia;
    const sa = c => (c.actor?.type === "aircraft") ? (c.actor.system.flightStats?.sa ?? 0) : 0;
    if ( sa(b) !== sa(a) ) return sa(b) - sa(a);
    return (a.name ?? "").localeCompare(b.name ?? "") || (a.id > b.id ? 1 : -1);
  }

  /* -------------------------------------------- */
  /*  Dogfight round                              */
  /* -------------------------------------------- */

  /** The aircraft that take part in the dogfight round: not defeated, not bombers / couriers (they are strafed). */
  get dogfighters() {
    return this.combatants.filter(c => (c.actor?.type === "aircraft") && !c.isDefeated && !(c.actor.system.threat > 0));
  }

  /**
   * Outnumbering bonus for one aircraft's flight: +1 per extra plane over the opposing flight, max +2 (core p70).
   * Sides come from token disposition: friendly tokens against everything else.
   * @param {Combatant} combatant
   * @returns {number}
   */
  outnumberBonusFor(combatant) {
    const side = sideOf(combatant.token?.disposition);
    let own = 0, other = 0;
    for ( const c of this.dogfighters ) {
      if ( sideOf(c.token?.disposition) === side ) own++;
      else other++;
    }
    return outnumberBonus(own, other);
  }

  /**
   * Round data for every dogfighter: roll, SA, side, whether the roll belongs to this round, and the defence chosen.
   * @returns {object[]}
   */
  dogfightEntries() {
    const round = this.round;
    return this.dogfighters.map(c => {
      const flags = c.flags?.warbirds ?? {};
      const rolledRound = flags.dogfightRound;
      // A roll made through the system records its round; a value typed into the tracker counts as this round's.
      const rolled = (rolledRound === undefined) || (rolledRound === null)
        ? (c.initiative !== null) && (c.initiative !== undefined)
        : ((rolledRound === round) || ((round <= 1) && (rolledRound === 0)));
      const defence = (flags.defence && (flags.defence.round === round)) ? flags.defence : null;
      return {
        id: c.id, name: c.name, img: c.img, initiative: c.initiative ?? null,
        sa: c.actor.system.flightStats?.sa ?? 0, side: sideOf(c.token?.disposition),
        rolled, crippled: !!c.actor.system.ratings?.autoLose, defence
      };
    });
  }

  /**
   * The round summary card data (see dogfight.mjs).
   * @returns {object}
   */
  dogfightSummary() {
    return { ...summarizeDogfight(this.dogfightEntries(), { round: this.round }), combatId: this.id };
  }

  /**
   * Post the round summary once every dogfighter has rolled, or update this round's card when the order or a
   * defence choice changes. GM side only.
   * @returns {Promise<ChatMessage|void>}
   */
  async refreshDogfightSummary() {
    if ( !this.started ) return;
    const card = this.dogfightSummary();
    if ( !card.ready ) return;
    const ids = this.getFlag("warbirds", "summaryMessages") ?? {};
    const existing = ids[this.round] ? game.messages.get(ids[this.round]) : null;
    if ( existing && foundry.utils.equals?.(existing.flags?.warbirds?.card, card) ) return existing;
    const content = await renderTemplate(systemPath("templates/chat/dogfight.hbs"), card);
    if ( existing ) {
      await existing.update({ content, "flags.warbirds.card": card });
      return existing;
    }
    const message = await ChatMessage.create({ content, flags: { warbirds: { type: "dogfight", card } } });
    await this.setFlag("warbirds", "summaryMessages", { ...ids, [this.round]: message.id });
    return message;
  }

  /** Debounced refresh for the updateCombatant hook (several rolls land in quick succession at round start). */
  scheduleDogfightSummary() {
    clearTimeout(this._dogfightTimer);
    this._dogfightTimer = setTimeout(() => this.refreshDogfightSummary().catch(err => console.error(err)), 300);
  }

  /**
   * Roll Dogfighting for every aircraft in the fight. In the first round, rolls made before combat began are kept;
   * from the second round on everybody rolls again.
   * @param {number} round
   */
  async rollDogfighting(round) {
    const ids = [];
    for ( const combatant of this.combatants ) {
      if ( (combatant.actor?.type !== "aircraft") || combatant.isDefeated ) continue;
      if ( (round <= 1) && (combatant.initiative !== null) ) continue;
      ids.push(combatant.id);
    }
    if ( ids.length ) await this.rollInitiative(ids, { updateTurn: false });
  }

  /** @inheritDoc */
  async _onEndRound(context) {
    await super._onEndRound(context);
    await this.rechargeWeapons(context.round);
  }

  /**
   * Give +1 ammo to every "recharges each round" weapon of the aircraft in this combat that did not fire in `round`.
   * Runs on the designated GM only (core calls the round events on one client).
   * @param {number} round   The round that just ended.
   */
  async rechargeWeapons(round) {
    const seen = new Set();
    for ( const combatant of this.combatants ) {
      const actor = combatant.actor;
      if ( !actor || (actor.type !== "aircraft") || seen.has(actor.uuid) ) continue;
      seen.add(actor.uuid);
      const updates = [];
      for ( const weapon of actor.itemTypes.weapon ) {
        const w = weapon.system;
        if ( (w.recharge !== "round") || !w.ammo.tracked || (w.ammo.value >= w.ammo.max) ) continue;
        if ( (w.lastFired.combat === this.id) && (w.lastFired.round === round) ) continue;
        updates.push({ _id: weapon.id, "system.ammo.value": Math.min(w.ammo.max, w.ammo.value + 1) });
      }
      if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
    }
  }
}
