import { describe, expect, it } from "vitest";
import { nextPlatformSelectIndex, type PlatformSelectOption } from "./PlatformSelect";

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
