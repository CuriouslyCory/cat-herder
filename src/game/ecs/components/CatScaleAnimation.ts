import type { Component } from "../Component";

/**
 * CatScaleAnimation — drives a uniform scale tween on a cat (or any) entity.
 *
 * Created by CatCompanionManager:
 *   - summon():       fromScale=0, toScale=1  (pop-in)
 *   - beginDespawn(): fromScale=1, toScale=0  (pop-out)
 *
 * Processed by VisualEffectsSystem._updateScaleAnimations() each render frame,
 * which only tweens Transform.scale{X,Y,Z} and removes this component when
 * the tween completes. Entity destruction is NOT driven by this component —
 * CatCompanionManager is the sole destruction authority (see
 * docs/adr/0004-cat-lifecycle-single-owner.md): it registers its own despawn
 * timer in beginDespawn() and destroys the entity when that timer elapses.
 */
export interface CatScaleAnimation extends Component {
  readonly type: "CatScaleAnimation";
  fromScale: number;
  toScale: number;
  elapsed: number;
  readonly duration: number;
}

export function createCatScaleAnimation(
  fromScale: number,
  toScale: number,
  duration: number,
): CatScaleAnimation {
  return {
    type: "CatScaleAnimation",
    fromScale,
    toScale,
    elapsed: 0,
    duration,
  };
}
