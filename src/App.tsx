import React, { useState, useEffect } from "react";
import { parseGPX, generateGPX, calculateDistance } from "./utils/gpxParser";
import type { GPXData, GPXPoint } from "./utils/gpxParser";
import { detectClimbs } from "./utils/hillDetector";
import type { ClimbCandidate } from "./utils/hillDetector";
import { useGoogleDrive } from "./hooks/useGoogleDrive";
import type { CatalogSegment, CloudAttempt } from "./hooks/useGoogleDrive";
import { MapView } from "./components/MapView";
import { ChartView } from "./components/ChartView";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceArea } from "recharts";

export interface AppNotification {
  id: string;
  date: string;
  title: string;
  read: boolean;
  matches: {
    segmentId: string;
    segmentName: string;
    durationMs: number;
    rank: number;
    isPR: boolean;
  }[];
}

// Helper: Format milliseconds to MM:SS or HH:MM:SS
function formatMsToTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Helper: Get relative time string in Korean
function getRelativeTimeKo(dateStr: string): string {
  const now = new Date();
  const past = new Date(dateStr);
  
  const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const pastZero = new Date(past.getFullYear(), past.getMonth(), past.getDate());
  
  const diffTime = nowZero.getTime() - pastZero.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 0) return dateStr;
  
  if (diffDays < 7) {
    return `${diffDays}일 전`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}주 전`;
  }
  const months = Math.floor(diffDays / 30);
  if (months < 12) {
    return `${months}달 전`;
  }
  const years = Math.floor(months / 12);
  return `${years}년 전`;
}

// Helper: Parse MM:SS or HH:MM:SS string to milliseconds
function parseTimeToMs(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return 0;
    return (m * 60 + s) * 1000;
  } else if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return 0;
    return (h * 3600 + m * 60 + s) * 1000;
  }
  return 0;
}

interface SplitDetail {
  splitNum: number;
  startDist: number;
  endDist: number;
  timeStr: string;
  avgSpeed: number;
  avgGrade: number;
  avgHr?: number;
  avgPower?: number;
  avgCadence?: number;
}

// Splits calculation algorithm (removes fake/simulation sensor values)
function calculateSplits(points: GPXPoint[], attempt: CloudAttempt, avgGradePercent: number): SplitDetail[] {
  if (points.length < 2) return [];
  
  const startPt = points[0];
  const endPt = points[points.length - 1];
  const totalDist = endPt.distance - startPt.distance;
  const splitDist = totalDist / 10;
  const splits: SplitDetail[] = [];
  
  let baseDurationMs = 0;
  if (startPt.time && endPt.time) {
    baseDurationMs = new Date(endPt.time).getTime() - new Date(startPt.time).getTime();
  }
  if (baseDurationMs <= 0) {
    baseDurationMs = attempt.durationMs;
  }
  
  const scaleFactor = attempt.durationMs / baseDurationMs;
  let currentPtIdx = 0;

  // Determine if sensors are actually present in the GPX points
  const hasHr = points.some(pt => pt.hr !== undefined && pt.hr > 0);
  const hasPower = points.some(pt => pt.power !== undefined && pt.power > 0);
  const hasCadence = points.some(pt => pt.cadence !== undefined && pt.cadence > 0);
  
  for (let i = 0; i < 10; i++) {
    const targetStartDist = i * splitDist;
    const targetEndDist = (i + 1) * splitDist;
    
    const splitPoints: GPXPoint[] = [];
    while (currentPtIdx < points.length && points[currentPtIdx].distance - startPt.distance <= targetEndDist) {
      splitPoints.push(points[currentPtIdx]);
      currentPtIdx++;
    }
    
    if (splitPoints.length === 0 && currentPtIdx < points.length) {
      splitPoints.push(points[currentPtIdx]);
    }
    
    if (splitPoints.length >= 2) {
      const pS = splitPoints[0];
      const pE = splitPoints[splitPoints.length - 1];
      const dist = pE.distance - pS.distance;
      
      let splitBaseMs = 0;
      if (pS.time && pE.time) {
        splitBaseMs = new Date(pE.time).getTime() - new Date(pS.time).getTime();
      } else {
        splitBaseMs = baseDurationMs / 10;
      }
      
      const durationMs = splitBaseMs * scaleFactor;
      const speed = dist > 0 && durationMs > 0 ? (dist / 1000) / (durationMs / 3600000) : 0;
      const eleDiff = pE.ele - pS.ele;
      const grade = dist > 0 ? (eleDiff / dist) * 100 : 0;
      
      let hrSum = 0, hrCount = 0;
      let powerSum = 0, powerCount = 0;
      let cadSum = 0, cadCount = 0;
      
      splitPoints.forEach(pt => {
        if (pt.hr) { hrSum += pt.hr; hrCount++; }
        if (pt.power) { powerSum += pt.power; powerCount++; }
        if (pt.cadence) { cadSum += pt.cadence; cadCount++; }
      });
      
      const avgHr = hasHr && hrCount > 0 ? Math.round(hrSum / hrCount) : undefined;
      const avgPower = hasPower && powerCount > 0 ? Math.round(powerSum / powerCount) : undefined;
      const avgCadence = hasCadence && cadCount > 0 ? Math.round(cadSum / cadCount) : undefined;
      
      splits.push({
        splitNum: i + 1,
        startDist: targetStartDist,
        endDist: targetEndDist,
        timeStr: formatMsToTime(durationMs),
        avgSpeed: speed,
        avgGrade: grade,
        avgHr,
        avgPower,
        avgCadence
      });
    } else {
      splits.push({
        splitNum: i + 1,
        startDist: targetStartDist,
        endDist: targetEndDist,
        timeStr: formatMsToTime(attempt.durationMs / 10),
        avgSpeed: attempt.avgSpeed,
        avgGrade: avgGradePercent,
        avgHr: undefined,
        avgPower: undefined,
        avgCadence: undefined
      });
    }
  }
  return splits;
}

// GPX matching algorithm to extract segment attempt (with sensor data extraction)
function extractAttemptFromRideGPX(ridePoints: GPXPoint[], segment: CatalogSegment): Omit<CloudAttempt, "id"> | null {
  if (ridePoints.length < 2) return null;
  
  const [startLat, startLon] = segment.startCoords;
  const [endLat, endLon] = segment.endCoords;
  
  let minStartDist = Infinity;
  let startIndex = -1;
  
  let minEndDist = Infinity;
  let endIndex = -1;
  
  for (let i = 0; i < ridePoints.length; i++) {
    const pt = ridePoints[i];
    const dStart = calculateDistance(pt.lat, pt.lon, startLat, startLon);
    if (dStart < minStartDist) {
      minStartDist = dStart;
      startIndex = i;
    }
  }
  
  if (startIndex !== -1) {
    for (let i = startIndex + 1; i < ridePoints.length; i++) {
      const pt = ridePoints[i];
      const dEnd = calculateDistance(pt.lat, pt.lon, endLat, endLon);
      if (dEnd < minEndDist) {
        minEndDist = dEnd;
        endIndex = i;
      }
    }
  }
  
  if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex && minStartDist < 150 && minEndDist < 150) {
    const startPt = ridePoints[startIndex];
    const endPt = ridePoints[endIndex];
    
    if (startPt.time && endPt.time) {
      const durationMs = new Date(endPt.time).getTime() - new Date(startPt.time).getTime();
      if (durationMs > 0) {
        const avgSpeed = (segment.distanceMeters / 1000) / (durationMs / 3600000);
        const date = startPt.time.split("T")[0];
        
        // Extract average sensor values for the segment range
        let hrSum = 0, hrCount = 0;
        let powerSum = 0, powerCount = 0;
        let cadSum = 0, cadCount = 0;
        
        for (let i = startIndex; i <= endIndex; i++) {
          const pt = ridePoints[i];
          if (pt.hr) { hrSum += pt.hr; hrCount++; }
          if (pt.power) { powerSum += pt.power; powerCount++; }
          if (pt.cadence) { cadSum += pt.cadence; cadCount++; }
        }
        
        const avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : undefined;
        const avgPower = powerCount > 0 ? Math.round(powerSum / powerCount) : undefined;
        const avgCadence = cadCount > 0 ? Math.round(cadSum / cadCount) : undefined;

        return {
          riderName: "Me",
          date,
          durationMs,
          avgSpeed: parseFloat(avgSpeed.toFixed(1)),
          avgHr,
          avgPower,
          avgCadence,
        };
      }
    }
  }
  return null;
}

// Generates a scaled, aspect-ratio-preserved SVG path representing the 2D segment route
function generateRouteSvgPath(points: GPXPoint[]): string {
  if (points.length < 2) return "";
  
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  
  points.forEach((p) => {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  });
  
  const latDiff = maxLat - minLat;
  const lonDiff = maxLon - minLon;
  
  const width = 240; // 10px padding on each side (260 - 20)
  const height = 65; // 10px padding on each side (85 - 20)
  
  let scaleX = 1;
  let scaleY = 1;
  
  if (lonDiff > 0) scaleX = width / lonDiff;
  if (latDiff > 0) scaleY = height / latDiff;
  
  const scale = Math.min(scaleX, scaleY);
  
  const routeWidth = lonDiff * scale;
  const routeHeight = latDiff * scale;
  const offsetX = 10 + (width - routeWidth) / 2;
  const offsetY = 10 + (height - routeHeight) / 2;
  
  const svgPoints = points.map((p) => {
    const x = offsetX + (p.lon - minLon) * scale;
    const y = offsetY + (maxLat - p.lat) * scale; // Invert latitude for SVG
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  
  return `M ${svgPoints.join(" L ")}`;
}

// Dynamic SVG 2D Route Map Thumbnail Renderer
function renderRouteThumbnail(pathD?: string) {
  if (!pathD) {
    return (
      <div className="segment-card-thumbnail">
        <span className="splits-loading" style={{ color: "#8E8E93" }}>지도 썸네일 생성 중...</span>
      </div>
    );
  }

  let startX = 130, startY = 42;
  let endX = 130, endY = 42;
  
  try {
    const coordsStr = pathD.replace("M ", "").split(" L ");
    if (coordsStr.length >= 2) {
      const startParts = coordsStr[0].split(",");
      const endParts = coordsStr[coordsStr.length - 1].split(",");
      startX = parseFloat(startParts[0]);
      startY = parseFloat(startParts[1]);
      endX = parseFloat(endParts[0]);
      endY = parseFloat(endParts[1]);
    }
  } catch (e) {
    // Ignored
  }

  return (
    <div className="segment-card-thumbnail" style={{ backgroundColor: "#FAFAFC" }}>
      <svg viewBox="0 0 260 85" width="100%" height="85">
        {/* Soft layout guidelines */}
        <line x1="0" y1="20" x2="260" y2="20" stroke="#F3F3F7" strokeDasharray="3,3" />
        <line x1="0" y1="50" x2="260" y2="50" stroke="#F3F3F7" strokeDasharray="3,3" />
        
        {/* Route outline line */}
        <path
          d={pathD}
          fill="none"
          stroke="#FC6100"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Start (Green) & End (Red) Dot Markers */}
        <circle cx={startX} cy={startY} r="5" fill="#4CAF50" stroke="#FFFFFF" strokeWidth="1.5" />
        <circle cx={endX} cy={endY} r="5" fill="#F44336" stroke="#FFFFFF" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// Read-only elevation profile chart component for the detailed leaderboard page
function ReadOnlyElevationChart({ points, activeSplitNum }: { points: GPXPoint[]; activeSplitNum?: number | null }) {
  if (points.length === 0) return <div className="splits-loading">고도 데이터를 불러오는 중...</div>;
  
  const baseDistance = points[0]?.distance || 0;
  const chartData = points.map((p) => ({
    distanceKm: parseFloat(((p.distance - baseDistance) / 1000).toFixed(3)),
    elevation: parseFloat(p.ele.toFixed(1)),
  }));
  
  const elevations = points.map((p) => p.ele);
  const minElevation = Math.floor(Math.min(...elevations) - 5);
  const maxElevation = Math.ceil(Math.max(...elevations) + 5);

  // Calculate start/end distance for active split highlight box (numeric values)
  let highlightX1: number | undefined = undefined;
  let highlightX2: number | undefined = undefined;

  if (activeSplitNum && points.length >= 2) {
    const totalDist = points[points.length - 1].distance - baseDistance;
    const splitDist = totalDist / 10;
    const startMeters = (activeSplitNum - 1) * splitDist;
    const endMeters = activeSplitNum * splitDist;
    highlightX1 = parseFloat((startMeters / 1000).toFixed(3));
    highlightX2 = parseFloat((endMeters / 1000).toFixed(3));
  }
  
  return (
    <div className="read-only-elevation-chart" style={{ width: "100%", height: "140px", marginTop: "12px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
          <XAxis
            type="number"
            dataKey="distanceKm"
            domain={[0, "dataMax"]}
            stroke="#8E8E93"
            fontSize={9}
            tickLine={false}
            tickFormatter={(val) => `${val.toFixed(2)} km`}
          />
          <YAxis domain={[minElevation, maxElevation]} stroke="#8E8E93" fontSize={9} tickLine={false} unit=" m" />
          <Tooltip
            contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#E6E6EB", borderRadius: "6px" }}
            labelStyle={{ color: "#242428", fontWeight: "bold" }}
            formatter={(value: any) => [`${value} m`, "고도"]}
            labelFormatter={(label) => `거리: ${Number(label).toFixed(2)} km`}
          />
          <Area type="monotone" dataKey="elevation" stroke="#FC6100" fill="url(#colorEleDetails)" strokeWidth={1.5} />
          
          {/* Shaded highlight area for active split */}
          {highlightX1 !== undefined && highlightX2 !== undefined && (
            <ReferenceArea
              x1={highlightX1}
              x2={highlightX2}
              fill="#FC6100"
              fillOpacity={0.25}
            />
          )}

          <defs>
            <linearGradient id="colorEleDetails" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FC6100" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#FC6100" stopOpacity={0.0} />
            </linearGradient>
          </defs>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function App() {
  const {
    accessToken,
    clientId,
    userEmail,
    loading,
    catalog,
    rankings,
    setClientId,
    login,
    logout,
    saveSegment,
    deleteSegment,
    renameSegment,
    downloadGPXFile,
    addAttemptToCloud,
    deleteAttemptFromCloud,
    cleanOrphanedFiles,
  } = useGoogleDrive();

  // Navigation views: 'directory' | 'leaderboard' | 'editor' | 'recent_records'
  const [activeView, setActiveView] = useState<"directory" | "leaderboard" | "editor" | "recent_records">("directory");

  // Filter Period: 'all' | 'year' | 'days30'
  const [filterPeriod, setFilterPeriod] = useState<"all" | "year" | "days30">("all");

  // Selected Segment ID and GPX Points for splits
  const [selectedSegId, setSelectedSegId] = useState<string>("");
  const [activeSegmentPoints, setActiveSegmentPoints] = useState<GPXPoint[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  // Active hovered split segment tracker
  const [hoveredSplitNum, setHoveredSplitNum] = useState<number | null>(null);

  // Toggle manual attempt input form
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Notification Center states
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem("gdrive_notifications");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem("gdrive_notifications", JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Registration states
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(0);
  const [segmentName, setSegmentName] = useState<string>("");
  const [detectedClimbs, setDetectedClimbs] = useState<ClimbCandidate[]>([]);
  const [climbNames, setClimbNames] = useState<{ [key: number]: string }>({});
  const [selectedClimbIdx, setSelectedClimbIdx] = useState<number>(-1);
  const [checkedClimbs, setCheckedClimbs] = useState<{ [key: number]: boolean }>({});

  // Local cache for dynamically parsed legacy route paths
  const [legacyPaths, setLegacyPaths] = useState<{ [id: string]: string }>({});

  // Pre-render/fetch missing route SVG paths for legacy segments
  useEffect(() => {
    if (!accessToken) return;
    catalog.segments.forEach((seg) => {
      if (!seg.routeSvgPath && !legacyPaths[seg.id]) {
        const fetchLegacyPath = async () => {
          const xml = await downloadGPXFile(seg.id);
          if (xml) {
            try {
              const parsed = parseGPX(xml);
              const path = generateRouteSvgPath(parsed.points);
              setLegacyPaths((prev) => ({ ...prev, [seg.id]: path }));
            } catch (e) {
              // Ignored
            }
          }
        };
        fetchLegacyPath();
      }
    });
  }, [catalog.segments, accessToken, legacyPaths]);

  // Manual ride record input states
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [manualTime, setManualTime] = useState<string>("");
  const [manualSpeed, setManualSpeed] = useState<string>("");

  const [showSettings, setShowSettings] = useState<boolean>(!localStorage.getItem("gdrive_client_id"));
  const [tempClientId, setTempClientId] = useState<string>(clientId);

  // Sync client ID
  useEffect(() => {
    setTempClientId(clientId);
  }, [clientId]);

  // Redirect to directory view if user logs out
  useEffect(() => {
    if (!accessToken && activeView !== "directory") {
      setActiveView("directory");
    }
  }, [accessToken, activeView]);

  // Set default selected segment when catalog loads
  useEffect(() => {
    if (catalog.segments.length > 0 && !selectedSegId) {
      setSelectedSegId(catalog.segments[0].id);
    }
  }, [catalog, selectedSegId]);

  // Fetch segment GPX points in the background to calculate splits
  useEffect(() => {
    if (!selectedSegId) {
      setActiveSegmentPoints([]);
      setSelectedAttemptId(null);
      return;
    }
    const loadActiveSegmentGPX = async () => {
      const xml = await downloadGPXFile(selectedSegId);
      if (xml) {
        try {
          const parsed = parseGPX(xml);
          setActiveSegmentPoints(parsed.points);
        } catch (e) {
          // Ignored
        }
      }
    };
    loadActiveSegmentGPX();
    setSelectedAttemptId(null);
  }, [selectedSegId]);

  const [duplicateWarning, setDuplicateWarning] = useState<CatalogSegment | null>(null);

  // Check if uploaded points match an existing segment in catalog (start/end within 150m)
  const checkDuplicateSegment = (points: GPXPoint[]) => {
    if (points.length < 2 || catalog.segments.length === 0) {
      setDuplicateWarning(null);
      return;
    }
    const startPt = points[0];
    const endPt = points[points.length - 1];

    for (const seg of catalog.segments) {
      if (!seg.startCoords || !seg.endCoords) continue;

      const startDist = calculateDistance(startPt.lat, startPt.lon, seg.startCoords[0], seg.startCoords[1]);
      const endDist = calculateDistance(endPt.lat, endPt.lon, seg.endCoords[0], seg.endCoords[1]);

      if (startDist <= 150 && endDist <= 150) {
        setDuplicateWarning(seg);
        return;
      }
    }
    setDuplicateWarning(null);
  };

  // Shared GPX parser for editor (file input or drag-and-drop)
  const processEditorGpxFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const parsed = parseGPX(text);
        if (parsed.points.length < 2) {
          alert("올바르지 않은 GPX 파일입니다. 최소 2개 이상의 포인트가 필요합니다.");
          return;
        }
        setGpxData(parsed);
        setStartIndex(0);
        setEndIndex(parsed.points.length - 1);
        setSegmentName(parsed.name);

        const climbs = detectClimbs(parsed.points);
        setDetectedClimbs(climbs);
        setSelectedClimbIdx(-1);
        setCheckedClimbs({});

        const initialNames: { [key: number]: string } = {};
        climbs.forEach((_, idx) => {
          initialNames[idx] = `${parsed.name} - 구간 ${idx + 1}`;
        });
        setClimbNames(initialNames);

        // Check for existing duplicate segment
        checkDuplicateSegment(parsed.points);
      } catch (err) {
        alert("GPX 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file);
  };

  // Handle GPX file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processEditorGpxFile(file);
  };

  // Handle GPX file drop in editor mode
  const handleEditorDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processEditorGpxFile(file);
  };

  const handleTrimChange = (start: number, end: number) => {
    setStartIndex(start);
    setEndIndex(end);
    setSelectedClimbIdx(-1);
  };

  const applyPresetClimb = (climb: ClimbCandidate, idx: number) => {
    setStartIndex(climb.startIndex);
    setEndIndex(climb.endIndex);
    setSelectedClimbIdx(idx);
    setSegmentName(climbNames[idx] || `${gpxData?.name || "Climb"} - 구간 ${idx + 1}`);
  };

  const handleClimbNameChange = (idx: number, val: string) => {
    setClimbNames((prev) => ({ ...prev, [idx]: val }));
  };

  const handleClimbCheckToggle = (idx: number) => {
    setCheckedClimbs((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleMergeSelectedClimbs = () => {
    const selectedIndices = Object.keys(checkedClimbs)
      .map(Number)
      .filter((idx) => checkedClimbs[idx]);

    if (selectedIndices.length < 2) {
      alert("병합할 구간을 최소 2개 이상 선택해 주세요.");
      return;
    }

    selectedIndices.sort((a, b) => a - b);
    const minStart = Math.min(...selectedIndices.map((idx) => detectedClimbs[idx].startIndex));
    const maxEnd = Math.max(...selectedIndices.map((idx) => detectedClimbs[idx].endIndex));

    setStartIndex(minStart);
    setEndIndex(maxEnd);
    setSelectedClimbIdx(-1);

    const mergedNames = selectedIndices.map((idx) => `Hill ${idx + 1}`).join(" + ");
    setSegmentName(`${gpxData?.name || "Merged Route"} - ${mergedNames} 병합`);
    setCheckedClimbs({});
    alert(`선택하신 ${selectedIndices.length}개 구간이 중간 내리막을 포함하여 병합되었습니다!`);
  };

  const handleSaveSettings = () => {
    setClientId(tempClientId);
    setShowSettings(false);
    alert("설정이 저장되었습니다.");
    logout();
  };

  const calculateStatsForRange = (start: number, end: number) => {
    if (!gpxData || gpxData.points.length === 0) return { dist: 0, gain: 0, grade: 0 };
    const startPt = gpxData.points[start];
    const endPt = gpxData.points[end];
    const dist = endPt.distance - startPt.distance;
    const gain = Math.max(0, endPt.ele - startPt.ele);
    const grade = dist > 0 ? (gain / dist) * 100 : 0;
    return { dist, gain, grade };
  };

  const { dist: distance, gain, grade } = calculateStatsForRange(startIndex, endIndex);

  // Upload inline climb segment from row (NO forced redirection!)
  const handleSaveClimbRow = async (climb: ClimbCandidate, idx: number) => {
    if (!gpxData) return;
    const name = climbNames[idx]?.trim() || `Climb ${idx + 1}`;

    setStartIndex(climb.startIndex);
    setEndIndex(climb.endIndex);
    setSelectedClimbIdx(idx);

    const trimmedPoints = gpxData.points.slice(climb.startIndex, climb.endIndex + 1);
    const gpxXml = generateGPX(name, trimmedPoints);
    const startPt = trimmedPoints[0];
    const endPt = trimmedPoints[trimmedPoints.length - 1];
    const stats = calculateStatsForRange(climb.startIndex, climb.endIndex);
    const routeSvgPath = generateRouteSvgPath(trimmedPoints);

    const success = await saveSegment(name, gpxXml, {
      distanceMeters: parseFloat(stats.dist.toFixed(1)),
      elevationGainMeters: parseFloat(stats.gain.toFixed(1)),
      avgGradePercent: parseFloat(stats.grade.toFixed(1)),
      startCoords: [startPt.lat, startPt.lon],
      endCoords: [endPt.lat, endPt.lon],
      routeSvgPath,
    });

    if (success) {
      alert(`🎉 구간 "${name}" 등록을 완료했습니다! 지도를 확인하거나 다른 구간도 계속 등록할 수 있습니다.`);
      const newFileName = `${name.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      setSelectedSegId(newFileName);
    }
  };

  // Upload custom segment (NO forced redirection!)
  const handleUploadToDrive = async () => {
    if (!gpxData) return;
    if (!segmentName.trim()) {
      alert("구간 이름을 입력해 주세요.");
      return;
    }

    const trimmedPoints = gpxData.points.slice(startIndex, endIndex + 1);
    const gpxXml = generateGPX(segmentName, trimmedPoints);
    const startPt = trimmedPoints[0];
    const endPt = trimmedPoints[trimmedPoints.length - 1];
    const routeSvgPath = generateRouteSvgPath(trimmedPoints);

    const success = await saveSegment(segmentName, gpxXml, {
      distanceMeters: parseFloat(distance.toFixed(1)),
      elevationGainMeters: parseFloat(gain.toFixed(1)),
      avgGradePercent: parseFloat(grade.toFixed(1)),
      startCoords: [startPt.lat, startPt.lon],
      endCoords: [endPt.lat, endPt.lon],
      routeSvgPath,
    });

    if (success) {
      alert(`🎉 구간 "${segmentName}" 등록을 완료했습니다!`);
      const newFileName = `${segmentName.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      setSelectedSegId(newFileName);
    }
  };

  // Shared process for global GPX upload/drop
  const processGlobalRideGpxFile = async (file: File) => {
    if (catalog.segments.length === 0) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const parsed = parseGPX(text);
        const matchedAttempts: { segmentName: string; durationMs: number; avgSpeed: number; id: string; attemptData: Omit<CloudAttempt, "id"> }[] = [];

        for (const segment of catalog.segments) {
          const attemptData = extractAttemptFromRideGPX(parsed.points, segment);
          if (attemptData) {
            matchedAttempts.push({
              segmentName: segment.name,
              durationMs: attemptData.durationMs,
              avgSpeed: attemptData.avgSpeed,
              id: segment.id,
              attemptData
            });
          }
        }

        if (matchedAttempts.length === 0) {
          alert("업로드한 GPX 파일에서 매칭된 구간 주행 기록을 찾을 수 없습니다. (오차범위 150m)");
          return;
        }

        // Upload matched attempts
        let successCount = 0;
        let duplicateCount = 0;
        const matchedLines: string[] = [];
        const notificationItems: { segmentId: string; segmentName: string; durationMs: number; rank: number; isPR: boolean }[] = [];

        for (const match of matchedAttempts) {
          const res = await addAttemptToCloud(match.id, match.attemptData);
          if (res === "added") {
            successCount++;
            // Calculate rank for this attempt
            const existingAttempts = rankings[match.id] || [];
            const sorted = [...existingAttempts, { id: "temp", ...match.attemptData }].sort((a, b) => a.durationMs - b.durationMs);
            const rankIndex = sorted.findIndex(a => a.date === match.attemptData.date && Math.abs(a.durationMs - match.durationMs) < 1000);
            const rank = rankIndex !== -1 ? rankIndex + 1 : sorted.length;
            const isPR = rank === 1;

            notificationItems.push({
              segmentId: match.id,
              segmentName: match.segmentName,
              durationMs: match.durationMs,
              rank,
              isPR,
            });

            if (isPR) {
              matchedLines.push(`• ${match.segmentName}: 1등 👑 (개인 최고 기록!) (${formatMsToTime(match.durationMs)})`);
            } else {
              matchedLines.push(`• ${match.segmentName}: ${rank}등 (${formatMsToTime(match.durationMs)})`);
            }
          } else if (res === "duplicate") {
            duplicateCount++;
          }
        }

        if (successCount > 0) {
          // Push to persistent notifications history
          const newNotif: AppNotification = {
            id: Date.now().toString(),
            date: new Date().toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            title: `🚴 새 주행 기록 분석 완료 (${successCount}개 구간 매칭)`,
            read: false,
            matches: notificationItems,
          };
          setNotifications((prev) => [newNotif, ...prev].slice(0, 30));

          let msg = `🎉 주행 기록 분석 및 등록 완료!\n\n📍 분석 및 매칭된 구간 순위 결과:\n${matchedLines.join("\n")}`;
          if (duplicateCount > 0) {
            msg += `\n\n(ℹ️ 이미 등록된 중복 기록 ${duplicateCount}개는 자동으로 제외되었습니다.)`;
          }
          alert(msg);
        } else if (duplicateCount > 0) {
          alert(`ℹ️ 업로드한 GPX 파일의 주행 기록(${duplicateCount}개 구간)은 이미 모두 리더보드에 등록되어 있습니다.`);
        }
      } catch (err) {
        alert("GPX 파일 파싱에 실패했습니다. 올바른 GPX 형식인지 확인해 주세요.");
      }
    };
    reader.readAsText(file);
  };

  const handleGlobalRideGpxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processGlobalRideGpxFile(file);
    }
  };

  const handleGlobalRideGpxDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processGlobalRideGpxFile(file);
    }
  };

  // Handle manual record entry submission
  const handleAddManualAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSegId) return;
    if (!manualTime.trim() || !manualSpeed.trim()) {
      alert("시간과 속도를 입력해 주세요.");
      return;
    }

    const durationMs = parseTimeToMs(manualTime);
    if (durationMs <= 0) {
      alert("시간 형식이 올바르지 않습니다. mm:ss 또는 hh:mm:ss 형식으로 입력해 주세요.");
      return;
    }

    const speed = parseFloat(manualSpeed);
    if (isNaN(speed) || speed <= 0) {
      alert("평균 시속은 숫자만 입력 가능합니다.");
      return;
    }

    const res = await addAttemptToCloud(selectedSegId, {
      riderName: "Me",
      date: manualDate,
      durationMs,
      avgSpeed: speed,
    });

    if (res === "added") {
      alert("🎉 기록이 성공적으로 추가되었습니다!");
      setManualTime("");
      setManualSpeed("");
      setShowManualForm(false);
    } else if (res === "duplicate") {
      alert("ℹ️ 이미 해당 날짜와 시간에 동일한 주행 기록이 등록되어 있습니다.");
    }
  };

  const handleDeleteAttempt = async (attemptId: string, date: string) => {
    if (window.confirm(`${date} 기록을 리더보드에서 삭제하시겠습니까?`)) {
      const success = await deleteAttemptFromCloud(selectedSegId, attemptId);
      if (success) {
        alert("🎉 주행 기록이 삭제되었습니다.");
      }
    }
  };

  const handleCleanOrphanedFiles = async () => {
    if (!window.confirm("catalog.json에 등록되어 있지 않은 모든 고아 GPX 파일들을 구글 드라이브에서 삭제하시겠습니까?")) {
      return;
    }
    const count = await cleanOrphanedFiles();
    alert(`🎉 정리 완료! catalog.json에 등록되지 않은 고아 GPX 파일 ${count}개를 찾아 안전하게 삭제했습니다.`);
  };

  const handleSegmentDelete = async (id: string, name: string) => {
    if (window.confirm(`구간 "${name}"을 삭제하시겠습니까? 관련 주행 기록도 함께 삭제됩니다.`)) {
      const success = await deleteSegment(id);
      if (success) {
        alert("🎉 구간이 정상적으로 삭제되었습니다.");
        if (selectedSegId === id) {
          setSelectedSegId(catalog.segments[0]?.id || "");
        }
      }
    }
  };

  const handleSegmentRename = async (id: string, currentName: string) => {
    const newName = window.prompt("새로운 구간 이름을 입력하세요:", currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      const success = await renameSegment(id, newName.trim());
      if (success) {
        alert("🎉 구간 이름이 변경되었습니다.");
        const newFileName = `${newName.trim().replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
        if (selectedSegId === id) {
          setSelectedSegId(newFileName);
        }
      }
    }
  };

  const handleLoadSegmentToEditor = async (id: string, name: string) => {
    const gpxXml = await downloadGPXFile(id);
    if (!gpxXml) {
      alert("구간 GPX 파일을 다운로드하는 데 실패했습니다.");
      return;
    }
    try {
      const parsed = parseGPX(gpxXml);
      if (parsed.points.length < 2) {
        alert("다운로드된 GPX가 손상되었습니다.");
        return;
      }
      setGpxData(parsed);
      setStartIndex(0);
      setEndIndex(parsed.points.length - 1);
      setSegmentName(name);
      setDetectedClimbs([]);
      setSelectedClimbIdx(-1);
      setCheckedClimbs({});
      setActiveView("editor");
    } catch (err) {
      alert("GPX 파싱 오류가 발생했습니다.");
    }
  };

  const getSelectedLeaderboard = (): CloudAttempt[] => {
    let list = rankings[selectedSegId] || [];
    const now = new Date();
    if (filterPeriod === "year") {
      list = list.filter((att) => new Date(att.date).getFullYear() === now.getFullYear());
    } else if (filterPeriod === "days30") {
      const limit = now.getTime() - 30 * 24 * 3600 * 1000;
      list = list.filter((att) => new Date(att.date).getTime() >= limit);
    }
    return [...list].sort((a, b) => a.durationMs - b.durationMs);
  };

  const activeSegment = catalog.segments.find((s) => s.id === selectedSegId);
  const leaderboard = getSelectedLeaderboard();
  const personalBest = leaderboard.length > 0 ? leaderboard[0] : null;

  // Helper to find the last run date for any segment
  const getSegmentLastRideDate = (segId: string): string => {
    const attempts = rankings[segId] || [];
    if (attempts.length === 0) return "";
    const sorted = [...attempts].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0].date;
  };

  // Find max attempt timestamp across all segments to identify the latest import session
  let maxTimestamp = 0;
  Object.values(rankings).forEach(attempts => {
    attempts.forEach(att => {
      const ts = parseInt(att.id);
      if (!isNaN(ts) && ts > maxTimestamp) {
        maxTimestamp = ts;
      }
    });
  });

  // Derived list of recently challenged segment IDs from the latest upload session (within 5 minutes of maxTimestamp)
  const lastUploadedSegmentIds = maxTimestamp > 0
    ? catalog.segments
        .filter(seg => (rankings[seg.id] || []).some(att => parseInt(att.id) >= maxTimestamp - 300000))
        .map(seg => seg.id)
    : [];

  // Helper to calculate rank & PR status of the latest uploaded attempt in a segment
  const getLatestAttemptRankInfo = (segmentId: string) => {
    const attempts = rankings[segmentId] || [];
    if (attempts.length === 0 || maxTimestamp <= 0) return null;

    const recentAtt = attempts.find(att => parseInt(att.id) >= maxTimestamp - 300000);
    if (!recentAtt) return null;

    const sorted = [...attempts].sort((a, b) => a.durationMs - b.durationMs);
    const rankIndex = sorted.findIndex(att => att.id === recentAtt.id);
    const rank = rankIndex !== -1 ? rankIndex + 1 : sorted.length;
    const isPR = rank === 1;

    return { rank, isPR, durationMs: recentAtt.durationMs, speed: recentAtt.avgSpeed };
  };

  const getSortedCatalogSegments = (): CatalogSegment[] => {
    return [...catalog.segments].sort((a, b) => {
      const attemptsA = rankings[a.id] || [];
      const attemptsB = rankings[b.id] || [];
      
      const hasRecentA = maxTimestamp > 0 && attemptsA.some(att => parseInt(att.id) >= maxTimestamp - 300000);
      const hasRecentB = maxTimestamp > 0 && attemptsB.some(att => parseInt(att.id) >= maxTimestamp - 300000);

      if (hasRecentA && !hasRecentB) return -1;
      if (!hasRecentA && hasRecentB) return 1;

      const dateA = getSegmentLastRideDate(a.id);
      const dateB = getSegmentLastRideDate(b.id);
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA);
    });
  };

  const sortedSegments = getSortedCatalogSegments();

  // Determine if active segment points contain actual sensor data
  const hasHr = activeSegmentPoints.some(pt => pt.hr !== undefined && pt.hr > 0);
  const hasPower = activeSegmentPoints.some(pt => pt.power !== undefined && pt.power > 0);
  const hasCadence = activeSegmentPoints.some(pt => pt.cadence !== undefined && pt.cadence > 0);

  // Dynamic grid template columns for leaderboard rows based on sensor existence
  let leaderboardGridStyle = "60px 40px 1fr 140px 50px"; // base
  if (hasHr && hasPower) {
    leaderboardGridStyle = "50px 40px 1fr 120px 80px 80px 50px";
  } else if (hasHr) {
    leaderboardGridStyle = "50px 40px 1fr 120px 90px 50px";
  } else if (hasPower) {
    leaderboardGridStyle = "50px 40px 1fr 120px 90px 50px";
  }

  // Helper to compile a flat chronological list of all recent ride attempts across all segments
  const getAllRecentRideAttempts = () => {
    const list: {
      segmentId: string;
      segmentName: string;
      attempt: CloudAttempt;
      rank: number;
      isPR: boolean;
      totalAttempts: number;
    }[] = [];

    catalog.segments.forEach((seg) => {
      const attempts = rankings[seg.id] || [];
      if (attempts.length === 0) return;

      const sortedByDuration = [...attempts].sort((a, b) => a.durationMs - b.durationMs);

      attempts.forEach((att) => {
        const rankIndex = sortedByDuration.findIndex((a) => a.id === att.id);
        const rank = rankIndex !== -1 ? rankIndex + 1 : sortedByDuration.length;
        const isPR = rank === 1;

        list.push({
          segmentId: seg.id,
          segmentName: seg.name,
          attempt: att,
          rank,
          isPR,
          totalAttempts: attempts.length,
        });
      });
    });

    return list.sort((a, b) => b.attempt.date.localeCompare(a.attempt.date));
  };

  const allRecentAttempts = getAllRecentRideAttempts();

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100vh", backgroundColor: "#F7F7FA" }}>
      {/* Left Sidebar Navigation Menu */}
      <aside className="app-sidebar" style={{ width: "240px", backgroundColor: "#1E1E24", color: "#FFFFFF", padding: "24px 16px", display: "flex", flexDirection: "column", gap: "24px", flexShrink: 0, borderRight: "1px solid #2D2D38" }}>
        <div className="sidebar-brand" style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "16px", borderBottom: "1px solid #33333F" }}>
          <span style={{ fontSize: "24px" }}>🏆</span>
          <span style={{ fontSize: "18px", fontWeight: "bold", color: "#FFFFFF", letterSpacing: "-0.5px" }}>개인 리더보드</span>
        </div>

        <nav className="sidebar-nav" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            className={`sidebar-nav-item ${activeView === "directory" ? "active" : ""}`}
            onClick={() => setActiveView("directory")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "8px",
              border: "none",
              background: activeView === "directory" ? "#FC6100" : "transparent",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: activeView === "directory" ? "bold" : "normal",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "background 0.2s",
            }}
          >
            <span>📂</span> 전체 구간 목록
          </button>

          <button
            className={`sidebar-nav-item ${activeView === "recent_records" ? "active" : ""}`}
            onClick={() => setActiveView("recent_records")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "8px",
              border: "none",
              background: activeView === "recent_records" ? "#FC6100" : "transparent",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: activeView === "recent_records" ? "bold" : "normal",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "background 0.2s",
            }}
          >
            <span>🔥</span> 최근 기록 보기
            {allRecentAttempts.length > 0 && (
              <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px" }}>
                {allRecentAttempts.length}
              </span>
            )}
          </button>

          {accessToken && (
            <button
              className={`sidebar-nav-item ${activeView === "editor" ? "active" : ""}`}
              onClick={() => {
                setGpxData(null);
                setSegmentName("");
                setDetectedClimbs([]);
                setActiveView("editor");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "none",
                background: activeView === "editor" ? "#FC6100" : "transparent",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: activeView === "editor" ? "bold" : "normal",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "background 0.2s",
              }}
            >
              <span>➕</span> 새 구간 등록
            </button>
          )}
        </nav>

        {/* Sidebar Footer info */}
        <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid #33333F", fontSize: "12px", color: "#8E8E93" }}>
          {accessToken ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ color: "#FFF", fontWeight: "bold" }}>● {userEmail || "구글 연동 완료"}</div>
              <button
                onClick={logout}
                style={{ background: "none", border: "none", color: "#8E8E93", cursor: "pointer", padding: 0, textAlign: "left", fontSize: "12px", textDecoration: "underline" }}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "none", background: "#FC6100", color: "#FFF", fontWeight: "bold", cursor: "pointer" }}
            >
              구글 로그인
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-content" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* 1. Subtle, Clean Header (KO) */}
        <header className="app-header">
          <div className="header-logo">
            <span className="logo-icon">🏆</span>
            <h1>개인 리더보드</h1>
          </div>

        <div className="header-actions">
          {accessToken && activeView !== "editor" && (
            <button
              className="btn btn-primary btn-sm register-header-btn"
              onClick={() => {
                setGpxData(null);
                setSegmentName("");
                setDetectedClimbs([]);
                setActiveView("editor");
              }}
            >
              ➕ 구간 등록 (Register)
            </button>
          )}
          {accessToken ? (
            <div className="user-profile">
              <span className="user-email">{userEmail || "연결됨"}</span>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                로그아웃
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={login}>
              로그인
            </button>
          )}
          {/* Notification Bell Center */}
          {accessToken && (
            <div className="notification-wrapper" style={{ position: "relative" }}>
              <button
                className="btn-icon"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications && unreadCount > 0) {
                    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                  }
                }}
                title="주행 분석 알림 센터"
                style={{ position: "relative", cursor: "pointer", fontSize: "16px", padding: "6px 10px" }}
              >
                🔔
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-2px",
                      right: "-2px",
                      backgroundColor: "#FC6100",
                      color: "#FFFFFF",
                      borderRadius: "10px",
                      padding: "2px 6px",
                      fontSize: "10px",
                      fontWeight: "bold",
                      lineHeight: "1",
                      border: "2px solid #FFF",
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {showNotifications && (
                <div
                  className="notification-dropdown card"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: "360px",
                    maxHeight: "420px",
                    overflowY: "auto",
                    zIndex: 1000,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                    padding: "16px",
                    borderRadius: "12px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E6E6EB",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid #F0F0F5", paddingBottom: "8px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", color: "#222", fontWeight: "bold" }}>🔔 주행 분석 알림 기록</h4>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => setNotifications([])}
                        style={{ color: "#8E8E93", background: "none", border: "none", cursor: "pointer", fontSize: "11px" }}
                      >
                        전체 삭제
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#8E8E93", padding: "24px 0", fontSize: "13px" }}>
                      아직 저장된 주행 분석 알림이 없습니다.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            background: "#FFFBF7",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid #FFEADA",
                            borderLeft: "4px solid #FC6100",
                          }}
                        >
                          <div style={{ fontSize: "11px", color: "#8E8E93", marginBottom: "4px" }}>
                            {n.date}
                          </div>
                          <div style={{ fontWeight: "bold", fontSize: "13px", color: "#222", marginBottom: "6px" }}>
                            {n.title}
                          </div>
                          <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "#444", display: "flex", flexDirection: "column", gap: "4px" }}>
                            {n.matches.map((m, idx) => (
                              <li
                                key={idx}
                                style={{ cursor: "pointer" }}
                                onClick={() => {
                                  setSelectedSegId(m.segmentId);
                                  setActiveView("leaderboard");
                                  setShowNotifications(false);
                                }}
                              >
                                <strong>{m.segmentName}</strong>:{" "}
                                {m.isPR ? (
                                  <span style={{ color: "#FC6100", fontWeight: "bold" }}>
                                    👑 1등 (개인 최고 기록!) ({formatMsToTime(m.durationMs)})
                                  </span>
                                ) : (
                                  <span>{m.rank}등 ({formatMsToTime(m.durationMs)})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="설정">
            ⚙️
          </button>
        </div>
      </header>

      {/* 2. Main Content */}
      <main className="app-main">
        {showSettings && (
          <div className="settings-modal">
            <div className="settings-card">
              <h3>구글 API 설정</h3>
              <div className="form-group">
                <label>OAuth Client ID</label>
                <input
                  type="text"
                  placeholder="Client ID를 입력하세요"
                  value={tempClientId}
                  onChange={(e) => setTempClientId(e.target.value)}
                />
              </div>
              {accessToken && (
                <div className="form-group" style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #E6E6EB" }}>
                  <label>저장소 및 파일 관리</label>
                  <button
                    className="btn btn-secondary btn-block"
                    style={{ backgroundColor: "#F3F3F7", color: "#E34F00", border: "1px solid #FC6100", fontWeight: "bold" }}
                    onClick={handleCleanOrphanedFiles}
                    disabled={loading}
                  >
                    {loading ? "정리 중..." : "🧹 미등록 쓰레기 GPX 파일 정리"}
                  </button>
                  <p style={{ fontSize: "11px", color: "#8E8E93", marginTop: "6px", lineHeight: "1.4" }}>
                    현재 리더보드 구간 목록(catalog.json)에 등록되어 있지 않으면서 구글 드라이브 폴더에 남겨진 쓰레기 GPX 파일들을 자동 감지하여 완전 제거합니다.
                  </p>
                </div>
              )}
              <div className="settings-buttons">
                <button className="btn btn-primary" onClick={handleSaveSettings}>
                  설정 저장
                </button>
                <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View A: Full-width GPX Editor Mode */}
        {activeView === "editor" && (
          <div className="editor-container">
            <div className="editor-header-nav">
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveView("directory")}>
                ← 랭킹 보드로 돌아가기
              </button>
              <h2>새로운 구간 생성 및 편집</h2>
            </div>
            
            <div className="main-grid">
              <div className="grid-col left-col">
                <div className="card upload-card">
                  <h3>GPX 파일 업로드</h3>
                  <div
                    className={`file-drop-zone ${isDragging ? "dragging" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleEditorDrop}
                  >
                    <input type="file" accept=".gpx" onChange={handleFileUpload} id="gpx-file-input" />
                    <label htmlFor="gpx-file-input">
                      <span className="upload-icon">📂</span>
                      <strong>GPX 주행 경로 파일 선택</strong> 또는 드래그하여 업로드
                    </label>
                  </div>
                </div>

                {duplicateWarning && (
                  <div className="card duplicate-warning-card" style={{ background: "#FFF8F0", border: "2px solid #FC6100", padding: "16px", borderRadius: "12px", marginTop: "16px" }}>
                    <h4 style={{ color: "#FC6100", margin: "0 0 8px", display: "flex", alignItems: "center", gap: "6px" }}>
                      ⚠️ 이미 유사한 구간이 등록되어 있습니다!
                    </h4>
                    <p style={{ fontSize: "13px", color: "#444", margin: "0 0 12px", lineHeight: "1.5" }}>
                      업로드한 경로가 기존 <strong>"{duplicateWarning.name}"</strong> ({(duplicateWarning.distanceMeters / 1000).toFixed(2)}km) 구간과 출발/도착 지점이 거의 동일합니다 (150m 이내).
                    </p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        className="btn btn-primary btn-xs"
                        onClick={() => {
                          setSelectedSegId(duplicateWarning.id);
                          setActiveView("leaderboard");
                        }}
                        style={{ backgroundColor: "#FC6100", border: "none", fontWeight: "bold" }}
                      >
                        👉 기존 구간 리더보드로 이동
                      </button>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => setDuplicateWarning(null)}
                      >
                        무시하고 신규 구간으로 계속 편집
                      </button>
                    </div>
                  </div>
                )}

                {gpxData && (
                  <div className="card map-card">
                    <h3>구간 지도 확인</h3>
                    <div className="map-view-wrapper">
                      <MapView points={gpxData.points} startIndex={startIndex} endIndex={endIndex} />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid-col right-col">
                {gpxData ? (
                  <>
                    <div className="card chart-card">
                      <h3>고도 프로필 및 범위 편집</h3>
                      <ChartView
                        points={gpxData.points}
                        startIndex={startIndex}
                        endIndex={endIndex}
                        onTrimChange={handleTrimChange}
                      />
                      <div className="segment-metrics">
                        <div className="metric-box">
                          <span className="metric-val">{(distance / 1000).toFixed(2)} km</span>
                          <span className="metric-lbl">구간 거리</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-val">{gain.toFixed(0)} m</span>
                          <span className="metric-lbl">획득 고도</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-val">{grade.toFixed(1)}%</span>
                          <span className="metric-lbl">평균 경사도</span>
                        </div>
                      </div>
                    </div>

                    <div className="card climbs-card">
                      <div className="climbs-header">
                        <h3>자동 감지된 오르막 구간 목록</h3>
                        {Object.values(checkedClimbs).some(Boolean) && (
                          <button className="btn btn-secondary btn-sm merge-btn" onClick={handleMergeSelectedClimbs}>
                            🔗 선택 구간 병합 (내리막 포함)
                          </button>
                        )}
                      </div>
                      {detectedClimbs.length > 0 ? (
                        <div className="climbs-list">
                          {detectedClimbs.map((climb, idx) => (
                            <div
                              key={idx}
                              className={`climb-item ${selectedClimbIdx === idx ? "active" : ""}`}
                              onClick={() => applyPresetClimb(climb, idx)}
                            >
                              <div className="climb-checkbox-wrapper" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={!!checkedClimbs[idx]}
                                  onChange={() => handleClimbCheckToggle(idx)}
                                />
                              </div>
                              <div className="climb-info">
                                <span className="climb-name">⛰️ Hill {idx + 1}</span>
                                <span className="climb-stats">
                                  {(climb.distance / 1000).toFixed(2)} km | {climb.elevationGain.toFixed(0)}m 획득고도
                                </span>
                              </div>
                              <div className="climb-item-actions">
                                <input
                                  type="text"
                                  className="climb-name-input"
                                  placeholder="이름 입력"
                                  value={climbNames[idx] || ""}
                                  onChange={(e) => handleClimbNameChange(idx, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                  className="btn btn-primary btn-sm"
                                  disabled={loading}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveClimbRow(climb, idx);
                                  }}
                                >
                                  등록
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-climbs-message">감지된 오르막이 없습니다. 수동으로 트랙을 편집해 주세요.</div>
                      )}
                    </div>

                    <div className="card save-card">
                      <h3>수동 조절 구간 등록</h3>
                      <div className="form-group">
                        <input
                          type="text"
                          placeholder="구간 이름을 입력하세요"
                          value={segmentName}
                          onChange={(e) => setSegmentName(e.target.value)}
                        />
                      </div>
                      <button className="btn btn-primary btn-block" onClick={handleUploadToDrive} disabled={loading}>
                        {loading ? "등록 중..." : "구글 드라이브에 저장"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="card welcome-card">
                    <h3>GPX 파일을 선택하여 업로드하면 편집 고도표가 표시됩니다.</h3>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View B: Segment Directory Navigator */}
        {activeView === "directory" && (
          <div className="directory-container">
            {!accessToken ? (
              <div className="card welcome-card" style={{ textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", maxWidth: "600px", margin: "40px auto" }}>
                <span style={{ fontSize: "54px" }}>🏆</span>
                <h2 style={{ fontSize: "24px", color: "#333", fontWeight: "bold" }}>개인 리더보드</h2>
                <p style={{ color: "#666", fontSize: "14px", lineHeight: "1.6", margin: "0 auto 12px" }}>
                  자신만의 자전거 코스 구간을 등록하고 완주 기록 리더보드를 관리해 보세요. 서비스를 이용하려면 구글 계정 로그인이 필요합니다.
                </p>
                <button className="btn btn-primary" onClick={login} style={{ padding: "12px 24px", fontSize: "15px", fontWeight: "bold" }}>
                  구글 계정으로 로그인하기
                </button>
              </div>
            ) : (
              <>
                <div className="directory-header-row">
                  <h2>🔥 최근 도전 구간 목록 ({sortedSegments.length})</h2>
                  <p className="directory-subtitle">구간 카드를 클릭하여 개인 리더보드 순위표를 확인하세요.</p>
                </div>

                {/* Global GPX Upload Card with Drag and Drop Support */}
                <div className="card add-attempt-card compact-card" style={{ marginBottom: "24px" }}>
                  <div className="card-header-with-action">
                    <h4>🚴 새 주행 기록 GPX 업로드 (전체 구간 자동 매칭)</h4>
                  </div>
                  <div 
                    className={`ride-upload-zone ${isDragging ? "dragging" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleGlobalRideGpxDrop}
                  >
                    <input
                      type="file"
                      accept=".gpx"
                      id="global-ride-gpx-upload"
                      onChange={handleGlobalRideGpxUpload}
                      disabled={loading}
                    />
                    <label htmlFor="global-ride-gpx-upload">
                      <span className="upload-icon">📂</span>
                      <strong>새 주행 GPX 파일 선택</strong> 또는 드래그하여 자동으로 완주 기록 추출 및 전체 리더보드 랭킹 추가
                    </label>
                  </div>
                </div>

                {/* Recently Challenged Segments Highlight Section */}
                {lastUploadedSegmentIds.length > 0 && (
                  <div className="recent-challenges-section" style={{ marginBottom: "32px", background: "#FFFBF7", padding: "20px", borderRadius: "12px", border: "1px solid #FFEADA" }}>
                    <h3 style={{ color: "#fc6100", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>🔥 방금 분석된 매칭 구간 달성 결과 ({lastUploadedSegmentIds.length})</span>
                    </h3>

                    {/* Matched Courses Rank Summary Box */}
                    <div className="matched-rank-summary-list" style={{ background: "#FFFFFF", padding: "14px 18px", borderRadius: "8px", border: "1px solid #FFE4D0", marginBottom: "16px" }}>
                      <div style={{ fontWeight: "bold", fontSize: "14px", color: "#333", marginBottom: "8px" }}>
                        📍 이번 주행 기록 분석 및 순위 결과:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {catalog.segments
                          .filter(seg => lastUploadedSegmentIds.includes(seg.id))
                          .map(seg => {
                            const rankInfo = getLatestAttemptRankInfo(seg.id);
                            return (
                              <li key={seg.id} style={{ fontSize: "14px", color: "#333", lineHeight: "1.5" }}>
                                <strong style={{ color: "#111" }}>{seg.name}</strong>:{" "}
                                {rankInfo ? (
                                  rankInfo.isPR ? (
                                    <span style={{ color: "#fc6100", fontWeight: "bold" }}>
                                      👑 1등. 개인 최고 기록 (PR)! 🎉 ({formatMsToTime(rankInfo.durationMs)})
                                    </span>
                                  ) : (
                                    <span style={{ color: "#444", fontWeight: "600" }}>
                                      {rankInfo.rank}등 ({formatMsToTime(rankInfo.durationMs)})
                                    </span>
                                  )
                                ) : (
                                  <span style={{ color: "#888" }}>기록 완료</span>
                                )}
                              </li>
                            );
                          })}
                      </ul>
                    </div>

                    <div className="segment-grid">
                      {catalog.segments
                        .filter(seg => lastUploadedSegmentIds.includes(seg.id))
                        .map(seg => {
                          const lastRide = getSegmentLastRideDate(seg.id);
                          const rankInfo = getLatestAttemptRankInfo(seg.id);
                          return (
                            <div
                              key={seg.id}
                              className="segment-card"
                              style={{ border: "2px solid #fc6100" }}
                              onClick={() => {
                                setSelectedSegId(seg.id);
                                setActiveView("leaderboard");
                              }}
                            >
                              {renderRouteThumbnail(seg.routeSvgPath || legacyPaths[seg.id])}
                              <div className="segment-card-body">
                                <div className="segment-card-title" title={seg.name}>
                                  ⛰️ {seg.name}{" "}
                                  {rankInfo?.isPR ? (
                                    <span className="recent-badge" style={{ background: "#fc6100", color: "#fff", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", marginLeft: "6px", fontWeight: "bold" }}>
                                      👑 1등 (PR)
                                    </span>
                                  ) : rankInfo ? (
                                    <span className="recent-badge" style={{ background: "#FFEADA", color: "#fc6100", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", marginLeft: "6px", fontWeight: "bold" }}>
                                      🏆 {rankInfo.rank}등
                                    </span>
                                  ) : (
                                    <span className="recent-badge" style={{ color: "#fc6100", fontSize: "12px", marginLeft: "6px", fontWeight: "bold" }}>
                                      🔥 최근 도전
                                    </span>
                                  )}
                                </div>
                                <div className="segment-card-stats">
                                  <span>{(seg.distanceMeters / 1000).toFixed(2)} km</span>
                                  <span className="divider">|</span>
                                  <span>{seg.elevationGainMeters}m 획득</span>
                                  <span className="divider">|</span>
                                  <span>{seg.avgGradePercent}% 경사</span>
                                </div>
                                <div className="segment-card-footer">
                                  {lastRide ? (
                                    <span className="last-ride-label">
                                      최근 완주: {getRelativeTimeKo(lastRide)} ({lastRide})
                                    </span>
                                  ) : (
                                    <span className="no-ride-label">완주 기록 없음</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {sortedSegments.length > 0 ? (
                  <div className="segment-grid">
                    {sortedSegments.map((seg) => {
                      const lastRide = getSegmentLastRideDate(seg.id);
                      const hasRecent = maxTimestamp > 0 && (rankings[seg.id] || []).some(att => parseInt(att.id) >= maxTimestamp - 10000);
                      return (
                        <div
                          key={seg.id}
                          className="segment-card"
                          onClick={() => {
                            setSelectedSegId(seg.id);
                            setActiveView("leaderboard");
                          }}
                        >
                          {/* Segment Thumbnail Outline (Pre-rendered 2D Route Map) */}
                          {renderRouteThumbnail(seg.routeSvgPath || legacyPaths[seg.id])}

                          <div className="segment-card-body">
                            <div className="segment-card-title" title={seg.name}>
                              ⛰️ {seg.name} {hasRecent && <span className="recent-badge" style={{ color: "#fc6100", fontSize: "12px", marginLeft: "6px", fontWeight: "bold" }}>🔥 최근 도전</span>}
                            </div>
                            
                            <div className="segment-card-stats">
                              <span>{(seg.distanceMeters / 1000).toFixed(2)} km</span>
                              <span className="divider">|</span>
                              <span>{seg.elevationGainMeters}m 획득</span>
                              <span className="divider">|</span>
                              <span>{seg.avgGradePercent}% 경사</span>
                            </div>

                            <div className="segment-card-footer">
                              {lastRide ? (
                                <span className="last-ride-label">
                                  최근 완주: {getRelativeTimeKo(lastRide)} ({lastRide})
                                </span>
                              ) : (
                                <span className="no-ride-label">완주 기록 없음</span>
                              )}
                            </div>
                          </div>

                          {/* Card Edit & Delete actions */}
                          <div className="segment-card-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="btn-icon-only-small"
                              onClick={() => handleSegmentRename(seg.id, seg.name)}
                              title="이름 수정"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn-icon-only-small text-danger"
                              onClick={() => handleSegmentDelete(seg.id, seg.name)}
                              title="삭제"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-catalog-message">
                    등록된 구간이 없습니다. 우측 상단의 "➕ 구간 등록"을 눌러 첫 세그먼트를 추가해 보세요!
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* View C: Focused Leaderboard View for Selected Segment (With Map & Elevation profile) */}
        {activeView === "leaderboard" && activeSegment && (
          <div className="centered-dashboard">
            <div className="leaderboard-back-nav">
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveView("directory")}>
                ← 전체 구간 목록으로 돌아가기
              </button>
            </div>

            {/* Segment Map & Elevation Card (Just like Strava details view!) */}
            <div className="card segment-media-card" style={{ padding: "16px", marginBottom: "10px" }}>
              <div style={{ width: "100%", height: "300px", borderRadius: "8px", overflow: "hidden" }}>
                <MapView
                  points={activeSegmentPoints}
                  startIndex={0}
                  endIndex={activeSegmentPoints.length - 1}
                  activeSplitNum={hoveredSplitNum}
                />
              </div>
              
              {/* Elevation Silhouette */}
              <ReadOnlyElevationChart points={activeSegmentPoints} activeSplitNum={hoveredSplitNum} />
            </div>

            <div className="card leaderboard-card strava-theme">
              {/* Segment Header Row with Actions */}
              <div className="segment-selector-header-row">
                <div className="selector-left">
                  <h3 className="leaderboard-seg-name">⛰️ {activeSegment.name}</h3>
                </div>

                <div className="selector-right-actions">
                  <button
                    className="btn btn-icon-only"
                    onClick={() => handleSegmentRename(activeSegment.id, activeSegment.name)}
                    title="구간 이름 수정"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn btn-icon-only text-danger"
                    onClick={() => handleSegmentDelete(activeSegment.id, activeSegment.name)}
                    title="구간 삭제"
                  >
                    🗑️
                  </button>
                  <button
                    className="btn btn-secondary btn-sm edit-seg-btn-small"
                    onClick={() => handleLoadSegmentToEditor(activeSegment.id, activeSegment.name)}
                    disabled={loading}
                    title="지도 범위 확인 및 편집"
                  >
                    🗺️ 구간 확인/편집
                  </button>
                </div>
              </div>

              {/* Segment stats info bar */}
              <div className="segment-metadata-bar">
                <span>{(activeSegment.distanceMeters / 1000).toFixed(2)} km</span>
                <span className="divider">|</span>
                <span>{activeSegment.elevationGainMeters}m 획득고도</span>
                <span className="divider">|</span>
                <span>평균 경사도 {activeSegment.avgGradePercent}%</span>
              </div>

              {/* Filter Pills */}
              <div className="filter-pills-row">
                <button
                  className={`pill-btn ${filterPeriod === "all" ? "active" : ""}`}
                  onClick={() => setFilterPeriod("all")}
                >
                  전체 기록
                </button>
                <button
                  className={`pill-btn ${filterPeriod === "year" ? "active" : ""}`}
                  onClick={() => setFilterPeriod("year")}
                >
                  올해 기록
                </button>
                <button
                  className={`pill-btn ${filterPeriod === "days30" ? "active" : ""}`}
                  onClick={() => setFilterPeriod("days30")}
                >
                  최근 30일
                </button>
              </div>

              {/* PR Trophy Highlight */}
              {personalBest && (
                <div className="pr-trophy-zone">
                  <div className="trophy-rays">
                    <span className="trophy-crown">👑</span>
                  </div>
                  <div className="pr-time-display">{formatMsToTime(personalBest.durationMs)}</div>
                  <div className="pr-label">개인 최고 기록 (PR)</div>
                  <div className="pr-achieved-date">
                    달성일: {getRelativeTimeKo(personalBest.date)} ({personalBest.date})
                  </div>
                </div>
              )}

              {/* Custom ranking rows with inline splits details */}
              {leaderboard.length > 0 ? (
                <div className="strava-leaderboard-list">
                  <div
                    className="leaderboard-list-header"
                    style={{ display: "grid", gridTemplateColumns: leaderboardGridStyle }}
                  >
                    <span>순위</span>
                    <span>주행 일자</span>
                    <span>시간 / 평균 시속</span>
                    {hasHr && <span>심박 (HR)</span>}
                    {hasPower && <span>파워 (Power)</span>}
                    <span style={{ textAlign: "center" }}>삭제</span>
                  </div>

                  {leaderboard.map((att, idx) => {
                    const isExpanded = selectedAttemptId === att.id;
                    const splits = isExpanded ? calculateSplits(activeSegmentPoints, att, activeSegment.avgGradePercent) : [];
                    return (
                      <React.Fragment key={att.id}>
                        <div
                          className={`leaderboard-row-item clickable ${isExpanded ? "expanded" : ""} ${maxTimestamp > 0 && parseInt(att.id) >= maxTimestamp - 10000 ? "recent-highlight" : ""}`}
                          style={{ display: "grid", gridTemplateColumns: leaderboardGridStyle }}
                          onClick={() => setSelectedAttemptId(isExpanded ? null : att.id)}
                        >
                          <div className="row-rank">
                            {idx === 0 ? (
                              <span className="crown-badge gold">👑 🎉</span>
                            ) : idx === 1 ? (
                              <span className="crown-badge silver">👑 🎉</span>
                            ) : idx === 2 ? (
                              <span className="crown-badge bronze">👑 🎉</span>
                            ) : (
                              <span className="rank-num">{idx + 1}</span>
                            )}
                          </div>

                          <div className="row-avatar">
                            <span className="avatar-placeholder">🚴</span>
                          </div>

                          <div className="row-info">
                            <span className="attempt-date">{att.date}</span>
                            <span className="attempt-relative">{getRelativeTimeKo(att.date)}</span>
                          </div>

                          <div className="row-results">
                            <span className="attempt-time">{formatMsToTime(att.durationMs)}</span>
                            <span className="attempt-speed">{att.avgSpeed.toFixed(1)} km/h</span>
                          </div>

                          {/* Render sensor values only if they exist in the segment points */}
                          {hasHr && (
                            <span className="sensor-hr" style={{ textAlign: "center", fontSize: "13px" }}>
                              {att.avgHr ? `${att.avgHr} bpm` : "—"}
                            </span>
                          )}
                          
                          {hasPower && (
                            <span className="sensor-power" style={{ textAlign: "center", fontSize: "13px" }}>
                              {att.avgPower ? `${att.avgPower} W` : "—"}
                            </span>
                          )}

                          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="btn-delete-attempt"
                              onClick={() => handleDeleteAttempt(att.id, att.date)}
                              title="완주 기록 삭제"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Splits Section */}
                        {isExpanded && (
                          <div className="splits-details-panel">
                            <h4>📊 10단계 구간 상세 분석 (10 Splits Analysis)</h4>
                            {activeSegmentPoints.length > 0 ? (
                              <div className="splits-table-wrapper">
                                <table className="splits-table">
                                  <thead>
                                    <tr>
                                      <th>구간</th>
                                      <th>거리 범위</th>
                                      <th>시간</th>
                                      <th>평균 시속</th>
                                      <th>경사도</th>
                                      {hasHr && <th>❤️ 심박</th>}
                                      {hasPower && <th>⚡ 파워</th>}
                                      {hasCadence && <th>🔄 케이던스</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {splits.map((split) => (
                                      <tr
                                        key={split.splitNum}
                                        onMouseEnter={() => setHoveredSplitNum(split.splitNum)}
                                        onMouseLeave={() => setHoveredSplitNum(null)}
                                        style={{
                                          backgroundColor: hoveredSplitNum === split.splitNum ? "rgba(252, 97, 0, 0.05)" : "transparent",
                                          cursor: "crosshair",
                                        }}
                                      >
                                        <td className="split-num-td">{split.splitNum}</td>
                                        <td className="split-interval-td">
                                          {(split.startDist / 1000).toFixed(2)} - {(split.endDist / 1000).toFixed(2)} km
                                        </td>
                                        <td className="split-time-td">{split.timeStr}</td>
                                        <td className="split-speed-td">{split.avgSpeed.toFixed(1)} km/h</td>
                                        <td
                                          className={`split-grade-td ${
                                            split.avgGrade > 8 ? "steep-red" : split.avgGrade > 4 ? "slope-orange" : "flat-green"
                                          }`}
                                        >
                                          {split.avgGrade.toFixed(1)}%
                                        </td>
                                        {hasHr && (
                                          <td className="sensor-hr">
                                            {split.avgHr !== undefined ? `${split.avgHr} bpm` : "—"}
                                          </td>
                                        )}
                                        {hasPower && (
                                          <td className="sensor-power">
                                            {split.avgPower !== undefined ? `${split.avgPower} W` : "—"}
                                          </td>
                                        )}
                                        {hasCadence && (
                                          <td className="sensor-cadence">
                                            {split.avgCadence !== undefined ? `${split.avgCadence} rpm` : "—"}
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="splits-loading">구간 데이터를 불러와 10단계 세부 스플릿을 계산하는 중...</div>
                            )}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-leaderboard-message">
                  등록된 주행 기록이 없습니다. 아래 업로드 칸에 주행 GPX를 올려 기록을 등록해 보세요!
                </div>
              )}
            </div>

            {/* Record Add Options (Only Toggleable Manual Entry) */}
            <div className="record-actions-container">
              <div className="card add-attempt-card compact-card">
                <div className="card-header-with-action">
                  <h4>➕ 수동 주행 기록 직접 등록 (기록 추가)</h4>
                  <button
                    className="btn btn-secondary btn-xs manual-toggle-btn"
                    onClick={() => setShowManualForm(!showManualForm)}
                  >
                    {showManualForm ? "수동 창 닫기" : "➕ 수동 기록 추가"}
                  </button>
                </div>

                {/* Collapsible Manual Record Input Form */}
                {showManualForm && (
                  <div className="manual-record-collapsible">
                    <h5>수동 기록 직접 등록</h5>
                    <form onSubmit={handleAddManualAttempt} className="attempt-form">
                      <div className="form-row">
                        <div className="form-group flex-1">
                          <label>주행 일자</label>
                          <input
                            type="date"
                            required
                            value={manualDate}
                            onChange={(e) => setManualDate(e.target.value)}
                          />
                        </div>
                        <div className="form-group flex-1">
                          <label>주행 시간 (mm:ss)</label>
                          <input
                            type="text"
                            required
                            placeholder="예: 05:42"
                            value={manualTime}
                            onChange={(e) => setManualTime(e.target.value)}
                          />
                        </div>
                        <div className="form-group flex-1">
                          <label>평균 시속 (km/h)</label>
                          <input
                            type="text"
                            required
                            placeholder="예: 23.4"
                            value={manualSpeed}
                            onChange={(e) => setManualSpeed(e.target.value)}
                          />
                        </div>
                        <div className="form-group form-btn-group">
                          <button type="submit" className="btn btn-primary" disabled={loading}>
                            기록 추가
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View D: All Recent Ride Attempts View */}
        {activeView === "recent_records" && (
          <div className="recent-records-container" style={{ padding: "24px", maxWidth: "1000px", margin: "0 auto", width: "100%" }}>
            <div className="directory-header-row" style={{ marginBottom: "24px" }}>
              <h2>🔥 최근 주행 기록 전체 보기 ({allRecentAttempts.length}개)</h2>
              <p className="directory-subtitle">모든 코스에서 수집된 주행 기록을 최신 순으로 한눈에 확인하세요.</p>
            </div>

            {allRecentAttempts.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "40px", color: "#888" }}>
                아직 등록된 주행 기록이 없습니다. GPX 파일 업로드를 통해 첫 완주 기록을 남겨보세요!
              </div>
            ) : (
              <div className="recent-attempts-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {allRecentAttempts.map((item, idx) => (
                  <div
                    key={`${item.segmentId}-${item.attempt.id}-${idx}`}
                    className="card recent-attempt-card"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "16px 20px",
                      background: item.isPR ? "#FFFBF7" : "#FFFFFF",
                      border: item.isPR ? "2px solid #FC6100" : "1px solid #E6E6EB",
                      borderRadius: "12px",
                      cursor: "pointer",
                      transition: "transform 0.15s, box-shadow 0.15s",
                    }}
                    onClick={() => {
                      setSelectedSegId(item.segmentId);
                      setActiveView("leaderboard");
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{ fontSize: "24px" }}>
                        {item.isPR ? "👑" : "🏆"}
                      </div>
                      <div>
                        <div style={{ fontWeight: "bold", fontSize: "16px", color: "#222", marginBottom: "4px" }}>
                          ⛰️ {item.segmentName}{" "}
                          {item.isPR ? (
                            <span style={{ background: "#FC6100", color: "#FFF", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold", marginLeft: "8px" }}>
                              1등. 개인 최고 기록 (PR)! 🎉
                            </span>
                          ) : (
                            <span style={{ background: "#FFEADA", color: "#FC6100", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold", marginLeft: "8px" }}>
                              {item.rank}등
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "13px", color: "#666" }}>
                          📅 주행일: {item.attempt.date} ({getRelativeTimeKo(item.attempt.date)})
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "18px", fontWeight: "bold", color: "#FC6100" }}>
                        {formatMsToTime(item.attempt.durationMs)}
                      </div>
                      <div style={{ fontSize: "12px", color: "#888" }}>
                        평균 {item.attempt.avgSpeed.toFixed(1)} km/h
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  </div>
  );
}
