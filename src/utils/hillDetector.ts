import type { GPXPoint } from "./gpxParser";

export interface ClimbCandidate {
  startIndex: number;
  endIndex: number;
  elevationGain: number;
  distance: number; // in meters
  avgGrade: number; // in %
}

// Simple moving average for elevations to filter out GPS jitter
export function smoothElevations(points: GPXPoint[], windowSize = 5): number[] {
  const smoothed: number[] = [];
  const len = points.length;

  for (let i = 0; i < len; i++) {
    let sum = 0;
    let count = 0;
    for (let w = -windowSize; w <= windowSize; w++) {
      const idx = i + w;
      if (idx >= 0 && idx < len) {
        sum += points[idx].ele;
        count++;
      }
    }
    smoothed.push(sum / count);
  }

  return smoothed;
}

// Detect segments of continuous climbs (Valley-to-Summit)
export function detectClimbs(points: GPXPoint[]): ClimbCandidate[] {
  if (points.length < 5) return [];

  const smoothedEle = smoothElevations(points, 7);
  const candidates: ClimbCandidate[] = [];
  
  let i = 0;
  const len = points.length;

  while (i < len - 1) {
    // Look for a local minimum (valley) to start a climb
    // A valley is where elevation starts increasing
    let startIdx = i;
    while (startIdx < len - 2 && smoothedEle[startIdx + 1] <= smoothedEle[startIdx]) {
      startIdx++;
    }

    let endIdx = startIdx;
    let maxEleIdx = startIdx;
    let maxEle = smoothedEle[startIdx];

    // Follow the climb uphill
    for (let j = startIdx + 1; j < len; j++) {
      const currentEle = smoothedEle[j];
      
      if (currentEle > maxEle) {
        maxEle = currentEle;
        maxEleIdx = j;
      }

      // Check if we are descending significantly (end of climb)
      // If we drop by more than 8 meters from the max elevation reached in this climb,
      // or if we have descended for more than 150 meters of distance, the climb is over.
      const eleDrop = maxEle - currentEle;
      const distFromPeak = points[j].distance - points[maxEleIdx].distance;

      if (eleDrop > 8.0 || distFromPeak > 150.0) {
        endIdx = maxEleIdx;
        break;
      }
      endIdx = j;
    }

    if (endIdx > startIdx) {
      const startPt = points[startIdx];
      const endPt = points[endIdx];
      const distance = endPt.distance - startPt.distance;
      const elevationGain = smoothedEle[endIdx] - smoothedEle[startIdx];

      // Criteria: Length >= 200m, Elevation Gain >= 15m, average grade >= 1.5%
      const avgGrade = distance > 0 ? (elevationGain / distance) * 100 : 0;

      if (distance >= 200 && elevationGain >= 15.0 && avgGrade >= 1.5) {
        candidates.push({
          startIndex: startIdx,
          endIndex: endIdx,
          elevationGain,
          distance,
          avgGrade,
        });
      }
      i = endIdx + 1; // Move past the climb
    } else {
      i++;
    }
  }

  return candidates;
}
