import { useEffect, useRef, forwardRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';

export interface FirstPersonControlsProps {
  moveSpeed?: number;
  lookSpeed?: number;
  position?: [number, number, number];
  onLock?: () => void;
  onUnlock?: () => void;
  isSpacePressed?: boolean;
}

const FirstPersonControls = forwardRef<any, FirstPersonControlsProps>(({ 
  moveSpeed = 0.1,
  lookSpeed = 0.5,
  position = [10, 5, 10],
  onLock,
  onUnlock,
  isSpacePressed = false
}, ref) => {
  const { camera } = useThree();
  const moveForward = useRef(false);
  const moveBackward = useRef(false);
  const moveLeft = useRef(false);
  const moveRight = useRef(false);
  const moveUp = useRef(false);
  const moveDown = useRef(false);
  const tiltLeft = useRef(false);
  const tiltRight = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') return;
      
      switch (event.code) {
        case 'KeyW': moveForward.current = true; break;
        case 'KeyS': moveBackward.current = true; break;
        case 'KeyA': moveLeft.current = true; break;
        case 'KeyD': moveRight.current = true; break;
        case 'KeyQ': moveUp.current = true; break;
        case 'KeyE': moveDown.current = true; break;
        case 'ArrowLeft': tiltLeft.current = true; break;
        case 'ArrowRight': tiltRight.current = true; break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') return;
      
      switch (event.code) {
        case 'KeyW': moveForward.current = false; break;
        case 'KeyS': moveBackward.current = false; break;
        case 'KeyA': moveLeft.current = false; break;
        case 'KeyD': moveRight.current = false; break;
        case 'KeyQ': moveUp.current = false; break;
        case 'KeyE': moveDown.current = false; break;
        case 'ArrowLeft': tiltLeft.current = false; break;
        case 'ArrowRight': tiltRight.current = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame(() => {
    if (!ref || !('current' in ref) || !ref.current) return;

    const controls = ref.current.getObject();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(controls.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(controls.quaternion);

    if (moveForward.current) controls.position.addScaledVector(direction, moveSpeed);
    if (moveBackward.current) controls.position.addScaledVector(direction, -moveSpeed);
    if (moveLeft.current) controls.position.addScaledVector(right, -moveSpeed);
    if (moveRight.current) controls.position.addScaledVector(right, moveSpeed);
    if (moveUp.current) controls.position.y += moveSpeed;
    if (moveDown.current) controls.position.y -= moveSpeed;

    if (tiltLeft.current) controls.rotation.z += lookSpeed * 0.5;
    if (tiltRight.current) controls.rotation.z -= lookSpeed * 0.5;
  });

  return (
    <PointerLockControls
      ref={ref}
      onLock={onLock}
      onUnlock={onUnlock}
      enabled={true}
    />
  );
});

FirstPersonControls.displayName = 'FirstPersonControls';

export default FirstPersonControls; 