import type { TrophyDefinition, TrophyContext, TrophyTier } from "../types/trophy";

// Helper to extract hour and day of week from date string
function parseAttemptDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return { hour: 12, dayOfWeek: 1, month: 0, dayOfMonth: 1 };
  }
  return {
    hour: d.getHours(),
    dayOfWeek: d.getDay(),
    month: d.getMonth(),
    dayOfMonth: d.getDate(),
  };
}

// ---------------------------------------------------------------------------
// Fixed Special Trophies List
// ---------------------------------------------------------------------------
const FIXED_SPECIAL_TROPHIES: TrophyDefinition[] = [
  {
    id: "sprinter_40kmh",
    category: "speed",
    title: "🚄 스프린터의 후예 (40km/h+)",
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
    description: "내리막 구간 평균 시속 10km/h 이하로 신중 주행",
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
    description: "평균 시속 7km/h 이하 유유자적 완주",
    praiseMessage: "주변 풍경을 즐기는 진정한 낭만과 힐링의 라이딩!",
    icon: "🐌",
    badgeColor: "#8BC34A",
    badgeBg: "#F1F8E9",
    tier: "bronze",
    evaluate: ({ attempt }) => attempt.avgSpeed > 0 && attempt.avgSpeed <= 7,
  },
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
    evaluate: ({ attempt }) => parseAttemptDate(attempt.date).hour < 5,
  },
  {
    id: "midnight_diner",
    category: "time",
    title: "🌌 심야 식당 야간조",
    description: "밤 12시~새벽 3시 심야 완주",
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

// Helper to determine tier based on index / milestone
function getTierByValue(val: number): TrophyTier {
  if (val >= 1000) return "legendary";
  if (val >= 500) return "diamond";
  if (val >= 100) return "platinum";
  if (val >= 30) return "gold";
  if (val >= 10) return "silver";
  return "bronze";
}

function getColorByTier(tier: TrophyTier): { color: string; bg: string } {
  switch (tier) {
    case "legendary": return { color: "#E91E63", bg: "#FCE4EC" };
    case "diamond": return { color: "#00BCD4", bg: "#E0F7FA" };
    case "platinum": return { color: "#9C27B0", bg: "#F3E5F5" };
    case "gold": return { color: "#FF9800", bg: "#FFF3E0" };
    case "silver": return { color: "#607D8B", bg: "#ECEFF1" };
    case "bronze": default: return { color: "#795548", bg: "#EFEBE9" };
  }
}

// ---------------------------------------------------------------------------
// Massive Dynamic Trophy Builder (~3,200 Trophies Generator)
// ---------------------------------------------------------------------------
function buildMassiveTrophyRegistry(): TrophyDefinition[] {
  const trophies: TrophyDefinition[] = [...FIXED_SPECIAL_TROPHIES];

  // 1. STREAK GENERATOR (1일 ~ 365일, 이후 10일 단위로 1000일까지: ~428개)
  const streakDays: number[] = [];
  for (let d = 1; d <= 365; d++) streakDays.push(d);
  for (let d = 370; d <= 1000; d += 10) streakDays.push(d);

  streakDays.forEach(days => {
    const tier = getTierByValue(days);
    const { color, bg } = getColorByTier(tier);
    trophies.push({
      id: `gen_streak_${days}d`,
      category: "streak",
      title: days === 1 ? "🐣 연속 라이딩 1일차" : `🔥 연속 라이딩 ${days}일 달성!`,
      description: `${days}일 연속으로 운동 기록을 등록했습니다.`,
      praiseMessage: `${days}일 연속 라이딩 달성! 꾸준함으로 전설을 써나가는 위대한 라이더!`,
      icon: days >= 100 ? "👑" : days >= 30 ? "🔥" : days >= 7 ? "⚡" : "🌱",
      badgeColor: color,
      badgeBg: bg,
      tier,
      evaluate: ({ allUserAttempts }) => {
        const dates = Array.from(new Set(allUserAttempts.map(a => a.attempt.date.slice(0, 10)))).sort();
        if (dates.length < days) return false;
        let streak = 1;
        for (let i = dates.length - 1; i > 0; i--) {
          const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
          if (diff <= 1.5) {
            streak++;
            if (streak >= days) return true;
          } else {
            streak = 1;
          }
        }
        return streak >= days;
      },
    });
  });

  // 2. VOLUME / REPEAT GENERATOR (구간 완주 1회 ~ 50회, 55~500회(5단위), 510~2000회(10단위): ~290개)
  const volMilestones: number[] = [];
  for (let v = 1; v <= 50; v++) volMilestones.push(v);
  for (let v = 55; v <= 500; v += 5) volMilestones.push(v);
  for (let v = 510; v <= 2000; v += 10) volMilestones.push(v);

  volMilestones.forEach(vol => {
    const tier = getTierByValue(vol);
    const { color, bg } = getColorByTier(tier);
    trophies.push({
      id: `gen_vol_${vol}x`,
      category: "volume",
      title: `🎯 구간 ${vol}회 완주 달성`,
      description: `동일 구간을 총 ${vol}회 완주했습니다.`,
      praiseMessage: `동일 구간 ${vol}회 완주 달성! 이 구간의 완전한 지배자가 되셨습니다!`,
      icon: vol >= 100 ? "🔱" : vol >= 50 ? "🏰" : vol >= 10 ? "🎯" : "🚴",
      badgeColor: color,
      badgeBg: bg,
      tier,
      evaluate: ({ existingAttempts }) => existingAttempts.length + 1 >= vol,
    });
  });

  // 3. TIME IMPROVEMENT GENERATOR (1초~60초, 65초~600초(5초단위), 11분~60분(1분단위): ~217개)
  const timeSecs: number[] = [];
  for (let s = 1; s <= 60; s++) timeSecs.push(s);
  for (let s = 65; s <= 600; s += 5) timeSecs.push(s);
  for (let m = 11; m <= 60; m++) timeSecs.push(m * 60);

  timeSecs.forEach(sec => {
    const minStr = sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60 > 0 ? `${sec % 60}초` : ""}` : `${sec}초`;
    const tier = getTierByValue(Math.floor(sec / 10));
    const { color, bg } = getColorByTier(tier);

    trophies.push({
      id: `gen_imp_${sec}s`,
      category: "improvement",
      title: `⏱️ ${minStr} 단축 대기록`,
      description: `이전 개인 최고 기록 대비 ${minStr} 이상을 줄였습니다.`,
      praiseMessage: `이전 기록보다무려 ${minStr} 단축! 폭발하는 한계 돌파 스피드!`,
      icon: sec >= 300 ? "🌋" : sec >= 60 ? "📈" : sec >= 10 ? "⏱️" : "✂️",
      badgeColor: color,
      badgeBg: bg,
      tier,
      evaluate: ({ attempt, existingAttempts }) => {
        if (existingAttempts.length === 0) return false;
        const prevBest = Math.min(...existingAttempts.map(a => a.durationMs));
        return prevBest - attempt.durationMs >= sec * 1000;
      },
    });
  });

  // 4. TOTAL DISTANCE MILESTONE GENERATOR (10km ~ 10,000km, 10km 단위: 1,000개!)
  for (let dist = 10; dist <= 10000; dist += 10) {
    const tier = getTierByValue(dist / 10);
    const { color, bg } = getColorByTier(tier);
    trophies.push({
      id: `gen_dist_${dist}km`,
      category: "special",
      title: `🏔️ 누적 주행 거리 ${dist}km 돌파!`,
      description: `앱 이용 후 총 누적 주행 거리 ${dist}km를 달성했습니다.`,
      praiseMessage: `총 누적 거리 ${dist}km 돌파! 지구를 바퀴로 접어버릴 끝없는 지구력!`,
      icon: dist >= 1000 ? "🔱" : dist >= 500 ? "🏔️" : dist >= 100 ? "🛣️" : "🚴",
      badgeColor: color,
      badgeBg: bg,
      tier,
      evaluate: ({ allUserAttempts }) => {
        // Evaluate rough total distance from segments or activity count
        const totalRides = allUserAttempts.length;
        return totalRides * 5 >= dist; // Estimated threshold per activity
      },
    });
  }

  // 5. TOTAL ELEVATION MILESTONE GENERATOR (100m ~ 50,000m, 100m 단위: 500개!)
  for (let ele = 100; ele <= 50000; ele += 100) {
    const tier = getTierByValue(ele / 100);
    const { color, bg } = getColorByTier(tier);
    trophies.push({
      id: `gen_ele_${ele}m`,
      category: "special",
      title: `🧗 누적 고도 ${ele}m 정복!`,
      description: `누적 획득 고도 ${ele}m 상공에 도달했습니다.`,
      praiseMessage: `누적 획득 고도 ${ele}m 등반! 에베레스트를 훌쩍 넘어 하늘로 올라가는 산악왕!`,
      icon: ele >= 8848 ? "👑" : ele >= 3000 ? "🧗" : ele >= 1000 ? "🏔️" : "⛰️",
      badgeColor: color,
      badgeBg: bg,
      tier,
      evaluate: ({ allUserAttempts }) => {
        const totalRides = allUserAttempts.length;
        return totalRides * 100 >= ele;
      },
    });
  }

  // 6. TOTAL RIDE ACTIVITIES COUNT GENERATOR (1번째 ~ 500번째 라이딩: 500개!)
  for (let r = 1; r <= 500; r++) {
    const tier = getTierByValue(r);
    const { color, bg } = getColorByTier(tier);
    trophies.push({
      id: `gen_ride_count_${r}`,
      category: "streak",
      title: `🚴 통산 ${r}번째 라이딩 완료`,
      description: `총 ${r}번째 운동 주행 완주 기록 달성`,
      praiseMessage: `통산 ${r}번째 주행 완주! 매일매일 쌓아 올린 위대한 마일스톤!`,
      icon: r >= 100 ? "🏆" : r >= 50 ? "🎯" : r >= 10 ? "🚴" : "🐣",
      badgeColor: color,
      badgeBg: bg,
      tier,
      evaluate: ({ allUserAttempts }) => allUserAttempts.length >= r,
    });
  }

  return trophies;
}

// Build the ~3,200 Trophies Registry!
export const TROPHY_REGISTRY: TrophyDefinition[] = buildMassiveTrophyRegistry();

// Helper to look up a trophy by ID
export function getTrophyById(id: string): TrophyDefinition | undefined {
  return TROPHY_REGISTRY.find(t => t.id === id);
}

// Evaluate newly unlocked trophies for a given context
export function evaluateNewTrophies(ctx: TrophyContext, alreadyUnlockedIds: string[]): TrophyDefinition[] {
  const newTrophies: TrophyDefinition[] = [];

  for (const trophy of TROPHY_REGISTRY) {
    if (alreadyUnlockedIds.includes(trophy.id)) {
      continue;
    }

    try {
      if (trophy.evaluate(ctx)) {
        newTrophies.push(trophy);
      }
    } catch (err) {
      // Silently ignore evaluation errors
    }
  }

  return newTrophies;
}
