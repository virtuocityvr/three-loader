// -------------------------------------------------------------------------------------------------
// Converted to Typescript and adapted from https://github.com/potree/potree
// -------------------------------------------------------------------------------------------------

import { Box3, BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { PointCloudOctreeGeometryNode } from '../point-cloud-octree-geometry-node';
import { LASDecoder, LASFile } from './laslaz';
import { Version } from '../version';
import { XhrRequest } from './types';

/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *  https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 *
 */

interface LASLAZLoaderOptions {
  version: string;
  extension: string;
  xhrRequest: XhrRequest;
}

interface LASData {
  buffer: ArrayBuffer;
  count: number;
  hasMoreData: boolean;
}

export class LasLazLoader {
  version: Version;
  extension: string;
  disposed: boolean = false;
  xhrRequest: XhrRequest;

  private workers: Worker[] = [];

  constructor ({
    version,
    xhrRequest,
    extension,
  }: LASLAZLoaderOptions) {
    if (typeof (version) === 'string') {
      this.version = new Version(version);
    } else {
      this.version = version;
    }

    this.xhrRequest = xhrRequest;
    this.extension = extension.toLowerCase();
  }

  dispose(): void {
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];

    this.disposed = true;
  }

  // @ts-ignore
  static progressCB (p: number) {

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
      url += '.' + this.extension;
    }

    return url;
  }



  private parse(node: PointCloudOctreeGeometryNode, buffer: ArrayBuffer): void {
    if (this.disposed) {
      return;
    }

    const lf = new LASFile(buffer);


    Promise.resolve()
    .then( () => {
        return lf.setLoader();
      }).then( () => {
        return lf.open()
    }).then( () => {
      lf.isOpen = true;
      return lf;
    }).then( (lf: LASFile) => {
      return lf.getHeader().then(function (h: any) {
        return [lf, h];
      });
    }).then( (v: [LASFile, any]) => {
      let lf = v[0];
      let header = v[1];

      let skip = 1;
      let totalRead = 0;
      let totalToRead = (skip <= 1 ? header.pointsCount : header.pointsCount / skip);
      let reader = () => {
        let p = lf.readData(1000000, 0, skip);
        return p.then( (data: LASData) => {
          this.pushBatch(node, new LASDecoder(data.buffer,
            header.pointsFormatId,
            header.pointsStructSize,
            data.count,
            header.scale,
            header.offset,
            header.mins, header.maxs));

          totalRead += data.count;
          LasLazLoader.progressCB(totalRead / totalToRead);

          if (data.hasMoreData) {
            return reader();
          } else {
            header.totalRead = totalRead;
            header.versionAsString = lf.versionAsString;
            header.isCompressed = lf.isCompressed;
            return [lf, header];
          }
        });
      };

      return reader();
    }).then( (v: [LASFile, any]) => {
      let lf = v[0];
      // we're done loading this file
      //
      LasLazLoader.progressCB(1);

      // Close it
      return lf.close().then(function () {
        lf.isOpen = false;

        return v.slice(1);
    }).catch( (e: Error) => {
        // If there was a cancellation, make sure the file is closed, if the file is open
        // close and then fail
        if (lf.isOpen) {
          return lf.close().then(function () {
            lf.isOpen = false;
            throw e;
          });
        }
        throw e;
      });
    })
    .catch( (e) => {
        console.log(e);
        console.log('failed to open file. :(');
    });
  }

  releaseWorker(worker: Worker): void {
    this.workers.push(worker);
  }

  private getWorker(): Worker {
    const worker = this.workers.pop();
    if (worker) {
      return worker;
    }

    const ctor = require('../workers/LASDecoderWorker.js');
    return new ctor();
  }

  private pushBatch(node: PointCloudOctreeGeometryNode, lasBuffer: LASDecoder) {

    const worker = this.getWorker();

    worker.onmessage = (e) => {
        const geometry = new BufferGeometry();
        const numPoints = lasBuffer.pointsCount;

        const positions = new Float32Array(e.data.position);
        const colors = new Uint8Array(e.data.color);
        const intensities = new Float32Array(e.data.intensity);
        const classifications = new Uint8Array(e.data.classification);
        const returnNumbers = new Uint8Array(e.data.returnNumber);
        const numberOfReturns = new Uint8Array(e.data.numberOfReturns);
        const pointSourceIDs = new Uint16Array(e.data.pointSourceID);
        const indices = new Uint8Array(e.data.indices);

        geometry.addAttribute('position', new BufferAttribute(positions, 3));
        geometry.addAttribute('color', new BufferAttribute(colors, 4, true));
        geometry.addAttribute('intensity', new BufferAttribute(intensities, 1));
        geometry.addAttribute('classification', new BufferAttribute(classifications, 1));
        geometry.addAttribute('returnNumber', new BufferAttribute(returnNumbers, 1));
        geometry.addAttribute('numberOfReturns', new BufferAttribute(numberOfReturns, 1));
        geometry.addAttribute('pointSourceID', new BufferAttribute(pointSourceIDs, 1));
        //geometry.addAttribute('normal', new BufferAttribute(new Float32Array(numPoints * 3), 3));
        geometry.addAttribute('indices', new BufferAttribute(indices, 4));
        geometry.attributes.indices.normalized = true;

        const tightBoundingBox = new Box3(
            new Vector3().fromArray(e.data.tightBoundingBox.min),
            new Vector3().fromArray(e.data.tightBoundingBox.max)
        );

        geometry.boundingBox = node.boundingBox;
        node.tightBoundingBox = tightBoundingBox;

        node.geometry = geometry;
        node.numPoints = numPoints;
        node.loaded = true;
        node.loading = false;
        node.pcoGeometry.numNodesLoading--;
        node.mean = new Vector3(...e.data.mean);

        //debugger;

        this.releaseWorker(worker);
    };

    const message = {
        buffer: lasBuffer.arrayb,
        numPoints: lasBuffer.pointsCount,
        pointSize: lasBuffer.pointSize,
        pointFormatID: 2,
        scale: lasBuffer.scale,
        offset: lasBuffer.offset,
        mins: lasBuffer.mins,
        maxs: lasBuffer.maxs
    };
    worker.postMessage(message, [message.buffer]);
  }
}
