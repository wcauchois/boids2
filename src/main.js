import {vec2} from 'gl-matrix';
import tinycolor from 'tinycolor2';
import shortid from 'shortid';

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
resizeCanvas(() => {game.init();});
window.addEventListener('resize', e => {
  resizeCanvas();
});

// https://gamedev.stackexchange.com/questions/79049/generating-tile-map
// http://www.vergenet.net/~conrad/boids/pseudocode.html

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

class Boid {
  constructor(manager, position) {
    this.manager = manager;
    if (typeof position === 'undefined') {
      this.position = randomVecInArea(manager.getMapWidth(), manager.getMapHeight());
    } else {
      this.position = position;
    }
    this.velocity = vec2.fromValues(0, 0);
    this.id = shortid.generate();
  }

  equals(otherBoid) {
    return this.id === otherBoid.id;
  }

  *otherBoids() {
    for (const boid of this.manager.boids) {
      if (!boid.equals(this)) {
        yield boid;
      }
    }
  }

  centerOfMassRule() {
    const centerOfMass = vec2.create();
    for (const boid of this.otherBoids()) {
      vec2.add(centerOfMass, centerOfMass, boid.position);
    }
    vec2.scale(centerOfMass, centerOfMass, 1.0 / (this.manager.boids.length - 1));
    const vec = vec2.clone(centerOfMass);
    vec2.sub(vec, vec, this.position);
    vec2.scale(vec, vec, 1.0 / 100.0);
    return vec;
  }

  avoidanceRule() {
    const vec = vec2.create();
    for (const boid of this.otherBoids()) {
      if (vec2.sqrDist(this.position, boid.position) < 10.0) {
        // c = c  - (b.position - b_j.position)
        vec2.sub(vec, vec, this.position);
        vec2.add(vec, vec, boid.position);
      }
    }
    return vec;
  }

  matchVelocityRule() {
    const vec = vec2.create();
    for (const boid of this.otherBoids()) {
      vec2.add(vec, vec, boid.velocity);
    }
    vec2.scale(vec, vec, 1.0 / (this.manager.boids.length - 1));
    vec2.sub(vec, vec, this.velocity);
    vec2.scale(vec, vec, 1.0 / 8.0);
    return vec;
  }

  attractToPointRule() {
    const targetPoint = vec2.fromValues(
      this.manager.map.width / 2,
      this.manager.map.height / 2
    );
    const vec = vec2.clone(targetPoint);
    vec2.sub(vec, vec, this.position);
    vec2.scale(vec, vec, 1.0 / 50.0);
    return vec;
  }

  simulate() {
    const results = [];
    results.push(this.centerOfMassRule());
    results.push(this.avoidanceRule());
    results.push(this.matchVelocityRule());
    results.push(this.attractToPointRule());

    results.forEach(result => {
      vec2.add(this.velocity, this.velocity, result);
    });

    vec2.add(this.position, this.position, this.velocity);
  }

  draw(ctx) {
    const x = Math.floor(this.position[0]);
    const y = Math.floor(this.position[1]);
    const triangleSize = 3.0;
    const rotInc = (Math.PI * 2) / 3.0;
    const rotation = Math.atan2(this.velocity[1], this.velocity[0]) - (rotInc / 2.0);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    let curRot = rotation - (rotInc / 2.0);
    for (let i = 0; i < 4; i++) {
      const drawX = Math.cos(curRot) * triangleSize;
      const drawY = Math.sin(curRot) * triangleSize;
      if (i === 0) {
        ctx.moveTo(drawX, drawY);
      } else {
        ctx.lineTo(drawX, drawY);
      }
      curRot += rotInc;
    }
    ctx.fill();
    //ctx.fillRect(0, 0, 1, 1);
    ctx.restore();
  }
}

class BoidManager {
  constructor(map, numBoids) {
    this.map = map;
    this.boids = new Array(numBoids);
    for (let i = 0; i < numBoids; i++) {
      this.boids[i] = new Boid(this);
    }
  }

  getMapWidth() { return this.map.width; }
  getMapHeight() { return this.map.height; }

  simulate() {
    for (const boid of this.boids) {
      boid.simulate();
    }
  }

  draw(ctx) {
    this.boids.forEach(boid => {
      boid.draw(ctx);
    });
  }
}

function randomVecInArea(width, height) {
  const vec = vec2.create();
  vec2.random(vec, Math.random());
  vec[0] = Math.abs(vec[0]);
  vec[1] = Math.abs(vec[1]);
  vec2.multiply(vec, vec, vec2.fromValues(width, height));
  vec2.floor(vec, vec);
  return vec;
}

class Game {
  render() {
    const ctx = canvas.getContext('2d');
    ctx.putImageData(this.imageData, 0, 0);
    this.boidManager.draw(ctx);
    requestAnimationFrame(this.render.bind(this));
  }

  init() {
    const width = canvas.width;
    const height = canvas.height;

    const numCenterPoints = 80; // TODO: Function of size of screen
    this.centerPoints = [];
    const widthHeightVector = vec2.fromValues(width, height);
    for (let i = 0; i < numCenterPoints; i++) {
      const centerPoint = new CenterPoint(
        randomVecInArea(width, height),
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

    this.boidManager = new BoidManager(this.map, 20);

    this.render();
    setInterval(this.simulate.bind(this), 100);
  }

  simulate() {
    this.boidManager.simulate();
  }
}

const game = new Game();
global.game = game;

