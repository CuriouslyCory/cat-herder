/**
 * UIManager — mounts and manages plain DOM panels over the game canvas.
 *
 * US-017 stub: provides the update()/dispose() interface required by the Game
 * orchestrator. Full HUD and FPS counter implementation is in US-018.
 */
export class UIManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_canvas: HTMLCanvasElement) {}

  /** Called once per render frame by the game loop. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_dt: number): void {}

  /** Remove all mounted DOM panels and listeners. */
  dispose(): void {}
}
