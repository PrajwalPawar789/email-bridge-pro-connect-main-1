import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment } from '@react-three/drei';
import * as THREE from 'three';

const MailIcon = (props: any) => {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.y += 0.01;
      mesh.current.position.y = Math.sin(state.clock.getElapsedTime() + props.offset) * 0.5;
    }
  });
  return (
    <mesh ref={mesh} {...props}>
      <boxGeometry args={[1, 0.7, 0.1]} />
      <meshStandardMaterial color="#fbbf24" metalness={0.6} roughness={0.2} />
      <mesh position={[0, 0, 0.06]}>
        <planeGeometry args={[0.9, 0.6]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
    </mesh>
  );
};

const BarGraph = () => {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.5) * 0.2;
    }
  });
  return (
    <group ref={group}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[i * 0.6 - 0.9, i * 0.4 - 0.5, 0]}>
          <boxGeometry args={[0.4, i * 0.8 + 0.5, 0.4]} />
          <meshStandardMaterial color={`hsl(${220 + i * 20}, 80%, 60%)`} />
        </mesh>
      ))}
    </group>
  );
};

const Clock = () => {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (group.current) {
      group.current.rotation.z = -state.clock.getElapsedTime() * 0.5;
    }
  });
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 0.2, 32]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[0, 0, 0.11]}>
        <circleGeometry args={[1.3, 32]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      <group ref={group} position={[0, 0, 0.12]}>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.1, 1, 0.05]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
      </group>
    </group>
  );
};

const Feature3D = ({ type }: { type: 'campaigns' | 'analytics' | 'scheduling' }) => {
  return (
    <div className="w-full h-64 md:h-96">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          {type === 'campaigns' && (
            <group>
              <MailIcon position={[-1, 0, 0]} offset={0} />
              <MailIcon position={[1, 0.5, -1]} offset={2} />
              <MailIcon position={[0, -0.5, 1]} offset={4} />
            </group>
          )}
          {type === 'analytics' && <BarGraph />}
          {type === 'scheduling' && <Clock />}
        </Float>
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
};

export default Feature3D;
