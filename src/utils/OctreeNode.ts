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
export type OctreeData = {
  points?: Point[];
  children?: string[] | OctreeData[];
  boundingBox?: THREE.Box3;
};

// This class represents a node in the Octree.
// Each node contains a set of points and optionally child nodes.
export class OctreeNode {
  public points: Point[];                 // All 3D points stored in this node
  public children: OctreeNode[];          // Recursively defined children (other OctreeNodes)
  public boundingBox: THREE.Box3;         // Axis-aligned bounding box for all points in this node

  constructor(data: OctreeData) {
    // Load all point data into this node
    this.points = data.points || [];

    // Initialize children
    this.children = [];

    // If this node has children, determine if they are URLs (external) or inlined data
    if (data.children) {
      if (typeof data.children[0] === 'string') {
        // Children are URLs — this happens in lazy-loaded Octrees (used for streaming or disk-based loading)
        this.children = []; // Will be handled by loader later
      } else {
        // Children are embedded OctreeData — recursively instantiate child nodes
        this.children = (data.children as OctreeData[]).map((child) => new OctreeNode(child));
      }
    }

    // Compute a bounding box for all points in this node (used for LOD and spatial partitioning)
    this.boundingBox = this.computeBoundingBox();
  }

  // Computes the bounding box that encloses all points in this node
  private computeBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();

    // Convert each point to a THREE.Vector3 for bounding box computation
    const vectors = this.points.map(
      (p) => new THREE.Vector3(p.x, p.y, p.z)
    );

    // Automatically compute min/max bounds from point positions
    box.setFromPoints(vectors);
    return box;
  }

  // Converts this node’s point data into a THREE.BufferGeometry for rendering in Three.js
  public toPointsGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    const positions: number[] = []; // Flat array for storing XYZ positions
    const colors: number[] = [];    // Flat array for storing RGB colors

    for (const p of this.points) {
      // Note: we swap Y and Z to match our world orientation (common in LiDAR / mapping applications)
      positions.push(p.x, p.z, p.y);

      // Normalize color values to [0,1] for WebGL
      colors.push(p.r / 255, p.g / 255, p.b / 255);
    }

    // Assign positions and colors as buffer attributes
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3)
    );

    return geometry;
  }
}
