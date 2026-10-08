import { WARBIRDS } from "../config.mjs";

/**
 * The Actor document class for every Warbirds actor type.
 */
export default class WarbirdsActor extends Actor {

  /** @inheritDoc */
  getRollData() {
    const data = { ...this.system, name: this.name };
    if ( typeof this.system.modifyRollData === "function" ) this.system.modifyRollData(data);
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Token bars for people show remaining Health and for aircraft remaining Structure, but the stored value is the
   * damage taken (wounds / damage). Translate bar edits made from the token HUD into damage updates.
   * @inheritDoc
   */
  async modifyTokenAttribute(attribute, value, isDelta=false, isBar=true) {
    const current = foundry.utils.getProperty(this.system, attribute);
    let updates;
    const hasStructure = ["aircraft", "vessel"].includes(this.type);
    if ( (attribute === "health") && !hasStructure ) {
      const max = current?.max ?? 0;
      const remaining = isDelta ? (max - this.system.wounds) + value : value;
      updates = { "system.wounds": Math.max(0, max - remaining) };
    }
    else if ( (attribute === "structure") && hasStructure ) {
      const max = current?.total ?? current?.max ?? 0;
      const remaining = isDelta ? (max - this.system.damage) + value : value;
      updates = { "system.damage": Math.max(0, max - remaining) };
    }
    else return super.modifyTokenAttribute(attribute, value, isDelta, isBar);

    const allowed = Hooks.call("modifyTokenAttribute", { attribute, value, isDelta, isBar }, updates, this);
    return allowed !== false ? this.update(updates) : this;
  }

  /* -------------------------------------------- */

  /**
   * Apply damage after Resist/Armour to this actor (people take wounds, aircraft and vessels take structure damage).
   * @param {number} amount          Damage that gets through.
   * @param {object} [options]
   * @param {string|null} [options.part]   For vessels: the sub-system unit hit (null = main Structure).
   * @returns {Promise<object>}      What happened: {part, disabledNow, redirected}
   */
  async applyDamage(amount, { part = null } = {}) {
    amount = Math.max(0, Math.floor(amount));
    if ( !amount ) return { part: null, disabledNow: false };
    if ( this.type === "vessel" ) return this.system.applyDamage(amount, part);
    if ( this.type === "aircraft" ) {
      await this.update({ "system.damage": this.system.damage + amount });
      return { part: null, disabledNow: false };
    }
    await this.update({ "system.wounds": this.system.wounds + amount });
    return { part: null, disabledNow: false };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;

    const updates = {};
    // A sensible default portrait per type.
    if ( !data.img ) updates.img = WARBIRDS.defaultIcons.Actor[this.type] ?? this.constructor.DEFAULT_ICON;

    // Prototype token defaults: linked player actors, the right bar per type.
    const bar = ["aircraft", "vessel"].includes(this.type) ? "structure" : "health";
    const token = {
      bar1: { attribute: bar },
      displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
    };
    if ( this.type === "pilot" ) {
      token.actorLink = true;
      token.disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      token.sight = { enabled: true };
      token.bar2 = { attribute: "reserve" };
    }
    if ( this.type !== "pilot" ) {
      token.bar2 = { attribute: null };
    }
    updates.prototypeToken = foundry.utils.mergeObject(token, data.prototypeToken ?? {}, { inplace: false });
    this.updateSource(updates);
  }
}
