import type { TrophyDefinition, TrophyContext } from "../types/trophy";

// Helper to extract hour and day of week from date string (YYYY-MM-DD or ISO)
function parseAttemptDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return { hour: 12, dayOfWeek: 1, month: 0, dayOfMonth: 1 };
  }
  return {
    hour: d.getHours(),
    dayOfWeek: d.getDay(), // 0 = Sun, 6 = Sat
    month: d.getMonth(),
    dayOfMonth: d.getDate(),
  };
}

// Declarative Trophy Registry
export const TROPHY_REGISTRY: TrophyDefinition[] = [
  // 1. STREAKS & VOLUME
  {
    id: "streak_1",
    category: "streak",
    title: "🐣 첫 출사표",
    description: "첫 운동 기록을 성공적으로 등록했습니다.",
    praiseMessage: "위대한 주행의 첫 걸음을 내딛으셨습니다! 라이더님의 성장을 응원합니다!",
    icon: "🐣",
    badgeColor: "#FF9800",
    badgeBg: "#FFF3E0",
    tier: "bronze",
    evaluate: ({ allUserAttempts }) => allUserAttempts.length >= 1,
  },
  {
    id: "streak_3",
    category: "streak",
    title: "🌱 작심삼일 극복",
    description: "3일 연속 라이딩 완주 달성",
    praiseMessage: "3일 연속 라이딩 달성! 작심삼일을 훌륭하게 이겨내셨군요!",
    icon: "🌱",
    badgeColor: "#4CAF50",
    badgeBg: "#E8F5E9",
    tier: "bronze",
    evaluate: ({ allUserAttempts }) => {
      const dates = Array.from(new Set(allUserAttempts.map(a => a.attempt.date.slice(0, 10)))).sort();
      if (dates.length < 3) return false;
      let streak = 1;
      for (let i = dates.length - 1; i > 0; i--) {
        const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
        if (diff <= 1.5) {
          streak++;
          if (streak >= 3) return true;
        } else {
          streak = 1;
        }
      }
      return streak >= 3;
    },
  },
  {
    id: "streak_7",
    category: "streak",
    title: "⚡ 라이딩 어딕트",
    description: "7일(일주일) 연속 라이딩 달성",
    praiseMessage: "일주일 내내 쉼 없이 달린 뜨거운 열정! 당신이 진정한 챔피언입니다!",
    icon: "⚡",
    badgeColor: "#FFC107",
    badgeBg: "#FFF8E1",
    tier: "gold",
    evaluate: ({ allUserAttempts }) => {
      const dates = Array.from(new Set(allUserAttempts.map(a => a.attempt.date.slice(0, 10)))).sort();
      if (dates.length < 7) return false;
      let streak = 1;
      for (let i = dates.length - 1; i > 0; i--) {
        const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
        if (diff <= 1.5) {
          streak++;
          if (streak >= 7) return true;
        } else {
          streak = 1;
        }
      }
      return streak >= 7;
    },
  },
  {
    id: "vol_5",
    category: "volume",
    title: "🚴 단골 라이더",
    description: "동일 구간 5회 이상 완주 달성",
    praiseMessage: "벌써 이 코스만 5번째 완주! 구간 지도가 머릿속에 훤하시겠어요!",
    icon: "🚴",
    badgeColor: "#2196F3",
    badgeBg: "#E3F2FD",
    tier: "bronze",
    evaluate: ({ existingAttempts }) => existingAttempts.length + 1 >= 5,
  },
  {
    id: "vol_10",
    category: "volume",
    title: "🎯 구간 마스터",
    description: "동일 구간 10회 이상 완주 달성",
    praiseMessage: "10회 완주 달성! 이제 이 구간은 라이더님의 홈그라운드입니다!",
    icon: "🎯",
    badgeColor: "#3F51B5",
    badgeBg: "#E8EAF6",
    tier: "silver",
    evaluate: ({ existingAttempts }) => existingAttempts.length + 1 >= 10,
  },
  {
    id: "vol_30",
    category: "volume",
    title: "🏰 구간의 지배자",
    description: "동일 구간 30회 이상 완주 달성",
    praiseMessage: "30회 완주 달성! 구간의 굳건한 주인이 되셨습니다!",
    icon: "🏰",
    badgeColor: "#9C27B0",
    badgeBg: "#F3E5F5",
    tier: "gold",
    evaluate: ({ existingAttempts }) => existingAttempts.length + 1 >= 30,
  },
  {
    id: "vol_100",
    category: "volume",
    title: "👟 동네 마당발",
    description: "동일 구간 100회 이상 완주 대기록 달성",
    praiseMessage: "100회 완주라는 전대미문의 대기록! 경의를 표합니다!",
    icon: "👟",
    badgeColor: "#E91E63",
    badgeBg: "#FCE4EC",
    tier: "legendary",
    evaluate: ({ existingAttempts }) => existingAttempts.length + 1 >= 100,
  },
  {
    id: "volume_day_10",
    category: "volume",
    title: "💣 연쇄 세그먼트 마의",
    description: "하루에 10개 이상 구간 통과",
    praiseMessage: "하루 만에 10개 이상 구간을 싹쓸이하는 무시무시한 주행 폭주!",
    icon: "💣",
    badgeColor: "#F44336",
    badgeBg: "#FFEBEE",
    tier: "gold",
    evaluate: ({ attempt, allUserAttempts }) => {
      const today = attempt.date.slice(0, 10);
      const sameDayCount = allUserAttempts.filter(a => a.attempt.date.slice(0, 10) === today).length;
      return sameDayCount >= 10;
    },
  },

  // 2. IMPROVEMENT & TIME ATTACK
  {
    id: "imp_1s",
    category: "improvement",
    title: "✂️ 칼치기 성공",
    description: "이전 개인 기록을 1초~3초 미세 단축",
    praiseMessage: "단 1초를 깎아낸 정교한 미세 컨트롤의 달인! 대단합니다!",
    icon: "✂️",
    badgeColor: "#00BCD4",
    badgeBg: "#E0F7FA",
    tier: "silver",
    evaluate: ({ attempt, existingAttempts }) => {
      if (existingAttempts.length === 0) return false;
      const prevBest = Math.min(...existingAttempts.map(a => a.durationMs));
      const diffSec = (prevBest - attempt.durationMs) / 1000;
      return diffSec >= 1 && diffSec <= 3;
    },
  },
  {
    id: "imp_10s",
    category: "improvement",
    title: "⏱️ 10초의 미학",
    description: "이전 기록 대비 10초 이상 단축",
    praiseMessage: "소중한 10초를 줄여낸 엄청난 집중력이 빛납니다!",
    icon: "⏱️",
    badgeColor: "#009688",
    badgeBg: "#E0F2F1",
    tier: "bronze",
    evaluate: ({ attempt, existingAttempts }) => {
      if (existingAttempts.length === 0) return false;
      const prevBest = Math.min(...existingAttempts.map(a => a.durationMs));
      return prevBest - attempt.durationMs >= 10000;
    },
  },
  {
    id: "imp_60s",
    category: "improvement",
    title: "📈 1분의 벽 돌파",
    description: "이전 기록 대비 1분(60초) 이상 단축",
    praiseMessage: "1분의 벽을 붕괴시켰습니다! 기량이 대폭 상승 중입니다!",
    icon: "📈",
    badgeColor: "#4CAF50",
    badgeBg: "#E8F5E9",
    tier: "gold",
    evaluate: ({ attempt, existingAttempts }) => {
      if (existingAttempts.length === 0) return false;
      const prevBest = Math.min(...existingAttempts.map(a => a.durationMs));
      return prevBest - attempt.durationMs >= 60000;
    },
  },
  {
    id: "imp_300s",
    category: "improvement",
    title: "🌋 기적의 라이딩",
    description: "이전 기록 대비 5분 이상 단축",
    praiseMessage: "5분 이상 단축! 오늘 당신의 주행은 그야말로 기적과 전설이었습니다!",
    icon: "🌋",
    badgeColor: "#FF5722",
    badgeBg: "#FBE9E7",
    tier: "diamond",
    evaluate: ({ attempt, existingAttempts }) => {
      if (existingAttempts.length === 0) return false;
      const prevBest = Math.min(...existingAttempts.map(a => a.durationMs));
      return prevBest - attempt.durationMs >= 300000;
    },
  },
  {
    id: "ghost_match",
    category: "improvement",
    title: "👻 유령과의 대결",
    description: "이전 최고 기록과 오차범위 1초 이내 완주",
    praiseMessage: "자신의 유령과 평행선으로 달린 정밀 스피드 컨트롤러!",
    icon: "👻",
    badgeColor: "#673AB7",
    badgeBg: "#EDE7F6",
    tier: "silver",
    evaluate: ({ attempt, existingAttempts }) => {
      if (existingAttempts.length === 0) return false;
      const prevBest = Math.min(...existingAttempts.map(a => a.durationMs));
      const diffMs = Math.abs(attempt.durationMs - prevBest);
      return diffMs <= 1000 && diffMs > 0;
    },
  },

  // 3. SPEED & PERFORMANCE
  {
    id: "sprinter_40kmh",
    category: "speed",
    title: "🚄 스프린터의 후예",
    description: "평균 시속 40km/h 이상으로 세그먼트 완주",
    praiseMessage: "시속 40km/h 돌파! 미사일급 순간 폭발 스피드입니다!",
    icon: "🚄",
    badgeColor: "#FFC107",
    badgeBg: "#FFF8E1",
    tier: "platinum",
    evaluate: ({ attempt }) => attempt.avgSpeed >= 40,
  },
  {
    id: "downhill_master",
    category: "speed",
    title: "🦅 내리막의 지배자",
    description: "내리막 구간 평균 시속 35km/h 이상 완주",
    praiseMessage: "시원하게 도로를 가르는 내리막의 제왕!",
    icon: "🦅",
    badgeColor: "#03A9F4",
    badgeBg: "#E1F5FE",
    tier: "silver",
    evaluate: ({ segment, attempt }) => (segment.elevationGainMeters < 0 || segment.name.includes("다운힐") || segment.name.includes("내리막")) && attempt.avgSpeed >= 35,
  },
  {
    id: "downhill_wall",
    category: "speed",
    title: "🧱 내리막 통곡의 벽",
    description: "내리막 구간 평균 시속 10km/h 이하로 조심조심 이동",
    praiseMessage: "안전이 최우선입니다! 신중하고 완벽한 안전 라이딩!",
    icon: "🧱",
    badgeColor: "#795548",
    badgeBg: "#EFEBE9",
    tier: "bronze",
    evaluate: ({ segment, attempt }) => (segment.elevationGainMeters < 0 || segment.name.includes("다운힐") || segment.name.includes("내리막")) && attempt.avgSpeed <= 10,
  },
  {
    id: "snail_pace",
    category: "speed",
    title: "🐌 달팽이의 산책",
    description: "평균 시속 7km/h 이하 유유자적 주행 완주",
    praiseMessage: "주변 풍경을 즐기는 진정한 낭만과 힐링의 라이딩!",
    icon: "🐌",
    badgeColor: "#8BC34A",
    badgeBg: "#F1F8E9",
    tier: "bronze",
    evaluate: ({ attempt }) => attempt.avgSpeed > 0 && attempt.avgSpeed <= 7,
  },

  // 4. TIME OF DAY & CALENDAR
  {
    id: "early_bird",
    category: "time",
    title: "🌅 새벽의 7시",
    description: "오전 5시 이전 새벽 미명 세그먼트 완주",
    praiseMessage: "모두가 잠든 새벽을 깨우는 부지런한 상위 1% 라이더!",
    icon: "🌅",
    badgeColor: "#FF9800",
    badgeBg: "#FFF3E0",
    tier: "silver",
    evaluate: ({ attempt }) => {
      const { hour } = parseAttemptDate(attempt.date);
      return hour < 5;
    },
  },
  {
    id: "midnight_diner",
    category: "time",
    title: "🌌 심야 식당 야간조",
    description: "밤 12시(자정)~새벽 3시 심야 완주",
    praiseMessage: "어둠을 가르고 달리는 밤의 감성 낭만 라이더!",
    icon: "🌌",
    badgeColor: "#673AB7",
    badgeBg: "#EDE7F6",
    tier: "silver",
    evaluate: ({ attempt }) => {
      const { hour } = parseAttemptDate(attempt.date);
      return hour >= 0 && hour <= 3;
    },
  },
  {
    id: "commute_morning",
    category: "time",
    title: "🏢 출근길 레이서",
    description: "평일 오전 7시~9시 출근 시간 완주",
    praiseMessage: "바쁜 출근길도 상쾌한 스포츠로 만들어내는 열정 라이더!",
    icon: "🏢",
    badgeColor: "#2196F3",
    badgeBg: "#E3F2FD",
    tier: "bronze",
    evaluate: ({ attempt }) => {
      const { hour, dayOfWeek } = parseAttemptDate(attempt.date);
      return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 7 && hour < 9;
    },
  },
  {
    id: "commute_evening",
    category: "time",
    title: "🌆 퇴근길 탈출극",
    description: "평일 오후 6시~8시 퇴근 시간 완주",
    praiseMessage: "하루 스트레스를 도로 위에 깔끔하게 날려버린 라이딩!",
    icon: "🌆",
    badgeColor: "#E91E63",
    badgeBg: "#FCE4EC",
    tier: "bronze",
    evaluate: ({ attempt }) => {
      const { hour, dayOfWeek } = parseAttemptDate(attempt.date);
      return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 18 && hour < 20;
    },
  },
  {
    id: "weekend_warrior",
    category: "time",
    title: "⚔️ 주말의 전사",
    description: "토요일 또는 일요일 집중 주행 완주",
    praiseMessage: "주말의 모든 에너지를 도로 위에 불태우는 진정한 주말 전사!",
    icon: "⚔️",
    badgeColor: "#FF5722",
    badgeBg: "#FBE9E7",
    tier: "bronze",
    evaluate: ({ attempt }) => {
      const { dayOfWeek } = parseAttemptDate(attempt.date);
      return dayOfWeek === 0 || dayOfWeek === 6;
    },
  },
  {
    id: "new_year_first",
    category: "time",
    title: "🎆 신년 첫 발자국",
    description: "1월 1일 새해 첫날 라이딩 완주",
    praiseMessage: "새해 첫날을 힘찬 페달링으로 시작하는 멋진 라이더의 다짐!",
    icon: "🎆",
    badgeColor: "#9C27B0",
    badgeBg: "#F3E5F5",
    tier: "gold",
    evaluate: ({ attempt }) => {
      const { month, dayOfMonth } = parseAttemptDate(attempt.date);
      return month === 0 && dayOfMonth === 1;
    },
  },

  // 5. RANKINGS & TITLES
  {
    id: "king_of_mountain",
    category: "rank",
    title: "👑 왕좌의 게임 (PR 1위)",
    description: "해당 구간 1등 개인 최고 기록 달성",
    praiseMessage: "👑 1등 PR 달성! 본인 구간 최강의 왕좌에 오르셨습니다!",
    icon: "👑",
    badgeColor: "#FFD700",
    badgeBg: "#FFFDE7",
    tier: "gold",
    evaluate: ({ attempt, existingAttempts }) => {
      if (existingAttempts.length === 0) return true;
      const best = Math.min(...existingAttempts.map(a => a.durationMs));
      return attempt.durationMs <= best;
    },
  },
  {
    id: "rank_2nd",
    category: "rank",
    title: "🥈 영원한 2인자 (아슬아슬 2위)",
    description: "해당 구간 전체 랭킹 2위 달성",
    praiseMessage: "아슬아슬하게 1등을 놓쳤지만, 다음엔 당당히 1등 확정입니다!",
    icon: "🥈",
    badgeColor: "#C0C0C0",
    badgeBg: "#F5F5F5",
    tier: "silver",
    evaluate: ({ attempt, existingAttempts }) => {
      const all = [...existingAttempts, attempt].sort((a, b) => a.durationMs - b.durationMs);
      const rank = all.findIndex(a => a.id === attempt.id) + 1;
      return rank === 2;
    },
  },
  {
    id: "rank_3rd",
    category: "rank",
    title: "🥉 포디움 입성",
    description: "해당 구간 전체 랭킹 3위 달성",
    praiseMessage: "당당히 3위 포디움 시상대에 이름을 올려놓으셨습니다!",
    icon: "🥉",
    badgeColor: "#CD7F32",
    badgeBg: "#FBE9E7",
    tier: "bronze",
    evaluate: ({ attempt, existingAttempts }) => {
      const all = [...existingAttempts, attempt].sort((a, b) => a.durationMs - b.durationMs);
      const rank = all.findIndex(a => a.id === attempt.id) + 1;
      return rank === 3;
    },
  },
  {
    id: "wooden_spoon",
    category: "rank",
    title: "🐢 꼴찌의 품격",
    description: "해당 구간 최하위/꼴찌 기록 달성",
    praiseMessage: "끝까지 포기하지 않고 페달을 밟아 완주한 당신이 진정한 챔피언입니다!",
    icon: "🐢",
    badgeColor: "#795548",
    badgeBg: "#EFEBE9",
    tier: "bronze",
    evaluate: ({ attempt, existingAttempts }) => {
      if (existingAttempts.length < 3) return false;
      const worst = Math.max(...existingAttempts.map(a => a.durationMs));
      return attempt.durationMs >= worst;
    },
  },
  {
    id: "ghost_rider",
    category: "rank",
    title: "👻 고스트 라이더 (최초 개척)",
    description: "아무 기록도 없던 구간에 최초 등록자 달성",
    praiseMessage: "아무도 가보지 않은 미지의 구간을 최초로 개척한 선구자!",
    icon: "👻",
    badgeColor: "#9C27B0",
    badgeBg: "#F3E5F5",
    tier: "gold",
    evaluate: ({ existingAttempts }) => existingAttempts.length === 0,
  },

  // 6. DISTANCE & GRADIENT
  {
    id: "short_sprint",
    category: "special",
    title: "⚡ 100m 단거리 육상선수",
    description: "100m 미만 초단거리 세그먼트 완료",
    praiseMessage: "짧고 굵게 끝내는 순간 폭발 번개 스프린트!",
    icon: "⚡",
    badgeColor: "#00BCD4",
    badgeBg: "#E0F7FA",
    tier: "bronze",
    evaluate: ({ segment }) => segment.distanceMeters > 0 && segment.distanceMeters < 100,
  },
  {
    id: "long_expedition",
    category: "special",
    title: "🏔️ 대장정의 시작",
    description: "10km 이상 초장거리 세그먼트 완료",
    praiseMessage: "10km 대장거리 구간을 끈기 있게 완주해 낸 불굴의 라이더!",
    icon: "🏔️",
    badgeColor: "#3F51B5",
    badgeBg: "#E8EAF6",
    tier: "gold",
    evaluate: ({ segment }) => segment.distanceMeters >= 10000,
  },
  {
    id: "flat_king",
    category: "special",
    title: "🛣️ 평지왕",
    description: "경사도 0% 평지 세그먼트 완주",
    praiseMessage: "크루징의 진수를 보여주는 평지 위의 최강자!",
    icon: "🛣️",
    badgeColor: "#4CAF50",
    badgeBg: "#E8F5E9",
    tier: "bronze",
    evaluate: ({ segment }) => segment.elevationGainMeters === 0 || Math.abs(segment.avgGradePercent) < 0.5,
  },
  {
    id: "hiker_style",
    category: "special",
    title: "🧗 등산객입니까",
    description: "경사도 15% 이상 극악 업힐 세그먼트 완주",
    praiseMessage: "벽처럼 서 있는 어마무시한 고개 구간을 정복한 짐승 같은 체력!",
    icon: "🧗",
    badgeColor: "#FF5722",
    badgeBg: "#FBE9E7",
    tier: "platinum",
    evaluate: ({ segment }) => segment.avgGradePercent >= 15,
  },
];

// Helper to look up a trophy by ID
export function getTrophyById(id: string): TrophyDefinition | undefined {
  return TROPHY_REGISTRY.find(t => t.id === id);
}

// Evaluate newly unlocked trophies for a given context
export function evaluateNewTrophies(ctx: TrophyContext, alreadyUnlockedIds: string[]): TrophyDefinition[] {
  const newTrophies: TrophyDefinition[] = [];

  for (const trophy of TROPHY_REGISTRY) {
    if (alreadyUnlockedIds.includes(trophy.id)) {
      continue; // Skip already unlocked trophies
    }

    try {
      if (trophy.evaluate(ctx)) {
        newTrophies.push(trophy);
      }
    } catch (err) {
      console.warn(`Error evaluating trophy ${trophy.id}:`, err);
    }
  }

  return newTrophies;
}
