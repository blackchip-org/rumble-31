// DealStep is one step of the round-start dealing animation: either
// one seat's Nth hand card, or one of the pot's three cards.
export type DealStep = { kind: "hand"; seat: number; cardIndex: number } | { kind: "pot"; potIndex: number };

// dealOrder returns the round-robin dealing sequence for the given
// active seats (seat-ascending): one card to each seat in turn,
// repeated three times — matching round.ts's dealCards order — then
// the three pot cards. Per specs/gui.md.
export function dealOrder(activeSeats: readonly number[]): DealStep[] {
  const steps: DealStep[] = [];
  for (let cardIndex = 0; cardIndex < 3; cardIndex++) {
    for (const seat of activeSeats) {
      steps.push({ kind: "hand", seat, cardIndex });
    }
  }
  for (let potIndex = 0; potIndex < 3; potIndex++) {
    steps.push({ kind: "pot", potIndex });
  }
  return steps;
}
