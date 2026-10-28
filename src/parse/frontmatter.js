// Pull the parsed YAML frontmatter off the tree and stash it on file.data, then
// remove the node so it is not rendered into the body.
import yaml from "js-yaml";

export function remarkExtractFrontmatter() {
  return (tree, file) => {
    const node = tree.children.find((n) => n.type === "yaml");
    if (node) {
      try {
        file.data.frontmatter = yaml.load(node.value) || {};
      } catch (err) {
        throw new Error(`Failed to parse YAML frontmatter: ${err.message}`);
      }
    } else {
      file.data.frontmatter = {};
    }
    tree.children = tree.children.filter((n) => n.type !== "yaml");
  };
}
