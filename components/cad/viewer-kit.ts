export type ViewerPart = {
  mesh: { vertices: number[]; triangles: number[]; normals?: number[] };
  color?: string | number;
};

export interface Viewer {
  setParts: (parts: ViewerPart[]) => void;
  dispose: () => void;
}

export interface ViewerOptions {
  /** Orbit / pan / zoom with the pointer. */
  interactive?: boolean;
  /** Slowly spin the model until the user interacts. */
  autoRotate?: boolean;
  /** Draw a soft contact shadow on the floor. */
  ground?: boolean;
}

const DEFAULT_COLOR = 0xe8804f;

/**
 * Shared three.js viewer for replicad meshes: PBR materials lit by an image-based
 * environment, tone mapping, crisp face normals, edge lines, contact shadow and
 * OrbitControls. Replicad is Z-up, so parts are rotated into three's Y-up space.
 */
export async function createViewer(canvas: HTMLCanvasElement, { interactive = true, autoRotate = false, ground = true }: ViewerOptions = {}): Promise<Viewer> {
  const [THREE, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
  ]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = ground;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.position.set(1, 0.8, 1.2).multiplyScalar(60);

  // Warm key (casts shadows), cool fill, warm rim, soft sky/ground bounce.
  const key = new THREE.DirectionalLight(0xfff1e6, 2.6);
  key.castShadow = ground;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight(0xaac4ff, 0.7);
  const rim = new THREE.DirectionalLight(0xff9a70, 1.4);
  const hemi = new THREE.HemisphereLight(0xfff4ec, 0x2a2622, 0.5);
  scene.add(key, key.target, fill, rim, hemi);

  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2; // Z-up (replicad) -> Y-up (three)
  const pivot = new THREE.Group();
  pivot.add(group);
  scene.add(pivot);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.visible = false;
  if (ground) scene.add(floor);

  const controls = new OrbitControls(camera, canvas);
  controls.enabled = interactive;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 1.2;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  if (!interactive) canvas.style.pointerEvents = 'none';

  // Keep spinning after the user lets go of the model.
  let resumeTimer = 0;
  const pause = () => {
    if (!autoRotate) return;
    controls.autoRotate = false;
    window.clearTimeout(resumeTimer);
  };
  const resume = () => {
    if (!autoRotate) return;
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => (controls.autoRotate = true), 2500);
  };
  controls.addEventListener('start', pause);
  controls.addEventListener('end', resume);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const clearParts = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      const disposable = child as import('three').Mesh;
      disposable.geometry?.dispose();
      const material = disposable.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    }
  };

  const fit = () => {
    group.updateMatrixWorld(true);
    pivot.position.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1e-3);

    // Centre horizontally and sit the model on the floor at y = 0.
    pivot.position.set(-center.x, -box.min.y, -center.z);
    const target = new THREE.Vector3(0, (box.max.y - box.min.y) / 2, 0);

    // Keep the current viewing direction, only re-frame the distance.
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(1, 0.8, 1.2);
    direction.normalize();
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const distance = (radius / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect)) / 2)) * 1.05;
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.near = distance / 100;
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.minDistance = radius * 0.6;
    controls.maxDistance = distance * 4;
    controls.update();

    key.position.set(radius * 1.6, radius * 2.6, radius * 1.4).add(target);
    key.target.position.copy(target);
    fill.position.set(-radius * 2, radius, radius * 1.2).add(target);
    rim.position.set(-radius * 1.2, radius * 1.4, -radius * 2).add(target);
    const s = radius * 1.6;
    Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: radius * 0.2, far: radius * 8 });
    key.shadow.camera.updateProjectionMatrix();

    floor.visible = ground;
    floor.scale.setScalar(radius * 6);
    floor.position.set(0, -0.001 * radius, 0);
  };

  const setParts = (parts: ViewerPart[]) => {
    clearParts();
    for (const part of parts) {
      const { vertices, triangles, normals } = part.mesh;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(triangles);
      // Replicad's per-face normals keep flat faces flat; fall back if missing.
      if (normals && normals.length === vertices.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      else geometry.computeVertexNormals();

      const material = new THREE.MeshPhysicalMaterial({
        color: part.color ?? DEFAULT_COLOR,
        roughness: 0.38,
        metalness: 0.3,
        clearcoat: 0.35,
        clearcoatRoughness: 0.35,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = ground;
      mesh.receiveShadow = ground;
      group.add(mesh);

      group.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 35),
          new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
        ),
      );
    }
    if (parts.length > 0) fit();
    else floor.visible = false;
  };

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  return {
    setParts,
    dispose: () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resumeTimer);
      observer.disconnect();
      controls.dispose();
      clearParts();
      floor.geometry.dispose();
      (floor.material as import('three').Material).dispose();
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
