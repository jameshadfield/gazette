// A small demo island: a multi-series line chart. Demonstrates the gazette figure
// contract — a pure render(container, data, opts) that returns a lifecycle object
// { element, resize, destroy, update }. The update(arg) method is the extension
// wired to prose :trigger controls via the gazette:update event.
//
// The host assembles `data` from the figure's named datasets, so each key is one
// parsed JSON file:
//   data = {
//     points: Array<{ date: string (ISO), value: number, series: string }>,  // data/demo.json
//     colors: Array<{ variant, color, display_name, is_major, order }>,       // data/palette.json
//   }
// opts = { mode?: "inline", log?: boolean, width? }
//
// Pure: no fetching, no ResizeObserver — the host owns data loading and resize.

import * as Plot from "./lib/plot.js";
import { colorScale, buildLegend } from "./lib/colors.js";

export function render(container, data, opts = {}) {
  const scale = colorScale(data.colors);
  const points = data.points.map((d) => ({ ...d, date: new Date(d.date) }));

  let useLog = opts.log === true;
  let lastWidth = 0;

  const root = document.createElement("div");
  container.appendChild(root);

  const header = document.createElement("div");
  Object.assign(header.style, { margin: "4px 0 8px" });
  header.appendChild(buildLegend(scale, { orientation: "horizontal", fontSize: "14px" }));
  root.appendChild(header);

  const plotHost = document.createElement("div");
  root.appendChild(plotHost);

  function measure() {
    const w = opts.width ?? Math.floor(container.clientWidth);
    return Math.max(320, w || 640);
  }

  function draw(width) {
    lastWidth = width;
    const chart = Plot.plot({
      width,
      height: Math.round(width * 0.5),
      marginLeft: 48,
      marginBottom: 28,
      style: { fontSize: "12px" },
      color: { type: "identity" },
      x: { type: "utc", label: null, tickFormat: "%b" },
      y: useLog
        ? { type: "log", label: "value (log)", grid: true }
        : { label: "value", grid: true, zero: true },
      marks: [
        Plot.ruleY(useLog ? [] : [0], { stroke: "#ccc" }),
        Plot.line(points, {
          x: "date",
          y: "value",
          z: "series",
          stroke: (d) => scale.color(d.series),
          strokeWidth: 1.8,
        }),
        Plot.dot(points, {
          x: "date",
          y: "value",
          fill: (d) => scale.color(d.series),
          r: 2.5,
        }),
      ],
    });
    plotHost.replaceChildren(chart);
  }

  draw(measure());

  return {
    element: root,
    resize(width) {
      draw(width ? Math.max(320, Math.floor(width)) : measure());
    },
    destroy() {
      root.remove();
    },
    // The argument may be a plain string ("log" / "linear" / "toggle") or a
    // structured payload like { scale: "log" | "linear" } from a trigger authored
    // in flow-YAML.
    update(arg) {
      const scale = arg && typeof arg === "object" ? arg.scale : arg;
      if (scale === "log") useLog = true;
      else if (scale === "linear") useLog = false;
      else useLog = !useLog; // "toggle" or anything else
      draw(lastWidth || measure());
    },
  };
}
