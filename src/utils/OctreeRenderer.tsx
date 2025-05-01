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

  const MIN_POINTS = Math.floor(1000 * qualitySettings.pointDensity);
  const MAX_POINTS = Math.floor(1000000 * qualitySettings.pointDensity);
  const UPDATE_INTERVAL = Math.floor(1000 / qualitySettings.updateFrequency);
  const updateThreshold = useRef(0.5);

  // Add LOD distance factors
  const LOD_DISTANCE_FACTORS = [1.0, 2.0, 4.0, 8.0, 16.0];
  const LOD_LEVELS = 5;

  const calculateLODLevel = (distance: number, nodeSize: number) => {
    const screenSpaceError = (nodeSize / distance) * 1000;
    for (let i = 0; i < LOD_LEVELS; i++) {
      if (screenSpaceError > LOD_DISTANCE_FACTORS[i]) {
        return i;
      }
    }
    return LOD_LEVELS - 1;
  };

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

          const mat = new THREE.PointsMaterial({
            size: pointSize * 0.2,
            vertexColors: true,
            sizeAttenuation: true,
            alphaTest: 0.5
          });
          
          const pointsObj = new THREE.Points(geometry, mat);
          pointsObj.frustumCulled = false;
          
          // Add points to the scene
          groupRef.current.add(pointsObj);
          console.log(`Added points object to scene:`, pointsObj);

          const bbox = new THREE.Box3().setFromPoints(
            nodeData.node.points.map((p: any) => new THREE.Vector3(p.x, p.z, p.y))
          );
          
          const node = new OctreeNode({ 
            points: nodeData.node.points, 
            boundingBox: bbox,
            currentLOD: 0,
            children: []
          });
          
          spatialIndexRef.current?.addNode(node, pointsObj);
          console.log(`Added node with ${nodeData.node.points.length} points to spatial index`);

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

    console.log("Starting to load octree...");
    spatialIndexRef.current = new SpatialIndex(
      MIN_POINTS,
      MAX_POINTS,
      UPDATE_INTERVAL
    );

    let totalNodes = 0;
    let loadedNodes = 0;

    const loadJsonNode = async (nodeUrl: string, level: number = 0) => {
      try {
        console.log(`Loading node: ${nodeUrl} (level ${level})`);
        const response = await fetch(nodeUrl);
        if (!response.ok) {
          console.error(`Failed to load ${nodeUrl}: ${response.statusText}`);
          return;
        }
        const data = await response.json();
        console.log(`Loaded node data:`, data);

        if (level === 0) {
          totalLevels.current = Math.max(totalLevels.current, level + 1);
        }

        if (data.children) {
          totalNodes += data.children.length;
          // Load first level immediately
          if (level === 0) {
            const children = data.children.slice(0, 2); // Reduce initial load
            console.log(`Loading first 2 children:`, children);
            await Promise.all(
              children.map((child: string) =>
                loadJsonNode(`${nodeUrl.substring(0, nodeUrl.lastIndexOf("/") + 1)}${child}`, level + 1)
              )
            );
            setLoadedLevels(1);
            
            // Load remaining children in background
            const remainingChildren = data.children.slice(2);
            for (const child of remainingChildren) {
              await loadJsonNode(`${nodeUrl.substring(0, nodeUrl.lastIndexOf("/") + 1)}${child}`, level + 1);
              loadedNodes++;
              onProgress?.(Math.min(100, (loadedNodes / totalNodes) * 100));
            }
          } else {
            for (const child of data.children) {
              await loadJsonNode(`${nodeUrl.substring(0, nodeUrl.lastIndexOf("/") + 1)}${child}`, level + 1);
              loadedNodes++;
              onProgress?.(Math.min(100, (loadedNodes / totalNodes) * 100));
            }
          }
        } else if (data.points) {
          console.log(`Loading points: ${data.points.length} points`);
          loadedNodes++;
          onProgress?.(Math.min(100, (loadedNodes / totalNodes) * 100));
          
          const points = data.points;
          const geometry = new THREE.BufferGeometry();
          const positions = new Float32Array(points.length * 3);
          const colors = new Float32Array(points.length * 3);
          const normals = new Float32Array(points.length * 3);

          // Create points geometry using typed arrays for better performance
          for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const i3 = i * 3;
            positions[i3] = p.x;
            positions[i3 + 1] = p.z;
            positions[i3 + 2] = p.y;
            colors[i3] = p.r / 255;
            colors[i3 + 1] = p.g / 255;
            colors[i3 + 2] = p.b / 255;
            normals[i3] = 0;
            normals[i3 + 1] = 1;
            normals[i3 + 2] = 0;
          }

          geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

          const mat = new THREE.PointsMaterial({
            size: pointSize * 0.2,
            vertexColors: true,
            sizeAttenuation: true,
            alphaTest: 0.5
          });
          
          const pointsObj = new THREE.Points(geometry, mat);
          pointsObj.frustumCulled = false;
          
          // Add points to the scene
          groupRef.current.add(pointsObj);
          console.log(`Added points object to scene:`, pointsObj);

          const bbox = new THREE.Box3().setFromPoints(
            points.map((p: any) => new THREE.Vector3(p.x, p.z, p.y))
          );
          
          const node = new OctreeNode({ 
            points: points, 
            boundingBox: bbox,
            currentLOD: 0,
            children: []
          });
          
          spatialIndexRef.current?.addNode(node, pointsObj);
          console.log(`Added node with ${points.length} points to spatial index`);
        }
      } catch (err) {
        console.error("Failed to load octree node:", err);
      }
    };

    (async () => {
      try {
        // First count total nodes
        console.log("Fetching root node...");
        const rootResponse = await fetch(url);
        const rootData = await rootResponse.json();
        console.log("Root node data:", rootData);
        
        if (rootData.children) {
          totalNodes = rootData.children.length;
          console.log(`Total nodes to load: ${totalNodes}`);
        }

        await loadJsonNode(url);
        console.log("Finished loading octree");
        console.log("Scene children:", scene.children);
        onFinishLoading?.();
        setIsLoaded(true);
        loadingRef.current = false;
      } catch (err) {
        console.error("Failed to load octree:", err);
        loadingRef.current = false;
      }
    })();

    return () => {
      if (spatialIndexRef.current) {
        spatialIndexRef.current.clear();
      }
    };
  }, [url, splatStyle]);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      const nodes = spatialIndexRef.current?.getNodes() || [];
      nodes.forEach((node) => {
        if (node.points) {
          node.points.geometry.dispose();
          groupRef.current.remove(node.points);
        }
      });
      spatialIndexRef.current?.clear();
    };
  }, []);

  // Update LOD based on camera distance
  useEffect(() => {
    if (!spatialIndexRef.current || !camera) {
      console.log("No spatial index or camera available");
      return;
    }

    const nodes = spatialIndexRef.current.getNodes();
    console.log(`Updating LOD for ${nodes.length} nodes`);
    
    nodes.forEach(node => {
      if (node.lodLevels) {
        const distance = camera.position.distanceTo(node.boundingBox.getCenter());
        const nodeSize = node.boundingBox.getSize(new THREE.Vector3()).length();
        const lodLevel = calculateLODLevel(distance, nodeSize);
        
        if (node.currentLOD !== lodLevel) {
          node.lodLevels.forEach((level, index) => {
            level.visible = index === lodLevel;
          });
          node.currentLOD = lodLevel;
        }
      }
    });
  }, [camera]);

  return null;
}
