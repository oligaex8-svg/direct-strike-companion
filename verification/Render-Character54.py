"""Render original theme-specific SC2 models using the frozen, validated native-skin adapter.

Blender invocation: --background --python Render-Character54.py --
--device nerazim --pilot --angle both. Type-2 environmental-refraction exclusions are enumerated in provenance.
Camera fitting includes sampled weighted poses, with a 15 percent margin.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'verification/Render-Campaign48.py'
# Redirect only the output location in an isolated module namespace; never edit
# the frozen renderer. Retain its evaluated-skin validation and native shading.
source = BASE.read_text(encoding='utf-8')
assert source.count("use_affine_palette = args.device == 'protoss-core-work'") == 1
source = source.replace("use_affine_palette = args.device == 'protoss-core-work'", 'use_affine_palette = True')
old = "choices=(1, 2), default=1, help='Render raw frames"
assert source.count(old) == 1, 'Frozen supersampling argument changed'
source = source.replace(old, "choices=(1, 2), default=2, help='Render raw frames")
old = "out = ROOT / 'verification/local48-campaign' / args.device"
assert source.count(old) == 1, 'Frozen renderer output contract changed'
source = source.replace(old, "out = ROOT / 'verification/local54-characters' / args.device")
# Fingerprints cover both this adapter and the frozen implementation.
old = 'fingerprint_source = Path(__file__).read_bytes() + data_path.read_bytes()'
assert source.count(old) == 1, 'Frozen renderer fingerprint contract changed'
source = source.replace(old, 'fingerprint_source = Path(__file__).read_bytes() + BASE.read_bytes() + data_path.read_bytes()')
assert source.count("scene.view_settings.view_transform = 'AgX'") == 1
source = source.replace("scene.view_settings.view_transform = 'AgX'", "scene.view_settings.view_transform = 'AgX'\n    scene.view_settings.exposure = .8 if args.device == 'nova' else 0" )
namespace = {'__name__': 'native54_render_base', '__file__': str(Path(__file__).resolve()), 'BASE': BASE}
exec(compile(source, str(BASE), 'exec'), namespace)
namespace['NATIVE'] = ROOT / 'assets/themes/native54'
# Same square size and complete-envelope fitting method for all selected models.
# These are complete source sculptures, never scaled/cropped independent parts.
import importlib.util
export_spec = importlib.util.spec_from_file_location('character54_selection', ROOT / 'verification/Export-Character54.py')
selection = importlib.util.module_from_spec(export_spec)
export_spec.loader.exec_module(selection)
namespace['PROFILES'] = {name: {'size': (384, 384), 'a': (6, -8, 6), 'b': (0, -8, 4), 'pilotPhase': .25, 'surface': 'organic' if name in ('abathur', 'dehaka', 'cerberus', 'mecha', 'classic-zerg') else 'metal'} for name in selection.DEVICES}
base_arguments = namespace['arguments']

def arguments():
    args = base_arguments()
    if args.duration_ms is not None:
        raise ValueError('Native character clips must retain their original duration; --duration-ms is disabled')
    if args.frames > 400:
        raise ValueError('Native character rendering is bounded to at most 400 frames')
    return args

namespace['arguments'] = arguments


def camera_fit(scene, bounds, profile, angle):
    """Fit the full native animation envelope in Blender's horizontal sensor.

    AABB centers need not center an oblique projection. Recenter using projected
    extrema, then validate the actual Blender camera projection before rendering.
    """
    from mathutils import Vector
    from bpy_extras.object_utils import world_to_camera_view
    import bpy

    points = list(bounds)
    if not points:
        raise ValueError('Cannot frame an empty native model envelope')
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (minimum + maximum) / 2
    extent = max(maximum - minimum)
    if extent <= 0:
        raise ValueError('Cannot frame a zero-size native model envelope')
    camera = scene.camera
    direction = Vector(profile[angle]).normalized()
    rotation = (-direction).to_track_quat('-Z', 'Y')
    inverse_rotation = rotation.to_matrix().transposed()
    projected = [inverse_rotation @ (point - center) for point in points]
    xmin, xmax = min(point.x for point in projected), max(point.x for point in projected)
    ymin, ymax = min(point.y for point in projected), max(point.y for point in projected)
    center += rotation @ Vector(((xmin + xmax) / 2, (ymin + ymax) / 2, 0))
    camera.location = center + direction * extent * 4
    camera.rotation_euler = rotation.to_euler()
    camera.data.sensor_fit = 'HORIZONTAL'
    camera.data.shift_x = camera.data.shift_y = 0
    aspect = (scene.render.resolution_x * scene.render.pixel_aspect_x /
              (scene.render.resolution_y * scene.render.pixel_aspect_y))
    camera.data.ortho_scale = max(xmax - xmin, (ymax - ymin) * aspect) * 1.15
    camera.data.clip_start = extent * .001
    camera.data.clip_end = extent * 20
    bpy.context.view_layer.update()
    image_points = [world_to_camera_view(scene, camera, point) for point in points]
    outside = [tuple(point) for point in image_points
               if not (0 <= point.x <= 1 and 0 <= point.y <= 1 and point.z > 0)]
    if outside:
        raise ValueError(f'Native model {angle} camera crops {len(outside)} envelope extrema: {outside[:5]}')
    # Persist numerical evidence in the saved blend alongside the render report.
    camera['native54_projection_bounds'] = [min(point.x for point in image_points),
                                           max(point.x for point in image_points),
                                           min(point.y for point in image_points),
                                           max(point.y for point in image_points)]
    camera['native54_projection_checked_points'] = len(points)
    return center, extent


namespace['camera_fit'] = camera_fit

if __name__ == '__main__':
    namespace['main']()



