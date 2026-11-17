import type { PlayerId } from "../config/gameConfig";

export class TurnManager {
  current: PlayerId = "player1";

  advance(): PlayerId {
    this.current = this.current === "player1" ? "player2" : "player1";
    return this.current;
  }
}
