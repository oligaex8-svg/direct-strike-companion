"""Render intact native consoles using the frozen, validated native-skin adapter.

Blender invocation: --background --python Render-NativeConsole53.py --
--device abathur-console --pilot --angle both. All native regions are retained.
Camera fitting includes sampled weighted poses, with a 15 percent margin.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'verification/Render-Campaign48Frozen.py'
# Redirect only the output location in an isolated module namespace; never edit
# the frozen renderer. Retain its evaluated-skin validation and native shading.
source = BASE.read_text(encoding='utf-8')
old = "out = ROOT / 'verification/local48-campaign' / args.device"
assert source.count(old) == 1, 'Frozen renderer output contract changed'
source = source.replace(old, "out = ROOT / 'verification/local53-native-console' / args.device")
# Fingerprints cover both this adapter and the frozen implementation.
old = 'fingerprint_source = Path(__file__).read_bytes() + data_path.read_bytes()'
assert source.count(old) == 1, 'Frozen renderer fingerprint contract changed'
source = source.replace(old, 'fingerprint_source = Path(__file__).read_bytes() + BASE.read_bytes() + data_path.read_bytes()')
namespace = {'__name__': 'native53_render_base', '__file__': str(Path(__file__).resolve()), 'BASE': BASE}
exec(compile(source, str(BASE), 'exec'), namespace)
namespace['NATIVE'] = ROOT / 'assets/themes/native53'
# Same size, view directions, phase and scale-fitting method for both consoles.
# These are complete source sculptures, never scaled/cropped independent parts.
namespace['PROFILES'] = {name: {'size': (512, 320), 'a': (0, -6, 2.4), 'b': (0, -6, 6), 'pilotPhase': .25, 'surface': 'organic'} for name in ('abathur-console', 'dehaka-console')}


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
        raise ValueError('Cannot frame an empty native console envelope')
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (minimum + maximum) / 2
    extent = max(maximum - minimum)
    if extent <= 0:
        raise ValueError('Cannot frame a zero-size native console envelope')
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
        raise ValueError(f'Native console {angle} camera crops {len(outside)} envelope extrema: {outside[:5]}')
    # Persist numerical evidence in the saved blend alongside the render report.
    camera['native53_projection_bounds'] = [min(point.x for point in image_points),
                                           max(point.x for point in image_points),
                                           min(point.y for point in image_points),
                                           max(point.y for point in image_points)]
    camera['native53_projection_checked_points'] = len(points)
    return center, extent


namespace['camera_fit'] = camera_fit

if __name__ == '__main__':
    namespace['main']()
