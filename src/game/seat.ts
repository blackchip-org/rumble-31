// Cardinal names for the four seats, per specs/rules.md — seat 0 is
// South, and seats proceed clockwise (South, West, North, East), as in
// Bridge.
const SEAT_NAMES = ["South", "West", "North", "East"] as const;

export function seatName(seat: number): string {
  return SEAT_NAMES[seat] as string;
}

const SEAT_BY_LOWERCASE_NAME = new Map<string, number>(SEAT_NAMES.map((name, seat) => [name.toLowerCase(), seat]));

// seatByName resolves a cardinal name (case-insensitive, e.g. "north"
// or "North") back to its seat number, for parsing debug input like
// specs/params.md's `turn` parameter. Returns undefined if name isn't
// one of the four seat names.
export function seatByName(name: string): number | undefined {
  return SEAT_BY_LOWERCASE_NAME.get(name.toLowerCase());
}
