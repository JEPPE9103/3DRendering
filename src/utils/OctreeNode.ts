import * as THREE from "three";

// Represents a single point in the point cloud with color (RGB)
export type Point = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
};

// Data structure passed to OctreeNode constructor.
// It may contain points, children (as nested data or URLs), and a bounding box.
export interface OctreeData {
  points: any[];
  boundingBox: THREE.Box3;
  lodLevels?: THREE.Points[];
  currentLOD?: number;
  children?: OctreeNode[];
}

// This class represents a node in the Octree.
// Each node contains a set of points and optionally child nodes.
export class OctreeNode {
  public points: any[];                 // All 3D points stored in this node
  public children: OctreeNode[];          // Recursively defined children (other OctreeNodes)
  public boundingBox: THREE.Box3;         // Axis-aligned bounding box for all points in this node
  public lodLevels?: THREE.Points[];
  public currentLOD: number;

  constructor(data: OctreeData) {
    this.points = data.points;
    this.children = data.children || [];
    this.boundingBox = data.boundingBox;
    this.lodLevels = data.lodLevels;
    this.currentLOD = data.currentLOD || 0;
  }

  // Computes the bounding box that encloses all points in this node
  computeBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    this.points.forEach(point => {
      box.expandByPoint(new THREE.Vector3(point.x, point.z, point.y));
    });
    return box;
  }

  // Converts this node's point data into a THREE.BufferGeometry for rendering in Three.js
  public toPointsGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];

    this.points.forEach(point => {
      positions.push(point.x, point.z, point.y);
      colors.push(point.r / 255, point.g / 255, point.b / 255);
      normals.push(0, 1, 0);
    });

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));

    return geometry;
  }
}
