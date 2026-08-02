import { describe, expect, it } from "vitest";
import {
  calculatePlatformSelectPopupPosition,
  calculatePlatformSelectScrollTop,
  nextPlatformSelectIndex,
  type PlatformSelectOption,
} from "./PlatformSelect";

const options: PlatformSelectOption[] = [
  { value: "placeholder", label: "Choose one" },
  { value: "hidden", label: "Unavailable", disabled: true },
  { value: "first", label: "First" },
  { value: "last", label: "Last" },
];

describe("nextPlatformSelectIndex", () => {
  it("moves in either direction while skipping disabled options", () => {
    expect(nextPlatformSelectIndex(options, 0, 1)).toBe(2);
    expect(nextPlatformSelectIndex(options, 2, -1)).toBe(0);
    expect(nextPlatformSelectIndex(options, 2, 1)).toBe(3);
  });

  it("does not wrap beyond either end", () => {
    expect(nextPlatformSelectIndex(options, 0, -1)).toBe(0);
    expect(nextPlatformSelectIndex(options, 3, 1)).toBe(3);
  });

  it("returns -1 when there are no options", () => {
    expect(nextPlatformSelectIndex([], 0, 1)).toBe(-1);
  });
});

describe("calculatePlatformSelectScrollTop", () => {
  it("scrolls down when the active option is below the visible area", () => {
    expect(
      calculatePlatformSelectScrollTop({
        scrollTop: 0,
        clientHeight: 100,
        optionTop: 120,
        optionBottom: 140,
      }),
    ).toBe(40);
  });

  it("scrolls up when the active option is above the visible area", () => {
    expect(
      calculatePlatformSelectScrollTop({
        scrollTop: 80,
        clientHeight: 100,
        optionTop: 40,
        optionBottom: 60,
      }),
    ).toBe(40);
  });

  it("keeps scrollTop unchanged when the active option is already visible", () => {
    expect(
      calculatePlatformSelectScrollTop({
        scrollTop: 40,
        clientHeight: 100,
        optionTop: 80,
        optionBottom: 100,
      }),
    ).toBe(40);
  });
});

describe("calculatePlatformSelectPopupPosition", () => {
  const viewport = { width: 1200, height: 1000 };

  it("anchors an above popup to the trigger's top edge", () => {
    const position = calculatePlatformSelectPopupPosition(
      { top: 900, bottom: 940, left: 100, width: 180 },
      viewport,
      3,
    );

    expect(position.placement).toBe("above");
    if (position.placement !== "above") throw new Error("expected above placement");
    expect(position.bottom).toBe(100);
    expect("top" in position).toBe(false);
    expect(position.maxHeight).toBeLessThanOrEqual(900 - 8);
  });

  it("keeps the existing trigger-bottom anchor for below placement", () => {
    const position = calculatePlatformSelectPopupPosition(
      { top: 100, bottom: 140, left: 100, width: 180 },
      viewport,
      3,
    );

    expect(position.placement).toBe("below");
    if (position.placement !== "below") throw new Error("expected below placement");
    expect(position.top).toBe(140);
    expect("bottom" in position).toBe(false);
    expect(position.maxHeight).toBeLessThanOrEqual(1000 - 140 - 8);
  });

  it("chooses the wider side when neither side fits the estimate", () => {
    const position = calculatePlatformSelectPopupPosition(
      { top: 200, bottom: 940, left: 100, width: 180 },
      viewport,
      12,
    );

    expect(position.placement).toBe("above");
    expect(position.maxHeight).toBeLessThanOrEqual(200 - 8);
  });

  it("keeps an extreme zero-space popup inside the viewport", () => {
    const extremeViewport = { width: 320, height: 100 };
    const position = calculatePlatformSelectPopupPosition(
      { top: 0, bottom: 100, left: 10, width: 120 },
      extremeViewport,
      20,
    );

    expect(position.placement).toBe("below");
    if (position.placement !== "below") throw new Error("expected below placement");
    expect(position.top).toBe(100);
    expect(position.maxHeight).toBe(0);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(extremeViewport.height);
  });
});
