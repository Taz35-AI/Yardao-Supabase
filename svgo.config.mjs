// svgo.config.mjs — conservative optimisation for the vehicle art.
// Preserves everything VehicleArt's recolour relies on:
//   • viewBox (used for scaling + full-canvas background detection)
//   • exact hex fills (the dark->colour / light->line classification)
//   • separate dark & light paths (no path merging)
export default {
  multipass: true,
  js2svg: { pretty: false },
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
          convertColors: false,
          mergePaths: false,
          removeHiddenElems: false,
          // convertPathData (default-on) is the big win: trims path-data
          // decimal precision without touching fills or structure.
        },
      },
    },
  ],
}
