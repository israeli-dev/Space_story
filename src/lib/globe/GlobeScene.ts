import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BodyConfig } from '../types';
import { latLonToVector3, vector3ToLatLon } from '../geo';

const DEG = Math.PI / 180;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Texture paths in `data/taxonomy.json` are written root-relative
 * ("/textures/moon.jpg"). Prefixing the deploy base lets the same build run at
 * a domain root *or* under a sub-path such as GitHub Pages on /<repo>/.
 */
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

function resolveAssetUrl(url: string) {
  if (/^(?:[a-z]+:)?\/\//i.test(url)) return url;
  return url.startsWith('/') ? `${BASE_URL}${url}` : url;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
  /** cosine between the surface normal and the camera direction */
  facing: number;
  /** 0 at the limb → 1 at the point nearest the camera */
  depth: number;
}

interface Flight {
  fromLat: number;
  fromLon: number;
  fromDist: number;
  toLat: number;
  toLon: number;
  toDist: number;
  elapsed: number;
  duration: number;
  resolve: () => void;
}

type TextureKey = 'map' | 'bump' | 'normal' | 'clouds';

/**
 * A single three.js scene that can display any planetary body in the dataset.
 *
 * The planet itself never rotates: the camera orbits it, exactly like Radio
 * Garden, so surface coordinates always stay aligned with the texture.
 */
export class GlobeScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private container: HTMLElement;
  private planet = new THREE.Group();
  private surface: THREE.Mesh;
  private clouds: THREE.Mesh | null = null;
  private atmosphere: THREE.Mesh;
  private stars: THREE.Points;
  private sun: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private textureLoader = new THREE.TextureLoader();
  private textureCache = new Map<string, THREE.Texture>();
  private material: THREE.MeshStandardMaterial;
  private cloudMaterial: THREE.MeshStandardMaterial | null = null;
  private atmosphereMaterial: THREE.ShaderMaterial;

  private raf = 0;
  private clock = new THREE.Clock();
  private flight: Flight | null = null;
  private observer: ResizeObserver | null = null;
  private disposed = false;
  private idleTimer: number | null = null;
  private reducedMotion = false;
  private autoRotateAllowed = true;
  private currentBody: BodyConfig | null = null;
  private loadToken = 0;
  private camDir = new THREE.Vector3();
  private lightDir = new THREE.Vector3();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.container = container;
    const { clientWidth: width, clientHeight: height } = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(Math.max(width, 1), Math.max(height, 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(36, Math.max(width, 1) / Math.max(height, 1), 0.05, 200);
    this.camera.position.set(0.6, 0.9, 2.7);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.65;
    this.controls.minDistance = 1.28;
    this.controls.maxDistance = 7.5;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.16;
    this.controls.target.set(0, 0, 0);

    this.scene.add(this.planet);

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.02,
    });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), this.material);
    this.surface.rotation.y = 0;
    this.planet.add(this.surface);

    this.atmosphereMaterial = this.createAtmosphereMaterial('#5aa9ff', 1);
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.055, 64, 48), this.atmosphereMaterial);
    this.atmosphere.visible = true;
    this.scene.add(this.atmosphere);

    this.stars = this.createStarfield();
    this.scene.add(this.stars);

    this.sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
    this.sun.position.set(4.2, 2.4, 3.4);
    this.scene.add(this.sun);

    this.ambient = new THREE.HemisphereLight(0x8fb6e6, 0x0a0f18, 0.85);
    this.scene.add(this.ambient);

    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (this.reducedMotion) {
      this.controls.autoRotate = false;
      this.autoRotateAllowed = false;
    }

    this.bindEvents();
    this.animate();
  }

  // ---------- public API -----------------------------------------------------

  /** Swaps the body, preloading the texture set and cross-fading the surface. */
  async setBody(body: BodyConfig, opts: { resetCamera?: boolean } = {}) {
    this.currentBody = body;
    const token = ++this.loadToken;
    this.atmosphereMaterial.uniforms.uColor.value = new THREE.Color(body.atmosphere);
    this.atmosphereMaterial.uniforms.uStrength.value = body.atmosphereStrength;
    this.atmosphere.visible = body.atmosphereStrength > 0.25;

    if (this.clouds) {
      this.planet.remove(this.clouds);
      this.clouds.geometry.dispose();
      this.clouds = null;
    }

    let map: THREE.Texture | null = null;
    try {
      map = await this.loadTexture(body.textures.map, 'map');
    } catch {
      map = this.fallbackTexture(body);
    }
    if (token !== this.loadToken || this.disposed) return;

    this.material.map = map;
    this.material.color.set(0xffffff);
    this.material.needsUpdate = true;

    const bump = body.textures.bump ? await this.loadTexture(body.textures.bump, 'bump').catch(() => null) : null;
    if (token !== this.loadToken || this.disposed) return;
    this.material.bumpMap = bump;
    this.material.bumpScale = body.id === 'earth' ? 0.014 : body.id === 'moon' ? 0.02 : 0.018;

    const normal = body.textures.normal
      ? await this.loadTexture(body.textures.normal, 'normal').catch(() => null)
      : null;
    if (token !== this.loadToken || this.disposed) return;
    this.material.normalMap = normal;
    if (normal) this.material.normalScale.set(0.55, 0.55);
    this.material.roughness = body.id === 'earth' ? 0.84 : body.id === 'moon' ? 0.96 : 0.9;
    this.material.metalness = 0.02;

    if (body.textures.clouds) {
      const cloudTexture = await this.loadTexture(body.textures.clouds, 'clouds').catch(() => null);
      if (token !== this.loadToken || this.disposed) return;
      if (cloudTexture) {
        this.cloudMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          alphaMap: cloudTexture,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
          roughness: 1,
          metalness: 0,
        });
        this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64), this.cloudMaterial);
        this.clouds.rotation.y = 0.1;
        this.planet.add(this.clouds);
      }
    }

    this.material.needsUpdate = true;

    if (opts.resetCamera !== false) {
      this.setCameraHome();
    }
  }

  setCameraHome() {
    this.flight = null;
    this.controls.enabled = true;
    this.camera.position.set(0.35, 0.75, 2.45).normalize().multiplyScalar(2.55);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  /** Smooth great-circle (lat/lon) flight to a coordinate. */
  flyTo(lat: number, lon: number, distance = 1.9, duration = 1150): Promise<void> {
    const { lat: fromLat, lon: fromLon } = vector3ToLatLon(this.camera.position);
    const fromDist = this.camera.position.length();
    // shortest longitude path
    let toLon = lon;
    const diff = ((toLon - fromLon + 540) % 360) - 180;
    toLon = fromLon + diff;

    return new Promise((resolve) => {
      this.flight = {
        fromLat,
        fromLon,
        fromDist,
        toLat: lat,
        toLon,
        toDist: distance,
        elapsed: 0,
        duration: this.reducedMotion ? 1 : duration,
        resolve,
      };
    });
  }

  projectVector(v: THREE.Vector3): ProjectedPoint {
    const dist = this.camera.position.length();
    this.camDir.copy(this.camera.position).normalize();
    const facing = this.tmpA.copy(v).normalize().dot(this.camDir);
    const limb = 1 / dist;
    const visible = facing > limb - 0.012;
    // 0 at the limb, 1 at the sub-camera point — used to fade markers into the horizon
    const depth = Math.max(0, Math.min(1, (facing - limb) / Math.max(0.001, 1 - limb)));
    const ndc = this.tmpB.copy(v).project(this.camera);
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    return {
      x: ((ndc.x + 1) / 2) * width,
      y: ((1 - ndc.y) / 2) * height,
      visible: visible && ndc.z < 1,
      facing,
      depth,
    };
  }

  project(lat: number, lon: number, radius = 1): ProjectedPoint {
    const v = latLonToVector3(lat, lon, radius);
    return this.projectVector(v);
  }

  cameraDistance() {
    return this.camera.position.length();
  }

  /** Screen-space angular size helper for markers near the limb. */
  getViewport() {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  setAutoRotate(allowed: boolean) {
    this.autoRotateAllowed = allowed && !this.reducedMotion;
    this.controls.autoRotate = this.autoRotateAllowed;
  }

  resetIdleTimer() {
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    if (!this.autoRotateAllowed) return;
    this.controls.autoRotate = false;
    this.idleTimer = window.setTimeout(() => {
      if (this.autoRotateAllowed && !this.flight) this.controls.autoRotate = true;
    }, 14000);
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.observer?.disconnect();
    this.controls.dispose();
    this.textureCache.forEach((t) => t.dispose());
    this.textureCache.clear();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mat = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // ---------- internals ------------------------------------------------------

  private bindEvents() {
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.container);

    const wake = () => {
      this.controls.autoRotate = false;
      this.resetIdleTimer();
    };
    this.renderer.domElement.addEventListener('pointerdown', wake, { passive: true });
    this.renderer.domElement.addEventListener('wheel', wake, { passive: true });
    this.renderer.domElement.addEventListener('touchstart', wake, { passive: true });
    this.resetIdleTimer();
  }

  private animate = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.flight) {
      this.controls.enabled = false;
      this.controls.autoRotate = false;
      const f = this.flight;
      f.elapsed += dt * 1000;
      const t = Math.min(1, f.elapsed / f.duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const lat = f.fromLat + (f.toLat - f.fromLat) * eased;
      const lon = f.fromLon + (f.toLon - f.fromLon) * eased;
      const dist = f.fromDist + (f.toDist - f.fromDist) * eased;
      latLonToVector3(lat, lon, dist, this.camera.position);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, 0, 0);
      if (t >= 1) {
        const resolve = f.resolve;
        this.flight = null;
        this.controls.enabled = true;
        this.controls.update();
        resolve();
        this.resetIdleTimer();
      }
    } else {
      this.controls.update();
    }

    // very slow cloud drift
    if (this.clouds) this.clouds.rotation.y += dt * 0.004;

    // subtle parallax of the starfield keeps the scene feeling three-dimensional
    this.stars.rotation.y += dt * 0.0025;
    this.stars.rotation.x = Math.sin(this.clock.elapsedTime * 0.02) * 0.01;

    // The key light travels with the camera (offset to one side) so whichever
    // hemisphere you turn to is readable, while the offset keeps a soft terminator.
    this.camDir.copy(this.camera.position).normalize();
    this.lightDir.copy(this.camDir).applyAxisAngle(WORLD_UP, -0.55);
    this.lightDir.y += 0.45;
    this.sun.position.copy(this.lightDir.normalize().multiplyScalar(9));

    this.renderer.render(this.scene, this.camera);
  };

  private loadTexture(rawUrl: string, _key: TextureKey): Promise<THREE.Texture> {
    const url = resolveAssetUrl(rawUrl);
    const cached = this.textureCache.get(url);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          this.textureCache.set(url, texture);
          resolve(texture);
        },
        undefined,
        () => reject(new Error(`Texture failed: ${url}`)),
      );
    });
  }

  /** If a texture is unavailable the globe still renders — with a subtle
   *  procedural surface rather than a broken material. */
  private fallbackTexture(body: BodyConfig): THREE.Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, body.id === 'earth' ? '#22384d' : '#3b3b3b');
    gradient.addColorStop(0.5, body.id === 'earth' ? '#2f4a5c' : '#4a4a4a');
    gradient.addColorStop(1, body.id === 'earth' ? '#20303d' : '#333333');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createAtmosphereMaterial(color: string, strength: number) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uStrength: { value: strength },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uStrength;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = 1.0 - abs(dot(vNormal, vView));
          float glow = pow(rim, 3.1) * 0.9 + pow(rim, 8.0) * 0.5;
          gl_FragColor = vec4(uColor, 1.0) * glow * uStrength;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  }

  private createStarfield() {
    const count = 2600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      // slightly clustered towards a galactic band
      const band = Math.random() < 0.45;
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = 42 + Math.random() * 18;
      const phi = Math.acos(band ? u * 0.22 + (Math.random() - 0.5) * 0.06 : u);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const temp = Math.random();
      color.setHSL(temp > 0.75 ? 0.09 : temp > 0.5 ? 0.58 : 0.62, 0.35, 0.72 + Math.random() * 0.24);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 1.35,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    return new THREE.Points(geometry, material);
  }
}

export function markerVectors(sites: { lat: number; lon: number }[], radius = 1.002) {
  return sites.map((s) => latLonToVector3(s.lat, s.lon, radius));
}

export const DEGREES = DEG;
