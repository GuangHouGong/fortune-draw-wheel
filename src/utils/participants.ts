export const DEFAULT_PARTICIPANT_COUNT = 120;

export function createDefaultParticipants(count = DEFAULT_PARTICIPANT_COUNT): string[] {
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

export function participantsToText(participants: string[]): string {
  return participants.join('\n');
}

export function parseParticipants(input: string): string[] {
  const seen = new Set<string>();
  const tokens = input
    .split(/[\s,，、]+/u)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens.filter((token) => {
    if (seen.has(token)) {
      return false;
    }

    seen.add(token);
    return true;
  });
}

export function createWinnerSet(winnerIds: string[]): Set<string> {
  return new Set(winnerIds.map((id) => id.trim()).filter(Boolean));
}

export function getAvailableParticipants(
  participants: string[],
  winnerIds: string[],
  allowRepeat: boolean,
): string[] {
  if (allowRepeat) {
    return participants;
  }

  const winnerSet = createWinnerSet(winnerIds);
  return participants.filter((participant) => !winnerSet.has(participant));
}

export function randomIndex(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('randomIndex requires a positive integer.');
  }

  const cryptoSource = globalThis.crypto;
  if (!cryptoSource?.getRandomValues) {
    throw new Error('This browser does not support crypto.getRandomValues.');
  }

  const range = 0x1_0000_0000;
  const limit = range - (range % maxExclusive);
  const buffer = new Uint32Array(1);

  while (true) {
    cryptoSource.getRandomValues(buffer);
    const value = buffer[0];

    if (value < limit) {
      return value % maxExclusive;
    }
  }
}
