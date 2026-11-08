// Deliberately accept only a whole unit containing an explicit integer value.
// Do not infer totals, currencies, multipliers, dates, formulas or table semantics.
export function attachmentMoney(text) {
  if (typeof text !== 'string') return null;
  const match = /^(?:₩\s*)?(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\s*원)?$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isSafeInteger(value) ? value : null;
}
