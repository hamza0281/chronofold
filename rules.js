// rules.js — declarative validation rules for Chronofold.
// Each rule is a tuple [name, fn(event, state) -> truthy when valid].
// Adding a new event type = adding an entry here. The engine stays generic.

export const rules = {
  deposit: [
    ['amount_positive', (e) => Number.isFinite(e.amount) && e.amount > 0],
    ['user_present',    (e) => typeof e.user === 'string' && e.user.length > 0],
  ],
  transfer: [
    ['amount_positive', (e) => Number.isFinite(e.amount) && e.amount > 0],
    ['from_present',    (e) => typeof e.from === 'string' && e.from.length > 0],
    ['to_present',      (e) => typeof e.to === 'string' && e.to.length > 0],
    ['not_self',        (e) => e.from !== e.to],
    ['sender_exists',   (e, s) => s.has(e.from)],
    ['sufficient',      (e, s) => (s.get(e.from) ?? 0) >= e.amount],
  ],
};

// Returns null when the event is valid, else { rule, type } describing the
// first failing rule. The caller treats any non-null return as a rejection.
export function validate(event, state) {
  if (!event || typeof event !== 'object') return { rule: 'not_object', type: 'unknown' };
  const t = event.type;
  if (typeof t !== 'string' || t.length === 0) return { rule: 'missing_type', type: 'unknown' };
  const set = rules[t];
  if (!set) return { rule: 'unknown_type', type: t };
  for (const [name, fn] of set) {
    if (!fn(event, state)) return { rule: name, type: t };
  }
  return null;
}
