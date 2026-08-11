// parseStrikesDigits validates and parses the debugging strikes value
// used by both the CLI's -strikes flag and the web GUI's strikes= URL
// parameter, per specs/cli.md and specs/params.md: a run of exactly
// four digits, one per seat in order (seat 0 first). Throws if value
// isn't exactly 4 digits.
export function parseStrikesDigits(value: string): [number, number, number, number] {
  if (!/^\d{4}$/.test(value)) {
    throw new Error(`invalid strikes value ${JSON.stringify(value)}: expected exactly 4 digits`);
  }
  return [Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3])] as [
    number,
    number,
    number,
    number,
  ];
}
