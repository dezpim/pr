import React, { useState, useEffect } from "react";
import { parseGPX, generateGPX } from "./utils/gpxParser";
import type { GPXData } from "./utils/gpxParser";
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

  // Registration states
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(0);
  const [segmentName, setSegmentName] = useState<string>("");
  const [detectedClimbs, setDetectedClimbs] = useState<ClimbCandidate[]>([]);
  const [climbNames, setClimbNames] = useState<{ [key: number]: string }>({});
  const [selectedClimbIdx, setSelectedClimbIdx] = useState<number>(-1);
  const [checkedClimbs, setCheckedClimbs] = useState<{ [key: number]: boolean }>({});

  // Ranking states
  const [selectedSegId, setSelectedSegId] = useState<string>("");
  const [newRiderName, setNewRiderName] = useState<string>("");
  const [newRideDate, setNewRideDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [newRideTime, setNewRideTime] = useState<string>("");
  const [newRideSpeed, setNewRideSpeed] = useState<string>("");

  const [showSettings, setShowSettings] = useState<boolean>(!localStorage.getItem("gdrive_client_id"));
  const [tempClientId, setTempClientId] = useState<string>(clientId);

  // Sync client ID
  useEffect(() => {
    setTempClientId(clientId);
  }, [clientId]);

  // Set default selected segment in ranking tab when catalog loads
  useEffect(() => {
    if (catalog.segments.length > 0 && !selectedSegId) {
      setSelectedSegId(catalog.segments[0].id);
    }
  }, [catalog, selectedSegId]);

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

        // Run auto-detect climbs
        const climbs = detectClimbs(parsed.points);
        setDetectedClimbs(climbs);
        setSelectedClimbIdx(-1);
        setCheckedClimbs({});

        // Pre-populate climb names
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
    setSelectedClimbIdx(-1); // Deselect preset if user manually adjusts
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

  // Checkbox toggle for merging
  const handleClimbCheckToggle = (idx: number) => {
    setCheckedClimbs((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  // Merge selected climbs (includes downhills/valleys in between)
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
    alert(`Merged ${selectedIndices.length} sections! The middle downhills/valleys are now included.`);
  };

  const handleSaveSettings = () => {
    setClientId(tempClientId);
    setShowSettings(false);
    alert("Client ID saved. Please log in again to apply changes.");
    logout();
  };

  // Calculate segment stats for any range
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

  // Upload inline climb segment from row
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
      alert(`🎉 Segment "${name}" successfully saved to Google Drive!`);
      const newFileName = `${name.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      setSelectedSegId(newFileName);
      setIsRegistering(false); // Redirect to leaderboard
    }
  };

  // Upload manual trimmed segment
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
      alert("🎉 Segment successfully saved to Google Drive and catalog updated!");
      const newFileName = `${segmentName.replace(/[^a-zA-Z0-9가-힣_]/g, "_")}.gpx`;
      setSelectedSegId(newFileName);
      setIsRegistering(false); // Redirect to leaderboard
    }
  };

  // Add ranking attempt handler
  const handleAddAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSegId) return;
    if (!newRiderName.trim() || !newRideTime.trim() || !newRideSpeed.trim()) {
      alert("Please fill in all ranking fields.");
      return;
    }

    const durationMs = parseTimeToMs(newRideTime);
    if (durationMs <= 0) {
      alert("Invalid Time format. Please enter as mm:ss or hh:mm:ss");
      return;
    }

    const speed = parseFloat(newRideSpeed);
    if (isNaN(speed) || speed <= 0) {
      alert("Invalid speed. Enter a number (e.g. 25.5)");
      return;
    }

    const success = await addAttemptToCloud(selectedSegId, {
      riderName: newRiderName,
      date: newRideDate,
      durationMs,
      avgSpeed: speed,
    });

    if (success) {
      alert("🎉 Ride record successfully added to cloud leaderboard!");
      setNewRiderName("");
      setNewRideTime("");
      setNewRideSpeed("");
    }
  };

  // Delete attempt handler
  const handleDeleteAttempt = async (attemptId: string, riderName: string) => {
    if (window.confirm(`Are you sure you want to delete ${riderName}'s attempt?`)) {
      const success = await deleteAttemptFromCloud(selectedSegId, attemptId);
      if (success) {
        alert("🎉 Ride record successfully deleted!");
      }
    }
  };

  // Delete whole segment wrapper
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

  // Rename segment wrapper
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

  // Load selected segment to GPX editor to view its track on the map/chart
  const handleLoadSegmentToEditor = async (id: string, name: string) => {
    const gpxXml = await downloadGPXFile(id);
    if (!gpxXml) {
      alert("Failed to download segment GPX file from Google Drive.");
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
      setIsRegistering(true); // Open Editor View!
    } catch (err) {
      alert("Failed to parse downloaded GPX.");
    }
  };

  // Sort selected segment leaderboard attempts (fastest time first)
  const getSelectedLeaderboard = (): CloudAttempt[] => {
    const list = rankings[selectedSegId] || [];
    return [...list].sort((a, b) => a.durationMs - b.durationMs);
  };

  const activeSegment = catalog.segments.find((s) => s.id === selectedSegId);

  return (
    <div className="app-container">
      {/* 1. Header Toolbar */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">🏆</span>
          <h1>Leaderboard</h1>
        </div>
        
        {/* Registration Mode Indicator / Action Button in Header */}
        <div className="header-navigation-actions">
          {isRegistering ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setIsRegistering(false)}
            >
              ← Back to Leaderboard (랭킹으로 돌아가기)
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setGpxData(null);
                setSegmentName("");
                setDetectedClimbs([]);
                setIsRegistering(true);
              }}
            >
              ➕ Register New Segment (새 구간 등록)
            </button>
          )}
        </div>

        <div className="header-actions">
          {accessToken ? (
            <div className="user-profile">
              <span className="user-email">{userEmail || "Connected"}</span>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                Logout
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={login}>
              Sign In with Google
            </button>
          )}
          <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
            ⚙️
          </button>
        </div>
      </header>

      {/* 2. Main Content Layout */}
      <main className="app-main">
        {/* Settings Overlay / Modal Panel */}
        {showSettings && (
          <div className="settings-modal">
            <div className="settings-card">
              <h3>Google API Configuration</h3>
              <p className="settings-guide">
                Configure your own Google Client ID. Create one in the{" "}
                <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">
                  Google Cloud Console
                </a>{" "}
                with Google Drive API enabled.
              </p>
              <div className="form-group">
                <label>OAuth Client ID</label>
                <input
                  type="text"
                  placeholder="Paste your Client ID here"
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

        {/* View A: GPX Segment Parser & Register (Hidden by default) */}
        {isRegistering ? (
          <div className="main-grid">
            {/* Left Column: GPX Upload & Map */}
            <div className="grid-col left-col">
              <div className="card upload-card">
                <h3>Upload GPX Route File</h3>
                <div className="file-drop-zone">
                  <input type="file" accept=".gpx" onChange={handleFileUpload} id="gpx-file-input" />
                  <label htmlFor="gpx-file-input">
                    <span className="upload-icon">📂</span>
                    <strong>Choose a GPX file</strong> or drag it here
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

            {/* Right Column: Trimming Chart, Hill Analyzer, Drive Upload */}
            <div className="grid-col right-col">
              {gpxData ? (
                <>
                  {/* Trimming Chart */}
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
                        <span className="metric-lbl">Elevation Gain</span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-val">{grade.toFixed(1)}%</span>
                        <span className="metric-lbl">Avg Slope</span>
                      </div>
                    </div>
                  </div>

                  {/* Auto Detected Climbs List */}
                  <div className="card climbs-card">
                    <div className="climbs-header">
                      <h3>Auto-Detected Hills (구간 분리 및 등록)</h3>
                      {Object.values(checkedClimbs).some(Boolean) && (
                        <button
                          className="btn btn-secondary btn-sm merge-btn"
                          onClick={handleMergeSelectedClimbs}
                        >
                          🔗 Merge Selected (선택 구간 병합)
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
                                {(climb.distance / 1000).toFixed(2)} km, {climb.elevationGain.toFixed(0)}m Gain,{" "}
                                {climb.avgGrade.toFixed(1)}%
                              </span>
                            </div>
                            
                            {/* Inline Naming and Saving */}
                            <div className="climb-item-actions">
                              <input
                                type="text"
                                className="climb-name-input"
                                placeholder="Enter segment name"
                                value={climbNames[idx] || ""}
                                onChange={(e) => handleClimbNameChange(idx, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={loading || !accessToken}
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
                      <div className="no-climbs-message">
                        No significant uphill climbs detected in this route. Adjust sliders manually.
                      </div>
                    )}
                  </div>

                  {/* Save segment to Drive */}
                  <div className="card save-card">
                    <h3>Register Custom Trimmed Segment</h3>
                    <div className="form-group">
                      <label>Segment Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Custom Trim Uphill"
                        value={segmentName}
                        onChange={(e) => setSegmentName(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn btn-primary btn-block btn-lg"
                      onClick={handleUploadToDrive}
                      disabled={loading || !accessToken}
                    >
                      {loading ? "Uploading..." : "Save to Google Drive"}
                    </button>
                    {!accessToken && (
                      <p className="login-warning">Please sign in with Google to enable Drive uploads.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="card welcome-card">
                  <h3>UploadGPX to Start Trimming</h3>
                  <p>
                    Drag & drop or select a GPX ride file in the left panel to open it in the editor.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* View B: Cloud Leaderboard / Rankings Viewer (Default Home) */
          <div className="main-grid">
            {/* Left Column: Registered Segments Catalog list */}
            <div className="grid-col left-col">
              <div className="card catalog-card">
                <div className="catalog-header-row">
                  <h3>Registered Segments ({catalog.segments.length})</h3>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setGpxData(null);
                      setSegmentName("");
                      setDetectedClimbs([]);
                      setIsRegistering(true);
                    }}
                  >
                    ➕ Register New (구간 등록)
                  </button>
                </div>
                {catalog.segments.length > 0 ? (
                  <div className="catalog-vertical-list">
                    {catalog.segments.map((seg) => (
                      <div
                        key={seg.id}
                        className={`catalog-item-interactive ${selectedSegId === seg.id ? "active" : ""}`}
                        onClick={() => setSelectedSegId(seg.id)}
                      >
                        <div className="catalog-info">
                          <span className="catalog-name">{seg.name}</span>
                          <span className="catalog-stats">
                            {(seg.distanceMeters / 1000).toFixed(2)} km | {seg.elevationGainMeters}m Gain |{" "}
                            {seg.avgGradePercent}% Avg
                          </span>
                        </div>
                        <div className="catalog-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn-edit-catalog"
                            onClick={() => handleSegmentRename(seg.id, seg.name)}
                            title="Rename Segment"
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-delete-catalog"
                            onClick={() => handleSegmentDelete(seg.id, seg.name)}
                            title="Delete Segment"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-catalog-message">
                    No segments registered in Google Drive yet. Click "Register New" above to create segments!
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Leaderboard details & manual attempt logs */}
            <div className="grid-col right-col">
              {activeSegment ? (
                <>
                  {/* Segment Details & Leaderboard table */}
                  <div className="card leaderboard-card">
                    <div className="leaderboard-header">
                      <div className="leaderboard-title-row">
                        <h3>🥇 Leaderboard: {activeSegment.name}</h3>
                        <button
                          className="btn btn-secondary btn-sm edit-seg-btn"
                          onClick={() => handleLoadSegmentToEditor(activeSegment.id, activeSegment.name)}
                          disabled={loading}
                        >
                          🗺️ View/Edit Route (구간 보기/편집)
                        </button>
                      </div>
                      <span className="leaderboard-subtitle">
                        {(activeSegment.distanceMeters / 1000).toFixed(2)} km | {activeSegment.elevationGainMeters}m Gain
                      </span>
                    </div>

                    {getSelectedLeaderboard().length > 0 ? (
                      <table className="leaderboard-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Rider Name</th>
                            <th>Time</th>
                            <th>Avg Speed</th>
                            <th>Date</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getSelectedLeaderboard().map((att, idx) => (
                            <tr key={att.id}>
                              <td className="rank-td">
                                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`}
                              </td>
                              <td className="rider-td">{att.riderName}</td>
                              <td className="time-td">{formatMsToTime(att.durationMs)}</td>
                              <td className="speed-td">{att.avgSpeed.toFixed(1)} km/h</td>
                              <td className="date-td">{att.date}</td>
                              <td className="action-td">
                                <button
                                  className="btn-delete-attempt"
                                  onClick={() => handleDeleteAttempt(att.id, att.riderName)}
                                  title="Delete Attempt"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-leaderboard-message">
                        No ride records saved on this segment yet. Register records below!
                      </div>
                    )}
                  </div>

                  {/* Add Attempt Form */}
                  <div className="card add-attempt-card">
                    <h3>Add Ride Record (기록 직접 등록)</h3>
                    <form onSubmit={handleAddAttempt} className="attempt-form">
                      <div className="form-row">
                        <div className="form-group flex-1">
                          <label>Rider Name</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Han"
                            value={newRiderName}
                            onChange={(e) => setNewRiderName(e.target.value)}
                          />
                        </div>
                        <div className="form-group flex-1">
                          <label>Date</label>
                          <input
                            type="date"
                            required
                            value={newRideDate}
                            onChange={(e) => setNewRideDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group flex-1">
                          <label>Duration (mm:ss or hh:mm:ss)</label>
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
                      </div>
                      <button
                        type="submit"
                        className="btn btn-primary btn-block btn-lg"
                        disabled={loading || !accessToken}
                      >
                        Add Record to Leaderboard
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="card welcome-card">
                  <h3>Select a Segment</h3>
                  <p>
                    Please select a registered segment from the left panel list to view its cloud leaderboard and
                    rankings.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
