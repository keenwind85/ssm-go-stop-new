import { Card } from '@game/objects/Card';
import { ScoreBreakdown, CardType } from '@utils/types';
import { SCORING } from '@utils/constants';

export class ScoreCalculator {
  calculate(collectedCards: Card[]): ScoreBreakdown {
    const categorized = this.categorizeCards(collectedCards);

    const kwangScore = this.calculateKwangScore(categorized.kwang);
    const animalScore = this.calculateAnimalScore(categorized.animal);
    const ribbonResult = this.calculateRibbonScore(categorized.ribbon);
    const piResult = this.calculatePiScoreAndCount(categorized.pi);

    const special = {
      godori: this.checkGodori(categorized.animal),
      hongdan: ribbonResult.hongdan,
      cheongdan: ribbonResult.cheongdan,
      chodan: ribbonResult.chodan,
    };

    const baseTotal = kwangScore + animalScore + ribbonResult.score + piResult.score;

    // Add special bonuses
    let specialBonus = 0;
    if (special.godori) specialBonus += SCORING.ANIMAL.GODORI;
    if (special.hongdan) specialBonus += SCORING.RIBBON.HONGDAN;
    if (special.cheongdan) specialBonus += SCORING.RIBBON.CHEONGDAN;
    if (special.chodan) specialBonus += SCORING.RIBBON.CHODAN;

    return {
      kwang: kwangScore,
      kwangCount: categorized.kwang.length,
      animal: animalScore,
      ribbon: ribbonResult.score,
      pi: piResult.score,
      piCount: piResult.count,
      special,
      multipliers: {
        go: 1,
        shake: 1,
        ppuk: 1,
        piBak: 1,
        gwangBak: 1,
        mungDda: 1,
        mungBak: 1,
        goBak: 1,
      },
      total: baseTotal + specialBonus,
    };
  }

  private categorizeCards(cards: Card[]): Record<CardType, Card[]> {
    const result: Record<CardType, Card[]> = {
      kwang: [],
      animal: [],
      ribbon: [],
      pi: [],
    };

    cards.forEach(card => {
      result[card.getType()].push(card);
    });

    return result;
  }

  private calculateKwangScore(kwangCards: Card[]): number {
    const count = kwangCards.length;
    const hasRainKwang = kwangCards.some(card => card.getMonth() === 12);

    if (count === 5) {
      return SCORING.KWANG.FIVE_KWANG;
    } else if (count === 4) {
      return hasRainKwang
        ? SCORING.KWANG.FOUR_KWANG_WITH_RAIN
        : SCORING.KWANG.FOUR_KWANG;
    } else if (count === 3) {
      return hasRainKwang
        ? SCORING.KWANG.THREE_KWANG_WITH_RAIN
        : SCORING.KWANG.THREE_KWANG;
    }

    return 0;
  }

  private calculateAnimalScore(animalCards: Card[]): number {
    const count = animalCards.length;
    if (count >= 5) {
      return SCORING.ANIMAL.BASE + (count - 5);
    }
    return 0;
  }

  private calculateRibbonScore(ribbonCards: Card[]): {
    score: number;
    hongdan: boolean;
    cheongdan: boolean;
    chodan: boolean;
  } {
    const count = ribbonCards.length;
    const months = ribbonCards.map(card => card.getMonth());

    // Check for special combinations
    const hongdan = [1, 2, 3].every(m => months.includes(m)); // 홍단 (1, 2, 3월)
    const cheongdan = [6, 9, 10].every(m => months.includes(m)); // 청단 (6, 9, 10월)
    const chodan = [4, 5, 7].every(m => months.includes(m)); // 초단 (4, 5, 7월)

    let score = 0;
    if (count >= 5) {
      score = SCORING.RIBBON.BASE + (count - 5);
    }

    return { score, hongdan, cheongdan, chodan };
  }

  private calculatePiScoreAndCount(piCards: Card[]): { score: number; count: number } {
    // Count pi points (some cards are worth 2)
    let piCount = 0;
    piCards.forEach(card => {
      // 9월 4번(국진이), 11월 4번, 12월 4번 카드는 쌍피 (2점)
      if ((card.getMonth() === 9 && card.cardData.index === 4) ||
          (card.getMonth() === 11 && card.cardData.index === 4) ||
          (card.getMonth() === 12 && card.cardData.index === 4)) {
        piCount += 2;
      } else {
        piCount += 1;
      }
    });

    let score = 0;
    if (piCount >= 10) {
      score = SCORING.PI.BASE + (piCount - 10) * SCORING.PI.EXTRA_PER_CARD;
    }

    return { score, count: piCount };
  }

  private checkGodori(animalCards: Card[]): boolean {
    // 고도리: 2월, 4월, 8월 동물 (새) 카드
    const birdMonths = [2, 4, 8];
    const animalMonths = animalCards.map(card => card.getMonth());
    return birdMonths.every(m => animalMonths.includes(m));
  }

  // Calculate if a player can declare "Go"
  // 7점 이상이어야 고/스톱 선언 가능
  canDeclareGo(collectedCards: Card[]): boolean {
    const score = this.calculate(collectedCards);
    return score.total >= 7;
  }

  // Apply multipliers for Go count, shake, etc.
  // opponentPiCount: 상대방의 피 점수 (피박 계산용)
  // opponentKwangCount: 상대방의 광 개수 (광박 계산용)
  // opponentAnimalCount: 상대방의 열끗 개수 (멍박 계산용)
  // myAnimalCount: 내 열끗 개수 (멍따 계산용)
  // opponentGoCount: 상대방의 고 횟수 (고박 계산용)
  applyMultipliers(
    baseScore: ScoreBreakdown,
    goCount: number,
    hasShake: boolean,
    hasPpuk: boolean,
    opponentPiCount: number = 10, // 기본값: 피박 아님
    opponentKwangCount: number = 1, // 기본값: 광박 아님
    opponentAnimalCount: number = 1, // 기본값: 멍박 아님
    myAnimalCount: number = 0, // 기본값: 멍따 아님
    opponentGoCount: number = 0 // 기본값: 고박 아님
  ): ScoreBreakdown {
    // 피박: 상대방이 피를 10점 미만 먹었을 때
    const hasPiBak = opponentPiCount < 10;
    // 광박: 상대방이 광을 하나도 못 먹었을 때
    const hasGwangBak = opponentKwangCount === 0;
    // 멍박: 상대방이 열끗을 하나도 못 먹었을 때
    const hasMungBak = opponentAnimalCount === 0;
    // 멍따: 내가 열끗을 7장 이상 먹었을 때
    const hasMungDda = myAnimalCount >= 7;
    // 고박: 상대방이 고를 선언했는데 내가 스톱해서 이긴 경우
    const hasGoBak = opponentGoCount > 0;

    // 고 배수 계산: 1고=x2, 2고=x3, 3고부터 지수 증가 (3고=x4, 4고=x8, 5고=x16...)
    let goMultiplier = 1;
    if (goCount === 1) {
      goMultiplier = 2;
    } else if (goCount === 2) {
      goMultiplier = 3;
    } else if (goCount >= 3) {
      // 3고부터는 2^(goCount-1) = 3고:4, 4고:8, 5고:16...
      goMultiplier = Math.pow(2, goCount - 1);
    }

    const multipliers = {
      go: goMultiplier,
      shake: hasShake ? SCORING.SPECIAL.SHAKE : 1,
      ppuk: hasPpuk ? SCORING.SPECIAL.PPUK : 1,
      piBak: hasPiBak ? SCORING.SPECIAL.PI_BAK : 1,
      gwangBak: hasGwangBak ? SCORING.SPECIAL.GWANG_BAK : 1,
      mungDda: hasMungDda ? SCORING.SPECIAL.MUNG_DDA : 1,
      mungBak: hasMungBak ? SCORING.SPECIAL.MUNG_BAK : 1,
      goBak: hasGoBak ? SCORING.SPECIAL.GO_BAK : 1,
    };

    const totalMultiplier = multipliers.go * multipliers.shake * multipliers.ppuk *
      multipliers.piBak * multipliers.gwangBak * multipliers.mungDda * multipliers.mungBak * multipliers.goBak;

    return {
      ...baseScore,
      multipliers,
      total: baseScore.total * totalMultiplier,
    };
  }
}
