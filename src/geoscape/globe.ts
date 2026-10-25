import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from "three";
import { LatLon, latLonToVector } from "./geo";

const globeVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vN = normalize(position);
    vView = normalize(cameraPosition - position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const globeFragment = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D overlay;
  uniform vec3 sun;
  uniform vec3 borderColor;
  uniform float borderOpacity;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec3 base = texture2D(map, vUv).rgb;
    vec4 over = texture2D(overlay, vUv);
    float d = dot(vN, normalize(sun));
    // A fairly hard terminator: night is properly dark, lit only by cities.
    float day = smoothstep(-0.03, 0.07, d);
    vec3 lit = base * (0.72 + 0.45 * max(d, 0.0));
    vec3 night = base * 0.17 + vec3(0.0, 0.008, 0.03);
    night += over.r * vec3(1.0, 0.76, 0.42) * 0.95;
    vec3 col = mix(night, lit, day);
    // Thin amber band along the terminator.
    col += vec3(0.95, 0.55, 0.15) * 0.12 * (1.0 - smoothstep(0.0, 0.035, abs(d - 0.02)));
    // Bloc borders stay readable on the night side.
    col = mix(col, borderColor * mix(0.55, 1.0, day), over.g * borderOpacity);
    // Rim light toward the limb.
    float rim = pow(1.0 - max(dot(vN, normalize(vView)), 0.0), 3.0);
    col += vec3(0.25, 0.55, 0.75) * rim * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }`;

const atmoVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vN = normalize(normalMatrix * normal);
    vP = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * vec4(vP, 1.0);
  }`;

// Rendered on the back faces: brightest at the planet's limb, fading to nothing at the outer edge.
const atmoFragment = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    float t = -dot(normalize(vN), normalize(-vP));
    float f = pow(smoothstep(0.0, 0.3, t), 2.2) * 0.55;
    gl_FragColor = vec4(0.35, 0.7, 0.95, 1.0) * f;
  }`;

/** The Earth, its atmosphere, a starfield and the base-site marker. */
export class Globe {
  readonly surface: Mesh;
  readonly sunDirection = new Vector3(1, 0, 0);
  private readonly marker = new Group();
  private readonly pulse: Mesh<RingGeometry, MeshBasicMaterial>;

  private readonly uniforms;

  constructor(scene: Scene, map: Texture, overlay: Texture, markerColor: Color, borderColor: Color) {
    this.uniforms = {
      map: { value: map },
      overlay: { value: overlay },
      sun: { value: this.sunDirection },
      borderColor: { value: borderColor },
      borderOpacity: { value: 0 },
    };
    this.surface = new Mesh(
      new SphereGeometry(1, 128, 96),
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: globeVertex,
        fragmentShader: globeFragment,
      })
    );
    scene.add(this.surface);

    scene.add(
      new Mesh(
        new SphereGeometry(1.05, 96, 64),
        new ShaderMaterial({
          side: BackSide,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          vertexShader: atmoVertex,
          fragmentShader: atmoFragment,
        })
      )
    );

    scene.add(makeStars(2200));

    const mat = () => new MeshBasicMaterial({ color: markerColor, transparent: true, side: DoubleSide, depthWrite: false });
    this.pulse = new Mesh(new RingGeometry(0.03, 0.033, 40), mat());
    this.marker.add(
      new Mesh(new RingGeometry(0.018, 0.024, 40), mat()),
      this.pulse,
      new Mesh(new CircleGeometry(0.008, 20), mat())
    );
    this.marker.visible = false;
    scene.add(this.marker);
  }

  setSun(subsolar: LatLon): void {
    latLonToVector(subsolar.lat, subsolar.lon, 1, this.sunDirection);
  }

  placeMarker(site: LatLon): void {
    const p = latLonToVector(site.lat, site.lon, 1.002);
    this.marker.position.copy(p);
    this.marker.lookAt(p.clone().multiplyScalar(2));
    this.marker.visible = true;
  }

  /** Bloc borders fade in as the camera zooms in. */
  setBorderOpacity(opacity: number): void {
    this.uniforms.borderOpacity.value = opacity;
  }

  /** Animates the marker pulse; scales it with camera distance so it stays a readable size. */
  update(nowMs: number, cameraDistance: number): void {
    if (!this.marker.visible) return;
    const p = (nowMs / 1400) % 1;
    this.pulse.scale.setScalar(1 + p * 1.6);
    this.pulse.material.opacity = 1 - p;
    this.marker.scale.setScalar(Math.min(1.2, Math.max(0.3, (cameraDistance - 1) / 2.2)));
  }
}

function makeStars(count: number): Points {
  const pos = new Float32Array(count * 3);
  const v = new Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(40 + Math.random() * 20);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  return new Points(geo, new PointsMaterial({ color: 0x9fb6c8, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
}
