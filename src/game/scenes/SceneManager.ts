import { Application } from 'pixi.js';
import { Scene, SceneManagerInterface } from './Scene';

export class SceneManager implements SceneManagerInterface {
  private app: Application;
  private scenes: Map<string, Scene> = new Map();
  private currentScene: Scene | null = null;
  private currentSceneName: string = '';

  constructor(app: Application) {
    this.app = app;
  }

  register(name: string, scene: Scene): void {
    scene.setSceneManager(this);
    this.scenes.set(name, scene);
  }

  async changeScene(name: string, data?: unknown): Promise<void> {
    const nextScene = this.scenes.get(name);

    if (!nextScene) {
      console.error(`Scene "${name}" not found`);
      return;
    }

    // Exit current scene
    if (this.currentScene) {
      await this.currentScene.onExit();
      this.app.stage.removeChild(this.currentScene.getContainer());
    }

    // Enter new scene
    this.currentScene = nextScene;
    this.currentSceneName = name;

    this.app.stage.addChild(nextScene.getContainer());
    await nextScene.onEnter(data);
  }

  getCurrentScene(): Scene | null {
    return this.currentScene;
  }

  getCurrentSceneName(): string {
    return this.currentSceneName;
  }

  getScene(name: string): Scene | undefined {
    return this.scenes.get(name);
  }
}
