import * as PIXI from "pixi.js";

export class TokenManager {
  private tokens = new Map<string, PIXI.Container>();
  private layer: PIXI.Container;
  private ids = new Map<PIXI.Container, string>();
  private visuals = new Map<string, PIXI.Sprite>();

  constructor(layer: PIXI.Container) {
    this.layer = layer;
  }

  create(id: string, x: number, y: number) {
    const token = new PIXI.Container();
    // Fallback sempre visível. Ele é substituído pela imagem do asset apenas
    // depois que o navegador termina de carregá-la com sucesso.
    const fallback = new PIXI.Sprite(PIXI.Texture.WHITE);
    fallback.width = 50;
    fallback.height = 50;
    token.addChild(fallback);

    token.x = x;
    token.y = y;

    this.layer.addChild(token);
    this.tokens.set(id, token);
    this.ids.set(token, id);
    this.visuals.set(id, fallback);

    return token;
  }

  move(id: string, x: number, y: number) {
    const token = this.tokens.get(id);
    if (!token) return;

    token.x = x;
    token.y = y;
  }

  get(id: string) {
    return this.tokens.get(id);
  }

  getId(token: PIXI.Container) {
    return this.ids.get(token);
  }

  async setImage(id: string, url: string) {
    const token = this.tokens.get(id);
    if (!token) return;

    try {
      // A rota de assets é /assets/:id e não carrega uma extensão no URL.
      // Por isso o Assets.load não consegue selecionar automaticamente o
      // parser de PNG/JPEG/WebP. O navegador usa o Content-Type da resposta
      // para decodificar a imagem, então criamos a textura a partir dela.
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        // O Vite roda em localhost:5173 e os assets são servidos em :3000.
        // Sem isto o browser permite exibir a imagem, mas bloqueia seu upload
        // para a textura WebGL por considerá-la cross-origin contaminada.
        element.crossOrigin = "anonymous";
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("A resposta do servidor não é uma imagem válida."));
        element.src = url;
      });
      const texture = PIXI.Texture.from(image);
      // A cena pode ter mudado enquanto a imagem carregava.
      if (this.tokens.get(id) !== token) return;

      this.visuals.get(id)?.destroy();
      const sprite = new PIXI.Sprite(texture);
      sprite.width = 50;
      sprite.height = 50;
      token.addChildAt(sprite, 0);
      this.visuals.set(id, sprite);
    } catch (error) {
      console.error("Não foi possível carregar a imagem do token.", error);
    }
  }

  clear() {
    // Remove todos os tokens do layer e limpa os maps
    this.tokens.forEach((graphic) => {
      this.layer.removeChild(graphic);
      graphic.destroy();
    });
    this.tokens.clear();
    this.ids.clear();
    this.visuals.clear();
  }
}
