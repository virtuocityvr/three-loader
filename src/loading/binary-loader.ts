// -------------------------------------------------------------------------------------------------
// Converted to Typescript and adapted from https://github.com/potree/potree
// -------------------------------------------------------------------------------------------------

import { Box3, BufferAttribute, BufferGeometry, Uint8BufferAttribute, Vector3 } from 'three';
import { PointAttributeName, PointAttributeType } from '../point-attributes';
import { PointCloudOctreeGeometryNode } from '../point-cloud-octree-geometry-node';
import { Version } from '../version';
import { XhrRequest } from './types';

interface AttributeData {
  attribute: {
    name: PointAttributeName;
    type: PointAttributeType;
    byteSize: number;
    numElements: number;
  };
  buffer: ArrayBuffer;
}

interface WorkerResponse {
  data: {
    attributeBuffers: { [name: string]: AttributeData };
    indices: ArrayBuffer;
    tightBoundingBox: { min: number[]; max: number[] };
    mean: number[];
  };
}

interface BinaryLoaderOptions {
  version: string;
  boundingBox: Box3;
  scale: number;
  xhrRequest: XhrRequest;
}

export class BinaryLoader {
  version: Version;
  boundingBox: Box3;
  scale: number;
  disposed: boolean = false;
  xhrRequest: XhrRequest;

  private workers: Worker[] = [];

  constructor({
    version,
    boundingBox,
    scale,
    xhrRequest
  }: BinaryLoaderOptions) {
    if (typeof version === 'string') {
      this.version = new Version(version);
    } else {
      this.version = version;
    }

    this.xhrRequest = xhrRequest;
    this.boundingBox = boundingBox;
    this.scale = scale;
  }

  dispose(): void {
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];

    this.disposed = true;
  }

  load(node: PointCloudOctreeGeometryNode): Promise<void> {
    if (node.loaded || this.disposed) {
      return Promise.resolve();
    }

    return Promise.resolve(this.getNodeUrl(node))
      .then(url => this.xhrRequest(url, { mode: 'cors' }))
      .then(res => res.arrayBuffer())
      .then(buffer => this.parse(node, buffer));
  }

  private getNodeUrl(node: PointCloudOctreeGeometryNode): string {
    let url = node.getUrl();
    if (this.version.equalOrHigher('1.4')) {
      url += '.bin';
    }

    return url;
  }

  private parse(node: PointCloudOctreeGeometryNode, buffer: ArrayBuffer): void {
    if (this.disposed) {
      return;
    }

    const worker = this.getWorker();

    const pointAttributes = node.pcoGeometry.pointAttributes;
    const numPoints = buffer.byteLength / pointAttributes.byteSize;

    if (this.version.upTo('1.5')) {
      node.numPoints = numPoints;
    }

    worker.onmessage = (e: WorkerResponse) => {
      if (this.disposed) {
        return;
      }

      const data = e.data;

      const geometry = (node.geometry = node.geometry || new BufferGeometry());
      geometry.boundingBox = node.boundingBox;

      this.addBufferAttributes(geometry, data.attributeBuffers);
      this.addIndices(geometry, data.indices);
      this.addNormalAttribute(geometry, numPoints);

      node.mean = new Vector3().fromArray(data.mean);
      node.tightBoundingBox = this.getTightBoundingBox(data.tightBoundingBox);
      node.loaded = true;
      node.loading = false;
      node.pcoGeometry.numNodesLoading--;
      node.pcoGeometry.needsUpdate = true;

      this.releaseWorker(worker);
    };

    const message = {
      buffer,
      pointAttributes,
      version: this.version.version,
      min: node.boundingBox.min.toArray(),
      offset: node.pcoGeometry.offset.toArray(),
      scale: this.scale,
      spacing: node.spacing,
      hasChildren: node.hasChildren,
    };

    worker.postMessage(message, [message.buffer]);
  }

  private getWorker(): Worker {
    let worker = this.workers.pop();
    if (worker) {
      return worker;
    }

    const ctor = require('../workers/binary-decoder-worker.js');
    return new ctor();
  }

  private releaseWorker(worker: Worker): void {
    this.workers.push(worker);
  }

  private getTightBoundingBox({ min, max }: { min: number[]; max: number[] }): Box3 {
    const box = new Box3(new Vector3().fromArray(min), new Vector3().fromArray(max));
    box.max.sub(box.min);
    box.min.set(0, 0, 0);

    return box;
  }

  private addBufferAttributes(
    geometry: BufferGeometry,
    buffers: { [name: string]: { buffer: ArrayBuffer } },
  ): void {
    Object.keys(buffers).forEach(property => {
      const buffer = buffers[property].buffer;

      if (this.isAttribute(property, PointAttributeName.POSITION_CARTESIAN)) {
        geometry.addAttribute('position', new BufferAttribute(new Float32Array(buffer), 3));
      } else if (this.isAttribute(property, PointAttributeName.COLOR_PACKED)) {
        geometry.addAttribute('color', new BufferAttribute(new Uint8Array(buffer), 3, true));
      } else if (this.isAttribute(property, PointAttributeName.INTENSITY)) {
        geometry.addAttribute('intensity', new BufferAttribute(new Float32Array(buffer), 1));
      } else if (this.isAttribute(property, PointAttributeName.CLASSIFICATION)) {
        geometry.addAttribute('classification', new BufferAttribute(new Uint8Array(buffer), 1));
      } else if (this.isAttribute(property, PointAttributeName.NORMAL_SPHEREMAPPED)) {
        geometry.addAttribute('normal', new BufferAttribute(new Float32Array(buffer), 3));
      } else if (this.isAttribute(property, PointAttributeName.NORMAL_OCT16)) {
        geometry.addAttribute('normal', new BufferAttribute(new Float32Array(buffer), 3));
      } else if (this.isAttribute(property, PointAttributeName.NORMAL)) {
        geometry.addAttribute('normal', new BufferAttribute(new Float32Array(buffer), 3));
      }
    });
  }

  private addIndices(geometry: BufferGeometry, indices: ArrayBuffer): void {
    const indicesAttribute = new Uint8BufferAttribute(indices, 4);
    indicesAttribute.normalized = true;
    geometry.addAttribute('indices', indicesAttribute);
  }

  private addNormalAttribute(geometry: BufferGeometry, numPoints: number): void {
    if (!geometry.getAttribute('normal')) {
      const buffer = new Float32Array(numPoints * 3);
      geometry.addAttribute('normal', new BufferAttribute(new Float32Array(buffer), 3));
    }
  }

  private isAttribute(property: string, name: PointAttributeName): boolean {
    return parseInt(property, 10) === name;
  }
}
