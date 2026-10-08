/**
 * Field factory helpers so every schema reads the same way.
 */
const fields = foundry.data.fields;

/**
 * A required, non-nullable integer field.
 * @param {object} [options]
 * @returns {foundry.data.fields.NumberField}
 */
export function integer(options = {}) {
  return new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, ...options });
}

/**
 * A required string field that may be blank.
 * @param {object} [options]
 * @returns {foundry.data.fields.StringField}
 */
export function text(options = {}) {
  return new fields.StringField({ required: true, blank: true, initial: "", ...options });
}

/**
 * A string field restricted to a set of choices.
 * @param {Record<string, string>|string[]} choices
 * @param {string} initial
 * @param {object} [options]
 * @returns {foundry.data.fields.StringField}
 */
export function choice(choices, initial, options = {}) {
  return new fields.StringField({ required: true, blank: false, choices, initial, ...options });
}

/**
 * The three core stats (Body, Mind, Spirit), each -3..+3.
 * @returns {foundry.data.fields.SchemaField}
 */
export function statsField() {
  return new fields.SchemaField({
    body: integer({ min: -3, max: 3 }),
    mind: integer({ min: -3, max: 3 }),
    spirit: integer({ min: -3, max: 3 })
  });
}

/**
 * An open-ended skill list keyed by id (default skills use their canonical key, custom ones a random id).
 * @returns {foundry.data.fields.TypedObjectField}
 */
export function skillsField() {
  return new fields.TypedObjectField(new fields.SchemaField({
    name: new fields.StringField({ required: true, blank: false, initial: "Skill" }),
    stat: choice(["body", "mind", "spirit"], "mind"),
    level: integer({ min: 0, max: 6 }),
    xp: integer({ min: 0 }),
    knack: new fields.BooleanField({ initial: false }),
    note: text()
  }));
}

/**
 * The four core flight skills plus the Jet Age Electronic Warfare skill.
 * @param {boolean} [npc=false]   NPC crews start at 0 in everything.
 * @returns {foundry.data.fields.SchemaField}
 */
export function flightSkillsField(npc = false) {
  const skill = initial => new fields.SchemaField({
    level: integer({ min: 0, max: 6, initial }),
    xp: integer({ min: 0 }),
    knack: new fields.BooleanField({ initial: false })
  });
  return new fields.SchemaField({
    piloting: skill(npc ? 0 : 1),
    strafing: skill(npc ? 0 : 1),
    gunnery: skill(npc ? 0 : 1),
    ordinance: skill(npc ? 0 : 1),
    ew: skill(0)
  });
}
