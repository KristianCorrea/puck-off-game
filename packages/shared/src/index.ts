export {
  DESIGN_SCALE,
  u,
  ARENA_CONFIG,
  GOAL_CONFIG,
  PUCK_CONFIG,
  BALL_CONFIG,
  SHOT_CONFIG,
  SETTLE_CONFIG,
  MATCH_CONFIG,
  GAME_CONFIG,
  getFieldBounds,
  type GameConfig,
} from "./constants/GAME_CONFIG";

export type {
  MatchPhase,
  PlayerId,
  GoalSide,
  MatchResult,
} from "./types/MatchPhase";

export type { LaunchAction } from "./types/LaunchAction";

export type {
  Vec2,
  BodyState,
  PuckState,
  MatchState,
} from "./types/MatchState";

export type { PhysicsKeyframe } from "./types/PhysicsKeyframe";

export {
  SOCKET_EVENTS,
  type SocketEventName,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type ReadyPayload,
  type LaunchPuckPayload,
  type RematchPayload,
  type RoomCreatedPayload,
  type RoomPlayerInfo,
  type RoomStatePayload,
  type PlayerJoinedPayload,
  type MatchStartPayload,
  type TurnResolvedPayload,
  type RejectLaunchPayload,
  type ErrorPayload,
  type LaunchPuckMessage,
  type TurnResolvedMessage,
  type RejectLaunchMessage,
} from "./protocol/messages";
