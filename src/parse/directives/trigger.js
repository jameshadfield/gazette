// Lower `:trigger[label]{target=fig:slug update=…}` text directives into an
// accessible button that drives a figure via the gazette:update custom event:
//
//   <button type="button" class="gazette-trigger"
//           data-gazette-target="fig-slug"
//           data-gazette-update='{"scale":"log"}'>label</button>
//
// The `update` value is authored as inline flow-YAML and parsed with js-yaml's
// JSON_SCHEMA — the same typing as the figure config block — so `toggle` stays
// the string "toggle", `42` is a number, `true` a boolean, and
// `"{scale: log, highlight: [BA.1]}"` an object. It is then serialized to JSON
// for the data attribute; gazette-runtime.js JSON.parses it back into the
// gazette:update event detail at click time, so the component's update(arg)
// receives a typed value, not a raw string.
import { visit } from "unist-util-visit";
import yaml from "js-yaml";

export function remarkTriggers() {
  return (tree, file) => {
    const triggers = (file.data.triggers ||= []);

    visit(tree, (n) => n.type === "textDirective" && n.name === "trigger", (node) => {
      const attrs = node.attributes || {};
      const targetId = `fig-${String(attrs.target || "").replace(/^fig:/, "")}`;

      const raw = attrs.update ?? "";
      let value = "";
      if (raw !== "") {
        try {
          const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
          value = parsed === undefined ? "" : parsed;
        } catch (err) {
          throw new Error(`trigger → ${targetId}: invalid \`update\` value — ${err.message}`);
        }
      }

      triggers.push({ target: targetId, update: value });
      node.data = {
        hName: "button",
        hProperties: {
          type: "button",
          className: ["gazette-trigger"],
          "data-gazette-target": targetId,
          "data-gazette-update": JSON.stringify(value),
        },
      };
      // node.children (the [label] content) are kept as the button's children.
    });
  };
}
