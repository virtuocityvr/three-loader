import { Vector3, Group, OrthographicCamera, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { PointColorType, PointSizeType, PointCloudOctree, Potree, PointCloudMaterial } from '../src';

// tslint:disable-next-line:no-duplicate-imports
import * as THREE from 'three';
const OrbitControls = require('three-orbit-controls')(THREE);

export class Viewer {
  /**
   * The element where we will insert our canvas.
   */
  private topViewEl: HTMLElement | undefined;
  private perspectiveViewEl: HTMLElement | undefined;
  /**
   * The ThreeJS renderer used to render the scene.
   */
  private renderer1 = new WebGLRenderer();
  private renderer2 = new WebGLRenderer();
  private renderer3: WebGLRenderer | undefined;

  private materialOpaque = new PointCloudMaterial();
  private materialTransparent = new PointCloudMaterial();
  /**
   * Our scene which will contain the point cloud.
   */
  scene: Scene = new Scene();
  /**
   * The camera used to view the scene.
   */
  camera: PerspectiveCamera = new PerspectiveCamera(45, NaN, 0.1, 1000);
  orthoCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100_000);
  childWindowCamera: PerspectiveCamera | undefined;
  /**
   * Controls which update the position of the camera.
   */
  cameraControls!: THREE.OrbitControls;
  orthoCameraControls!: THREE.OrbitControls;
  /**
   * Out potree instance which handles updating point clouds, keeps track of loaded nodes, etc.
   */
  private potree = new Potree();
  /**
   * Array of point clouds which are in the scene and need to be updated.
   */
  private pointClouds: PointCloudOctree[] = [];
  private pointCloudGroups: Group[] = [];
  /**
   * The time (milliseconds) when `loop()` was last called.
   */
  private prevTime: number | undefined;
  /**
   * requestAnimationFrame handle we can use to cancel the viewer loop.
   */
  private reqAnimationFrameHandle: number | undefined;

  /**
   * Initializes the viewer into the specified element.
   *
   *    The element into which we should add the canvas where we will render the scene.
   */
  initialize(topViewEl: HTMLElement, perspectiveViewEl: HTMLElement): void {
    if (this.topViewEl || !topViewEl) {
      return;
    }

    this.topViewEl = topViewEl;
    this.perspectiveViewEl = perspectiveViewEl;
    topViewEl.appendChild(this.renderer1.domElement);
    perspectiveViewEl.appendChild(this.renderer2.domElement);

    this.orthoCamera.position.set(0, 20, 0);
    this.orthoCamera.lookAt(0, 0, 0);

    this.orthoCameraControls = new OrbitControls(this.orthoCamera, this.topViewEl);
    this.orthoCameraControls.rotateSpeed = 0;

    this.camera.position.set(-3, 0, 6);
    this.camera.lookAt(new Vector3());
    this.cameraControls = new OrbitControls(this.camera, this.perspectiveViewEl);

    this.materialOpaque.size = 0.1;
    this.materialOpaque.pointColorType = PointColorType.RGB;
    // adaptive point size doesn't work because of a bug with LOD when rendering multiple times during a frame
    this.materialOpaque.pointSizeType = PointSizeType.ATTENUATED;

    this.materialTransparent.size = 0.1;
    this.materialTransparent.opacity = 0.1;
    this.materialTransparent.pointColorType = PointColorType.HEIGHT;
    this.materialTransparent.pointSizeType = PointSizeType.FIXED;

    this.resize();
    window.addEventListener('resize', this.resize);

    requestAnimationFrame(this.loop);
  }

    addWindowRenderer(childWindow: Window) {
      this.renderer3 = new WebGLRenderer();
      this.childWindowCamera = new PerspectiveCamera(45, 2, 0.1, 1000);
      childWindow.document.body.appendChild(this.renderer3.domElement);

      const resizeChildWindow = () => {
        console.log("resize child window");
        const width = childWindow.innerWidth;
        const height = childWindow.innerHeight;
        const aspect = width / height;
        this.childWindowCamera!.aspect = aspect;
        this.childWindowCamera!.updateProjectionMatrix();
        this.renderer3!.setSize(width, height);
      };
      childWindow.addEventListener('resize', resizeChildWindow);
      resizeChildWindow();
    }

  /**
   * Performs any cleanup necessary to destroy/remove the viewer from the page.
   */
  destroy(): void {
    if (this.topViewEl) {
      this.topViewEl.removeChild(this.renderer1.domElement);
      this.topViewEl = undefined;
    }

    if (this.perspectiveViewEl) {
      this.perspectiveViewEl.removeChild(this.renderer2.domElement);
      this.perspectiveViewEl = undefined;
    }

    window.removeEventListener('resize', this.resize);

    // TODO: clean point clouds or other objects added to the scene.

    if (this.reqAnimationFrameHandle !== undefined) {
      cancelAnimationFrame(this.reqAnimationFrameHandle);
    }
  }

  /**
   * Loads a point cloud into the viewer and returns it.
   *
   * @param fileName
   *    The name of the point cloud which is to be loaded.
   * @param baseUrl
   *    The url where the point cloud is located and from where we should load the octree nodes.
   */
  load(fileName: string, baseUrl: string): Promise<PointCloudOctree> {
    return this.potree.loadPointCloud(
      // The file name of the point cloud which is to be loaded.
      fileName,
      // Given the relative URL of a file, should return a full URL.
      url => `${baseUrl}${url}`,
    ).then(pco => {
      //this.materialTransparent.elevationRange = pco.material.elevationRange;
      const range: [number, number] = [-2, 1.2];
      this.materialTransparent.elevationRange = range;
      this.materialOpaque.elevationRange = range;
      return pco;
    });
  }

  add(pco: PointCloudOctree, group: Group): void {
    this.scene.add(group);
    this.pointCloudGroups.push(group);
    this.pointClouds.push(pco);
  }

  unload(): void {
    for (const group of this.pointCloudGroups) {
        this.scene.remove(group);
    }

    this.pointClouds.forEach(pco => {
      pco.dispose();
    });
    this.pointClouds = [];
  }

  /**
   * Updates the point clouds, cameras or any other objects which are in the scene.
   *
   * @param dt
   *    The time, in milliseconds, since the last update.
   */
  update(_: number, camera: PerspectiveCamera | OrthographicCamera, renderer: WebGLRenderer): void {
    // This is where most of the potree magic happens. It updates the
    // visiblily of the octree nodes based on the camera frustum and it
    // triggers any loads/unloads which are necessary to keep the number
    // of visible points in check.
    this.potree.updatePointClouds(this.pointClouds, camera, renderer);
  }

  /**
   * Renders the scene into the canvas.
   */
  render1(): void {
    this.renderer1.clear();
    this.renderer1.render(this.scene, this.orthoCamera);
  }

  render2(): void {
    this.renderer2.clear();
    this.renderer2.render(this.scene, this.camera);
  }

  render3(): void {
    if (this.renderer3) {
      this.renderer3.clear();
      this.childWindowCamera!.position.copy(this.camera.position);
      this.childWindowCamera!.rotation.copy(this.camera.rotation);
      this.renderer3.render(this.scene, this.childWindowCamera!);
    }
  }

  updateMaterial(material: PointCloudMaterial): void {//opacity: number, colorType: PointColorType): void {
    for (const pc of this.pointClouds) {
      pc.material = material;
    }
  }

  /**
   * The main loop of the viewer, called at 60FPS, if possible.
   */
  loop = (time: number): void => {
    this.reqAnimationFrameHandle = requestAnimationFrame(this.loop);

    const prevTime = this.prevTime;
    this.prevTime = time;
    if (prevTime === undefined) {
      return;
    }

    // Alternatively, you could use Three's OrbitControls or any other
    // camera control system.
    this.cameraControls.update();

    this.updateMaterial(this.materialTransparent);
    this.update(time - prevTime, this.orthoCamera, this.renderer1);
    this.render1();

    this.updateMaterial(this.materialOpaque);
    this.update(time - prevTime, this.camera, this.renderer2);
    this.render2();

    this.render3();
  };

  /**
   * Triggered anytime the window gets resized.
   */
  resize = () => {
    if (!this.topViewEl) {
      return;
    }

    const { width, height } = this.topViewEl.getBoundingClientRect();
    this.renderer1.setSize(width, height);
    let aspect1 = width / height;

    let distanceToZero = this.orthoCamera.position.length();
    this.orthoCamera.left = -distanceToZero;
    this.orthoCamera.right = distanceToZero;
    this.orthoCamera.top = distanceToZero * 1 / aspect1;
    this.orthoCamera.bottom = -distanceToZero * 1/ aspect1;
    this.orthoCamera.updateProjectionMatrix();



    const rect = this.topViewEl.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();

    this.renderer2.setSize(rect.width, rect.height);
  };
}
