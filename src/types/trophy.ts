import type { CatalogSegment, CloudAttempt } from "../hooks/useGoogleDrive";
import type { GPXPoint } from "../utils/gpxParser";

export type TrophyCategory =
  | "streak"
  | "improvement"
  | "volume"
  | "rank"
  | "time"
  | "speed"
  | "pause"
  | "special";

export type TrophyTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legendary";

export interface TrophyContext {
  segment: CatalogSegment;
  attempt: CloudAttempt;
  existingAttempts: CloudAttempt[];
  allUserAttempts: { segmentId: string; attempt: CloudAttempt }[];
  segmentPoints?: GPXPoint[];
}

export interface TrophyDefinition {
  id: string;
  category: TrophyCategory;
  title: string;
  description: string;
  praiseMessage: string;
  icon: string;
  badgeColor: string;
  badgeBg: string;
  tier: TrophyTier;
  evaluate: (ctx: TrophyContext) => boolean;
}

export interface UnlockedTrophy {
  id: string; // unique instance ID
  trophyId: string;
  unlockedAt: string;
  segmentId: string;
  segmentName: string;
  attemptId: string;
}
