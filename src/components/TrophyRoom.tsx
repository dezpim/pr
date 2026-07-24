import React, { useState, useMemo } from "react";
import { TROPHY_REGISTRY } from "../utils/trophyEngine";
import type { UnlockedTrophy } from "../types/trophy";

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
    default:
      return { background: "linear-gradient(135deg, #8D4E2A, #D77A3F)", color: "#FFFFFF" };
  }
}

export const TrophyRoom: React.FC<TrophyRoomProps> = ({ unlockedTrophies }) => {
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [onlyUnlocked, setOnlyUnlocked] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const unlockedMap = useMemo(() => {
    const map = new Map<string, UnlockedTrophy>();
    unlockedTrophies.forEach((u) => map.set(u.trophyId, u));
    return map;
  }, [unlockedTrophies]);

  const totalCount = TROPHY_REGISTRY.length;
  const unlockedCount = unlockedMap.size;
  const progressPercent = Math.round((unlockedCount / totalCount) * 100);

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
      {/* Header & Progress Card */}
      <div className="trophy-room-header card">
        <div className="trophy-header-info">
          <h2>🎖️ 나의 훈장 수집함 (총 {totalCount.toLocaleString()}개 훈장)</h2>
          <p>연속 주행, 완주 횟수, 기록 단축, 누적 거리 및 고도 정복 등 3,200여 개의 영예로운 훈장을 수집해보세요!</p>
        </div>

        <div className="trophy-progress-box">
          <div className="progress-labels">
            <span className="progress-text">훈장 수집 현황</span>
            <span className="progress-value">
              <strong>{unlockedCount.toLocaleString()}</strong> / {totalCount.toLocaleString()}개 ({progressPercent}%)
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.max(progressPercent, 1)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Controls: Search Bar & Toggle */}
      <div className="trophy-room-controls">
        <input
          type="text"
          className="trophy-search-input"
          placeholder="🔍 훈장 이름, 검색어 입력... (예: 100km, 연속, 칼치기, 1분)"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
        />

        <label className="trophy-checkbox-label">
          <input
            type="checkbox"
            checked={onlyUnlocked}
            onChange={(e) => {
              setOnlyUnlocked(e.target.checked);
              setCurrentPage(1);
            }}
          />
          <span>달성한 훈장만 보기 ({unlockedCount}개)</span>
        </label>
      </div>

      {/* Category Filter Tabs */}
      <div className="trophy-filter-tabs">
        <button
          className={`filter-btn ${selectedCat === "all" ? "active" : ""}`}
          onClick={() => { setSelectedCat("all"); setCurrentPage(1); }}
        >
          전체 보기 ({totalCount.toLocaleString()})
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

      {/* Pagination Header Bar */}
      <div className="trophy-pagination-bar">
        <span>
          검색 결과 <strong>{filteredTrophies.length.toLocaleString()}</strong>개 (페이지 {safePage} / {totalPages})
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

      {/* Trophy Grid (Paginated 48 per page with 60px 3D Metallic Badge Icons) */}
      <div className="trophy-grid">
        {paginatedTrophies.map((t) => {
          const unlockedInfo = unlockedMap.get(t.id);
          const isUnlocked = !!unlockedInfo;
          const tierStyle = getTierStyle(t.tier);

          return (
            <div
              key={t.id}
              className={`trophy-room-card ${isUnlocked ? "unlocked" : "locked"}`}
              style={{
                borderColor: isUnlocked ? t.badgeColor : "#E6E6EB",
                backgroundColor: isUnlocked ? t.badgeBg : "#FAFAFC",
              }}
            >
              <div
                className="trophy-room-icon"
                style={{
                  background: isUnlocked ? `linear-gradient(135deg, ${t.badgeColor}, #222)` : "#E0E0E6",
                  color: isUnlocked ? "#FFF" : "#A0A0AA",
                }}
              >
                {isUnlocked ? t.icon : "🔒"}
              </div>

              <div className="trophy-room-details">
                <div className="trophy-room-title-row">
                  <span className="trophy-room-title" style={{ color: isUnlocked ? t.badgeColor : "#888" }}>
                    {t.title}
                  </span>
                  <span className="trophy-room-tier" style={tierStyle}>
                    {t.tier.toUpperCase()}
                  </span>
                </div>

                <div className="trophy-room-desc">{t.description}</div>

                {isUnlocked ? (
                  <div className="trophy-room-praise">
                    💬 "{t.praiseMessage}"
                    <div className="trophy-room-date">
                      달성일: {unlockedInfo.unlockedAt} ({unlockedInfo.segmentName})
                    </div>
                  </div>
                ) : (
                  <div className="trophy-room-locked-text">
                    🔒 미달성 훈장
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div className="trophy-pagination-bar" style={{ marginTop: "16px" }}>
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
