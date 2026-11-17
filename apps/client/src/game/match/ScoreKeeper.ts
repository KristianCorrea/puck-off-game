import type { PlayerId } from "../config/gameConfig";
import { MATCH_CONFIG } from "../config/gameConfig";

export class ScoreKeeper {
  player1 = 0;
  player2 = 0;

  /** Ball entered this goal mouth → other player scores (own goal included). */
  awardForGoalIn(goalSide: PlayerId): PlayerId {
    const scorer: PlayerId = goalSide === "player1" ? "player2" : "player1";
    this[scorer] += 1;
    return scorer;
  }

  hasWinner(): PlayerId | null {
    if (this.player1 >= MATCH_CONFIG.maxGoals) return "player1";
    if (this.player2 >= MATCH_CONFIG.maxGoals) return "player2";
    return null;
  }
}
