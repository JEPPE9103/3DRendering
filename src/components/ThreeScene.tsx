import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { EffectComposer, SSAO, Bloom, FXAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useCallback, useEffect, useRef, useState } from 'react';
import ViewerControls from './ViewerControls';
import FirstPersonControls from './FirstPersonControls';
import OctreeRenderer from '../utils/OctreeRenderer';
import { QualitySettings, SplatStyle, PostProcessingSettings, FormatOption } from './ViewerControls';

function CameraUpdater({ onCameraUpdate }: { onCameraUpdate: (position: THREE.Vector3, target: THREE.Vector3) => void }) {
  const { camera, controls } = useThree();
  useFrame(() => {
    if (controls && 'target' in controls) {
      onCameraUpdate(camera.position.clone(), (controls as any).target.clone());
    }
  });
  return null;
}

function CameraController({
  navigationMode,
  isSpacePressed,
  initialPosition,
  initialTarget,
}: {
  navigationMode: 'orbit' | 'firstPerson';
  isSpacePressed: boolean;
  initialPosition?: THREE.Vector3;
  initialTarget?: THREE.Vector3;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const prevNavigationMode = useRef(navigationMode);

  useFrame(() => {
    if (navigationMode === 'orbit' && controlsRef.current) {
      const controls = controlsRef.current;
      controls.enablePan = isSpacePressed;
      controls.enableRotate = !isSpacePressed;
      controls.update();
    }
  });

  useEffect(() => {
    if (prevNavigationMode.current !== navigationMode && navigationMode === 'firstPerson') {
      camera.position.copy(initialPosition || new THREE.Vector3(10, 5, 10));
      camera.lookAt(initialTarget || new THREE.Vector3(0, 0, 0));
    }
    prevNavigationMode.current = navigationMode;
  }, [navigationMode]);

  return navigationMode === 'orbit' ? (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={0.5}
      minDistance={1}
      maxDistance={1000}
      enablePan={true}
      panSpeed={1.0}
      enableRotate={true}
      target={initialTarget || new THREE.Vector3(0, 0, 0)}
      zoomToCursor={true}
      mouseButtons={{
        LEFT: isSpacePressed ? 2 : 0,
        MIDDLE: 1,
        RIGHT: 2,
      }}
      touches={{
        ONE: isSpacePressed ? 2 : 0,
        TWO: 1,
      }}
    />
  ) : (
    <FirstPersonControls
      ref={controlsRef}
      moveSpeed={0.1}
      lookSpeed={0.002}
    />
  );
}

function FPSCounter() {
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useFrame(() => {
    frameCount.current++;
    const currentTime = performance.now();
    if (currentTime - lastTime.current >= 1000) {
      setFps(Math.round((frameCount.current * 1000) / (currentTime - lastTime.current)));
      frameCount.current = 0;
      lastTime.current = currentTime;
    }
  });

  return (
    <div className="performance-info">
      FPS: {fps}
    </div>
  );
}

export default function ThreeScene() {
  const [splatStyle, setSplatStyle] = useState<SplatStyle>('solidFancy');
  const [pointSize, setPointSize] = useState(0.05);
  const [navigationMode, setNavigationMode] = useState<'orbit' | 'firstPerson'>('orbit');
  const [format, setFormat] = useState<FormatOption>('json');
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3(10, 5, 10));
  const [cameraTarget, setCameraTarget] = useState(new THREE.Vector3(0, 0, 0));

  const [qualitySettings, setQualitySettings] = useState<QualitySettings>({
    pointDensity: 1.0,
    loadDistance: 1.0,
    updateFrequency: 1.0,
  });

  const [postProcessing, setPostProcessing] = useState<PostProcessingSettings>({
    ssao: false,
    ssaoRadius: 0.2,
    ssaoIntensity: 1.0,
    bloom: true,
    bloomIntensity: 0.3,
    fxaa: true
  });

  const handleCameraUpdate = useCallback((pos: THREE.Vector3, target: THREE.Vector3) => {
    setCameraPosition(pos);
    setCameraTarget(target);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setNavigationMode((prev) => (prev === 'orbit' ? 'firstPerson' : 'orbit'));
      } else if (e.code === 'Space') {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [navigationMode]);

  useEffect(() => {
    if (loadingProgress >= 99.9) {
      const timeoutId = setTimeout(() => setLoading(false), 500);
      return () => clearTimeout(timeoutId);
    }
  }, [loadingProgress]);

  const urlMap: Record<FormatOption, string> = {
    json: '/output_octree/root.json',
  };

  const datasetUrl = urlMap[format];

  return (
    <div className="viewer-container">
      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner" />
            <div className="loading-text">Loading... {loadingProgress.toFixed(1)}%</div>
          </div>
        </div>
      )}

      <ViewerControls
        onPointSizeChange={setPointSize}
        onQualityChange={setQualitySettings}
        navigationMode={navigationMode}
        onNavigationModeChange={setNavigationMode}
        onFormatChange={setFormat}
        currentFormat={format}
        qualitySettings={qualitySettings}
        onSplatStyleChange={setSplatStyle}
        currentSplatStyle={splatStyle}
        postProcessing={postProcessing}
        onPostProcessingChange={setPostProcessing}
      />

      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          stencil: false,
          depth: true
        }}
      >
        <Stats />
        <ambientLight intensity={0.3} />
        <CameraUpdater onCameraUpdate={handleCameraUpdate} />
        <CameraController
          navigationMode={navigationMode}
          isSpacePressed={isSpacePressed}
          initialPosition={cameraPosition}
          initialTarget={cameraTarget}
        />

        <OctreeRenderer
          url={datasetUrl}
          pointSize={pointSize}
          onProgress={setLoadingProgress}
          qualitySettings={qualitySettings}
          splatStyle={splatStyle}
        />

        <EffectComposer multisampling={2}>
          <>
            {postProcessing.ssao && (
              <SSAO
                samples={16}
                radius={postProcessing.ssaoRadius}
                intensity={postProcessing.ssaoIntensity}
                luminanceInfluence={0.0}
                color={new THREE.Color("#000000")}
              />
            )}
            {postProcessing.bloom && (
              <Bloom
                intensity={postProcessing.bloomIntensity}
                luminanceThreshold={0.9}
                luminanceSmoothing={0.1}
              />
            )}
            {postProcessing.fxaa && <FXAA />}
          </>
        </EffectComposer>

        <FPSCounter />
      </Canvas>

      <div className="navigation-hint">
        Press <strong>TAB</strong> to switch between Orbit and First-Person<br />
        Hold <strong>SPACE + Left Mouse</strong> to pan the view
      </div>
    </div>
  );
}
