// rules.js — declarative event specs. Engine loops over these generically.
// Each entry: { validate: [[name, fn(event, state)->truthy]...], apply: fn(event, state) }.
// Adding a new event type means adding an entry here; the engine never changes.

const positiveAmt = ['amount_positive', (e) => Number.isFinite(e.amount) && e.amount > 0];
const userOk      = ['user_present',    (e) => typeof e.user === 'string' && e.user.length > 0];
const userExists  = ['user_exists',     (e, s) => s.has(e.user)];
const userHasEnough = ['sufficient',    (e, s) => (s.get(e.user) ?? 0) >= e.amount];

const credit = (e, s) => s.set(e.user, (s.get(e.user) ?? 0) + e.amount);
const debit  = (e, s) => s.set(e.user, s.get(e.user) - e.amount);

export const rules = {
  deposit:  { validate: [positiveAmt, userOk], apply: credit },
  mint:     { validate: [positiveAmt, userOk], apply: credit },
  withdraw: { validate: [positiveAmt, userOk, userExists, userHasEnough], apply: debit },
  burn:     { validate: [positiveAmt, userOk, userExists, userHasEnough], apply: debit },
  transfer: {
    validate: [
      positiveAmt,
      ['from_present',  (e) => typeof e.from === 'string' && e.from.length > 0],
      ['to_present',    (e) => typeof e.to === 'string' && e.to.length > 0],
      ['not_self',      (e) => e.from !== e.to],
      ['sender_exists', (e, s) => s.has(e.from)],
      ['sufficient',    (e, s) => (s.get(e.from) ?? 0) >= e.amount],
    ],
    apply: (e, s) => {
      s.set(e.from, s.get(e.from) - e.amount);
      s.set(e.to,  (s.get(e.to) ?? 0) + e.amount);
    },
  },
};

export function validate(event, state) {
  if (!event || typeof event !== 'object') return { rule: 'not_object', type: 'unknown' };
  const t = event.type;
  if (typeof t !== 'string' || t.length === 0) return { rule: 'missing_type', type: 'unknown' };
  const def = rules[t];
  if (!def) return { rule: 'unknown_type', type: t };
  for (const [name, fn] of def.validate) if (!fn(event, state)) return { rule: name, type: t };
  return null;
}

export function apply(event, state) {
  rules[event.type].apply(event, state);
}
