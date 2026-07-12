// @vitest-environment jsdom

import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BasinMap } from "./BasinMap";

class TestResizeObserver implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("BasinMap sector touch targets", () => {
  it("uses native HTML buttons outside SVG and preserves tap selection", async () => {
    const onSectorSelect = vi.fn();
    const user = userEvent.setup();
    render(
      createElement(BasinMap, {
        basin: {
          sectors: [
            {
              id: 13,
              name: "Blackwater Site 2",
              region: "blackwater",
              x: 0.5,
              y: 0.54,
              deepSite: true,
            },
          ],
          connections: [],
          entities: [],
          evidence: [],
        },
        interactiveCamera: true,
        inspectAllSectors: true,
        onSectorSelect,
      }),
    );

    const target = screen.getByRole("button", {
      name: /Sector 13, Blackwater Site 2/,
    });
    expect(target.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(target.closest("svg, foreignObject")).toBeNull();

    await user.click(target);
    expect(onSectorSelect).toHaveBeenCalledOnce();
    expect(onSectorSelect).toHaveBeenCalledWith(13);
  });
});
