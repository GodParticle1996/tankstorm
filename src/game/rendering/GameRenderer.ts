// ═══════════════════════════════════════════════════════════
//  GameRenderer — Three.js scene manager (§2.2)
//  Reads engine state directly every frame. NO React in render path.
//  Pooled particle system (4000 slots), buffer-attribute terrain updates,
//  screen shake via camera offset. Disposes everything on unmount.
//
//  Camera: fixed orthographic, symmetric frustum, positioned at the
//  battlefield center (WORLD.WIDTH/2, WORLD.HEIGHT/2). The frustum is
//  NEVER offset by world coordinates — only camera.position moves
//  (this is what the screen shake modifies).
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";
import { WORLD, PARTICLES } from "../engine/constants";
import { getWeapon } from "../engine/weapons";
import { sfx } from "../audio/Sfx";
import type { GameEngine } from "../engine/GameEngine";
import type { TankState, ProjectileState, VisualEffect, ScorePopup, ZoneEffect } from "../engine/types";
import type { TerrainTheme } from "../engine/modes";

// ─── Per-mode visual themes ───

interface ThemePalette {
  skyTop: string; skyMid: string; skyHorizon: string;
  grassLow: string; grassHigh: string; grassDark: string;
  dirtLight: string; dirtMid: string; dirtDark: string; deep: string;
  surfaceLine: string;
  starOpacity: number;
  clouds: boolean;
  cloudColor: string;
  /** Moon / sun / Earth disc in the sky (null = none) */
  disc: { color: string; x: number; y: number; r: number; opacity: number } | null;
}

const THEMES: Record<TerrainTheme, ThemePalette> = {
  night: {
    skyTop: "#070b16", skyMid: "#151d38", skyHorizon: "#2b3a63",
    grassLow: "#55a03f", grassHigh: "#82ce54", grassDark: "#39702c",
    dirtLight: "#9a6b3d", dirtMid: "#6e4a28", dirtDark: "#3a2614", deep: "#150d06",
    surfaceLine: "#c8f09a", starOpacity: 0.7, clouds: true, cloudColor: "#9db1d8",
    disc: { color: "#e8ecf5", x: 860, y: 570, r: 26, opacity: 0.5 },
  },
  storm: {
    skyTop: "#0a0d18", skyMid: "#1c2334", skyHorizon: "#3e4a55",
    grassLow: "#4d8f42", grassHigh: "#6fb54b", grassDark: "#33612c",
    dirtLight: "#82613f", dirtMid: "#5c452c", dirtDark: "#332417", deep: "#120d07",
    surfaceLine: "#a8c98a", starOpacity: 0.2, clouds: true, cloudColor: "#7d92a8",
    disc: null,
  },
  lunar: {
    skyTop: "#02030a", skyMid: "#05070f", skyHorizon: "#131522",
    grassLow: "#8f93a2", grassHigh: "#b4b8c6", grassDark: "#6c7080",
    dirtLight: "#585c6a", dirtMid: "#42454f", dirtDark: "#2a2c33", deep: "#101116",
    surfaceLine: "#d4d8e6", starOpacity: 1.0, clouds: false, cloudColor: "#ffffff",
    disc: { color: "#7fa8d9", x: 160, y: 600, r: 36, opacity: 0.85 },
  },
  inferno: {
    skyTop: "#0d0508", skyMid: "#2a0f10", skyHorizon: "#6b2a17",
    grassLow: "#7a6b3a", grassHigh: "#9c8a48", grassDark: "#57492a",
    dirtLight: "#7c4a30", dirtMid: "#57301e", dirtDark: "#331a10", deep: "#120705",
    surfaceLine: "#d9b06a", starOpacity: 0.15, clouds: true, cloudColor: "#b0664a",
    disc: { color: "#ff5a2a", x: 830, y: 590, r: 30, opacity: 0.45 },
  },
};

// Camera base position (battlefield center) — shake jitters around this
const CAM_X = WORLD.WIDTH / 2;
const CAM_Y = WORLD.HEIGHT / 2;
const VIEW_MARGIN = 30;
// How far below y=0 the terrain mesh skirt extends (covers underground for tall views)
const TERRAIN_SKIRT_Y = -600;
// Turret pivot height above tank bottom (must match Physics.getTurretTip)
const TURRET_PIVOT_Y = WORLD.TANK_HEIGHT + 2;

export class GameRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private container: HTMLElement;
  private engine: GameEngine;

  // Scene objects
  private terrainMesh: THREE.Mesh;
  private terrainGeo: THREE.BufferGeometry;
  private tankGroups: [THREE.Group, THREE.Group];
  private projectileMeshes: Map<number, THREE.Mesh> = new Map();
  private trajectoryLine: THREE.Line;
  private popupGroup: THREE.Group;
  private skyMesh: THREE.Mesh;
  private starPoints: THREE.Points;

  // Transient effect meshes (beams, explosion rings) keyed by effect id
  private beamMeshes: Map<number, THREE.Mesh> = new Map();
  private ringMeshes: Map<number, THREE.Mesh> = new Map();

  // Pooled particle system (§2.2 — one THREE.Points, 4000 slots)
  private particleGeo: THREE.BufferGeometry;
  private particlePositions: Float32Array;
  private particleColors: Float32Array;
  private particleLife: Float32Array;
  private particleMaxLife: Float32Array;
  private particleVel: Float32Array;
  private particleMaterial: THREE.PointsMaterial;
  private particleCount = 0;

  // Screen shake
  private shakeTrauma = 0;

  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, engine: GameEngine) {
    this.container = container;
    this.engine = engine;

    // ─── Renderer ───
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // §2.2
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    // ─── Scene ───
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a0f1e");

    // ─── Orthographic camera (§2.2 — fixed, whole battlefield visible) ───
    const { viewW, viewH } = this.computeView(container.clientWidth, container.clientHeight);
    this.camera = new THREE.OrthographicCamera(
      -viewW / 2, viewW / 2, viewH / 2, -viewH / 2, -500, 500,
    );
    this.camera.position.set(CAM_X, CAM_Y, 100);

    // ─── Lighting (tanks are Lambert; terrain is unlit/Basic) ───
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(200, 400, 300);
    this.scene.add(dirLight);

    // ─── Sky, stars, clouds, celestial disc ───
    this.skyMesh = this.createSky();
    this.scene.add(this.skyMesh);
    this.starPoints = this.createStars();
    this.scene.add(this.starPoints);
    this.createClouds();
    this.createCelestialDisc();

    // Apply the initial theme BEFORE the terrain is built (it reads palette)
    this.applyThemeIfChanged();

    // ─── Terrain mesh (§2.2 — built once, position buffer rewritten on change) ───
    // Surface line + speckles are created first so the initial
    // updateTerrainMesh() inside createTerrainMesh() populates them too.
    this.surfaceLine = this.createSurfaceLine();
    this.scene.add(this.surfaceLine);
    this.specklePoints = this.createSpeckles();
    this.scene.add(this.specklePoints);
    this.terrainGeo = new THREE.BufferGeometry();
    this.terrainMesh = this.createTerrainMesh();
    this.scene.add(this.terrainMesh);

    // ─── Tanks ───
    this.tankGroups = [this.createTankModel(0), this.createTankModel(1)];
    this.scene.add(this.tankGroups[0], this.tankGroups[1]);

    // ─── Trajectory preview line ───
    const trajGeo = new THREE.BufferGeometry();
    const trajMat = new THREE.LineDashedMaterial({
      color: 0x00d4ff,
      dashSize: 6,
      gapSize: 5,
      transparent: true,
      opacity: 0.55,
    });
    this.trajectoryLine = new THREE.Line(trajGeo, trajMat);
    this.trajectoryLine.visible = false;
    this.scene.add(this.trajectoryLine);

    // ─── Pooled particle system (§2.2) ───
    this.particlePositions = new Float32Array(PARTICLES.POOL_SIZE * 3);
    this.particleColors = new Float32Array(PARTICLES.POOL_SIZE * 3);
    this.particleLife = new Float32Array(PARTICLES.POOL_SIZE);
    this.particleMaxLife = new Float32Array(PARTICLES.POOL_SIZE);
    this.particleVel = new Float32Array(PARTICLES.POOL_SIZE * 3);
    this.particleCount = 0;

    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute("position", new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeo.setAttribute("color", new THREE.BufferAttribute(this.particleColors, 3));
    this.particleGeo.setDrawRange(0, 0);

    this.particleMaterial = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
      depthWrite: false,
    });

    const particlePoints = new THREE.Points(this.particleGeo, this.particleMaterial);
    particlePoints.frustumCulled = false;
    this.scene.add(particlePoints);

    // Smoke & debris pool (normal blending — dark particles)
    this.initSmokePool();

    // ─── Score popup group ───
    this.popupGroup = new THREE.Group();
    this.scene.add(this.popupGroup);

    // ─── Resize observer (§2.2) ───
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
  }

  // ═════════════════════════════════════════════
  //  View fitting: show the whole battlefield + margin
  // ═════════════════════════════════════════════

  private computeView(w: number, h: number): { viewW: number; viewH: number } {
    const worldW = WORLD.WIDTH + VIEW_MARGIN * 2;
    const worldH = WORLD.HEIGHT + VIEW_MARGIN * 2;
    const aspect = w > 0 && h > 0 ? w / h : 16 / 9;
    let viewW = worldW;
    let viewH = viewW / aspect;
    if (viewH < worldH) {
      viewH = worldH;
      viewW = viewH * aspect;
    }
    return { viewW, viewH };
  }

  // ═════════════════════════════════════════════
  //  Sky — gradient by world Y (FrontSide, faces the camera)
  // ═════════════════════════════════════════════

  private createSky(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(WORLD.WIDTH * 6, WORLD.HEIGHT * 10);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color("#070b16") },
        midColor: { value: new THREE.Color("#151d38") },
        horizonColor: { value: new THREE.Color("#2b3a63") },
      },
      vertexShader: `
        varying float vWorldY;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldY = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        varying float vWorldY;
        void main() {
          float t1 = clamp(vWorldY / 260.0, 0.0, 1.0);
          float t2 = clamp((vWorldY - 260.0) / 400.0, 0.0, 1.0);
          vec3 color = mix(horizonColor, midColor, t1);
          color = mix(color, topColor, t2);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(WORLD.WIDTH / 2, WORLD.HEIGHT / 2, -250);
    return mesh;
  }

  private createStars(): THREE.Points {
    const COUNT = 110;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = -300 + Math.random() * (WORLD.WIDTH + 600);
      positions[i * 3 + 1] = 240 + Math.random() * 700;
      positions[i * 3 + 2] = -200;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 2,
      color: 0xbfd4ff,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: false,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  // ═════════════════════════════════════════════
  //  Theme (per battle mode): sky, palette, clouds, moon/sun
  // ═════════════════════════════════════════════

  private activeThemeId: TerrainTheme | null = null;
  private theme: ThemePalette = THEMES.night;

  private applyThemeIfChanged(): void {
    const id = this.engine.getMode().theme;
    if (id === this.activeThemeId) return;
    this.activeThemeId = id;
    this.theme = THEMES[id];

    const sky = this.skyMesh.material as THREE.ShaderMaterial;
    sky.uniforms.topColor.value.set(this.theme.skyTop);
    sky.uniforms.midColor.value.set(this.theme.skyMid);
    sky.uniforms.horizonColor.value.set(this.theme.skyHorizon);

    (this.starPoints.material as THREE.PointsMaterial).opacity = this.theme.starOpacity;

    for (const cloud of this.clouds) {
      cloud.visible = this.theme.clouds;
      (cloud.material as THREE.SpriteMaterial).color.set(this.theme.cloudColor);
    }

    const disc = this.theme.disc;
    this.celestialDisc.visible = this.celestialGlow.visible = disc !== null;
    if (disc) {
      this.celestialDisc.position.set(disc.x, disc.y, -220);
      this.celestialDisc.scale.set(disc.r, disc.r, 1);
      (this.celestialDisc.material as THREE.MeshBasicMaterial).color.set(disc.color);
      (this.celestialDisc.material as THREE.MeshBasicMaterial).opacity = disc.opacity;
      this.celestialGlow.position.set(disc.x, disc.y, -221);
      this.celestialGlow.scale.set(disc.r * 1.9, disc.r * 1.9, 1);
      (this.celestialGlow.material as THREE.MeshBasicMaterial).color.set(disc.color);
      (this.celestialGlow.material as THREE.MeshBasicMaterial).opacity = disc.opacity * 0.22;
    }

    if (this.surfaceLine) {
      (this.surfaceLine.material as THREE.LineBasicMaterial).color.set(this.theme.surfaceLine);
    }
    if (this.specklePoints) {
      this.retintSpeckles();
    }
    this.engine.terrain.dirty = true; // recolor the terrain bands
  }

  // ─── Clouds: soft sprites drifting with the wind ───

  private clouds: THREE.Sprite[] = [];
  private cloudDrift: number[] = [];

  private createClouds(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    for (const [bx, by, br] of [[40, 38, 26], [70, 30, 30], [98, 40, 22]] as const) {
      const g = ctx.createRadialGradient(bx, by, 2, bx, by, br);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);

    for (let i = 0; i < 5; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texture, transparent: true, opacity: 0.11 + (i % 3) * 0.025, depthWrite: false,
      });
      const cloud = new THREE.Sprite(mat);
      cloud.scale.set(150 + i * 22, 46 + (i % 3) * 10, 1);
      cloud.position.set((i / 5) * WORLD.WIDTH + 60, 390 + ((i * 67) % 150), -170);
      this.clouds.push(cloud);
      this.cloudDrift.push(4 + (i % 3) * 3);
      this.scene.add(cloud);
    }
  }

  private updateClouds(dt: number, wind: number): void {
    if (!this.theme.clouds) return;
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      cloud.position.x += (this.cloudDrift[i] + wind * 0.55) * dt;
      if (cloud.position.x > WORLD.WIDTH + 250) cloud.position.x = -250;
      if (cloud.position.x < -250) cloud.position.x = WORLD.WIDTH + 250;
    }
  }

  // ─── Celestial disc (moon / Earth / red sun) ───

  private celestialDisc!: THREE.Mesh;
  private celestialGlow!: THREE.Mesh;

  private createCelestialDisc(): void {
    const geo = new THREE.CircleGeometry(1, 40);
    this.celestialDisc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.5, depthWrite: false,
    }));
    this.celestialGlow = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.celestialGlow, this.celestialDisc);
  }

  // ═════════════════════════════════════════════
  //  Terrain mesh — 6 vertex rows per column:
  //  bright grass / grass shadow / light dirt / mid dirt / dark dirt / deep
  //  skirt, with deterministic per-column color jitter so the ground reads
  //  as textured earth instead of a flat gradient.
  //  Unlit (MeshBasicMaterial) so colors stay vibrant and predictable.
  // ═════════════════════════════════════════════

  private static readonly TERRAIN_ROWS = 6;

  /** Deterministic per-column hash in [0,1) — stable across terrain updates */
  private static colHash(i: number): number {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  /** Smooth value noise over columns — adjacent columns stay correlated so
   *  color variation reads as mottled earth, not vertical stripes. */
  private static smoothNoise(i: number, scale: number): number {
    const x = i / scale;
    const i0 = Math.floor(x);
    const f = x - i0;
    const t = f * f * (3 - 2 * f);
    return GameRenderer.colHash(i0) * (1 - t) + GameRenderer.colHash(i0 + 1) * t;
  }

  private createTerrainMesh(): THREE.Mesh {
    const cols = this.engine.terrain.cols;
    const rows = GameRenderer.TERRAIN_ROWS;
    const positions = new Float32Array(cols * rows * 3);
    const colors = new Float32Array(cols * rows * 3);
    const indices: number[] = [];

    for (let i = 0; i < cols - 1; i++) {
      for (let r = 0; r < rows - 1; r++) {
        const a = i * rows + r;
        const b = i * rows + r + 1;
        const c = (i + 1) * rows + r;
        const d = (i + 1) * rows + r + 1;
        indices.push(a, b, c);
        indices.push(c, b, d);
      }
    }

    this.terrainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.terrainGeo.setIndex(indices);

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(this.terrainGeo, material);
    mesh.name = "terrain";
    mesh.frustumCulled = false;
    this.updateTerrainMesh();
    return mesh;
  }

  /** Rewrite the position buffer from the engine's heightmap (§2.2) */
  updateTerrainMesh(): void {
    const terrain = this.engine.terrain;
    const cols = terrain.cols;
    const rows = GameRenderer.TERRAIN_ROWS;
    const posAttr = this.terrainGeo.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = this.terrainGeo.getAttribute("color") as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;

    const grassLow = new THREE.Color(this.theme.grassLow);
    const grassHigh = new THREE.Color(this.theme.grassHigh);
    const grassDark = new THREE.Color(this.theme.grassDark);
    const dirtLight = new THREE.Color(this.theme.dirtLight);
    const dirtMid = new THREE.Color(this.theme.dirtMid);
    const dirtDark = new THREE.Color(this.theme.dirtDark);
    const deep = new THREE.Color(this.theme.deep);
    const grass = new THREE.Color();
    const jittered = new THREE.Color();

    for (let i = 0; i < cols; i++) {
      const x = i * terrain.step;
      const surfaceY = terrain.surfaceY[i];
      // Two octaves of smooth noise: broad patches + fine grain, ±6%
      const n = GameRenderer.smoothNoise(i, 26) * 0.7 + GameRenderer.smoothNoise(i + 5000, 7) * 0.3;
      const jitter = 0.94 + n * 0.12;

      // Grass color varies with elevation + per-column jitter
      const hf = Math.max(0, Math.min(1, (surfaceY - 60) / (WORLD.HEIGHT * 0.6)));
      grass.copy(grassLow).lerp(grassHigh, hf).multiplyScalar(jitter);

      const ys = [surfaceY, surfaceY - 5, surfaceY - 13, surfaceY - 55, surfaceY - 150, TERRAIN_SKIRT_Y];
      const rowColors = [
        grass,
        grassDark,
        jittered.copy(dirtLight).multiplyScalar(jitter),
        dirtMid,
        dirtDark,
        deep,
      ];

      for (let r = 0; r < rows; r++) {
        const vi = (i * rows + r) * 3;
        positions[vi] = x;
        positions[vi + 1] = ys[r];
        positions[vi + 2] = 0;
        colors[vi] = rowColors[r].r;
        colors[vi + 1] = rowColors[r].g;
        colors[vi + 2] = rowColors[r].b;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    this.updateSurfaceLine();
    this.updateSpeckles();
  }

  // ─── Surface highlight: thin sunlit line tracing the terrain silhouette ───

  private surfaceLine!: THREE.Line;

  private createSurfaceLine(): THREE.Line {
    const cols = this.engine.terrain.cols;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cols * 3), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xc8f09a, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    return line;
  }

  private updateSurfaceLine(): void {
    if (!this.surfaceLine) return;
    const terrain = this.engine.terrain;
    const attr = this.surfaceLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < terrain.cols; i++) {
      arr[i * 3] = i * terrain.step;
      arr[i * 3 + 1] = terrain.surfaceY[i] + 0.6;
      arr[i * 3 + 2] = 1;
    }
    attr.needsUpdate = true;
  }

  // ─── Dirt speckles: scattered darker/lighter grains below the surface ───

  private static readonly SPECKLE_COUNT = 700;
  private specklePoints!: THREE.Points;

  private createSpeckles(): THREE.Points {
    const n = GameRenderer.SPECKLE_COUNT;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({
      size: 2.2, vertexColors: true, sizeAttenuation: false, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.specklePoints = points;
    this.retintSpeckles();
    return points;
  }

  /** Speckle grain colors follow the active theme's dirt shades */
  private retintSpeckles(): void {
    const attr = this.specklePoints.geometry.getAttribute("color") as THREE.BufferAttribute;
    const colors = attr.array as Float32Array;
    const shades = [
      new THREE.Color(this.theme.dirtDark),
      new THREE.Color(this.theme.dirtLight),
      new THREE.Color(this.theme.deep),
    ];
    for (let i = 0; i < GameRenderer.SPECKLE_COUNT; i++) {
      const c = shades[Math.floor(GameRenderer.colHash(i * 7 + 3) * shades.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    attr.needsUpdate = true;
  }

  /** Reposition speckles relative to the CURRENT surface (they sink with craters) */
  private updateSpeckles(): void {
    if (!this.specklePoints) return;
    const terrain = this.engine.terrain;
    const attr = this.specklePoints.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < GameRenderer.SPECKLE_COUNT; i++) {
      // Deterministic per-index x + depth so grains stay put between updates
      const x = GameRenderer.colHash(i * 13 + 1) * WORLD.WIDTH;
      const depth = 6 + GameRenderer.colHash(i * 29 + 5) ** 2 * 110;
      arr[i * 3] = x;
      arr[i * 3 + 1] = terrain.getSurfaceY(x) - depth;
      arr[i * 3 + 2] = 0.5;
    }
    attr.needsUpdate = true;
  }

  // ═════════════════════════════════════════════
  //  Tank models (§2.2 — simple extruded shapes)
  // ═════════════════════════════════════════════

  private createTankModel(playerIndex: 0 | 1): THREE.Group {
    const group = new THREE.Group();
    group.name = `tank_${playerIndex}`;
    const color = playerIndex === 0 ? 0x3b82f6 : 0xf43f5e;
    const topColor = playerIndex === 0 ? 0x6aa6f8 : 0xf7758b;
    const darkColor = playerIndex === 0 ? 0x1e4a94 : 0x93293c;

    // Track assembly
    const trackGeo = new THREE.BoxGeometry(WORLD.TANK_WIDTH + 6, 6.5, 13);
    const trackMat = new THREE.MeshLambertMaterial({ color: 0x1c212c });
    const tracks = new THREE.Mesh(trackGeo, trackMat);
    tracks.position.y = 3.25;
    group.add(tracks);

    // Road wheels along the track face
    const wheelGeo = new THREE.CylinderGeometry(2.4, 2.4, 13.6, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0e1118 });
    for (const wx of [-9, -3, 3, 9]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 3.1, 0);
      group.add(wheel);
    }

    // Mudguard lip over the tracks
    const guardGeo = new THREE.BoxGeometry(WORLD.TANK_WIDTH + 7, 1.4, 13.5);
    const guardMat = new THREE.MeshLambertMaterial({ color: darkColor });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.y = 6.9;
    group.add(guard);

    // Hull
    const bodyGeo = new THREE.BoxGeometry(WORLD.TANK_WIDTH, 6, 12);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.name = "body";
    body.position.y = 10.4;
    group.add(body);

    // Upper glacis — narrower, lighter two-tone accent
    const glacisGeo = new THREE.BoxGeometry(WORLD.TANK_WIDTH * 0.66, 3.2, 10);
    const glacisMat = new THREE.MeshLambertMaterial({ color: topColor });
    const glacis = new THREE.Mesh(glacisGeo, glacisMat);
    glacis.position.y = 14.6;
    group.add(glacis);

    // Turret dome + hatch
    const domeGeo = new THREE.SphereGeometry(6.2, 16, 12);
    const domeMat = new THREE.MeshLambertMaterial({ color });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.scale.y = 0.72;
    dome.position.y = TURRET_PIVOT_Y - 0.5;
    group.add(dome);

    const hatchGeo = new THREE.CylinderGeometry(2, 2.3, 1.4, 10);
    const hatch = new THREE.Mesh(hatchGeo, new THREE.MeshLambertMaterial({ color: topColor }));
    hatch.position.set(-1.5, TURRET_PIVOT_Y + 3.6, 0);
    group.add(hatch);

    // Barrel — child of group, positioned+rotated around the turret pivot.
    // Muzzle brake is a child of the barrel so it inherits the rotation.
    const barrelGeo = new THREE.BoxGeometry(WORLD.TURRET_LENGTH, 3, 4);
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x59616e });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.name = "barrel";
    barrel.position.set(WORLD.TURRET_LENGTH / 2, TURRET_PIVOT_Y, -0.5);
    group.add(barrel);

    const muzzleGeo = new THREE.BoxGeometry(3, 4.4, 4.6);
    const muzzle = new THREE.Mesh(muzzleGeo, new THREE.MeshLambertMaterial({ color: 0x39404c }));
    muzzle.position.set(WORLD.TURRET_LENGTH / 2 - 1.5, 0, 0);
    barrel.add(muzzle);

    // Active player halo — flat ring facing the camera (XY plane)
    const ringGeo = new THREE.RingGeometry(WORLD.TANK_WIDTH * 0.95, WORLD.TANK_WIDTH * 1.05, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = "active_ring";
    ring.position.set(0, 9, -2);
    group.add(ring);

    // Shield bubble — visible while the tank has shieldHp
    const shieldGeo = new THREE.RingGeometry(WORLD.TANK_WIDTH * 0.78, WORLD.TANK_WIDTH * 0.92, 40);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa, transparent: true, opacity: 0,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.name = "shield_ring";
    shield.position.set(0, 10, 3);
    group.add(shield);

    return group;
  }

  /** Per-tank smoothed display state (position lerp + hull tilt) */
  private tankView = [
    { x: Number.NaN, y: 0, tilt: 0 },
    { x: Number.NaN, y: 0, tilt: 0 },
  ];

  private updateTankModel(group: THREE.Group, tank: TankState, isActive: boolean, timeSec: number, dt: number): void {
    // Smooth movement: hops (Q/E) and knock-arcs glide instead of snapping.
    // Warp-scale jumps snap directly so the tank doesn't slide across the map.
    const view = this.tankView[tank.id];
    if (Number.isNaN(view.x) || Math.abs(tank.x - view.x) > 80) {
      view.x = tank.x;
      view.y = tank.y;
    }
    const k = 1 - Math.exp(-12 * dt);
    view.x += (tank.x - view.x) * k;
    view.y += (tank.y - view.y) * k;

    // Hull tilts to match the ground slope (clamped, eased)
    const slopeRad = (this.engine.terrain.getSlopeSignedDeg(tank.x) * Math.PI) / 180;
    const targetTilt = Math.max(-0.45, Math.min(0.45, slopeRad));
    view.tilt += (targetTilt - view.tilt) * k;

    group.position.set(view.x, view.y, 0);
    group.rotation.z = view.tilt;

    // Barrel keeps its WORLD aim angle (compensate for hull tilt) and kicks
    // back along its own axis while recoil decays.
    const angleRad = (tank.angleDeg * Math.PI) / 180;
    const localAngle = angleRad - view.tilt;
    const recoilOffset = tank.recoil * tank.recoil * 4.5;
    const barrel = group.getObjectByName("barrel") as THREE.Mesh;
    if (barrel) {
      const reach = WORLD.TURRET_LENGTH / 2 - recoilOffset;
      barrel.position.x = Math.cos(localAngle) * reach;
      barrel.position.y = TURRET_PIVOT_Y + Math.sin(localAngle) * reach;
      barrel.rotation.z = localAngle;
    }

    // Pulsing halo for the active tank
    const ring = group.getObjectByName("active_ring") as THREE.Mesh;
    if (ring) {
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = isActive ? 0.4 + 0.18 * Math.sin(timeSec * 5) : 0;
    }

    // Shield bubble while shieldHp remains
    const shield = group.getObjectByName("shield_ring") as THREE.Mesh;
    if (shield) {
      const mat = shield.material as THREE.MeshBasicMaterial;
      mat.opacity = tank.shieldHp > 0 ? 0.45 + 0.2 * Math.sin(timeSec * 7) : 0;
    }

    // Emissive glow when active
    const body = group.getObjectByName("body") as THREE.Mesh;
    if (body) {
      const mat = body.material as THREE.MeshLambertMaterial;
      mat.emissive.setHex(tank.id === 0 ? 0x3b82f6 : 0xf43f5e);
      mat.emissiveIntensity = isActive ? 0.35 : 0;
    }
  }

  // ═════════════════════════════════════════════
  //  Projectile rendering (weapon-colored, with particle trails)
  // ═════════════════════════════════════════════

  private updateProjectiles(projectiles: readonly ProjectileState[]): void {
    const activeIds = new Set<number>();

    for (const p of projectiles) {
      activeIds.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      const weaponColor = getWeapon(p.weaponId)?.color ?? "#ffaa44";
      if (!mesh) {
        const geo = new THREE.SphereGeometry(3.5, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: weaponColor });
        mesh = new THREE.Mesh(geo, mat);
        this.scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, 5);
      // Streak: stretch the shell along its velocity vector
      mesh.rotation.z = Math.atan2(p.vy, p.vx);
      mesh.scale.set(1.7, 0.65, 1);

      // Trail: one faint particle per frame at the projectile position
      this.spawnParticles(p.x, p.y, 1, new THREE.Color(weaponColor), 0, 8, 0.2, 0.35, 0);
    }

    // Remove dead projectiles
    for (const [id, mesh] of this.projectileMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.projectileMeshes.delete(id);
      }
    }
  }

  // ═════════════════════════════════════════════
  //  Pooled particle system (§2.2 — 4000 slots, reuse dead)
  // ═════════════════════════════════════════════

  private spawnParticles(
    x: number, y: number, count: number,
    color: THREE.Color, speedMin: number, speedMax: number,
    lifeMin: number, lifeMax: number, gravityScale = 1,
    upwardBias = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particleCount >= PARTICLES.POOL_SIZE) break;
      const idx = this.particleCount++;
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);

      this.particlePositions[idx * 3] = x;
      this.particlePositions[idx * 3 + 1] = y;
      this.particlePositions[idx * 3 + 2] = 6;

      this.particleVel[idx * 3] = Math.cos(angle) * speed;
      this.particleVel[idx * 3 + 1] = Math.sin(angle) * speed + upwardBias;
      // Pack per-particle gravity scale into the unused z-velocity slot
      this.particleVel[idx * 3 + 2] = gravityScale;

      const heat = Math.random();
      this.particleColors[idx * 3] = Math.min(1, color.r + heat * 0.35);
      this.particleColors[idx * 3 + 1] = Math.min(1, color.g + heat * 0.18);
      this.particleColors[idx * 3 + 2] = Math.min(1, color.b + heat * 0.1);

      this.particleLife[idx] = life;
      this.particleMaxLife[idx] = life;
    }
  }

  private updateParticles(dt: number, wind = 0): void {
    let writeIdx = 0;
    for (let i = 0; i < this.particleCount; i++) {
      this.particleLife[i] -= dt;
      if (this.particleLife[i] <= 0) continue; // dead slot — skip

      if (i !== writeIdx) {
        this.particlePositions[writeIdx * 3] = this.particlePositions[i * 3];
        this.particlePositions[writeIdx * 3 + 1] = this.particlePositions[i * 3 + 1];
        this.particlePositions[writeIdx * 3 + 2] = this.particlePositions[i * 3 + 2];
        this.particleVel[writeIdx * 3] = this.particleVel[i * 3];
        this.particleVel[writeIdx * 3 + 1] = this.particleVel[i * 3 + 1];
        this.particleVel[writeIdx * 3 + 2] = this.particleVel[i * 3 + 2];
        this.particleColors[writeIdx * 3] = this.particleColors[i * 3];
        this.particleColors[writeIdx * 3 + 1] = this.particleColors[i * 3 + 1];
        this.particleColors[writeIdx * 3 + 2] = this.particleColors[i * 3 + 2];
        this.particleLife[writeIdx] = this.particleLife[i];
        this.particleMaxLife[writeIdx] = this.particleMaxLife[i];
      }

      // Light wind drift on hot particles
      this.particleVel[writeIdx * 3] += wind * 0.3 * dt;
      this.particlePositions[writeIdx * 3] += this.particleVel[writeIdx * 3] * dt;
      this.particlePositions[writeIdx * 3 + 1] += this.particleVel[writeIdx * 3 + 1] * dt;

      // Gravity (scaled per particle — trails/flames float, debris falls)
      this.particleVel[writeIdx * 3 + 1] -= 300 * this.particleVel[writeIdx * 3 + 2] * dt;

      // Fade with remaining life
      const lifeRatio = Math.max(0, this.particleLife[writeIdx] / this.particleMaxLife[writeIdx]);
      const fade = 0.985 * (0.6 + 0.4 * lifeRatio);
      this.particleColors[writeIdx * 3] *= fade;
      this.particleColors[writeIdx * 3 + 1] *= fade;
      this.particleColors[writeIdx * 3 + 2] *= fade;

      writeIdx++;
    }
    this.particleCount = writeIdx;

    (this.particleGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    this.particleGeo.setDrawRange(0, this.particleCount);
  }

  // ═════════════════════════════════════════════
  //  Smoke & debris pool — NORMAL blending (additive particles can't be
  //  dark, so smoke plumes and dirt clods live in their own system)
  // ═════════════════════════════════════════════

  private static readonly SMOKE_POOL = 1200;
  private smokeGeo!: THREE.BufferGeometry;
  private smokePositions = new Float32Array(GameRenderer.SMOKE_POOL * 3);
  private smokeColors = new Float32Array(GameRenderer.SMOKE_POOL * 3);
  private smokeLife = new Float32Array(GameRenderer.SMOKE_POOL);
  private smokeMaxLife = new Float32Array(GameRenderer.SMOKE_POOL);
  private smokeVel = new Float32Array(GameRenderer.SMOKE_POOL * 3);
  private smokeCount = 0;
  private smokeMaterial!: THREE.PointsMaterial;

  private initSmokePool(): void {
    this.smokeGeo = new THREE.BufferGeometry();
    this.smokeGeo.setAttribute("position", new THREE.BufferAttribute(this.smokePositions, 3));
    this.smokeGeo.setAttribute("color", new THREE.BufferAttribute(this.smokeColors, 3));
    this.smokeGeo.setDrawRange(0, 0);
    this.smokeMaterial = new THREE.PointsMaterial({
      size: 6,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.NormalBlending,
      sizeAttenuation: false,
      depthWrite: false,
    });
    const points = new THREE.Points(this.smokeGeo, this.smokeMaterial);
    points.frustumCulled = false;
    this.scene.add(points);
  }

  private spawnSmoke(
    x: number, y: number, count: number,
    colorA: THREE.Color, colorB: THREE.Color,
    speedMin: number, speedMax: number,
    lifeMin: number, lifeMax: number,
    gravityScale: number, upwardBias = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.smokeCount >= GameRenderer.SMOKE_POOL) break;
      const idx = this.smokeCount++;
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);

      this.smokePositions[idx * 3] = x + (Math.random() - 0.5) * 6;
      this.smokePositions[idx * 3 + 1] = y + (Math.random() - 0.5) * 4;
      this.smokePositions[idx * 3 + 2] = 5.5;

      this.smokeVel[idx * 3] = Math.cos(angle) * speed;
      this.smokeVel[idx * 3 + 1] = Math.abs(Math.sin(angle)) * speed * 0.6 + upwardBias;
      this.smokeVel[idx * 3 + 2] = gravityScale;

      const t = Math.random();
      this.smokeColors[idx * 3] = colorA.r + (colorB.r - colorA.r) * t;
      this.smokeColors[idx * 3 + 1] = colorA.g + (colorB.g - colorA.g) * t;
      this.smokeColors[idx * 3 + 2] = colorA.b + (colorB.b - colorA.b) * t;

      this.smokeLife[idx] = life;
      this.smokeMaxLife[idx] = life;
    }
  }

  private updateSmoke(dt: number, wind: number): void {
    let writeIdx = 0;
    for (let i = 0; i < this.smokeCount; i++) {
      this.smokeLife[i] -= dt;
      if (this.smokeLife[i] <= 0) continue;

      if (i !== writeIdx) {
        for (let k = 0; k < 3; k++) {
          this.smokePositions[writeIdx * 3 + k] = this.smokePositions[i * 3 + k];
          this.smokeVel[writeIdx * 3 + k] = this.smokeVel[i * 3 + k];
          this.smokeColors[writeIdx * 3 + k] = this.smokeColors[i * 3 + k];
        }
        this.smokeLife[writeIdx] = this.smokeLife[i];
        this.smokeMaxLife[writeIdx] = this.smokeMaxLife[i];
      }

      // Smoke drifts with the wind much more than hot sparks do
      this.smokeVel[writeIdx * 3] += wind * 0.9 * dt;
      this.smokePositions[writeIdx * 3] += this.smokeVel[writeIdx * 3] * dt;
      this.smokePositions[writeIdx * 3 + 1] += this.smokeVel[writeIdx * 3 + 1] * dt;
      this.smokeVel[writeIdx * 3 + 1] -= 300 * this.smokeVel[writeIdx * 3 + 2] * dt;

      // Fade toward dark as the puff dies
      const lifeRatio = Math.max(0, this.smokeLife[writeIdx] / this.smokeMaxLife[writeIdx]);
      const fade = 0.9 + 0.1 * lifeRatio;
      this.smokeColors[writeIdx * 3] *= fade;
      this.smokeColors[writeIdx * 3 + 1] *= fade;
      this.smokeColors[writeIdx * 3 + 2] *= fade;

      writeIdx++;
    }
    this.smokeCount = writeIdx;

    (this.smokeGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.smokeGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    this.smokeGeo.setDrawRange(0, this.smokeCount);
  }

  // ═════════════════════════════════════════════
  //  Visual effects → particles + transient meshes
  // ═════════════════════════════════════════════

  private processedEffectIds = new Set<number>();

  private processVisualEffects(effects: readonly VisualEffect[]): void {
    for (const eff of effects) {
      if (this.processedEffectIds.has(eff.id)) continue;
      this.processedEffectIds.add(eff.id);

      const color = new THREE.Color(eff.color);
      switch (eff.type) {
        case "explosion": {
          // Hot sparks (additive) + white flash
          const count = Math.min(PARTICLES.MAX_PER_EXPLOSION, Math.floor(eff.radius * 0.8));
          this.spawnParticles(eff.x, eff.y, count, color, 60, 220, 0.35, 0.8, 1);
          this.spawnParticles(eff.x, eff.y, 10, new THREE.Color(0xffffff), 20, 90, 0.1, 0.25, 0.3);
          // Dirt clods thrown out of the crater (fall with gravity)
          this.spawnSmoke(eff.x, eff.y, Math.min(18, Math.floor(eff.radius * 0.3)),
            new THREE.Color(this.theme.dirtLight), new THREE.Color(this.theme.dirtDark),
            70, 230, 0.6, 1.3, 1.15, 60);
          // Rising smoke plume
          this.spawnSmoke(eff.x, eff.y + 4, 12,
            new THREE.Color(0x585862), new THREE.Color(0x33333c),
            8, 34, 1.1, 2.2, -0.05, 34);
          this.shakeTrauma = Math.min(1, this.shakeTrauma + eff.radius / 220);
          sfx.boom(eff.radius);
          break;
        }
        case "dust": {
          // Rolling earth dust (landslides, bounces) — opaque brown puffs
          this.spawnSmoke(eff.x, eff.y, 10,
            new THREE.Color(this.theme.dirtLight), new THREE.Color(this.theme.dirtMid),
            12, 55, 0.5, 1.0, -0.03, 26);
          sfx.thud();
          break;
        }
        case "fire": {
          this.spawnParticles(eff.x, eff.y, 24, color, 15, 60, 0.5, 1.1, -0.15, 30);
          break;
        }
        case "spark": {
          this.spawnParticles(eff.x, eff.y, 10, color, 80, 170, 0.15, 0.35, 0.6);
          sfx.pop();
          break;
        }
        case "beam": {
          // Sparks along the beam; the beam quad itself is drawn in updateBeams
          const x2 = eff.x2 ?? eff.x;
          const y2 = eff.y2 ?? eff.y;
          for (let s = 0; s <= 6; s++) {
            const t = s / 6;
            this.spawnParticles(
              eff.x + (x2 - eff.x) * t, eff.y + (y2 - eff.y) * t,
              2, color, 10, 50, 0.15, 0.35, 0.2,
            );
          }
          this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.15);
          sfx.zap();
          break;
        }
      }
    }

    // Clean up old effect IDs (prevent set from growing forever)
    if (this.processedEffectIds.size > 300) {
      this.processedEffectIds.clear();
      for (const eff of effects) this.processedEffectIds.add(eff.id);
    }
  }

  /** Beam quads: created on first sight of a beam effect, faded by age, removed when the effect expires */
  private updateBeams(effects: readonly VisualEffect[]): void {
    const activeIds = new Set<number>();

    for (const eff of effects) {
      if (eff.type !== "beam") continue;
      activeIds.add(eff.id);

      let mesh = this.beamMeshes.get(eff.id);
      if (!mesh) {
        const x2 = eff.x2 ?? eff.x;
        const y2 = eff.y2 ?? eff.y;
        const dx = x2 - eff.x;
        const dy = y2 - eff.y;
        const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const width = Math.max(3, eff.radius);

        const geo = new THREE.PlaneGeometry(len, width);
        const mat = new THREE.MeshBasicMaterial({
          color: eff.color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(eff.x + dx / 2, eff.y + dy / 2, 6);
        mesh.rotation.z = Math.atan2(dy, dx);
        this.scene.add(mesh);
        this.beamMeshes.set(eff.id, mesh);
      }

      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.max(0, 1 - eff.age / eff.maxAge);
    }

    for (const [id, mesh] of this.beamMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.beamMeshes.delete(id);
      }
    }
  }

  /** Expanding shockwave rings for explosions */
  private updateExplosionRings(effects: readonly VisualEffect[]): void {
    const activeIds = new Set<number>();

    for (const eff of effects) {
      if (eff.type !== "explosion") continue;
      activeIds.add(eff.id);

      let mesh = this.ringMeshes.get(eff.id);
      if (!mesh) {
        const geo = new THREE.RingGeometry(0.82, 1, 40);
        const mat = new THREE.MeshBasicMaterial({
          color: eff.color,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(eff.x, eff.y, 5);
        this.scene.add(mesh);
        this.ringMeshes.set(eff.id, mesh);
      }

      const t = Math.min(1, eff.age / Math.min(eff.maxAge, 0.45));
      const ease = 1 - (1 - t) * (1 - t); // ease-out
      const scale = Math.max(0.01, eff.radius * ease);
      mesh.scale.set(scale, scale, 1);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    }

    for (const [id, mesh] of this.ringMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.ringMeshes.delete(id);
      }
    }
  }

  /** Persistent zone effects (napalm fire, radiation) — ambient flame particles */
  private updateZoneParticles(zones: readonly ZoneEffect[], dt: number): void {
    for (const zone of zones) {
      // ~10 particles/sec per zone, spread across its radius
      if (Math.random() < dt * 10) {
        const ox = (Math.random() * 2 - 1) * zone.radius * 0.8;
        const surfaceY = this.engine.terrain.getSurfaceY(zone.x + ox);
        const color = new THREE.Color(zone.effect === "fire" ? "#ff6a1a" : "#9be31c");
        this.spawnParticles(zone.x + ox, surfaceY + 2, 2, color, 5, 25, 0.5, 1.0, -0.25, 35);
      }
    }
  }

  // ═════════════════════════════════════════════
  //  Trajectory preview (aim line — read from engine.aimReadout)
  // ═════════════════════════════════════════════

  private updateTrajectory(): void {
    const readout = this.engine.aimReadout;
    if (readout.trajectory.length < 2) {
      this.trajectoryLine.visible = false;
      return;
    }
    this.trajectoryLine.visible = true;
    const points = readout.trajectory.map((p) => new THREE.Vector3(p.x, p.y, 2));
    (this.trajectoryLine.geometry as THREE.BufferGeometry).setFromPoints(points);
    this.trajectoryLine.computeLineDistances();
  }

  // ═════════════════════════════════════════════
  //  Score popups (floating text — sprite-based)
  // ═════════════════════════════════════════════

  private popupSprites: Map<number, THREE.Sprite> = new Map();

  private updatePopups(popups: readonly ScorePopup[]): void {
    const activeIds = new Set<number>();

    for (const pop of popups) {
      activeIds.add(pop.id);
      let sprite = this.popupSprites.get(pop.id);
      if (!sprite) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 96;
        const ctx = canvas.getContext("2d")!;
        ctx.font = "bold 48px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.strokeText(pop.text, 128, 48);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, 128, 48);

        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        sprite = new THREE.Sprite(mat);
        sprite.scale.set(64, 24, 1);
        this.popupGroup.add(sprite);
        this.popupSprites.set(pop.id, sprite);
      }

      sprite.position.set(pop.x, pop.y, 10);
      const alpha = Math.max(0, 1 - pop.age / pop.maxAge);
      (sprite.material as THREE.SpriteMaterial).opacity = alpha;
    }

    for (const [id, sprite] of this.popupSprites) {
      if (!activeIds.has(id)) {
        this.popupGroup.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        (sprite.material as THREE.SpriteMaterial).dispose();
        this.popupSprites.delete(id);
      }
    }
  }

  // ═════════════════════════════════════════════
  //  Main render frame (called every rAF by the Game page)
  // ═════════════════════════════════════════════

  private lastFrameTime = 0;

  render(): void {
    const now = performance.now();
    const dt = this.lastFrameTime > 0 ? Math.min((now - this.lastFrameTime) / 1000, 0.1) : 0.016;
    this.lastFrameTime = now;
    const timeSec = now / 1000;

    // Read engine state directly (NO React)
    const tanks = this.engine.getTanks();
    const projectiles = this.engine.getProjectiles();
    const effects = this.engine.getVisualEffects();
    const popups = this.engine.getPopups();
    const zones = this.engine.getZones();
    const snapshot = this.engine.getSnapshot();
    const wind = snapshot.wind;

    // Theme follows the active battle mode (mode is picked in the draft)
    this.applyThemeIfChanged();

    // Update terrain mesh only when terrain was modified (dirty flag — §2.2)
    if (this.engine.terrain.dirty) {
      this.updateTerrainMesh();
      this.engine.terrain.dirty = false;
    }

    // Update tanks
    this.updateTankModel(this.tankGroups[0], tanks[0], snapshot.currentPlayer === 0 && snapshot.phase === "AIMING", timeSec, dt);
    this.updateTankModel(this.tankGroups[1], tanks[1], snapshot.currentPlayer === 1 && snapshot.phase === "AIMING", timeSec, dt);

    // Update projectiles (+trails)
    this.updateProjectiles(projectiles);

    // Effects (smoke/dust drift with the wind)
    this.processVisualEffects(effects);
    this.updateBeams(effects);
    this.updateExplosionRings(effects);
    this.updateZoneParticles(zones, dt);
    this.updateParticles(dt, wind);
    this.updateSmoke(dt, wind);
    this.updateClouds(dt, wind);

    // Aim preview + popups
    this.updateTrajectory();
    this.updatePopups(popups);

    // Screen shake (§2.2 — camera offset around the base position, trauma² decay)
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2);
    const shake = this.shakeTrauma * this.shakeTrauma;
    if (shake > 0.01) {
      this.camera.position.x = CAM_X + (Math.random() - 0.5) * shake * 18;
      this.camera.position.y = CAM_Y + (Math.random() - 0.5) * shake * 10;
    } else {
      this.camera.position.x = CAM_X;
      this.camera.position.y = CAM_Y;
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ═════════════════════════════════════════════
  //  Resize
  // ═════════════════════════════════════════════

  private handleResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.renderer.setSize(w, h);

    const { viewW, viewH } = this.computeView(w, h);
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    this.camera.updateProjectionMatrix();
  }

  // ═════════════════════════════════════════════
  //  Dispose (§Part 4 item 11 — prevent GPU leaks)
  // ═════════════════════════════════════════════

  dispose(): void {
    this.resizeObserver.disconnect();

    for (const [, mesh] of this.projectileMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.projectileMeshes.clear();

    for (const [, mesh] of this.beamMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.beamMeshes.clear();

    for (const [, mesh] of this.ringMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.ringMeshes.clear();

    for (const [, sprite] of this.popupSprites) {
      this.popupGroup.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      (sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.popupSprites.clear();

    this.terrainGeo.dispose();
    (this.terrainMesh.material as THREE.Material).dispose();

    this.surfaceLine.geometry.dispose();
    (this.surfaceLine.material as THREE.Material).dispose();

    this.specklePoints.geometry.dispose();
    (this.specklePoints.material as THREE.Material).dispose();

    this.skyMesh.geometry.dispose();
    (this.skyMesh.material as THREE.Material).dispose();

    this.starPoints.geometry.dispose();
    (this.starPoints.material as THREE.Material).dispose();

    this.particleGeo.dispose();
    this.particleMaterial.dispose();

    this.smokeGeo.dispose();
    this.smokeMaterial.dispose();

    for (const cloud of this.clouds) {
      (cloud.material as THREE.SpriteMaterial).map?.dispose();
      (cloud.material as THREE.SpriteMaterial).dispose();
    }
    this.clouds = [];

    this.celestialDisc.geometry.dispose();
    (this.celestialDisc.material as THREE.Material).dispose();
    this.celestialGlow.geometry.dispose();
    (this.celestialGlow.material as THREE.Material).dispose();

    (this.trajectoryLine.geometry as THREE.BufferGeometry).dispose();
    (this.trajectoryLine.material as THREE.Material).dispose();

    for (const group of this.tankGroups) {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
