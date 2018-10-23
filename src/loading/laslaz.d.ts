//let LASModuleWasLoaded: boolean;

export class LASFile {
  constructor(a: ArrayBuffer);
  determineFormat: any;
  determineVersion: any;
  versionAsString: string;
  open: any;
  getHeader: any;
  readData: any;
  close: any;
  isOpen: boolean;
  isCompressed: boolean;
}
export function handleMessage(e: any): any;

export class LASLoader {
  open: any;
  getHeader: any;
  readData: any;
  close: any;
}
export class LAZLoader {
  open: any;
  getHeader: any;
  readData: any;
  close: any;
}
export class LASDecoder {
  constructor(arrayb: ArrayBuffer, pointFormatID: any, pointSize: any, pointsCount: number, scale: any, offset: any, mins: any, maxs: any);
  getPoint: any;
  arrayb: ArrayBuffer;
  pointsCount: number;
  pointSize: number;
  scale: number;
  offset: any;
  maxs: [number, number, number];
  mins: [number, number, number];
}
