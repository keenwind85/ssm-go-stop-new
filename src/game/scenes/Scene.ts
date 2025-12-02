import { Application, Container } from 'pixi.js';

export interface SceneManagerInterface {
  changeScene(name: string, data?: unknown): Promise<void>;
}

export abstract class Scene {
  protected app: Application;
  protected container: Container;
  protected sceneManager: SceneManagerInterface | null = null;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
  }

  setSceneManager(manager: SceneManagerInterface): void {
    this.sceneManager = manager;
  }

  protected changeScene(name: string, data?: unknown): void {
    if (this.sceneManager) {
      this.sceneManager.changeScene(name, data);
    } else {
      console.error('SceneManager not set');
    }
  }

  abstract onEnter(data?: unknown): Promise<void> | void;
  abstract onExit(): Promise<void> | void;

  getContainer(): Container {
    return this.container;
  }

  update(_deltaTime: number): void {
    // Override in subclasses if needed
  }

  resize(_width: number, _height: number): void {
    // Override in subclasses if needed
  }
}
