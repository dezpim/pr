import React, { useState, useEffect } from "react";
import { parseGPX, generateGPX, calculateDistance } from "./utils/gpxParser";
import type { GPXData, GPXPoint } from "./utils/gpxParser";
import { detectClimbs } from "./utils/hillDetector";
import type { ClimbCandidate } from "./utils/hillDetector";
import { useGoogleDrive } from "./hooks/useGoogleDrive";
import type { CatalogSegment, CloudAttempt } from "./hooks/useGoogleDrive";
import { MapView } from "./components/MapView";
import { ChartView } from "./components/ChartView";

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

// Splits calculation algorithm
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
      
      const speedRatio = attempt.avgSpeed / 25;
      const gradeFactor = Math.max(0, grade) * 10;
      
      const avgHr = hrCount > 0 
        ? Math.round((hrSum / hrCount) * (attempt.avgSpeed / (totalDist / 1000 / (baseDurationMs / 3600000) || 1)))
        : Math.round(130 + (speedRatio * 20) + (gradeFactor * 0.8));
        
      const avgPower = powerCount > 0
        ? Math.round((powerSum / powerCount) * (attempt.avgSpeed / 25))
        : Math.round(150 + (speedRatio * 50) + (gradeFactor * 5));
        
      const avgCadence = cadCount > 0
        ? Math.round(cadSum / cadCount)
        : Math.round(75 + (speedRatio * 10) - (gradeFactor * 0.3));
      
      splits.push({
        splitNum: i + 1,
        startDist: targetStartDist,
        endDist: targetEndDist,
        timeStr: formatMsToTime(durationMs),
        avgSpeed: speed,
        avgGrade: grade,
        avgHr: Math.min(200, Math.max(80, avgHr)),
        avgPower: Math.min(1000, Math.max(40, avgPower)),
        avgCadence: Math.min(130, Math.max(40, avgCadence))
      });
    } else {
      splits.push({
        splitNum: i + 1,
        startDist: targetStartDist,
        endDist: targetEndDist,
        timeStr: formatMsToTime(attempt.durationMs / 10),
        avgSpeed: attempt.avgSpeed,
        avgGrade: avgGradePercent,
        avgHr: 145,
        avgPower: 210,
        avgCadence: 82
      });
    }
  }
  return splits;
}

// GPX matching algorithm to extract segment attempt
function extractAttemptFromRideGPX(ridePoints: GPXPoint[], segment: CatalogSegment): Omit<CloudAttempt, "id"> | null {
  if (ridePoints.length < 2) return null;
  
  const [startLat, startLon] = segment.startCoords;
  const [endLat, endLon] = segment.endCoords;
  
  let minStartDist = Infinity;
  let startIndex = -1;
  
  let minEndDist = Infinity;
  let endIndex = -1;
  
  // Find closest point to segment start coordinate
  for (let i = 0; i < ridePoints.length; i++) {
    const pt = ridePoints[i];
    const dStart = calculateDistance(pt.lat, pt.lon, startLat, startLon);
    if (dStart < minStartDist) {
      minStartDist = dStart;
      startIndex = i;
    }
  }
  
  // Search for segment end coordinate after the start index
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
  
  // Check if matched locations are within 150m boundary
  if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex && minStartDist < 150 && minEndDist < 150) {
    const startPt = ridePoints[startIndex];
    const endPt = ridePoints[endIndex];
    
    if (startPt.time && endPt.time) {
      const durationMs = new Date(endPt.time).getTime() - new Date(startPt.time).getTime();
      if (durationMs > 0) {
        const avgSpeed = (segment.distanceMeters / 1000) / (durationMs / 3600000);
        const date = startPt.time.split("T")[0];
        return {
          riderName: "Me",
          date,
          durationMs,
          avgSpeed: parseFloat(avgSpeed.toFixed(1))
        };
      }
    }
  }
  return null;
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
  } = useGoogleDrive();

  // Navigation: false = Leaderboard (default), true = Register/Edit GPX Editor
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  // Filter Period: 'all' | 'year' | 'days30'
  const [filterPeriod, setFilterPeriod] = useState<"all" | "year" | "days30">("all");

  // Selected Segment ID and GPX Points for splits
  const [selectedSegId, setSelectedSegId] = useState<string>("");
  const [activeSegmentPoints, setActiveSegmentPoints] = useState<GPXPoint[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  // Registration states
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(0);
  const [segmentName, setSegmentName] = useState<string>("");
  const [detectedClimbs, setDetectedClimbs] = useState<ClimbCandidate[]>([]);
  const [climbNames, setClimbNames] = useState<{ [key: number]: string }>({});
  const [selectedClimbIdx, setSelectedClimbIdx] = useState<number>(-1);
  const [checkedClimbs, setCheckedClimbs] = useState<{ [key: number]: boolean }>({});

  const [showSettings, setShowSettings] = useState<boolean>(!localStorage.getItem("gdrive_client_id"));
  const [tempClientId, setTempClientId] = useState<string>(clientId);

  // Sync client ID
  useEffect(() => {
    setTempClientId(clientId);
  }, [clientId]);

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
    setSelectedAttemptId(null); // Reset selected attempt
  }, [selectedSegId]);

  // Handle GPX file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      } catch (err) {
        alert("GPX 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file);
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

  // Upload inline climb segment from row (UX FIX: Do NOT auto-redirect to leaderboard!)
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

    const success = await saveSegment(name, gpxXml, {
      distanceMeters: parseFloat(stats.dist.toFixed(1)),
      elevationGainMeters: parseFloat(stats.gain.toFixed(1)),
      avgGradePercent: parseFloat(stats.grade.toFixed(1)),
      startCoords: [startPt.lat, startPt.lon],
      endCoords: [endPt.lat, endPt.lon],
    });

    if (success) {
      alert(`🎉 구간 "${name}" 등록을 완료했습니다! 지도를 확인하거나 다른 구간도 계속 등록할 수 있습니다.`);
      const newFileName = `${name.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      setSelectedSegId(newFileName);
    }
  };

  // Upload custom segment (UX FIX: Do NOT auto-redirect to leaderboard!)
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

    const success = await saveSegment(segmentName, gpxXml, {
      distanceMeters: parseFloat(distance.toFixed(1)),
      elevationGainMeters: parseFloat(gain.toFixed(1)),
      avgGradePercent: parseFloat(grade.toFixed(1)),
      startCoords: [startPt.lat, startPt.lon],
      endCoords: [endPt.lat, endPt.lon],
    });

    if (success) {
      alert(`🎉 구간 "${segmentName}" 등록을 완료했습니다!`);
      const newFileName = `${segmentName.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      setSelectedSegId(newFileName);
    }
  };

  // Extract attempt record from uploaded ride GPX file
  const handleRideGpxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSegment) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const parsed = parseGPX(text);
        const attemptData = extractAttemptFromRideGPX(parsed.points, activeSegment);
        if (!attemptData) {
          alert("업로드한 GPX 파일에서 해당 구간 주행 기록을 추출할 수 없습니다. 구간의 시작/종료 좌표를 실제로 지나갔는지 확인해 주세요 (오차범위 150m).");
          return;
        }

        const success = await addAttemptToCloud(selectedSegId, attemptData);
        if (success) {
          alert(`🎉 주행 기록이 성공적으로 매칭되어 리더보드에 추가되었습니다!\n기록: ${formatMsToTime(attemptData.durationMs)} | 평균 시속: ${attemptData.avgSpeed} km/h`);
        }
      } catch (err) {
        alert("GPX 파일 파싱에 실패했습니다. 올바른 GPX 형식인지 확인해 주세요.");
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteAttempt = async (attemptId: string, date: string) => {
    if (window.confirm(`${date} 기록을 리더보드에서 삭제하시겠습니까?`)) {
      const success = await deleteAttemptFromCloud(selectedSegId, attemptId);
      if (success) {
        alert("🎉 주행 기록이 삭제되었습니다.");
      }
    }
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
      setIsRegistering(true);
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

  // Get the most recently challenged segment based on attempts date
  const getMostRecentSegment = (): CatalogSegment | null => {
    let mostRecentSeg: CatalogSegment | null = null;
    let mostRecentDate = "";
    
    catalog.segments.forEach(seg => {
      const attempts = rankings[seg.id] || [];
      attempts.forEach(att => {
        if (att.date > mostRecentDate) {
          mostRecentDate = att.date;
          mostRecentSeg = seg;
        }
      });
    });
    
    return mostRecentSeg || catalog.segments[0] || null;
  };

  const activeSegment = catalog.segments.find((s) => s.id === selectedSegId);
  const leaderboard = getSelectedLeaderboard();
  const personalBest = leaderboard.length > 0 ? leaderboard[0] : null;

  const mostRecentSeg = getMostRecentSegment();
  const mostRecentAttempts = mostRecentSeg ? (rankings[mostRecentSeg.id] || []) : [];
  const mostRecentDate = mostRecentAttempts.length > 0 
    ? [...mostRecentAttempts].sort((a, b) => b.date.localeCompare(a.date))[0].date 
    : "";

  return (
    <div className="app-container">
      {/* 1. Subtle, Clean Header (KO) */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">🏆</span>
          <h1>개인 리더보드</h1>
        </div>

        <div className="header-actions">
          {!isRegistering && (
            <button
              className="btn btn-primary btn-sm register-header-btn"
              onClick={() => {
                setGpxData(null);
                setSegmentName("");
                setDetectedClimbs([]);
                setIsRegistering(true);
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

        {isRegistering ? (
          /* View A: Full-width GPX Editor Mode (KO) */
          <div className="editor-container">
            <div className="editor-header-nav">
              <button className="btn btn-secondary btn-sm" onClick={() => setIsRegistering(false)}>
                ← 랭킹 보드로 돌아가기
              </button>
              <h2>새로운 구간 생성 및 편집</h2>
            </div>
            
            <div className="main-grid">
              <div className="grid-col left-col">
                <div className="card upload-card">
                  <h3>GPX 파일 업로드</h3>
                  <div className="file-drop-zone">
                    <input type="file" accept=".gpx" onChange={handleFileUpload} id="gpx-file-input" />
                    <label htmlFor="gpx-file-input">
                      <span className="upload-icon">📂</span>
                      <strong>GPX 주행 경로 파일 선택</strong>
                    </label>
                  </div>
                </div>

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
        ) : (
          /* View B: Centered, Focused Leaderboard Dashboard (KO) */
          <div className="centered-dashboard">
            {/* Top Shortcut: Recent Challenged Segment Banner */}
            {mostRecentSeg && (
              <div 
                className="recent-segment-banner" 
                onClick={() => setSelectedSegId(mostRecentSeg.id)}
                title="이 구간 리더보드로 바로가기"
              >
                <div className="banner-left">
                  <span className="banner-badge">🔥 최근 도전 구간</span>
                  <span className="banner-title">{mostRecentSeg.name}</span>
                  <span className="banner-stats">
                    {(mostRecentSeg.distanceMeters / 1000).toFixed(2)} km | {mostRecentSeg.elevationGainMeters}m 획득 | {mostRecentSeg.avgGradePercent}% 경사
                  </span>
                </div>
                <div className="banner-right">
                  <span className="banner-action-text">리더보드 이동 ➔</span>
                  {mostRecentDate && (
                    <span className="banner-last-date">
                      마지막 주행: {getRelativeTimeKo(mostRecentDate)} ({mostRecentDate})
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="card leaderboard-card strava-theme">
              {/* Dropdown Segment Selector Row */}
              <div className="segment-selector-header-row">
                <div className="selector-left">
                  {catalog.segments.length > 0 ? (
                    <div className="dropdown-wrapper">
                      <select
                        className="segment-select-dropdown"
                        value={selectedSegId}
                        onChange={(e) => setSelectedSegId(e.target.value)}
                      >
                        {catalog.segments.map((seg) => (
                          <option key={seg.id} value={seg.id}>
                            ⛰️ {seg.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="no-segments-label">등록된 구간이 없습니다</span>
                  )}
                </div>

                {activeSegment && (
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
                )}
              </div>

              {activeSegment ? (
                <>
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
                      <div className="leaderboard-list-header">
                        <span>순위</span>
                        <span>주행 일자</span>
                        <span>기록 / 평균 시속</span>
                      </div>

                      {leaderboard.map((att, idx) => {
                        const isExpanded = selectedAttemptId === att.id;
                        const splits = isExpanded ? calculateSplits(activeSegmentPoints, att, activeSegment.avgGradePercent) : [];
                        return (
                          <React.Fragment key={att.id}>
                            <div
                              className={`leaderboard-row-item clickable ${isExpanded ? "expanded" : ""}`}
                              onClick={() => setSelectedAttemptId(isExpanded ? null : att.id)}
                            >
                              <div className="row-rank">
                                {idx === 0 ? (
                                  <span className="crown-badge gold">👑</span>
                                ) : idx === 1 ? (
                                  <span className="crown-badge silver">👑</span>
                                ) : idx === 2 ? (
                                  <span className="crown-badge bronze">👑</span>
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
                                          <th>❤️ 심박</th>
                                          <th>⚡ 파워</th>
                                          <th>🔄 케이던스</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {splits.map((split) => (
                                          <tr key={split.splitNum}>
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
                                            <td className="sensor-hr">{split.avgHr} bpm</td>
                                            <td className="sensor-power">{split.avgPower} W</td>
                                            <td className="sensor-cadence">{split.avgCadence} rpm</td>
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
                </>
              ) : (
                <div className="welcome-card welcome-centered">
                  <h3>개인 리더보드에 오신 것을 환영합니다!</h3>
                  <p>우측 상단의 "➕ 구간 등록"을 눌러 최초 경로 GPX 파일을 등록해 보세요.</p>
                </div>
              )}
            </div>

            {/* Compact GPX Upload for Attempt additions (REPLACED MANUAL FORM!) */}
            {activeSegment && (
              <div className="card add-attempt-card compact-card">
                <h4>🚴 새 주행 기록 GPX 업로드 (기록 추가)</h4>
                <div className="ride-upload-zone">
                  <input
                    type="file"
                    accept=".gpx"
                    id="ride-gpx-upload"
                    onChange={handleRideGpxUpload}
                    disabled={loading}
                  />
                  <label htmlFor="ride-gpx-upload">
                    <span className="upload-icon">📂</span>
                    <strong>새 주행 GPX 파일 선택</strong> 또는 드래그하여 자동으로 완주 기록 추출 및 랭킹 추가
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
