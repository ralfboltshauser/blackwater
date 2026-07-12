#!/usr/bin/env python3
"""Generate Blackwater's neutral low-poly physical sprite kit.

The script is intentionally self-contained.  Blender is the source renderer, but
the game receives only transparent raster sprites.  Player identity, status
rings, labels, and tactical evidence remain code-native overlays.

Run with Blender 5:

    blender --background --factory-startup \
      --python tools/blender/generate_assets.py -- \
      --output assets/generated/raw \
      --blend assets/source/blender/blackwater-kit.blend
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path
from typing import Callable

import bpy
from mathutils import Vector


PIPELINE_VERSION = 1
KEEP_OBJECTS: set[str] = set()
TEMP_OBJECTS: list[bpy.types.Object] = []
MATERIALS: dict[str, bpy.types.Material] = {}


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--resolution", type=int, default=384)
    parser.add_argument("--samples", type=int, default=32)
    return parser.parse_args(argv)


def reset_blender() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.materials,
    ):
        for block in list(datablocks):
            datablocks.remove(block)


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.55,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Alpha"].default_value = color[3]
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    if color[3] < 1.0 and hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED"
    MATERIALS[name] = mat
    return mat


def setup_materials() -> None:
    # Deliberately neutral: ownership and warnings are runtime vector overlays.
    material("ivory", (0.68, 0.66, 0.57, 1.0), metallic=0.18, roughness=0.42)
    material("ivory_light", (0.87, 0.83, 0.70, 1.0), metallic=0.08, roughness=0.38)
    material("steel", (0.22, 0.30, 0.30, 1.0), metallic=0.62, roughness=0.30)
    material("steel_dark", (0.045, 0.095, 0.10, 1.0), metallic=0.52, roughness=0.35)
    material("rubber", (0.025, 0.045, 0.047, 1.0), metallic=0.0, roughness=0.72)
    material("glass", (0.06, 0.37, 0.42, 0.92), metallic=0.22, roughness=0.18)
    material(
        "mint",
        (0.17, 0.76, 0.68, 1.0),
        metallic=0.08,
        roughness=0.30,
        emission=(0.15, 0.72, 0.65),
        emission_strength=1.2,
    )
    material(
        "warm",
        (0.95, 0.47, 0.15, 1.0),
        metallic=0.05,
        roughness=0.38,
        emission=(0.86, 0.28, 0.06),
        emission_strength=0.55,
    )
    material("site_rock", (0.11, 0.23, 0.24, 1.0), metallic=0.05, roughness=0.82)
    material("shadow", (0.005, 0.018, 0.020, 0.26), metallic=0.0, roughness=1.0)


def remember(obj: bpy.types.Object, mat: str | None = None) -> bpy.types.Object:
    TEMP_OBJECTS.append(obj)
    if mat:
        obj.data.materials.append(MATERIALS[mat])
    return obj


def empty(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    return remember(obj)


def parent(obj: bpy.types.Object, root: bpy.types.Object) -> bpy.types.Object:
    obj.parent = root
    return obj


def smooth(obj: bpy.types.Object) -> None:
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def bevel(obj: bpy.types.Object, amount: float = 0.08, segments: int = 2) -> None:
    modifier = obj.modifiers.new("soft-machined-edge", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def box(
    root: bpy.types.Object,
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: str,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel_amount: float = 0.08,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = remember(bpy.context.object, mat)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_amount:
        bevel(obj, bevel_amount)
    return parent(obj, root)


def cylinder(
    root: bpy.types.Object,
    name: str,
    loc: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: str,
    *,
    vertices: int = 16,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel_amount: float = 0.04,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation
    )
    obj = remember(bpy.context.object, mat)
    obj.name = name
    if bevel_amount:
        bevel(obj, bevel_amount)
    return parent(obj, root)


def cone(
    root: bpy.types.Object,
    name: str,
    loc: tuple[float, float, float],
    radius1: float,
    radius2: float,
    depth: float,
    mat: str,
    *,
    vertices: int = 20,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=loc,
        rotation=rotation,
    )
    obj = remember(bpy.context.object, mat)
    obj.name = name
    bevel(obj, 0.04)
    return parent(obj, root)


def sphere(
    root: bpy.types.Object,
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: str,
    *,
    segments: int = 20,
    rings: int = 10,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=loc
    )
    obj = remember(bpy.context.object, mat)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    return parent(obj, root)


def ico(
    root: bpy.types.Object,
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: str,
    *,
    subdivisions: int = 1,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1.0, location=loc)
    obj = remember(bpy.context.object, mat)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return parent(obj, root)


def torus(
    root: bpy.types.Object,
    name: str,
    loc: tuple[float, float, float],
    major: float,
    minor: float,
    mat: str,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=24,
        minor_segments=8,
        location=loc,
        rotation=rotation,
    )
    obj = remember(bpy.context.object, mat)
    obj.name = name
    smooth(obj)
    return parent(obj, root)


def shadow(root: bpy.types.Object, sx: float, sy: float) -> None:
    sphere(root, "water-shadow", (0, 0, 0.045), (sx, sy, 0.025), "shadow", segments=24, rings=8)


def rail(root: bpy.types.Object, y: float, x_half: float, z: float) -> None:
    box(root, "deck-rail", (-x_half, y, z), (0.035, 0.54, 0.035), "steel_dark", bevel_amount=0.025)
    box(root, "deck-rail", (x_half, y, z), (0.035, 0.54, 0.035), "steel_dark", bevel_amount=0.025)


def build_ark(_: str = "idle") -> bpy.types.Object:
    root = empty("ARK_ROOT")
    shadow(root, 2.0, 0.72)
    # Direction zero points toward +Y.
    box(root, "port-hull", (-0.72, 0, 0.34), (0.43, 1.85, 0.28), "ivory", bevel_amount=0.24)
    box(root, "starboard-hull", (0.72, 0, 0.34), (0.43, 1.85, 0.28), "ivory", bevel_amount=0.24)
    box(root, "deck", (0, -0.05, 0.67), (0.78, 1.35, 0.15), "steel", bevel_amount=0.14)
    box(root, "cabin", (0, 0.15, 0.96), (0.48, 0.55, 0.27), "ivory_light", bevel_amount=0.15)
    box(root, "front-window", (0, 0.71, 1.01), (0.38, 0.035, 0.14), "glass", bevel_amount=0.035)
    box(root, "port-window", (-0.49, 0.18, 1.01), (0.035, 0.33, 0.13), "glass", bevel_amount=0.03)
    box(root, "starboard-window", (0.49, 0.18, 1.01), (0.035, 0.33, 0.13), "glass", bevel_amount=0.03)
    cylinder(root, "mast", (0, -0.54, 1.31), 0.055, 0.72, "steel_dark", vertices=10)
    cylinder(root, "sensor", (0, -0.54, 1.68), 0.14, 0.12, "mint", vertices=12)
    box(root, "aft-crane", (-0.43, -1.08, 0.99), (0.07, 0.42, 0.07), "warm", rotation=(0.0, 0.28, 0.0), bevel_amount=0.035)
    rail(root, -0.1, 1.12, 0.78)
    for x in (-0.72, 0.72):
        cylinder(root, "bow-lamp", (x, 1.52, 0.60), 0.07, 0.10, "mint", vertices=10)
    return root


def build_submarine(_: str = "idle") -> bpy.types.Object:
    root = empty("SUBMARINE_ROOT")
    shadow(root, 1.62, 0.57)
    sphere(root, "pressure-hull", (0, 0, 0.50), (0.58, 1.70, 0.48), "ivory", segments=24, rings=12)
    sphere(root, "nose-glass", (0, 1.28, 0.55), (0.41, 0.40, 0.34), "glass", segments=20, rings=10)
    box(root, "sail", (0, -0.12, 0.98), (0.22, 0.39, 0.20), "steel", bevel_amount=0.10)
    cylinder(root, "periscope", (0, -0.08, 1.28), 0.035, 0.48, "steel_dark", vertices=10)
    cylinder(root, "periscope-lamp", (0, -0.08, 1.53), 0.075, 0.08, "mint", vertices=10)
    box(root, "port-fin", (-0.72, -0.10, 0.54), (0.48, 0.34, 0.055), "steel", rotation=(0.0, 0.0, -0.18), bevel_amount=0.07)
    box(root, "starboard-fin", (0.72, -0.10, 0.54), (0.48, 0.34, 0.055), "steel", rotation=(0.0, 0.0, 0.18), bevel_amount=0.07)
    torus(root, "prop-guard", (0, -1.54, 0.50), 0.27, 0.045, "steel_dark", rotation=(math.pi / 2, 0, 0))
    for angle in (0, math.pi / 2):
        box(root, "prop-blade", (0, -1.56, 0.50), (0.04, 0.03, 0.25), "warm", rotation=(0, angle, 0), bevel_amount=0.02)
    return root


def platform_base(root: bpy.types.Object) -> None:
    shadow(root, 1.22, 0.86)
    cylinder(root, "foundation-lower", (0, 0, 0.20), 1.12, 0.32, "steel_dark", vertices=16, bevel_amount=0.08)
    cylinder(root, "foundation-band", (0, 0, 0.39), 0.96, 0.16, "ivory", vertices=16, bevel_amount=0.06)
    torus(root, "owner-collar-neutral", (0, 0, 0.50), 0.76, 0.10, "mint")
    cylinder(root, "module-socket", (0, 0, 0.55), 0.59, 0.25, "steel", vertices=16, bevel_amount=0.06)
    for angle in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        x, y = 0.92 * math.cos(angle), 0.92 * math.sin(angle)
        box(root, "brace", (x, y, 0.49), (0.12, 0.22, 0.10), "ivory_light", rotation=(0, 0, angle), bevel_amount=0.04)


def build_platform(_: str = "idle") -> bpy.types.Object:
    root = empty("PLATFORM_ROOT")
    platform_base(root)
    cylinder(root, "empty-socket", (0, 0, 0.77), 0.42, 0.18, "rubber", vertices=16, bevel_amount=0.04)
    return root


def build_extractor(_: str = "idle") -> bpy.types.Object:
    root = empty("EXTRACTOR_ROOT")
    platform_base(root)
    cylinder(root, "extractor-tower", (0, 0, 1.06), 0.44, 0.86, "ivory", vertices=12, bevel_amount=0.08)
    cylinder(root, "piston", (0, 0, 1.57), 0.22, 0.44, "steel", vertices=12, bevel_amount=0.04)
    cylinder(root, "cap", (0, 0, 1.83), 0.50, 0.14, "ivory_light", vertices=12, bevel_amount=0.06)
    for angle in (0, 2 * math.pi / 3, 4 * math.pi / 3):
        x, y = 0.48 * math.cos(angle), 0.48 * math.sin(angle)
        cylinder(root, "pipe", (x, y, 1.04), 0.075, 0.75, "steel_dark", vertices=8)
    cylinder(root, "work-light", (0, 0, 1.94), 0.10, 0.08, "warm", vertices=10)
    return root


def build_sonar(_: str = "idle") -> bpy.types.Object:
    root = empty("SONAR_ROOT")
    platform_base(root)
    cylinder(root, "sonar-column", (0, 0, 1.06), 0.34, 0.82, "ivory", vertices=14, bevel_amount=0.08)
    cylinder(root, "azimuth", (0, 0, 1.50), 0.43, 0.18, "steel", vertices=16, bevel_amount=0.05)
    # A shallow cone reads as a civic/scientific dish rather than a weapon.
    cone(root, "dish", (0, 0.06, 1.96), 0.78, 0.12, 0.18, "ivory_light", vertices=28, rotation=(math.radians(58), 0, 0))
    cylinder(root, "receiver-boom", (0, 0.26, 2.12), 0.035, 0.62, "steel_dark", vertices=8, rotation=(math.radians(58), 0, 0))
    sphere(root, "receiver", (0, 0.52, 2.28), (0.12, 0.12, 0.12), "mint", segments=12, rings=6)
    return root


def build_laboratory(_: str = "idle") -> bpy.types.Object:
    root = empty("LABORATORY_ROOT")
    platform_base(root)
    cylinder(root, "lab-housing", (0, 0, 1.02), 0.67, 0.70, "ivory", vertices=12, bevel_amount=0.10)
    sphere(root, "lab-dome", (0, 0, 1.50), (0.57, 0.57, 0.48), "glass", segments=20, rings=10)
    cylinder(root, "dome-ring", (0, 0, 1.32), 0.64, 0.11, "steel", vertices=16, bevel_amount=0.035)
    for angle in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        x, y = 0.54 * math.cos(angle), 0.54 * math.sin(angle)
        box(root, "dome-rib", (x, y, 1.48), (0.045, 0.045, 0.46), "steel_dark", rotation=(0.0, 0.25 * math.sin(angle), angle), bevel_amount=0.02)
    cylinder(root, "lab-beacon", (0, 0, 1.95), 0.09, 0.08, "mint", vertices=10)
    return root


def build_snare(state: str = "armed") -> bpy.types.Object:
    root = empty("SNARE_ROOT")
    shadow(root, 0.86, 0.62)
    cylinder(root, "snare-core", (0, 0, 0.30), 0.34, 0.42, "steel_dark", vertices=12, bevel_amount=0.06)
    cylinder(root, "snare-eye", (0, 0, 0.56), 0.12, 0.10, "warm", vertices=10)
    extension = 0.68 if state == "armed" else 0.38
    tilt = 0.12 if state == "armed" else 0.50
    for angle in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        x, y = extension * math.cos(angle), extension * math.sin(angle)
        box(root, "snare-arm", (x, y, 0.34), (0.42, 0.09, 0.08), "ivory", rotation=(0, tilt, angle), bevel_amount=0.06)
        tx, ty = 1.02 * math.cos(angle), 1.02 * math.sin(angle)
        if state == "armed":
            cone(root, "snare-tip", (tx, ty, 0.34), 0.11, 0.025, 0.36, "warm", vertices=8, rotation=(0, math.pi / 2, angle))
    return root


def build_decoy(state: str = "deployed") -> bpy.types.Object:
    root = empty("DECOY_ROOT")
    shadow(root, 0.78, 0.55)
    sphere(root, "decoy-core", (0, 0, 0.48), (0.43, 0.43, 0.43), "steel", segments=16, rings=8)
    torus(root, "echo-ring", (0, 0, 0.48), 0.48, 0.045, "mint", rotation=(math.pi / 2, 0, 0))
    extension = 0.86 if state == "deployed" else 0.48
    for angle in (0, 2 * math.pi / 3, 4 * math.pi / 3):
        x, y = extension * math.cos(angle), extension * math.sin(angle)
        box(root, "screen-fin", (x, y, 0.48), (0.44, 0.08, 0.30), "ivory_light", rotation=(0, 0, angle), bevel_amount=0.08)
    cylinder(root, "decoy-beacon", (0, 0, 0.92), 0.08, 0.14, "warm", vertices=10)
    return root


def build_site(state: str = "a") -> bpy.types.Object:
    root = empty(f"DEEP_SITE_{state.upper()}_ROOT")
    shadow(root, 1.12, 0.78)
    torus(root, "site-ring", (0, 0, 0.18), 0.82, 0.08, "steel_dark")
    configs = {
        "a": [(-0.44, -0.10, 0.52, 0.48), (0.16, 0.18, 0.66, 0.58), (0.51, -0.21, 0.43, 0.38)],
        "b": [(-0.52, 0.12, 0.40, 0.36), (0.02, -0.08, 0.82, 0.54), (0.48, 0.20, 0.55, 0.43)],
        "c": [(-0.46, -0.18, 0.64, 0.40), (0.05, 0.18, 0.50, 0.62), (0.48, -0.08, 0.72, 0.34)],
    }
    for index, (x, y, height, width) in enumerate(configs[state]):
        ico(root, f"geology-{index}", (x, y, height * 0.52), (width, width * 0.78, height), "site_rock", subdivisions=1)
        cylinder(root, f"marker-{index}", (x, y, height + 0.08), 0.06, 0.10, "mint", vertices=8)
    return root


def build_pod(_: str = "idle") -> bpy.types.Object:
    root = empty("SAMPLE_POD_ROOT")
    shadow(root, 0.84, 0.52)
    sphere(root, "pod-body", (0, 0, 0.42), (0.52, 0.82, 0.40), "ivory", segments=18, rings=8)
    box(root, "pod-window", (0, 0.57, 0.46), (0.28, 0.035, 0.18), "glass", bevel_amount=0.07)
    torus(root, "pod-collar", (0, 0, 0.42), 0.52, 0.055, "steel", rotation=(math.pi / 2, 0, 0))
    box(root, "pod-handle", (0, -0.72, 0.66), (0.38, 0.07, 0.06), "warm", bevel_amount=0.04)
    return root


def build_specimen(state: str = "ribbon-filter") -> bpy.types.Object:
    """Build the three analyzed ecology types as readable field-atlas miniatures."""
    root = empty(f"SPECIMEN_{state.upper().replace('-', '_')}_ROOT")
    shadow(root, 0.74, 0.52)
    if state == "ribbon-filter":
        cylinder(root, "filter-stem", (0, 0, 0.46), 0.10, 0.72, "steel_dark", vertices=10)
        torus(root, "filter-crown", (0, 0, 0.76), 0.34, 0.055, "mint", rotation=(math.pi / 2, 0, 0))
        for index, angle in enumerate((0, math.pi / 2, math.pi, 3 * math.pi / 2)):
            x, y = 0.42 * math.cos(angle), 0.42 * math.sin(angle)
            box(
                root,
                f"filter-ribbon-{index}",
                (x, y, 0.64 + (index % 2) * 0.12),
                (0.08, 0.46, 0.055),
                "ivory_light",
                rotation=(0.18 * (-1 if index % 2 else 1), 0.22, angle),
                bevel_amount=0.055,
            )
            sphere(root, f"filter-node-{index}", (x * 1.42, y * 1.42, 0.72), (0.10, 0.10, 0.10), "warm", segments=10, rings=5)
    elif state == "prism-raft":
        torus(root, "raft-membrane", (0, 0, 0.24), 0.60, 0.055, "mint")
        box(root, "raft-spine-a", (0, 0, 0.32), (0.68, 0.09, 0.07), "steel", rotation=(0, 0, 0.38), bevel_amount=0.045)
        box(root, "raft-spine-b", (0, 0, 0.32), (0.68, 0.09, 0.07), "steel", rotation=(0, 0, -0.38), bevel_amount=0.045)
        for index, (x, y, height, width) in enumerate(((-0.34, -0.06, 0.76, 0.30), (0.08, 0.16, 1.08, 0.38), (0.42, -0.16, 0.66, 0.27))):
            ico(root, f"raft-prism-{index}", (x, y, 0.30 + height * 0.42), (width, width * 0.74, height), "glass", subdivisions=1)
            cylinder(root, f"raft-light-{index}", (x, y, 0.34 + height), 0.055, 0.08, "mint", vertices=8)
    elif state == "luminous-pollen":
        sphere(root, "pollen-heart", (0, 0, 0.55), (0.28, 0.28, 0.28), "glass", segments=16, rings=8)
        positions = (
            (-0.52, -0.18, 0.38), (-0.38, 0.34, 0.68), (-0.12, -0.42, 0.80),
            (0.18, 0.40, 0.42), (0.45, -0.24, 0.68), (0.54, 0.20, 0.92),
            (-0.02, 0.02, 1.06), (0.22, -0.06, 0.72), (-0.52, 0.02, 1.00),
        )
        for index, (x, y, z) in enumerate(positions):
            radius = 0.09 + (index % 3) * 0.025
            sphere(root, f"pollen-spore-{index}", (x, y, z), (radius, radius, radius), "warm" if index % 3 == 0 else "mint", segments=10, rings=5)
            if index < 6:
                box(root, f"pollen-filament-{index}", (x * 0.52, y * 0.52, (z + 0.55) * 0.5), (0.025, 0.025, 0.26), "steel_dark", rotation=(0.2 * y, -0.2 * x, 0), bevel_amount=0.012)
    else:
        raise ValueError(f"Unknown specimen state: {state}")
    return root


def build_buoy(_: str = "idle") -> bpy.types.Object:
    root = empty("CALIBRATION_BUOY_ROOT")
    shadow(root, 0.72, 0.52)
    cylinder(root, "buoy-float", (0, 0, 0.34), 0.62, 0.34, "ivory", vertices=16, bevel_amount=0.10)
    cone(root, "buoy-body", (0, 0, 0.82), 0.38, 0.18, 0.72, "warm", vertices=16)
    cylinder(root, "buoy-mast", (0, 0, 1.38), 0.045, 0.70, "steel_dark", vertices=8)
    sphere(root, "buoy-beacon", (0, 0, 1.76), (0.13, 0.13, 0.13), "mint", segments=12, rings=6)
    for angle in (0, 2 * math.pi / 3, 4 * math.pi / 3):
        x, y = 0.55 * math.cos(angle), 0.55 * math.sin(angle)
        box(root, "buoy-fender", (x, y, 0.33), (0.18, 0.10, 0.13), "rubber", rotation=(0, 0, angle), bevel_amount=0.06)
    return root


BUILDERS: dict[str, Callable[[str], bpy.types.Object]] = {
    "ark": build_ark,
    "submarine": build_submarine,
    "platform": build_platform,
    "extractor": build_extractor,
    "sonar": build_sonar,
    "laboratory": build_laboratory,
    "snare": build_snare,
    "decoy": build_decoy,
    "deep-site": build_site,
    "sample-pod": build_pod,
    "specimen": build_specimen,
    "calibration-buoy": build_buoy,
}


ASSET_PLAN = [
    {"asset": "ark", "states": ["idle"], "directions": 16, "footprint": 1.75, "pivot": [0.5, 0.72]},
    {"asset": "submarine", "states": ["idle"], "directions": 16, "footprint": 1.48, "pivot": [0.5, 0.72]},
    {"asset": "platform", "states": ["idle"], "directions": 1, "footprint": 1.00, "pivot": [0.5, 0.72]},
    {"asset": "extractor", "states": ["active"], "directions": 1, "footprint": 1.00, "pivot": [0.5, 0.72]},
    {"asset": "sonar", "states": ["active"], "directions": 1, "footprint": 1.00, "pivot": [0.5, 0.72]},
    {"asset": "laboratory", "states": ["active"], "directions": 1, "footprint": 1.00, "pivot": [0.5, 0.72]},
    {"asset": "snare", "states": ["closed", "armed"], "directions": 1, "footprint": 0.72, "pivot": [0.5, 0.72]},
    {"asset": "decoy", "states": ["closed", "deployed"], "directions": 1, "footprint": 0.70, "pivot": [0.5, 0.72]},
    {"asset": "deep-site", "states": ["a", "b", "c"], "directions": 1, "footprint": 0.92, "pivot": [0.5, 0.72]},
    {"asset": "sample-pod", "states": ["idle"], "directions": 1, "footprint": 0.62, "pivot": [0.5, 0.72]},
    {"asset": "specimen", "states": ["ribbon-filter", "prism-raft", "luminous-pollen"], "directions": 1, "footprint": 0.68, "pivot": [0.5, 0.72]},
    {"asset": "calibration-buoy", "states": ["idle"], "directions": 1, "footprint": 0.58, "pivot": [0.5, 0.72]},
]


def setup_scene(resolution: int, samples: int) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    scene = bpy.context.scene
    # Blender 5 exposes Eevee Next under the stable BLENDER_EEVEE enum.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 85
    scene.render.use_file_extension = True
    scene.render.resolution_percentage = 100
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = samples
        scene.eevee.taa_samples = samples
        scene.eevee.use_taa_reprojection = False
        scene.eevee.use_shadow_jitter_viewport = False
        scene.eevee.use_bokeh_jittered = False
    scene.view_settings.look = "AgX - Medium High Contrast"

    bpy.ops.object.camera_add(location=(6.8, -8.5, 8.2))
    camera = bpy.context.object
    camera.name = "BLACKWATER_ORTHO_CAMERA"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.7
    camera.rotation_euler = ((Vector((0, 0, 0.65)) - camera.location).to_track_quat("-Z", "Y")).to_euler()
    scene.camera = camera

    lights: list[bpy.types.Object] = []
    for name, loc, energy, size, color in (
        ("KEY", (-4.0, -4.0, 9.0), 1050.0, 5.0, (1.0, 0.78, 0.58)),
        ("FILL", (5.0, -1.0, 6.5), 780.0, 4.0, (0.42, 0.92, 1.0)),
        ("RIM", (0.0, 6.0, 8.0), 900.0, 3.0, (0.36, 1.0, 0.82)),
    ):
        data = bpy.data.lights.new(name=f"BLACKWATER_{name}", type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(data.name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = ((Vector((0, 0, 0.5)) - obj.location).to_track_quat("-Z", "Y")).to_euler()
        lights.append(obj)

    KEEP_OBJECTS.update({camera.name, *(light.name for light in lights)})
    return camera, lights


def cleanup_asset() -> None:
    global TEMP_OBJECTS
    for obj in reversed(TEMP_OBJECTS):
        if obj and obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    TEMP_OBJECTS = []


def render_plan(output: Path) -> list[dict]:
    output.mkdir(parents=True, exist_ok=True)
    for path in output.glob("*.png"):
        path.unlink()

    rendered: list[dict] = []
    for spec in ASSET_PLAN:
        asset = spec["asset"]
        for state in spec["states"]:
            directions = int(spec["directions"])
            for direction in range(directions):
                root = BUILDERS[asset](state)
                root.rotation_euler.z = direction * (2 * math.pi / directions) if directions > 1 else 0.0
                direction_suffix = f"-dir{direction:02d}" if directions > 1 else ""
                state_suffix = f"-{state}" if state not in ("idle", "active") or len(spec["states"]) > 1 else ""
                key = f"{asset}{state_suffix}{direction_suffix}"
                filename = f"{key}.png"
                bpy.context.scene.render.filepath = str((output / filename).resolve())
                bpy.context.view_layer.update()
                bpy.ops.render.render(write_still=True)
                rendered.append(
                    {
                        "key": key,
                        "asset": asset,
                        "state": state,
                        "direction": direction if directions > 1 else None,
                        "headingDegrees": direction * (360 // directions) if directions > 1 else None,
                        "file": filename,
                        "footprint": spec["footprint"],
                        "pivot": spec["pivot"],
                    }
                )
                cleanup_asset()
    return rendered


def save_catalog(path: Path) -> None:
    # The generator is authoritative; this .blend is a convenient inspectable catalog.
    spacing_x, spacing_y = 4.5, 4.3
    for index, spec in enumerate(ASSET_PLAN):
        state = spec["states"][-1]
        root = BUILDERS[spec["asset"]](state)
        root.name = f"CATALOG_{spec['asset'].upper()}"
        root.location.x = (index % 4 - 1.5) * spacing_x
        root.location.y = (index // 4 - 1.0) * spacing_y
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(path.resolve()), check_existing=False)


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    blend = Path(args.blend)
    if output.exists():
        shutil.rmtree(output)

    reset_blender()
    setup_materials()
    setup_scene(args.resolution, args.samples)
    rendered = render_plan(output)
    index = {
        "schemaVersion": 1,
        "pipelineVersion": PIPELINE_VERSION,
        "renderer": "Blender 5 / Eevee Next / AgX",
        "resolution": [args.resolution, args.resolution],
        "count": len(rendered),
        "sprites": rendered,
    }
    (output / "render-index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    save_catalog(blend)
    print(f"Rendered {len(rendered)} sprites to {output}")
    print(f"Saved inspectable catalog to {blend}")


if __name__ == "__main__":
    main()
