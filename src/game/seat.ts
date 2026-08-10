// Cardinal names for the four seats, per specs/rules.md — seat 0 is
// South, and seats proceed clockwise (South, West, North, East), as in
// Bridge.
const SEAT_NAMES = ["South", "West", "North", "East"] as const;

export function seatName(seat: number): string {
  return SEAT_NAMES[seat] as string;
}
