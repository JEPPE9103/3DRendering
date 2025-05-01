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
  onProgress?: (progress: number) => void;
  onFinishLoading?: () => void;
  qualitySettings: QualitySettings;
  splatStyle: SplatStyle;
}

export default function OctreeRenderer({
  url,
  pointSize,
  onProgress,
  onFinishLoading,
  qualitySettings,
  splatStyle,
}: OctreeRendererProps) {
  const groupRef = useRef(new THREE.Group());
  const { scene, camera } = useThree();
  const spatialIndexRef = useRef<SpatialIndex | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastCameraPosition = useRef(new THREE.Vector3());
  const [isLoaded, setIsLoaded] = useState(false);
  const loadingRef = useRef(false);

  const MIN_POINTS = Math.floor(500 * qualitySettings.pointDensity);
  const MAX_POINTS = Math.floor(250000 * qualitySettings.pointDensity);
  const UPDATE_INTERVAL = Math.floor(1000 / qualitySettings.updateFrequency);
  const updateThreshold = useRef(0.5);

  const [loadedLevels, setLoadedLevels] = useState(0);
  const totalLevels = useRef(0);

  useEffect(() => {
    if (spatialIndexRef.current) {
      spatialIndexRef.current.updateSettings(
        MIN_POINTS,
        MAX_POINTS,
        UPDATE_INTERVAL
      );
    }
  }, [qualitySettings]);

  useEffect(() => {
    scene.add(groupRef.current);
    return () => {
      scene.remove(groupRef.current);
    };
  }, [scene]);

  useEffect(() => {
    if (!isLoaded || !spatialIndexRef.current) return;

    const updateLOD = () => {
      const camPos = camera.position;
      const now = Date.now();

      const moved = camPos.distanceTo(lastCameraPosition.current) > updateThreshold.current;

      if (moved) {
        lastCameraPosition.current.copy(camPos);

        const nodesToUpdate = spatialIndexRef.current?.updateLOD(camPos, now) || [];

        for (const nodeData of nodesToUpdate) {
          if (nodeData.points) {
            nodeData.points.geometry.dispose();
            groupRef.current.remove(nodeData.points);
          }

          const geometry = new THREE.BufferGeometry();
          const positions: number[] = [];
          const colors: number[] = [];
          const normals: number[] = [];

          const step = nodeData.node.points.length / nodeData.pointsToShow;
          for (let i = 0; i < nodeData.pointsToShow; i++) {
            const index = Math.floor(i * step);
            const p = nodeData.node.points[index];
            positions.push(p.x, p.z, p.y);
            colors.push(p.r / 255, p.g / 255, p.b / 255);
            normals.push(0, 1, 0);
          }

          geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
          geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));

          const mat = createSplatMaterial(pointSize, 0, splatStyle);
          const points = new THREE.Points(geometry, mat);
          groupRef.current.add(points);
          nodeData.points = points;

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
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isLoaded, camera, pointSize, splatStyle]);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoaded(false);
    groupRef.current.clear();

    spatialIndexRef.current = new SpatialIndex(
      MIN_POINTS,
      MAX_POINTS,
      UPDATE_INTERVAL
    );

    const loadJsonNode = async (nodeUrl: string, level: number = 0) => {
      try {
        const response = await fetch(nodeUrl);
        if (!response.ok) throw new Error(`Failed to load ${nodeUrl}: ${response.statusText}`);
        const data = await response.json();

        if (level === 0) {
          totalLevels.current = Math.max(totalLevels.current, level + 1);
        }

        if (data.children) {
          if (level === 0) {
            await Promise.all(
              data.children.map((child: string) =>
                loadJsonNode(`${nodeUrl.substring(0, nodeUrl.lastIndexOf("/") + 1)}${child}`, level + 1)
              )
            );
            setLoadedLevels(1);
          } else {
            setTimeout(() => {
              Promise.all(
                data.children.map((child: string) =>
                  loadJsonNode(`${nodeUrl.substring(0, nodeUrl.lastIndexOf("/") + 1)}${child}`, level + 1)
                )
              ).then(() => {
                setLoadedLevels(prev => Math.max(prev, level + 1));
              });
            }, 1000 * level);
          }
        } else if (data.points) {
          const points = data.points;
          const geometry = new THREE.BufferGeometry();
          const positions: number[] = [];
          const colors: number[] = [];
          const normals: number[] = [];

          const step = level === 0 ? 1 : Math.max(1, Math.floor(points.length / 10000));
          for (let i = 0; i < points.length; i += step) {
            const p = points[i];
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

          const bbox = new THREE.Box3().setFromPoints(
            points.map((p: any) => new THREE.Vector3(p.x, p.z, p.y))
          );
          spatialIndexRef.current?.addNode(new OctreeNode({ points, boundingBox: bbox }), pointsObj);
        }

        onProgress?.(Math.min(100, (loadedLevels / totalLevels.current) * 100));
      } catch (err) {
        console.error("Failed to load octree:", err);
      }
    };

    (async () => {
      try {
        await loadJsonNode(url);
        onFinishLoading?.();
        setIsLoaded(true);
        loadingRef.current = false;
      } catch (err) {
        console.error("Failed to load octree:", err);
      }
    })();

    return () => spatialIndexRef.current?.clear();
  }, [url, splatStyle]);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
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
