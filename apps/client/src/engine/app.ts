import * as PIXI from "pixi.js";

export class App {
  app: PIXI.Application;
  camera: PIXI.Container;
  layers: Record<string, PIXI.Container>;

  constructor() {
    this.app = new PIXI.Application();
    this.camera = new PIXI.Container();
    this.layers = {};
  }

  async init() {
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x666666,
      antialias: true,
    });

    document.body.appendChild(this.app.canvas);

    this.layers.background = new PIXI.Container();
    this.layers.grid = new PIXI.Container();
    this.layers.drawings = new PIXI.Container();
    this.layers.tokens = new PIXI.Container();
    this.layers.ui = new PIXI.Container();

    this.app.stage.addChild(this.camera);
    this.camera.addChild(this.layers.background, this.layers.grid, this.layers.tokens, this.layers.drawings);
    this.app.stage.addChild(this.layers.ui);

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
  }
  
  resize() {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }
}
