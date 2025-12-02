import { Card } from '@game/objects/Card';
import { ScoreBreakdown, CardType } from '@utils/types';
import { SCORING } from '@utils/constants';

export class ScoreCalculator {
  calculate(collectedCards: Card[]): ScoreBreakdown {
    const categorized = this.categorizeCards(collectedCards);

    const kwangScore = this.calculateKwangScore(categorized.kwang);
    const animalScore = this.calculateAnimalScore(categorized.animal);
    const ribbonResult = this.calculateRibbonScore(categorized.ribbon);
    const piScore = this.calculatePiScore(categorized.pi);

    const special = {
      godori: this.checkGodori(categorized.animal),
      hongdan: ribbonResult.hongdan,
      cheongdan: ribbonResult.cheongdan,
      chodan: ribbonResult.chodan,
    };

    const baseTotal = kwangScore + animalScore + ribbonResult.score + piScore;

    // Add special bonuses
    let specialBonus = 0;
    if (special.godori) specialBonus += SCORING.ANIMAL.GODORI;
    if (special.hongdan) specialBonus += SCORING.RIBBON.HONGDAN;
    if (special.cheongdan) specialBonus += SCORING.RIBBON.CHEONGDAN;
    if (special.chodan) specialBonus += SCORING.RIBBON.CHODAN;

    return {
      kwang: kwangScore,
      animal: animalScore,
      ribbon: ribbonResult.score,
      pi: piScore,
      special,
      multipliers: {
        go: 1,
        shake: 1,
        ppuk: 1,
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

  private calculatePiScore(piCards: Card[]): number {
    // Count pi points (some cards are worth 2)
    let piCount = 0;
    piCards.forEach(card => {
      // 11월 4번, 12월 4번 카드는 쌍피 (2점)
      if ((card.getMonth() === 11 && card.cardData.index === 4) ||
          (card.getMonth() === 12 && card.cardData.index === 4)) {
        piCount += 2;
      } else {
        piCount += 1;
      }
    });

    if (piCount >= 10) {
      return SCORING.PI.BASE + (piCount - 10) * SCORING.PI.EXTRA_PER_CARD;
    }

    return 0;
  }

  private checkGodori(animalCards: Card[]): boolean {
    // 고도리: 2월, 4월, 8월 동물 (새) 카드
    const birdMonths = [2, 4, 8];
    const animalMonths = animalCards.map(card => card.getMonth());
    return birdMonths.every(m => animalMonths.includes(m));
  }

  // Calculate if a player can declare "Go"
  canDeclareGo(collectedCards: Card[]): boolean {
    const score = this.calculate(collectedCards);
    return score.total >= 3;
  }

  // Apply multipliers for Go count, shake, etc.
  applyMultipliers(
    baseScore: ScoreBreakdown,
    goCount: number,
    hasShake: boolean,
    hasPpuk: boolean
  ): ScoreBreakdown {
    const multipliers = {
      go: Math.pow(2, goCount),
      shake: hasShake ? SCORING.SPECIAL.SHAKE : 1,
      ppuk: hasPpuk ? SCORING.SPECIAL.PPUK : 1,
    };

    const totalMultiplier = multipliers.go * multipliers.shake * multipliers.ppuk;

    return {
      ...baseScore,
      multipliers,
      total: baseScore.total * totalMultiplier,
    };
  }
}
