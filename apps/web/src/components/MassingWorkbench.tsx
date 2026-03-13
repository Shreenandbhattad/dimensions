import { Bounds, ContactShadows, Environment, Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";
import type { VariantResponse } from "@dimensions/contracts";
import { polygonArea, polygonBounds, polygonCentroid, type Point2D } from "../lib/siteAnalysis";

interface MassingWorkbenchProps {
  variant: VariantResponse | null;
}

type DisplayMode = "solid" | "wireframe" | "slabs";

interface BlockSummary {
  width: number;
  depth: number;
  centroid: Point2D;
}

function materialPalette(materialHint: string): { shell: string; accent: string; slab: string } {
  const hint = materialHint.toLowerCase();
  if (hint.includes("timber")) {
    return { shell: "#b98a55", accent: "#6f4a1f", slab: "#d9b27b" };
  }
  if (hint.includes("steel")) {
    return { shell: "#8aa1b2", accent: "#425562", slab: "#bfd0dc" };
  }
  return { shell: "#7bb6c8", accent: "#224f64", slab: "#d2eef5" };
}

function createFootprintShape(points: Point2D[]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  });
  shape.closePath();
  return shape;
}

function BlockModel({
  block,
  displayMode,
  explode,
  opacity,
  showCore
}: {
  block: VariantResponse["massing_params"]["blocks"][number];
  displayMode: DisplayMode;
  explode: number;
  opacity: number;
  showCore: boolean;
}) {
  const points = block.footprint_local as Point2D[];
  const summary = useMemo<BlockSummary>(() => {
    const bounds = polygonBounds([points]);
    return {
      width: Math.max(4, bounds.width),
      depth: Math.max(4, bounds.height),
      centroid: polygonCentroid(points)
    };
  }, [points]);

  const shape = useMemo(() => createFootprintShape(points), [points]);
  const shellGeometry = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: block.height_m,
      bevelEnabled: false
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  }, [block.height_m, shape]);

  const slabGeometry = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: false
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  }, [shape]);

  const edgeGeometry = useMemo(() => new THREE.EdgesGeometry(shellGeometry, 20), [shellGeometry]);
  const palette = materialPalette(block.material_hint);
  const floorCount = Math.min(block.floor_count, 36);
  const floorHeight = Math.max(2.8, block.floor_height_m || block.height_m / Math.max(1, floorCount));

  return (
    <group>
      <mesh geometry={shellGeometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={palette.shell}
          roughness={displayMode === "wireframe" ? 0.38 : 0.24}
          metalness={0.12}
          transmission={displayMode === "solid" ? 0.12 : 0.02}
          thickness={0.6}
          opacity={displayMode === "slabs" ? Math.max(0.12, opacity * 0.3) : opacity}
          transparent
          wireframe={displayMode === "wireframe"}
        />
      </mesh>

      {displayMode !== "wireframe" ? (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial color={palette.accent} transparent opacity={0.46} />
        </lineSegments>
      ) : null}

      {displayMode === "slabs"
        ? Array.from({ length: floorCount }).map((_, floorIndex) => (
            <mesh
              // Floor spacing exaggeration gives the model a lightweight exploded-axon feel.
              key={`${block.name}-${floorIndex}`}
              geometry={slabGeometry}
              position={[0, floorIndex * (floorHeight + explode * 0.38), 0]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color={palette.slab} roughness={0.28} metalness={0.08} />
            </mesh>
          ))
        : null}

      {showCore ? (
        <mesh
          position={[summary.centroid[0], block.height_m * 0.5, summary.centroid[1]]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[summary.width * 0.24, block.height_m, summary.depth * 0.24]} />
          <meshStandardMaterial color="#183547" roughness={0.32} metalness={0.18} />
        </mesh>
      ) : null}
    </group>
  );
}

function ModelScene({
  variant,
  displayMode,
  explode,
  opacity,
  showGrid,
  showCore,
  autoRotate
}: {
  variant: VariantResponse;
  displayMode: DisplayMode;
  explode: number;
  opacity: number;
  showGrid: boolean;
  showCore: boolean;
  autoRotate: boolean;
}) {
  const allPoints = variant.massing_params.blocks.flatMap((block) => block.footprint_local as Point2D[]);
  const bounds = useMemo(() => polygonBounds([allPoints]), [allPoints]);
  const centerX = bounds.minX + bounds.width * 0.5;
  const centerZ = bounds.minY + bounds.height * 0.5;

  return (
    <>
      <color attach="background" args={["#eef3f6"]} />
      <fog attach="fog" args={["#eef3f6", 80, 180]} />
      <ambientLight intensity={0.7} />
      <directionalLight
        castShadow
        intensity={1.45}
        position={[26, 34, 18]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight intensity={0.38} position={[-18, 16, -12]} />

      {showGrid ? (
        <Grid
          infiniteGrid
          sectionColor="#b8cad6"
          cellColor="#c9d7e1"
          fadeDistance={180}
          fadeStrength={1.3}
          sectionSize={20}
          cellSize={4}
        />
      ) : null}

      <group position={[-centerX, 0, -centerZ]}>
        {variant.massing_params.blocks.map((block, index) => (
          <group key={`${block.name}-${index}`}>
            <BlockModel
              block={block}
              displayMode={displayMode}
              explode={explode}
              opacity={opacity}
              showCore={showCore}
            />
          </group>
        ))}
      </group>

      <ContactShadows position={[0, -0.01, 0]} scale={120} blur={2.8} opacity={0.35} />
      <Environment preset="city" />
      <Bounds fit clip observe margin={1.2}>
        <mesh visible={false} position={[0, variant.scores.gfa_sqm * 0.0001, 0]}>
          <boxGeometry args={[bounds.width, 60, bounds.height]} />
        </mesh>
      </Bounds>
      <OrbitControls makeDefault autoRotate={autoRotate} autoRotateSpeed={0.55} />
    </>
  );
}

export function MassingWorkbench({ variant }: MassingWorkbenchProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("solid");
  const [explode, setExplode] = useState(0.4);
  const [opacity, setOpacity] = useState(0.92);
  const [showGrid, setShowGrid] = useState(true);
  const [showCore, setShowCore] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);

  const summary = useMemo(() => {
    if (!variant) return null;
    const heights = variant.massing_params.blocks.map((block) => block.height_m);
    const floorCount = variant.massing_params.blocks.reduce((total, block) => total + block.floor_count, 0);
    const footprintArea = variant.massing_params.blocks.reduce(
      (total, block) => total + polygonArea(block.footprint_local as Point2D[]),
      0
    );
    return {
      blockCount: variant.massing_params.blocks.length,
      floorCount,
      maxHeight: Math.max(...heights, 0),
      footprintArea
    };
  }, [variant]);

  return (
    <section className="panel massing-workbench-panel">
      <div className="panel-header">
        <div>
          <h3>Massing Workbench</h3>
          <p className="panel-hint">A lightweight model space for reading blocks, cores, floor plates, and envelope quality.</p>
        </div>
        {variant && summary ? (
          <div className="workbench-badges">
            <span>{summary.blockCount} blocks</span>
            <span>{summary.floorCount} floors</span>
            <span>{Math.round(summary.maxHeight)}m max</span>
            <span>{Math.round(summary.footprintArea)} sqm footprint</span>
          </div>
        ) : null}
      </div>

      {variant ? (
        <>
          <div className="workbench-toolbar">
            <div className="toolbar-group">
              <button
                type="button"
                className={displayMode === "solid" ? "active" : ""}
                onClick={() => setDisplayMode("solid")}
              >
                Solid shell
              </button>
              <button
                type="button"
                className={displayMode === "wireframe" ? "active" : ""}
                onClick={() => setDisplayMode("wireframe")}
              >
                Wireframe
              </button>
              <button
                type="button"
                className={displayMode === "slabs" ? "active" : ""}
                onClick={() => setDisplayMode("slabs")}
              >
                Floor slabs
              </button>
            </div>
            <div className="toolbar-switches">
              <label>
                <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                Grid
              </label>
              <label>
                <input type="checkbox" checked={showCore} onChange={(event) => setShowCore(event.target.checked)} />
                Core
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={autoRotate}
                  onChange={(event) => setAutoRotate(event.target.checked)}
                />
                Turntable
              </label>
            </div>
          </div>

          <div className="workbench-sliders">
            <label>
              Explode floors
              <input
                type="range"
                min="0"
                max="1.4"
                step="0.05"
                value={explode}
                onChange={(event) => setExplode(Number(event.target.value))}
              />
            </label>
            <label>
              Shell opacity
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="workbench-canvas">
            <Canvas shadows camera={{ position: [34, 26, 30], fov: 42 }}>
              <ModelScene
                variant={variant}
                displayMode={displayMode}
                explode={explode}
                opacity={opacity}
                showGrid={showGrid}
                showCore={showCore}
                autoRotate={autoRotate}
              />
            </Canvas>
          </div>

          <div className="workbench-footer">
            <div className="workbench-stat">
              <span>Solar</span>
              <strong>{Math.round(variant.scores.solar_access * 100)}%</strong>
            </div>
            <div className="workbench-stat">
              <span>Daylight</span>
              <strong>{Math.round(variant.scores.daylight_factor * 100)}%</strong>
            </div>
            <div className="workbench-stat">
              <span>Shadow impact</span>
              <strong>{Math.round(variant.scores.shadow_impact * 100)}%</strong>
            </div>
            <div className="workbench-stat">
              <span>GFA</span>
              <strong>{Math.round(variant.scores.gfa_sqm)} sqm</strong>
            </div>
          </div>
        </>
      ) : (
        <div className="analysis-empty-state">
          <p>Select a generated variant to inspect it as a 3D massing model.</p>
        </div>
      )}
    </section>
  );
}
