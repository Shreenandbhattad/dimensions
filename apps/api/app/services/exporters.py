from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from textwrap import dedent
from typing import Any
from uuid import UUID

import numpy as np
import trimesh

from app.services.storage import storage


def _block_dimensions(block: dict[str, Any]) -> tuple[float, float, float, float, float]:
    points = np.array(block["footprint_local"], dtype=np.float64)
    min_x, min_y = points.min(axis=0)
    max_x, max_y = points.max(axis=0)
    width = float(max(max_x - min_x, 1.0))
    depth = float(max(max_y - min_y, 1.0))
    center_x = float((min_x + max_x) / 2.0)
    center_y = float((min_y + max_y) / 2.0)
    height = float(max(float(block["height_m"]), 3.0))
    return width, depth, height, center_x, center_y


def _build_scene(massing_params: dict[str, Any], metadata: dict[str, Any]) -> trimesh.Scene:
    scene = trimesh.Scene()
    for index, block in enumerate(massing_params.get("blocks", [])):
        width, depth, height, center_x, center_y = _block_dimensions(block)
        mesh = trimesh.creation.box(extents=(width, depth, height))
        mesh.apply_translation((center_x, center_y, height / 2))
        scene.add_geometry(mesh, geom_name=f"block_{index}")
    scene.metadata.update({"extras": metadata})
    return scene


def export_gltf(
    *,
    site_id: UUID,
    variant_id: UUID,
    massing_params: dict[str, Any],
    scores: dict[str, float],
    compliance_flags: dict[str, bool],
) -> str:
    metadata = {
        "site_id": str(site_id),
        "variant_id": str(variant_id),
        "scores": scores,
        "compliance_flags": compliance_flags,
        "exported_at": datetime.now(UTC).isoformat(),
    }
    scene = _build_scene(massing_params, metadata=metadata)
    glb_bytes = scene.export(file_type="glb")
    key = f"sites/{site_id}/variants/{variant_id}/variant.glb"
    storage.put_bytes(key, glb_bytes, content_type="model/gltf-binary")
    return key


def export_ifc_stub(
    *,
    site_id: UUID,
    variant_id: UUID,
    massing_params: dict[str, Any],
    scores: dict[str, float],
) -> str:
    timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S")
    blocks = massing_params.get("blocks", [])
    element_lines = []
    base_id = 100
    for idx, block in enumerate(blocks):
        width, depth, height, center_x, center_y = _block_dimensions(block)
        element_lines.append(
            f"#{base_id + idx}=IFCBUILDINGELEMENTPROXY('3F7n{idx}',#5,'BLOCK_{idx}',"
            f"'w={width:.2f};d={depth:.2f};h={height:.2f};cx={center_x:.2f};cy={center_y:.2f}',$, $, $, $, $);"
        )
    if not element_lines:
        element_lines = ["#100=IFCBUILDINGELEMENTPROXY('3F7n0',#5,'EMPTY',$,$,$,$,$);"]

    ifc_body = dedent(
        f"""
        ISO-10303-21;
        HEADER;
        FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
        FILE_NAME(
          'dimensions_variant_{variant_id}.ifc',
          '{timestamp}',
          ('Dimensions'),
          ('Dimensions'),
          'Dimensions',
          'Dimensions API',
          ''
        );
        FILE_SCHEMA(('IFC2X3'));
        ENDSEC;
        DATA;
        #1=IFCPERSON($,$,'Dimensions',$,$,$,$,$);
        #2=IFCORGANIZATION($,'Dimensions',$,$,$);
        #3=IFCPERSONANDORGANIZATION(#1,#2,$);
        #4=IFCAPPLICATION(#2,'0.1.0','Dimensions API','DIMENSIONS');
        #5=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,{int(datetime.now(UTC).timestamp())});
        #6=IFCPROJECT('2D7project',#5,'DimensionsProject',$,$,$,$,(#20),#30);
        #20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#40,$);
        #30=IFCUNITASSIGNMENT((#31,#32,#33));
        #31=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
        #32=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
        #33=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
        #40=IFCAXIS2PLACEMENT3D(#41,$,$);
        #41=IFCCARTESIANPOINT((0.,0.,0.));
        {'\n'.join(element_lines)}
        ENDSEC;
        END-ISO-10303-21;
        """
    ).strip()

    metadata = {
        "variant_id": str(variant_id),
        "site_id": str(site_id),
        "scores": scores,
        "exported_at": timestamp,
    }
    buffer = BytesIO()
    buffer.write(ifc_body.encode("utf-8"))
    buffer.write(b"\n")
    buffer.write(f"/*METADATA:{metadata}*/".encode())
    key = f"sites/{site_id}/variants/{variant_id}/variant.ifc"
    storage.put_bytes(key, buffer.getvalue(), content_type="application/octet-stream")
    return key
