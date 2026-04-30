/**
 * ComponentType is a string literal tag used to identify component kinds.
 * Each concrete component must declare a static `type` field matching this tag.
 */
export type ComponentType = string;

/**
 * Base interface for all ECS components. Each component carries a `type` tag
 * so the World can store and retrieve components by type without runtime instanceof checks.
 */
export interface Component {
  readonly type: ComponentType;
}
