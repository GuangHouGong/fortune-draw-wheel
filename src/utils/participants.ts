export const DEFAULT_PARTICIPANT_COUNT = 120;
export const RECOMMENDED_PARTICIPANT_COUNT = 100;
export const MAX_PARTICIPANT_COUNT = 200;

export function createDefaultParticipants(count = DEFAULT_PARTICIPANT_COUNT): string[] {
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

export function participantsToText(participants: string[]): string {
  return participants.join('\n');
}

function normalizeParticipantName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function splitParticipantSegment(segment: string, shouldSplitWhitespace: boolean): string[] {
  const normalizedSegment = normalizeParticipantName(segment);

  if (!normalizedSegment) {
    return [];
  }

  const whitespaceParts = normalizedSegment.split(/\s+/u).filter(Boolean);

  if (whitespaceParts.length <= 1) {
    return [normalizedSegment];
  }

  if (shouldSplitWhitespace) {
    return whitespaceParts;
  }

  return [normalizedSegment];
}

export function parseParticipants(input: string): string[] {
  const seen = new Set<string>();
  const hasLineBreaks = /\r?\n/u.test(input);
  const lines = hasLineBreaks ? input.split(/\r?\n/u) : [input];
  const tokens = lines.flatMap((line) => {
    const commaSegments = line.split(/[,，、;；]+/u);
    const hasCommaSeparators = commaSegments.length > 1;

    return commaSegments.flatMap((segment) => {
      const shouldSplitWhitespace = !hasCommaSeparators && (!hasLineBreaks || /^(\s*\d+\s*)+$/u.test(segment));
      return splitParticipantSegment(segment, shouldSplitWhitespace);
    });
  });

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
