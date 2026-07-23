import React, { useState, useEffect } from "react";
import { parseGPX, generateGPX } from "./utils/gpxParser";
import type { GPXData, GPXPoint } from "./utils/gpxParser";
import { detectClimbs } from "./utils/hillDetector";
import type { ClimbCandidate } from "./utils/hillDetector";
import { useGoogleDrive } from "./hooks/useGoogleDrive";
import type { CloudAttempt } from "./hooks/useGoogleDrive";
import { MapView } from "./components/MapView";
import { ChartView } from "./components/ChartView";

// Helper: Parse MM:SS or HH:MM:SS duration string to milliseconds
function parseTimeToMs(timeStr: string): number {
  const parts = timeStr.trim().split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  
  if (parts.length === 2) {
    // MM:SS
    return (parts[0] * 60 + parts[1]) * 1000;
  } else if (parts.length === 3) {
    // HH:MM:SS
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  
  // Fallback: try raw seconds
  const sec = parseFloat(timeStr);
  return isNaN(sec) ? 0 : sec * 1000;
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

// Helper: Get relative time string (e.g. "3 days ago")
function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const past = new Date(dateStr);
  
  const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const pastZero = new Date(past.getFullYear(), past.getMonth(), past.getDate());
  
  const diffTime = nowZero.getTime() - pastZero.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today (오늘)";
  if (diffDays === 1) return "Yesterday (어제)";
  if (diffDays < 0) return dateStr;
  
  if (diffDays < 7) {
    return `${diffDays} days ago (${diffDays}일 전)`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago (${weeks}주 전)`;
  }
  const months = Math.floor(diffDays / 30);
  if (months < 12) {
    return `${months} month${months > 1 ? "s" : ""} ago (${months}달 전)`;
  }
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago (${years}년 전)`;
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

  // Ranking attempt states
  const [newRideDate, setNewRideDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [newRideTime, setNewRideTime] = useState<string>("");
  const [newRideSpeed, setNewRideSpeed] = useState<string>("");

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
          alert("Invalid GPX: File must contain at least 2 points.");
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
          initialNames[idx] = `${parsed.name} - Climb ${idx + 1}`;
        });
        setClimbNames(initialNames);
      } catch (err) {
        alert("Failed to parse GPX file. Make sure it's valid XML.");
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
    setSegmentName(climbNames[idx] || `${gpxData?.name || "Climb"} - Climb ${idx + 1}`);
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
      alert("Please select at least 2 climbs to merge.");
      return;
    }

    selectedIndices.sort((a, b) => a - b);
    const minStart = Math.min(...selectedIndices.map((idx) => detectedClimbs[idx].startIndex));
    const maxEnd = Math.max(...selectedIndices.map((idx) => detectedClimbs[idx].endIndex));

    setStartIndex(minStart);
    setEndIndex(maxEnd);
    setSelectedClimbIdx(-1);

    const mergedNames = selectedIndices.map((idx) => `Hill ${idx + 1}`).join(" + ");
    setSegmentName(`${gpxData?.name || "Merged Route"} - ${mergedNames} Merged`);
    setCheckedClimbs({});
    alert(`Merged ${selectedIndices.length} sections!`);
  };

  const handleSaveSettings = () => {
    setClientId(tempClientId);
    setShowSettings(false);
    alert("Client ID saved.");
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
      alert(`🎉 Segment "${name}" successfully saved!`);
      const newFileName = `${name.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      setSelectedSegId(newFileName);
      setIsRegistering(false);
    }
  };

  const handleUploadToDrive = async () => {
    if (!gpxData) return;
    if (!segmentName.trim()) {
      alert("Please enter a segment name.");
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
      alert("🎉 Segment successfully saved!");
      const newFileName = `${segmentName.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      setSelectedSegId(newFileName);
      setIsRegistering(false);
    }
  };

  const handleAddAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSegId) return;
    if (!newRideTime.trim() || !newRideSpeed.trim()) {
      alert("Please fill in time and speed.");
      return;
    }

    const durationMs = parseTimeToMs(newRideTime);
    if (durationMs <= 0) {
      alert("Invalid Time. Format must be mm:ss or hh:mm:ss");
      return;
    }

    const speed = parseFloat(newRideSpeed);
    if (isNaN(speed) || speed <= 0) {
      alert("Invalid speed.");
      return;
    }

    const success = await addAttemptToCloud(selectedSegId, {
      riderName: "Me",
      date: newRideDate,
      durationMs,
      avgSpeed: speed,
    });

    if (success) {
      alert("🎉 Record successfully added!");
      setNewRideTime("");
      setNewRideSpeed("");
    }
  };

  const handleDeleteAttempt = async (attemptId: string, date: string) => {
    if (window.confirm(`Delete attempt from ${date}?`)) {
      const success = await deleteAttemptFromCloud(selectedSegId, attemptId);
      if (success) {
        alert("🎉 Attempt successfully deleted!");
      }
    }
  };

  const handleSegmentDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete segment "${name}" from Drive?`)) {
      const success = await deleteSegment(id);
      if (success) {
        alert("🎉 Segment successfully deleted!");
        if (selectedSegId === id) {
          setSelectedSegId(catalog.segments[0]?.id || "");
        }
      }
    }
  };

  const handleSegmentRename = async (id: string, currentName: string) => {
    const newName = window.prompt("Enter new segment name:", currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      const success = await renameSegment(id, newName.trim());
      if (success) {
        alert("🎉 Segment successfully renamed!");
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
      alert("Failed to download segment GPX file.");
      return;
    }
    try {
      const parsed = parseGPX(gpxXml);
      if (parsed.points.length < 2) {
        alert("Downloaded GPX is invalid.");
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
      alert("Failed to parse GPX.");
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

  return (
    <div className="app-container">
      {/* 1. Subtle, Clean Header */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">🏆</span>
          <h1>Leaderboard</h1>
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
              ➕ 구간 등록 (Register Route)
            </button>
          )}
          {accessToken ? (
            <div className="user-profile">
              <span className="user-email">{userEmail || "Connected"}</span>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                Logout
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={login}>
              Sign In
            </button>
          )}
          <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
            ⚙️
          </button>
        </div>
      </header>

      {/* 2. Main Content */}
      <main className="app-main">
        {showSettings && (
          <div className="settings-modal">
            <div className="settings-card">
              <h3>Google API Configuration</h3>
              <div className="form-group">
                <label>OAuth Client ID</label>
                <input
                  type="text"
                  placeholder="Client ID"
                  value={tempClientId}
                  onChange={(e) => setTempClientId(e.target.value)}
                />
              </div>
              <div className="settings-buttons">
                <button className="btn btn-primary" onClick={handleSaveSettings}>
                  Save Settings
                </button>
                <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {isRegistering ? (
          /* View A: Full-width GPX Editor Mode */
          <div className="editor-container">
            <div className="editor-header-nav">
              <button className="btn btn-secondary btn-sm" onClick={() => setIsRegistering(false)}>
                ← Back to Leaderboard (랭킹으로 돌아가기)
              </button>
              <h2>Register New Segment</h2>
            </div>
            
            <div className="main-grid">
              <div className="grid-col left-col">
                <div className="card upload-card">
                  <h3>Upload GPX Route File</h3>
                  <div className="file-drop-zone">
                    <input type="file" accept=".gpx" onChange={handleFileUpload} id="gpx-file-input" />
                    <label htmlFor="gpx-file-input">
                      <span className="upload-icon">📂</span>
                      <strong>Choose a GPX file</strong>
                    </label>
                  </div>
                </div>

                {gpxData && (
                  <div className="card map-card">
                    <h3>Route Map</h3>
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
                      <h3>Elevation Profile (Trim Segment)</h3>
                      <ChartView
                        points={gpxData.points}
                        startIndex={startIndex}
                        endIndex={endIndex}
                        onTrimChange={handleTrimChange}
                      />
                      <div className="segment-metrics">
                        <div className="metric-box">
                          <span className="metric-val">{(distance / 1000).toFixed(2)} km</span>
                          <span className="metric-lbl">Distance</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-val">{gain.toFixed(0)} m</span>
                          <span className="metric-lbl">Gain</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-val">{grade.toFixed(1)}%</span>
                          <span className="metric-lbl">Avg Slope</span>
                        </div>
                      </div>
                    </div>

                    <div className="card climbs-card">
                      <div className="climbs-header">
                        <h3>Auto-Detected Hills</h3>
                        {Object.values(checkedClimbs).some(Boolean) && (
                          <button className="btn btn-secondary btn-sm merge-btn" onClick={handleMergeSelectedClimbs}>
                            🔗 Merge Selected
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
                                  {(climb.distance / 1000).toFixed(2)} km | {climb.elevationGain.toFixed(0)}m Gain
                                </span>
                              </div>
                              <div className="climb-item-actions">
                                <input
                                  type="text"
                                  className="climb-name-input"
                                  placeholder="Name"
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
                                  Save
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-climbs-message">No climbs detected. Trim manually.</div>
                      )}
                    </div>

                    <div className="card save-card">
                      <h3>Register Custom Trimmed Segment</h3>
                      <div className="form-group">
                        <input
                          type="text"
                          placeholder="Segment Name"
                          value={segmentName}
                          onChange={(e) => setSegmentName(e.target.value)}
                        />
                      </div>
                      <button className="btn btn-primary btn-block" onClick={handleUploadToDrive} disabled={loading}>
                        {loading ? "Uploading..." : "Save to Google Drive"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="card welcome-card">
                    <h3>Upload GPX to Start Trimming</h3>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* View B: Centered, Focused Leaderboard Dashboard */
          <div className="centered-dashboard">
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
                    <span className="no-segments-label">No segments registered yet</span>
                  )}
                </div>

                {activeSegment && (
                  <div className="selector-right-actions">
                    <button
                      className="btn btn-icon-only"
                      onClick={() => handleSegmentRename(activeSegment.id, activeSegment.name)}
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-icon-only text-danger"
                      onClick={() => handleSegmentDelete(activeSegment.id, activeSegment.name)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                    <button
                      className="btn btn-secondary btn-sm edit-seg-btn-small"
                      onClick={() => handleLoadSegmentToEditor(activeSegment.id, activeSegment.name)}
                      disabled={loading}
                      title="Map View"
                    >
                      🗺️ View/Edit Route
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
                    <span>{activeSegment.elevationGainMeters}m Gain</span>
                    <span className="divider">|</span>
                    <span>{activeSegment.avgGradePercent}% Avg Slope</span>
                  </div>

                  {/* Filter Pills */}
                  <div className="filter-pills-row">
                    <button
                      className={`pill-btn ${filterPeriod === "all" ? "active" : ""}`}
                      onClick={() => setFilterPeriod("all")}
                    >
                      All-Time
                    </button>
                    <button
                      className={`pill-btn ${filterPeriod === "year" ? "active" : ""}`}
                      onClick={() => setFilterPeriod("year")}
                    >
                      This Year
                    </button>
                    <button
                      className={`pill-btn ${filterPeriod === "days30" ? "active" : ""}`}
                      onClick={() => setFilterPeriod("days30")}
                    >
                      Recent 30 Days
                    </button>
                  </div>

                  {/* PR Trophy Highlight */}
                  {personalBest && (
                    <div className="pr-trophy-zone">
                      <div className="trophy-rays">
                        <span className="trophy-crown">👑</span>
                      </div>
                      <div className="pr-time-display">{formatMsToTime(personalBest.durationMs)}</div>
                      <div className="pr-label">PERSONAL RECORD (PR)</div>
                      <div className="pr-achieved-date">
                        Achieved {getRelativeTime(personalBest.date)} ({personalBest.date})
                      </div>
                    </div>
                  )}

                  {/* Custom ranking rows with inline splits details */}
                  {leaderboard.length > 0 ? (
                    <div className="strava-leaderboard-list">
                      <div className="leaderboard-list-header">
                        <span>RANK</span>
                        <span>ATTEMPT DATE</span>
                        <span>TIME / SPEED</span>
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
                                <span className="attempt-relative">{getRelativeTime(att.date)}</span>
                              </div>

                              <div className="row-results">
                                <span className="attempt-time">{formatMsToTime(att.durationMs)}</span>
                                <span className="attempt-speed">{att.avgSpeed.toFixed(1)} km/h</span>
                              </div>

                              <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="btn-delete-attempt"
                                  onClick={() => handleDeleteAttempt(att.id, att.date)}
                                  title="Delete Record"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>

                            {/* Collapsible Splits Section */}
                            {isExpanded && (
                              <div className="splits-details-panel">
                                <h4>📊 10 Splits detailed Analysis (10단계 구간 상세 분석)</h4>
                                {activeSegmentPoints.length > 0 ? (
                                  <div className="splits-table-wrapper">
                                    <table className="splits-table">
                                      <thead>
                                        <tr>
                                          <th>SPLIT</th>
                                          <th>INTERVAL</th>
                                          <th>TIME</th>
                                          <th>SPEED</th>
                                          <th>SLOPE</th>
                                          <th>❤️ HR</th>
                                          <th>⚡ POWER</th>
                                          <th>🔄 CAD</th>
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
                                  <div className="splits-loading">Loading segment GPX points for splits calculations...</div>
                                )}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-leaderboard-message">
                      No records saved yet. Upload GPX with time logs to start.
                    </div>
                  )}
                </>
              ) : (
                <div className="welcome-card welcome-centered">
                  <h3>Welcome to Leaderboard</h3>
                  <p>Click "구간 등록 (Register Route)" in the header to import your first GPX file.</p>
                </div>
              )}
            </div>

            {/* Compact Add Attempt form under the main card */}
            {activeSegment && (
              <div className="card add-attempt-card compact-card">
                <h4>Add Manual Ride Record (기록 직접 추가)</h4>
                <form onSubmit={handleAddAttempt} className="attempt-form">
                  <div className="form-row">
                    <div className="form-group flex-1">
                      <label>Ride Date</label>
                      <input
                        type="date"
                        required
                        value={newRideDate}
                        onChange={(e) => setNewRideDate(e.target.value)}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label>Duration (mm:ss)</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 05:42"
                        value={newRideTime}
                        onChange={(e) => setNewRideTime(e.target.value)}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label>Avg Speed (km/h)</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 23.4"
                        value={newRideSpeed}
                        onChange={(e) => setNewRideSpeed(e.target.value)}
                      />
                    </div>
                    <div className="form-group form-btn-group">
                      <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        Add Record
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
