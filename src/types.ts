export type Participant = { id: string; label: string; code: string; groupId: string | null };
export type Group = { id: string; name: string };
export type Prize = { id: string; name: string; quantity: number; groupIds: string[] | null };
export type RepeatPolicy = 'activity' | 'prize' | 'none';
export type DrawMethod = 'wheel' | 'ticker' | 'instant';
export type DrawSettings = { method: DrawMethod; autoStop: boolean; repeatPolicy: RepeatPolicy };
export type DrawRecord = {
  id: string; drawId: string; participantId: string; label: string; code: string;
  groupName: string; prizeId: string | null; prizeName: string;
  drawnAt: string; status: 'won' | 'absent' | 'declined';
};
export type PendingDraw = {
  id: string; prizeId: string | null; prizeName: string;
  winners: Participant[]; groupNames: Record<string, string>;
  revealedCount: number; startedAt: string; mode: 'single' | 'sequence' | 'batch';
  candidateIds: string[];
};
export type Activity = {
  id: string; name: string; createdAt: string; archived: boolean;
  participants: Participant[]; groups: Group[]; prizes: Prize[];
  settings: DrawSettings; records: DrawRecord[]; pendingDraw: PendingDraw | null;
};
export type Preferences = { largeText: boolean; reducedMotion: boolean; sound: boolean; speech: boolean; voiceURI: string; speechRate: number };
export type AppData = { schemaVersion: 2; activities: Activity[]; activeActivityId: string | null; preferences: Preferences };
export type ImportRow = { label: string; code: string; group: string };
