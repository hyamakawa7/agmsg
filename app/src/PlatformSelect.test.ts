import { describe, expect, it } from "vitest";
import {
  calculatePlatformSelectPopupPosition,
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

describe("calculatePlatformSelectPopupPosition", () => {
  const viewport = { width: 1200, height: 1000 };

  it("anchors an above popup to the trigger's top edge", () => {
    const position = calculatePlatformSelectPopupPosition(
      { top: 900, bottom: 940, left: 100, width: 180 },
      viewport,
      3,
    );

    expect(position.placement).toBe("above");
    expect(position.bottom).toBe(100);
    expect(position.top).toBeUndefined();
  });

  it("keeps the existing trigger-bottom anchor for below placement", () => {
    const position = calculatePlatformSelectPopupPosition(
      { top: 100, bottom: 140, left: 100, width: 180 },
      viewport,
      3,
    );

    expect(position.placement).toBe("below");
    expect(position.top).toBe(140);
    expect(position.bottom).toBeUndefined();
  });
});
