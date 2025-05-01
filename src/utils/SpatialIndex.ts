import * as THREE from "three";
import { OctreeNode } from "./OctreeNode";

// Represents a renderable node in the scene, including its LOD info and geometry
interface SpatialNode {
  node: OctreeNode;                 // The actual octree node
  boundingBox: THREE.Box3;         // Bounding volume for frustum culling
  center: THREE.Vector3;           // Center point (used for distance calculation)
  radius: number;                  // Bounding sphere radius (not actively used)
  points: THREE.Points | null;     // THREE.Points object for rendering
  distance: number;                // Distance to camera (used for sorting, LOD)
  lastUpdate: number;              // Timestamp of last LOD update
  pointsToShow: number;            // How many points should be shown (LOD-controlled)
}

// An Octree class that spatially partitions OctreeNodes using bounding boxes
class Octree {
  private bounds: THREE.Box3;              // Bounds of this octree cell
  private children: Octree[] | null = null;// Child cells (if subdivided)
  private nodes: OctreeNode[] = [];        // Points/nodes stored in this cell
  private maxNodesPerCell: number = 8;     // Max number of nodes before subdivision

  constructor(bounds: THREE.Box3) {
    this.bounds = bounds;
  }

  // Recursively insert a node into this octree or its children
  public insert(node: OctreeNode): void {
    if (this.children) {
      for (const child of this.children) {
        if (child.bounds.containsPoint(node.boundingBox.getCenter(new THREE.Vector3()))) {
          child.insert(node);
          return;
        }
      }
    }

    this.nodes.push(node);

    // If this cell is overloaded, split it into 8 children
    if (this.nodes.length > this.maxNodesPerCell) {
      this.subdivide();
    }
  }

  // Divide the current bounding box into 8 children (octants)
  private subdivide(): void {
    const center = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    this.children = [];

    // Create all 8 octants
    for (let x = -1; x <= 1; x += 2) {
      for (let y = -1; y <= 1; y += 2) {
        for (let z = -1; z <= 1; z += 2) {
          const childCenter = new THREE.Vector3(
            center.x + x * size.x * 0.5,
            center.y + y * size.y * 0.5,
            center.z + z * size.z * 0.5
          );
          const childBounds = new THREE.Box3(
            new THREE.Vector3().copy(childCenter).sub(size.clone().multiplyScalar(0.5)),
            new THREE.Vector3().copy(childCenter).add(size.clone().multiplyScalar(0.5))
          );
          this.children.push(new Octree(childBounds));
        }
      }
    }

    // Re-insert nodes into the correct children
    for (const node of this.nodes) {
      const nodeCenter = node.boundingBox.getCenter(new THREE.Vector3());
      for (const child of this.children) {
        if (child.bounds.containsPoint(nodeCenter)) {
          child.insert(node);
          break;
        }
      }
    }

    this.nodes = []; // Clear local node list once distributed
  }

  // Return all OctreeNodes within the view frustum
  public search(frustum: THREE.Frustum, cameraPosition: THREE.Vector3): OctreeNode[] {
    const result: OctreeNode[] = [];

    // Skip if not visible
    if (!frustum.intersectsBox(this.bounds)) return result;

    result.push(...this.nodes);

    // Recursively search children
    if (this.children) {
      for (const child of this.children) {
        result.push(...child.search(frustum, cameraPosition));
      }
    }

    return result;
  }

  // Remove a node from the tree (recursive)
  public delete(node: OctreeNode): void {
    const index = this.nodes.indexOf(node);
    if (index !== -1) {
      this.nodes.splice(index, 1);
      return;
    }

    if (this.children) {
      for (const child of this.children) {
        child.delete(node);
      }
    }
  }
}

// Manages all OctreeNodes and calculates LOD updates based on camera movement
export class SpatialIndex {
  private nodes: SpatialNode[] = [];
  private octree: Octree;
  private minPoints: number;
  private maxPoints: number;
  private updateInterval: number;

  constructor(
    minPoints = 1000,        // Minimum number of points to show
    maxPoints = 100000,      // Maximum number of points to show
    updateInterval = 1000    // Time (ms) between LOD checks
  ) {
    this.minPoints = minPoints;
    this.maxPoints = maxPoints;
    this.updateInterval = updateInterval;

    this.octree = new Octree(new THREE.Box3()); // Initial root bounds will expand dynamically
  }

  // Update LOD parameters on-the-fly
  public updateSettings(
    minPoints: number,
    maxPoints: number,
    updateInterval: number
  ): void {
    this.minPoints = minPoints;
    this.maxPoints = maxPoints;
    this.updateInterval = updateInterval;
  }

  // Add a node to both the list and the octree structure
  public addNode(node: OctreeNode, points: THREE.Points | null = null): void {
    const boundingBox = node.boundingBox;
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const radius = center.distanceTo(boundingBox.min) * 2;

    this.nodes.push({
      node,
      boundingBox,
      center,
      radius,
      points,
      distance: 0,
      lastUpdate: 0,
      pointsToShow: node.points.length,
    });

    this.octree.insert(node);
  }

  // Remove a node from index and Octree
  public removeNode(node: OctreeNode): void {
    const index = this.nodes.findIndex((n) => n.node === node);
    if (index !== -1) {
      this.nodes.splice(index, 1);
      this.octree.delete(node);
    }
  }

  // Compute which nodes should be updated based on current camera position
  public updateLOD(cameraPosition: THREE.Vector3, now: number): SpatialNode[] {
    const nodesToUpdate: SpatialNode[] = [];

    // Fake camera to project frustum
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(cameraPosition);
    camera.updateMatrixWorld();

    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(projScreenMatrix);

    // Get visible nodes in frustum
    const nodesInFrustum = this.octree.search(frustum, cameraPosition);

    for (const nodeData of nodesInFrustum) {
      const spatialNode = this.nodes.find((n) => n.node === nodeData);
      if (!spatialNode) continue;
      if (now - spatialNode.lastUpdate < this.updateInterval) continue;

      // Compute distance from camera
      const distance = cameraPosition.distanceTo(spatialNode.center);
      spatialNode.distance = distance;

      // Estimate screen space usage of this node
      const screenArea = this.estimateScreenArea(spatialNode.boundingBox, camera);
      let pointsToShow = spatialNode.node.points.length;

      // Apply LOD reduction if screen space is small
      if (screenArea < 5000) {
        const reduction = Math.max(0.1, screenArea / 5000);
        pointsToShow = Math.max(
          this.minPoints,
          Math.min(this.maxPoints, Math.floor(spatialNode.node.points.length * reduction))
        );
      }

      // Skip if the change is too small to matter
      if (Math.abs(pointsToShow - spatialNode.pointsToShow) < spatialNode.pointsToShow * 0.1) continue;

      spatialNode.pointsToShow = pointsToShow;
      spatialNode.lastUpdate = now;
      nodesToUpdate.push(spatialNode);
    }

    return nodesToUpdate;
  }

  // Project bounding box to screen and estimate how much space it occupies
  private estimateScreenArea(box: THREE.Box3, camera: THREE.PerspectiveCamera): number {
    const vertices = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    const screenCoords = vertices.map((v) => {
      const projected = v.clone().project(camera);
      return new THREE.Vector2(projected.x, projected.y);
    });

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of screenCoords) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    return width * height * window.innerWidth * window.innerHeight;
  }

  public getNodes(): SpatialNode[] {
    return this.nodes;
  }

  // Reset the entire index
  public clear(): void {
    this.nodes = [];
    const initialBounds = new THREE.Box3(
      new THREE.Vector3(-1000, -1000, -1000),
      new THREE.Vector3(1000, 1000, 1000)
    );
    this.octree = new Octree(initialBounds);
  }
}
