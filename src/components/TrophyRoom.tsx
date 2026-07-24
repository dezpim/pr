import React, { useState, useMemo } from "react";
import { TROPHY_REGISTRY } from "../utils/trophyEngine";
import type { UnlockedTrophy } from "../types/trophy";
import { LaurelWreath } from "./LaurelWreath";

interface TrophyRoomProps {
  unlockedTrophies: UnlockedTrophy[];
}

const ITEMS_PER_PAGE = 48;

function getTierStyle(tier: string) {
  switch (tier) {
    case "legendary":
      return { background: "linear-gradient(135deg, #D50000, #FFD700)", color: "#FFFFFF" };
    case "diamond":
      return { background: "linear-gradient(135deg, #0091EA, #00E5FF)", color: "#000000", fontWeight: "bold" as const };
    case "platinum":
      return { background: "linear-gradient(135deg, #673AB7, #E040FB)", color: "#FFFFFF" };
    case "gold":
      return { background: "linear-gradient(135deg, #FF9800, #FFD700)", color: "#3A2500", fontWeight: "bold" as const };
    case "silver":
      return { background: "linear-gradient(135deg, #607D8B, #CFD8DC)", color: "#111111" };
    case "bronze":
      return { background: "linear-gradient(135deg, #8D4E2A, #D77A3F)", color: "#FFFFFF" };
    case "secret":
    default:
      return { background: "linear-gradient(135deg, #4A4A5A, #2A2A36)", color: "#FFD700", fontWeight: "bold" as const };
  }
}

export const TrophyRoom: React.FC<TrophyRoomProps> = ({ unlockedTrophies }) => {
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // Default to true: Show ONLY Unlocked Trophies like discovering secret gifts!
  const [onlyUnlocked, setOnlyUnlocked] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const unlockedMap = useMemo(() => {
    const map = new Map<string, UnlockedTrophy>();
    unlockedTrophies.forEach((u) => map.set(u.trophyId, u));
    return map;
  }, [unlockedTrophies]);

  const unlockedCount = unlockedMap.size;

  const filteredTrophies = useMemo(() => {
    return TROPHY_REGISTRY.filter((t) => {
      if (selectedCat !== "all" && t.category !== selectedCat) return false;
      if (onlyUnlocked && !unlockedMap.has(t.id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.praiseMessage.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedCat, searchQuery, onlyUnlocked, unlockedMap]);

  const totalPages = Math.ceil(filteredTrophies.length / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);

  const paginatedTrophies = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredTrophies.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTrophies, safePage]);

  return (
    <div className="trophy-room-container">
      {/* 1. Header Hero Card */}
      <div className="trophy-room-header">
        <div className="trophy-header-info">
          <h2>🎁 나의 훈장 & 비밀 월계관 수집함</h2>
          <p>
            주행 기록을 올릴 때마다 숨겨진 훈장이 <strong>깜짝 비밀 선물</strong>로 하나씩 달성됩니다!
          </p>
        </div>

        <div className="trophy-progress-box">
          <div className="progress-labels">
            <span className="progress-text">현재 획득한 훈장</span>
            <span className="progress-value">
              <strong>{unlockedCount.toLocaleString()}개</strong> 달성!
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(unlockedCount * 10, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Unified Control Panel Card */}
      <div className="trophy-control-panel">
        <div className="control-panel-top">
          <div className="trophy-search-box">
            <span className="search-icon-inside">🔍</span>
            <input
              type="text"
              className="trophy-search-input"
              placeholder="획득한 훈장 검색... (예: 100km, 연속, 1분)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <label className="trophy-checkbox-label">
            <input
              type="checkbox"
              checked={!onlyUnlocked}
              onChange={(e) => {
                setOnlyUnlocked(!e.target.checked);
                setCurrentPage(1);
              }}
            />
            <span>🔒 미달성 비밀 훈장 힌트 함께 보기</span>
          </label>
        </div>

        {/* Category Filter Pills */}
        <div className="trophy-filter-tabs">
          <button
            className={`filter-btn ${selectedCat === "all" ? "active" : ""}`}
            onClick={() => { setSelectedCat("all"); setCurrentPage(1); }}
          >
            전체 보기 ({filteredTrophies.length.toLocaleString()})
          </button>
          <button
            className={`filter-btn ${selectedCat === "streak" ? "active" : ""}`}
            onClick={() => { setSelectedCat("streak"); setCurrentPage(1); }}
          >
            🔥 연속 & 출석
          </button>
          <button
            className={`filter-btn ${selectedCat === "improvement" ? "active" : ""}`}
            onClick={() => { setSelectedCat("improvement"); setCurrentPage(1); }}
          >
            ⏱️ 기록 단축
          </button>
          <button
            className={`filter-btn ${selectedCat === "volume" ? "active" : ""}`}
            onClick={() => { setSelectedCat("volume"); setCurrentPage(1); }}
          >
            🎯 완주 누적
          </button>
          <button
            className={`filter-btn ${selectedCat === "rank" ? "active" : ""}`}
            onClick={() => { setSelectedCat("rank"); setCurrentPage(1); }}
          >
            👑 순위 & PR
          </button>
          <button
            className={`filter-btn ${selectedCat === "speed" ? "active" : ""}`}
            onClick={() => { setSelectedCat("speed"); setCurrentPage(1); }}
          >
            🚄 속도 & 내리막
          </button>
          <button
            className={`filter-btn ${selectedCat === "time" ? "active" : ""}`}
            onClick={() => { setSelectedCat("time"); setCurrentPage(1); }}
          >
            🌙 시각 & 요일
          </button>
          <button
            className={`filter-btn ${selectedCat === "special" ? "active" : ""}`}
            onClick={() => { setSelectedCat("special"); setCurrentPage(1); }}
          >
            🏔️ 거리 & 고도
          </button>
        </div>

        {/* Pagination Status & Controls Bar */}
        <div className="trophy-pagination-bar">
          <span>
            {onlyUnlocked ? "내가 획득한 훈장" : "미달성 포함 전체"} <strong>{filteredTrophies.length.toLocaleString()}</strong>개 (페이지 {safePage} / {totalPages})
          </span>

          <div className="pagination-buttons">
            <button
              className="btn btn-secondary btn-sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            >
              ◀ 이전
            </button>
            <span className="page-number-text">{safePage} / {totalPages}</span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            >
              다음 ▶
            </button>
          </div>
        </div>
      </div>

      {/* Empty State Banner if no trophies unlocked yet */}
      {onlyUnlocked && unlockedCount === 0 && (
        <div className="card" style={{ padding: "40px 20px", textAlign: "center", background: "#FFFDF9", border: "2px dashed #FFD54F" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎁</div>
          <h3 style={{ fontSize: "18px", fontWeight: 800, margin: "0 0 8px 0" }}>아직 수집된 비밀 훈장이 없습니다!</h3>
          <p style={{ fontSize: "13px", color: "#666", margin: 0 }}>
            GPX 주행 기록을 등록하면 예고 없이 찾아오는 <strong>깜짝 비밀 선물 훈장</strong>을 발굴하실 수 있습니다!
          </p>
        </div>
      )}

      {/* 3. Refined 3-Column Responsive Grid */}
      <div className="trophy-grid">
        {paginatedTrophies.map((t) => {
          const unlockedInfo = unlockedMap.get(t.id);
          const isUnlocked = !!unlockedInfo;
          const tierStyle = getTierStyle(isUnlocked ? t.tier : "secret");

          return (
            <div
              key={t.id}
              className={`trophy-room-card ${isUnlocked ? "unlocked" : "locked"}`}
            >
              {isUnlocked ? (
                <LaurelWreath size={54}>
                  <div
                    className="trophy-room-icon"
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, ${t.badgeColor}, #111)`,
                      color: "#FFF",
                    }}
                  >
                    {t.icon}
                  </div>
                </LaurelWreath>
              ) : (
                <div
                  className="trophy-room-icon"
                  style={{
                    backgroundColor: "#EBEBEF",
                    color: "#A0A0AA",
                    borderRadius: "14px",
                  }}
                >
                  🎁
                </div>
              )}

              <div className="trophy-room-details">
                <div className="trophy-room-title-row">
                  <span className="trophy-room-title" style={{ color: isUnlocked ? t.badgeColor : "#777" }}>
                    {isUnlocked ? t.title : "🎁 ??? (숨겨진 비밀 훈장)"}
                  </span>
                  <span className="trophy-room-tier" style={tierStyle}>
                    {isUnlocked ? t.tier.toUpperCase() : "SECRET"}
                  </span>
                </div>

                <div className="trophy-room-desc">
                  {isUnlocked ? t.description : "열심히 달리다 보면 예고 없이 깜짝 달성되는 비밀 선물입니다!"}
                </div>

                {isUnlocked ? (
                  <div className="trophy-room-praise">
                    💬 "{t.praiseMessage}"
                    <div className="trophy-room-date">
                      달성일: {unlockedInfo.unlockedAt} ({unlockedInfo.segmentName})
                    </div>
                  </div>
                ) : (
                  <div className="trophy-room-locked-text">
                    🔒 주행 시 예고 없이 해금되는 비밀 선물
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div className="trophy-pagination-bar" style={{ marginTop: "8px", background: "#FFF", padding: "12px 18px", borderRadius: "12px", border: "1px solid #E6E6EB" }}>
          <span>페이지 {safePage} / {totalPages}</span>
          <div className="pagination-buttons">
            <button
              className="btn btn-secondary btn-sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            >
              ◀ 이전
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            >
              다음 ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
