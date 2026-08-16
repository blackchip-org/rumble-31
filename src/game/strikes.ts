// ParsedStrikes is the result of parsing a debugging strikes value:
// each seat's starting strike count, whether it already holds an
// unused second chance (specs/rules.md), and whether it starts
// eliminated. A seat with an active second chance is never eliminated
// regardless of its strike count.
export interface ParsedStrikes {
  strikes: [number, number, number, number];
  secondChance: [boolean, boolean, boolean, boolean];
  eliminated: [boolean, boolean, boolean, boolean];
}

// parseStrikesDigits validates and parses the web GUI's debugging
// strikes= URL parameter (specs/params.md): a run of exactly four
// characters, one per seat in order (seat 0 first), each either a
// digit or the letter s/S. A digit sets that seat's strike count
// directly (3 or more starts it eliminated outright). s/S sets the
// seat to exactly three strikes with an active, unused second chance
// (starts it showing XX/, not eliminated). Throws if value isn't
// exactly 4 such characters.
export function parseStrikesDigits(value: string): ParsedStrikes {
  if (!/^[0-9sS]{4}$/.test(value)) {
    throw new Error(`invalid strikes value ${JSON.stringify(value)}: expected exactly 4 digits or s/S characters`);
  }

  const strikes: number[] = [];
  const secondChance: boolean[] = [];
  for (const ch of value) {
    const isSecondChance = ch === "s" || ch === "S";
    strikes.push(isSecondChance ? 3 : Number(ch));
    secondChance.push(isSecondChance);
  }
  const eliminated = strikes.map((s, i) => !secondChance[i] && s >= 3);

  return {
    strikes: strikes as [number, number, number, number],
    secondChance: secondChance as [boolean, boolean, boolean, boolean],
    eliminated: eliminated as [boolean, boolean, boolean, boolean],
  };
}
