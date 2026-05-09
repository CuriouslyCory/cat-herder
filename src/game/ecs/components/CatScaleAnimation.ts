import type { Component } from "../Component";

/**
 * CatScaleAnimation — drives a uniform scale tween on a cat (or any) entity.
 *
 * Created by CatCompanionManager:
 *   - summon(): fromScale=0, toScale=1, destroyOnComplete=false  (pop-in)
 *   - dismiss(): fromScale=1, toScale=0, destroyOnComplete=true   (pop-out)
 *
 * Processed by VisualEffectsSystem._updateScaleAnimations() each render frame.
 * When destroyOnComplete is true, VisualEffectsSystem calls world.destroyEntity()
 * after the tween finishes so CatCompanionManager.dismiss() can skip the
 * immediate destroy and let the animation play first.
 */
export interface CatScaleAnimation extends Component {
  readonly type: "CatScaleAnimation";
  fromScale: number;
  toScale: number;
  elapsed: number;
  readonly duration: number;
  readonly destroyOnComplete: boolean;
}

export function createCatScaleAnimation(
  fromScale: number,
  toScale: number,
  duration: number,
  destroyOnComplete: boolean,
): CatScaleAnimation {
  return {
    type: "CatScaleAnimation",
    fromScale,
    toScale,
    elapsed: 0,
    duration,
    destroyOnComplete,
  };
}
