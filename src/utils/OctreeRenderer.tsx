import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { OctreeNode } from "./OctreeNode";
import { SpatialIndex } from "./SpatialIndex";
import { createSplatMaterial } from "./SplatMaterial";
import { QualitySettings, SplatStyle } from "../components/ViewerControls";

interface OctreeRendererProps {
  url: string;
  pointSize: number;
  colorMode: "rgb" | "height";
  onProgress?: (progress: number) => void;
  onFinishLoading?: () => void;
  qualitySettings: QualitySettings;
  splatStyle: SplatStyle;
}

export default function OctreeRenderer({
  url,
  pointSize,
  colorMode,
  onProgress,
  onFinishLoading,
  qualitySettings,
  splatStyle,
}: OctreeRendererProps) {
  const groupRef = useRef(new THREE.Group()); // All points in the scene are added to this group
  const { scene, camera } = useThree();
  const spatialIndexRef = useRef<SpatialIndex | null>(null); // Manages octree and LOD decisions
  const frameRef = useRef<number>();
  const lastCameraPosition = useRef(new THREE.Vector3()); // To track camera movement
  const [isLoaded, setIsLoaded] = useState(false);
  const loadingRef = useRef(false); // Prevents multiple loads

  // Constants controlling level of detail (LOD)
  const LOD_DISTANCE = 50 * qualitySettings.loadDistance;
  const MIN_POINTS = Math.floor(1000 * qualitySettings.pointDensity);
  const MAX_POINTS = Math.floor(500000 * qualitySettings.pointDensity);
  const UPDATE_INTERVAL = Math.floor(500 / qualitySettings.updateFrequency);
  const updateThreshold = useRef(0.2); // Minimum camera movement (in world units) before triggering an update

  // When quality settings change, update SpatialIndex thresholds accordingly
  useEffect(() => {
    if (spatialIndexRef.current) {
      spatialIndexRef.current.updateSettings(
        updateThreshold.current,
        LOD_DISTANCE,
        MIN_POINTS,
        MAX_POINTS,
        UPDATE_INTERVAL
      );
    }
  }, [qualitySettings]);

  // Add/remove points group to/from scene
  useEffect(() => {
    scene.add(groupRef.current);
    return () => scene.remove(groupRef.current);
  }, [scene]);

  // Core LOD update loop — checks if camera has moved, then requests new point sets
  useEffect(() => {
    if (!isLoaded || !spatialIndexRef.current) return;

    const updateLOD = () => {
      const camPos = camera.position;
      const now = Date.now();

      // Check if camera has moved significantly
      const moved = camPos.distanceTo(lastCameraPosition.current) > updateThreshold.current;

      if (moved) {
        lastCameraPosition.current.copy(camPos);

        // Ask SpatialIndex which nodes to update
        const nodesToUpdate = spatialIndexRef.current.updateLOD(camPos, now);

        for (const nodeData of nodesToUpdate) {
          // Remove old points geometry
          if (nodeData.points) {
            nodeData.points.geometry.dispose();
            groupRef.current.remove(nodeData.points);
          }

          // Generate new geometry using selected subset of points
          const geometry = new THREE.BufferGeometry();
          const positions: number[] = [];
          const colors: number[] = [];
          const normals: number[] = [];

          // Use step-based downsampling to control how many points we show
          const step = nodeData.node.points.length / nodeData.pointsToShow;
          for (let i = 0; i < nodeData.pointsToShow; i++) {
            const index = Math.floor(i * step);
            const p = nodeData.node.points[index];
            positions.push(p.x, p.z, p.y); // Y/Z flipped for Three.js orientation
            colors.push(p.r / 255, p.g / 255, p.b / 255);
            normals.push(0, 1, 0); // Normals not used yet, reserved for future lighting
          }

          geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
          geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));

          // Shader material with fade (LOD + visual transition)
          const mat = createSplatMaterial(pointSize, 0, splatStyle);
          const points = new THREE.Points(geometry, mat);
          groupRef.current.add(points);
          nodeData.points = points;

          // Smooth fade-in animation using requestAnimationFrame
          let fade = 0;
          const fadeIn = () => {
            fade = Math.min(fade + 0.05, 1);
            mat.uniforms.fade.value = fade;
            if (fade < 1) requestAnimationFrame(fadeIn);
          };
          fadeIn();

          nodeData.lastUpdate = now;
        }
      }

      frameRef.current = requestAnimationFrame(updateLOD);
    };

    frameRef.current = requestAnimationFrame(updateLOD);
    return () => cancelAnimationFrame(frameRef.current!);
  }, [isLoaded, camera, pointSize, splatStyle]);

  // Loads the octree structure from root and recursively walks the hierarchy
  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoaded(false);
    groupRef.current.clear();

    spatialIndexRef.current = new SpatialIndex(
      updateThreshold.current,
      LOD_DISTANCE,
      MIN_POINTS,
      MAX_POINTS,
      UPDATE_INTERVAL
    );

    // Loads either internal or leaf nodes
    const loadJsonNode = async (nodeUrl: string) => {
      try {
        const response = await fetch(nodeUrl);
        if (!response.ok) throw new Error(`Failed to load ${nodeUrl}: ${response.statusText}`);
        const data = await response.json();

        if (data.children) {
          // Internal node: recurse on each child
          await Promise.all(
            data.children.map((child: string) =>
              loadJsonNode(`${nodeUrl.substring(0, nodeUrl.lastIndexOf("/") + 1)}${child}`)
            )
          );
        } else if (data.points) {
          // Leaf node: construct geometry and add to spatial index
          const points = data.points;
          const geometry = new THREE.BufferGeometry();
          const positions: number[] = [];
          const colors: number[] = [];
          const normals: number[] = [];

          for (const p of points) {
            positions.push(p.x, p.z, p.y);
            colors.push(p.r / 255, p.g / 255, p.b / 255);
            normals.push(0, 1, 0);
          }

          geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
          geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));

          const mat = createSplatMaterial(pointSize, 0, splatStyle);
          const pointsObj = new THREE.Points(geometry, mat);
          groupRef.current.add(pointsObj);

          let fade = 0;
          const fadeIn = () => {
            fade = Math.min(fade + 0.05, 1);
            mat.uniforms.fade.value = fade;
            if (fade < 1) requestAnimationFrame(fadeIn);
          };
          fadeIn();

          // Add to spatial index for LOD
          const bbox = new THREE.Box3().setFromPoints(
            points.map((p: any) => new THREE.Vector3(p.x, p.z, p.y))
          );
          spatialIndexRef.current!.addNode(new OctreeNode({ points, boundingBox: bbox }), pointsObj);
        }

        onProgress?.(100);
      } catch (err) {
        console.error("Failed to load octree:", err);
      }
    };

    (async () => {
      try {
        await loadJsonNode(url); // Start with root
        onFinishLoading?.();
        setIsLoaded(true);
        loadingRef.current = false;
      } catch (err) {
        console.error("Failed to load octree:", err);
      }
    })();

    return () => spatialIndexRef.current?.clear();
  }, [url, splatStyle]);

  // Cleanup when unmounting component
  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current!);
      spatialIndexRef.current?.getNodes().forEach((node) => {
        if (node.points) {
          node.points.geometry.dispose();
          groupRef.current.remove(node.points);
        }
      });
      spatialIndexRef.current?.clear();
    };
  }, []);

  return null;
}
