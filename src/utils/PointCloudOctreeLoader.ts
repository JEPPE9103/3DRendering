// src/utils/PointCloudOctreeLoader.ts
import * as THREE from 'three';
import { OctreeNode } from './OctreeNode';

export async function loadOctreeFromUrl(
  url: string,
  basePath: string = ''
): Promise<THREE.Group> {
  const rootData = await fetch(url).then((res) => res.json());
  const group = new THREE.Group();

  async function buildNode(data: OctreeNode, name: string) {
    if (data.points && data.points.length > 0) {
      const geometry = new THREE.BufferGeometry();

      const positions: number[] = [];
      const colors: number[] = [];

      for (const p of data.points) {
        positions.push(p.x, p.y, p.z);
        colors.push(p.r / 255, p.g / 255, p.b / 255);
      }

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true });
      const points = new THREE.Points(geometry, material);
      points.name = name;

      group.add(points);
    }

    if (data.children && data.children.length > 0) {
      for (let i = 0; i < data.children.length; i++) {
        const childUrl = `${basePath}/root_${i}.json`;
        try {
          const childData = await fetch(childUrl).then((res) => res.json());
          await buildNode(childData, `child-${i}`);
        } catch (e) {
          console.warn(`Failed to load child ${i}`, e);
        }
      }
    }
  }

  await buildNode(rootData, 'root');
  return group;
}
