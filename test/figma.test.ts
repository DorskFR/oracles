import assert from "node:assert/strict";
import { test } from "node:test";
import { type FigmaNode, figmaToNodeRecords } from "../src/references/figma-api.js";

test("figmaToNodeRecords maps box, color, radius, type, provenance", () => {
  const root: FigmaNode = {
    id: "1",
    name: "Frame",
    type: "FRAME",
    absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
    children: [
      {
        id: "2",
        name: "Button",
        type: "INSTANCE",
        absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 40 },
        cornerRadius: 6,
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
        children: [
          {
            id: "3",
            name: "Label",
            type: "TEXT",
            characters: "Go",
            absoluteBoundingBox: { x: 20, y: 20, width: 40, height: 20 },
            style: { fontFamily: "Inter", fontWeight: 600, fontSize: 16, lineHeightPx: 24 },
            fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
          },
        ],
      },
    ],
  };
  const nodes = figmaToNodeRecords(root);
  const btn = nodes.find((x) => x.fid === "Button")!;
  assert.equal(btn.styles["background-color"], "rgb(255, 0, 0)");
  assert.equal(btn.styles["border-top-left-radius"], "6px");
  assert.equal(btn.origin, "Button"); // INSTANCE => provenance marker
  assert.equal(btn.box.x, 10);
  assert.equal(btn.box.width, 100);

  const label = nodes.find((x) => x.fid === "Label")!;
  assert.equal(label.styles["color"], "rgb(255, 255, 255)");
  assert.equal(label.styles["font-family"], "inter");
  assert.equal(label.styles["font-weight"], "600");
  assert.equal(label.styles["font-size"], "16px");
});
