import {vec2} from 'gl-matrix';
import tinycolor from 'tinycolor2';

// Re-exports
global.vec2 = vec2;
global.tinycolor = tinycolor;

const canvas = document.getElementById('c');
global.canvas = canvas;

const PIXEL_SIZE = 8.0;

function resizeCanvas(callback) {
  setTimeout(() => {
    canvas.width = Math.ceil(document.documentElement.clientWidth / PIXEL_SIZE);
    canvas.height = Math.ceil(document.documentElement.clientHeight / PIXEL_SIZE);
    callback && callback();
  }, 0);
}
resizeCanvas(() => { game.init(); });
window.addEventListener('resize', e => {
  resizeCanvas();
});

// https://gamedev.stackexchange.com/questions/79049/generating-tile-map

function* pointsInScreen(width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      yield vec2.fromValues(x, y);
    }
  }
}

function setImageData(data, x, y, rgba) {
  const baseIndex = (y * data.width + x) * 4;
  for (let i = 0; i < 4; i++) {
    data.data[baseIndex + i] = (i < rgba.length) ? rgba[i] : 255;
  }
}

class CenterPoint {
  constructor(point, kind) {
    this.point = point;
    this.kind = kind;
  }
}

class MapTile {
  constructor(map, point) {
    this.map = map;
    this.point = point;
    this.kind = undefined;
    this.edgeFactor = 0;
  }

  *neighbors(n) {
    n = n || 1;
    for (let y = this.point[1] - n; y <= this.point[1] + n; y++) {
      for (let x = this.point[0] - n; x <= this.point[0] + n; x++) {
        if (
          x !== this.point[0] && y !== this.point[1] &&
          x >= 0 && y >= 0 &&
          x < this.map.width && y < this.map.height
        ) {
          yield this.map.get(x, y);
        }
      }
    }
  }

  getColor() {
    const colors = [
      [0, 0, 255],
      [0, 255, 0],
    ].map(([r, g, b]) => tinycolor({r, g, b}));
    let color = colors[this.kind];
    color = color.darken(this.edgeFactor * 30);
    const colorObj = color.toRgb();
    return [colorObj.r, colorObj.g, colorObj.b];
  }
}

class Map {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.array = new Array(width * height);
    for (const point of pointsInScreen(width, height)) {
      this.array[point[1] * width + point[0]] = new MapTile(this, point);
    }
  }

  get(x, y) {
    return this.array[y * this.width + x];
  }

  liminalize() {
    let edgeFactors = new Array(this.width * this.height);
    for (const [x, y] of pointsInScreen(this.width, this.height)) {
      const tile = this.get(x, y);
      let maxEdge = 0;
      for (const neighbor of tile.neighbors()) {
        if (neighbor.kind !== tile.kind && maxEdge === 0) {
          maxEdge = 1;
        } else if (neighbor.edgeFactor > maxEdge)  {
          maxEdge = neighbor.edgeFactor;
        }
      }
      edgeFactors[y * this.width + x] = maxEdge;
    }
    for (let i = 0; i < this.array.length; i++) {
      this.array[i].edgeFactor = edgeFactors[i];
    }
  }

  toImageData(ctx) {
    const imageData = ctx.createImageData(this.width, this.height);
    for (const [x, y] of pointsInScreen(this.width, this.height)) {
      setImageData(imageData, x, y, this.get(x, y).getColor());
    }
    return imageData;
  }
}

class Game {
  render() {
    const ctx = canvas.getContext('2d');
    ctx.putImageData(this.imageData, 0, 0);

    requestAnimationFrame(this.render.bind(this));
  }

  init() {
    const width = canvas.width;
    const height = canvas.height;

    const numCenterPoints = 80; // TODO: Function of size of screen
    this.centerPoints = [];
    const widthHeightVector = vec2.fromValues(width, height);
    for (let i = 0; i < numCenterPoints; i++) {
      const point = vec2.create();
      vec2.random(point, Math.random());
      point[0] = Math.abs(point[0]);
      point[1] = Math.abs(point[1]);
      vec2.multiply(point, point, widthHeightVector);
      vec2.floor(point, point);
      const centerPoint = new CenterPoint(
        point,
        Math.floor(Math.random() * 2)
      );
      this.centerPoints.push(centerPoint);
    }

    const ctx = canvas.getContext('2d');
    this.map = new Map(width, height);

    for (const point of pointsInScreen(width, height)) {
      let minDistance = Number.MAX_VALUE;
      let curCenterPoint;
      let isCenterPoint = false;
      for (const centerPoint of this.centerPoints) {
        if (vec2.exactEquals(centerPoint.point, point)) {
          isCenterPoint = true;
        }
        const squaredDistance = vec2.sqrDist(point, centerPoint.point);
        if (squaredDistance < minDistance) {
          minDistance = squaredDistance;
          curCenterPoint = centerPoint;
        }
      }
      this.map.get(point[0], point[1]).kind = curCenterPoint.kind;
    }
    this.map.liminalize();

    this.imageData = this.map.toImageData(ctx);

    this.render();
  }
}

const game = new Game();
global.game = game;

