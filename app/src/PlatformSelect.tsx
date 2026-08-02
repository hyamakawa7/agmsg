import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type PlatformSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type PlatformSelectProps = {
  /** Render the custom control only for Linux; other platforms keep native select. */
  linux: boolean;
  value: string;
  onChange: (value: string) => void;
  options: readonly PlatformSelectOption[];
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

function firstSelectableIndex(options: readonly PlatformSelectOption[], value: string): number {
  const selected = options.findIndex((option) => option.value === value && !option.disabled);
  if (selected >= 0) return selected;
  return options.findIndex((option) => !option.disabled);
}

/** Move to the next selectable option without wrapping at either end. */
export function nextPlatformSelectIndex(
  options: readonly PlatformSelectOption[],
  current: number,
  direction: -1 | 1,
): number {
  if (!options.length) return -1;
  let index = current;
  while (true) {
    index += direction;
    if (index < 0 || index >= options.length) return current;
    if (!options[index]?.disabled) return index;
  }
}

type PopupPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "above" | "below";
};

function NativeSelect(props: PlatformSelectProps) {
  return (
    <select
      className={props.className}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function LinuxSelect(props: PlatformSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedIndex = useMemo(
    () => firstSelectableIndex(props.options, props.value),
    [props.options, props.value],
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [open, setOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);

  useEffect(() => {
    if (!open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  const positionPopup = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const estimatedHeight = Math.min(280, Math.max(48, props.options.length * 32 + 8));
    const belowSpace = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
    const aboveSpace = Math.max(0, rect.top - viewportPadding);
    const placement: PopupPosition["placement"] =
      belowSpace >= estimatedHeight || belowSpace >= aboveSpace ? "below" : "above";
    const availableSpace = placement === "below" ? belowSpace : aboveSpace;
    const maxHeight = Math.max(48, Math.min(280, availableSpace));
    const unclampedTop = placement === "below" ? rect.bottom : rect.top - maxHeight;
    const top = Math.max(
      viewportPadding,
      Math.min(unclampedTop, window.innerHeight - viewportPadding - maxHeight),
    );
    const width = Math.min(rect.width, Math.max(0, window.innerWidth - viewportPadding * 2));
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - viewportPadding - width),
    );
    setPopupPosition({ top, left, width, maxHeight, placement });
  }, [props.options.length]);

  const closeMenu = useCallback(
    (commit: boolean) => {
      if (commit && activeIndex >= 0) {
        const option = props.options[activeIndex];
        if (option && !option.disabled) props.onChange(option.value);
      } else {
        setActiveIndex(selectedIndex);
      }
      setOpen(false);
      setPopupPosition(null);
    },
    [activeIndex, props.onChange, props.options, selectedIndex],
  );

  const openMenu = useCallback(
    (index = selectedIndex) => {
      if (props.disabled) return;
      const nextIndex = index >= 0 ? index : firstSelectableIndex(props.options, props.value);
      if (nextIndex < 0) return;
      setActiveIndex(nextIndex);
      setOpen(true);
      positionPopup();
      if (typeof window !== "undefined") window.requestAnimationFrame(positionPopup);
    },
    [positionPopup, props.disabled, props.options, props.value, selectedIndex],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const closeOnViewportChange = () => closeMenu(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [closeMenu, open]);

  const selectIndex = useCallback(
    (index: number) => {
      const option = props.options[index];
      if (!option || option.disabled) return;
      setActiveIndex(index);
      props.onChange(option.value);
      setOpen(false);
      setPopupPosition(null);
    },
    [props.onChange, props.options],
  );

  const move = useCallback(
    (direction: -1 | 1) => {
      const base = activeIndex >= 0 ? activeIndex : selectedIndex;
      const next = nextPlatformSelectIndex(props.options, base, direction);
      if (next < 0) return;
      if (!open) {
        props.onChange(props.options[next].value);
        openMenu(next);
      } else {
        setActiveIndex(next);
      }
    },
    [activeIndex, open, openMenu, props.onChange, props.options, selectedIndex],
  );

  const moveToBoundary = useCallback(
    (toEnd: boolean) => {
      const index = toEnd
        ? [...props.options].map((option, index) => ({ option, index })).reverse().find(({ option }) => !option.disabled)?.index ?? -1
        : props.options.findIndex((option) => !option.disabled);
      if (index < 0) return;
      if (!open) {
        props.onChange(props.options[index].value);
        openMenu(index);
      } else {
        setActiveIndex(index);
      }
    },
    [open, openMenu, props.onChange, props.options],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        moveToBoundary(false);
        break;
      case "End":
        event.preventDefault();
        moveToBoundary(true);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) closeMenu(true);
        else openMenu();
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          closeMenu(false);
        }
        break;
      case "Tab":
        if (open) closeMenu(true);
        break;
    }
  };

  const onBlur = (event: FocusEvent<HTMLButtonElement>) => {
    const related = event.relatedTarget;
    if (related instanceof Node && (rootRef.current?.contains(related) || popupRef.current?.contains(related))) {
      return;
    }
    if (open) closeMenu(false);
  };

  const selectedLabel = props.options.find((option) => option.value === props.value)?.label ?? "";
  const triggerClassName = ["platform-select-trigger", props.className].filter(Boolean).join(" ");
  const popupStyle: CSSProperties | undefined = popupPosition
    ? {
        top: popupPosition.top,
        left: popupPosition.left,
        width: popupPosition.width,
        maxHeight: popupPosition.maxHeight,
      }
    : undefined;

  return (
    <div ref={rootRef} className="platform-select-custom">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        <span className="platform-select-trigger-label">{selectedLabel}</span>
        <span className="platform-select-chevron" aria-hidden="true" />
      </button>
      {open && popupPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popupRef}
              id={listboxId}
              className="platform-select-popup"
              data-placement={popupPosition.placement}
              role="listbox"
              aria-label={props.ariaLabel}
              style={popupStyle}
            >
              {props.options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${listboxId}-option-${index}`}
                  className={index === activeIndex ? "platform-select-option active" : "platform-select-option"}
                  role="option"
                  aria-selected={option.value === props.value}
                  aria-disabled={option.disabled || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => selectIndex(index)}
                >
                  {option.label}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function PlatformSelect(props: PlatformSelectProps) {
  return props.linux ? <LinuxSelect {...props} /> : <NativeSelect {...props} />;
}
