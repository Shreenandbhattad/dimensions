import { Environment, OrbitControls, Center, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, SSAO, SMAA } from "@react-three/postprocessing";
import { useMemo } from "react";
import * as THREE from "three";
import type { VariantResponse } from "@dimensions/contracts";

interface HqVariantPreviewProps {
  variant: VariantResponse | null;
  metric: "solar_access" | "daylight_factor" | "shadow_impact";
}

function tintFromScore(score: number, metric: HqVariantPreviewProps["metric"]): THREE.Color {
  if (metric === "shadow_impact") {
    return new THREE.Color().setHSL(0.08 + (1 - score) * 0.22, 0.55, 0.5);
  }
  return new THREE.Color().setHSL(0.58 - score * 0.33, 0.52, 0.55);
}

function VariantMesh({ url, tint }: { url: string; tint: THREE.Color }) {
  const gltf = useGLTF(url, true);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useMemo(() => {
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.material = new THREE.MeshPhysicalMaterial({
        color: tint,
        roughness: 0.2,
        metalness: 0.12,
        transmission: 0.28,
        thickness: 0.8,
        envMapIntensity: 1.3,
        clearcoat: 0.95,
        clearcoatRoughness: 0.08
      });
    });
  }, [scene, tint]);

  return (
    <Center>
      <primitive object={scene} />
    </Center>
  );
}

export function HqVariantPreview({ variant, metric }: HqVariantPreviewProps) {
  if (!variant?.gltf_download_url) {
    return (
      <div className="studio-empty">
        <p>Generate a variant to unlock studio-quality PBR preview.</p>
      </div>
    );
  }

  const metricValue = variant.scores[metric];
  const tint = tintFromScore(metricValue, metric);

  return (
    <div className="studio-canvas">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [16, 12, 16], fov: 48 }}
      >
        <color attach="background" args={["#edf3f9"]} />
        <ambientLight intensity={0.6} />
        <directionalLight intensity={1.55} position={[9, 15, 11]} castShadow />
        <directionalLight intensity={0.38} position={[-6, 8, -7]} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[160, 160]} />
          <meshStandardMaterial color="#dbe4ec" roughness={0.82} metalness={0.06} />
        </mesh>

        <VariantMesh url={variant.gltf_download_url} tint={tint} />
        <Environment preset="city" />
        <OrbitControls enablePan={false} minDistance={8} maxDistance={46} autoRotate autoRotateSpeed={0.45} />

        <EffectComposer multisampling={0}>
          <SSAO
            samples={16}
            radius={0.38}
            intensity={13}
            luminanceInfluence={0.45}
            worldDistanceThreshold={1}
            worldDistanceFalloff={0.1}
            worldProximityThreshold={0.03}
            worldProximityFalloff={0.001}
          />
          <SMAA />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
