import * as PIXI from "pixi.js";

export class App {
  app: PIXI.Application;
  layers: Record<string, PIXI.Container>;

  constructor() {
    this.app = new PIXI.Application();
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
    this.layers.tokens = new PIXI.Container();
    this.layers.ui = new PIXI.Container();

    Object.values(this.layers).forEach(layer =>
      this.app.stage.addChild(layer)
    );

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
  }
  
  resize() {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }
}