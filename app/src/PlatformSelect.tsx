import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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

type PlatformSelectScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  optionTop: number;
  optionHeight: number;
};

/** Return the nearest scrollTop that makes the active option fully visible. */
export function calculatePlatformSelectScrollTop({
  scrollTop,
  clientHeight,
  optionTop,
  optionHeight,
}: PlatformSelectScrollMetrics): number {
  const visibleTop = scrollTop;
  const visibleBottom = scrollTop + clientHeight;
  const optionBottom = optionTop + optionHeight;
  if (optionTop < visibleTop) return Math.max(0, optionTop);
  if (optionBottom > visibleBottom) return Math.max(0, optionBottom - clientHeight);
  return scrollTop;
}

/** Give each keyboard/open scroll request a distinct token for the layout effect. */
export function advancePlatformSelectKeyboardScrollRequest(request: number): number {
  return request + 1;
}

type PlatformSelectPopupPositionBase = {
  left: number;
  width: number;
  maxHeight: number;
};

export type PlatformSelectPopupPosition =
  | (PlatformSelectPopupPositionBase & { placement: "above"; bottom: number })
  | (PlatformSelectPopupPositionBase & { placement: "below"; top: number });

type PopupAnchorRect = Pick<DOMRectReadOnly, "top" | "bottom" | "left" | "width">;

type PopupViewport = {
  width: number;
  height: number;
};

/**
 * Calculate the fixed-position popup geometry from viewport coordinates.
 *
 * Above placement deliberately uses a bottom anchor instead of estimating the
 * popup's rendered height. That keeps the popup edge attached to the trigger
 * even when its actual content is shorter than the max-height estimate.
 */
export function calculatePlatformSelectPopupPosition(
  rect: PopupAnchorRect,
  viewport: PopupViewport,
  optionCount: number,
): PlatformSelectPopupPosition {
  const viewportPadding = 8;
  // .platform-select-option is 13px × 1.5 line-height plus 12px vertical
  // padding (about 32px); keep this estimate coupled to its CSS height.
  const estimatedHeight = Math.min(280, Math.max(48, optionCount * 32 + 8));
  const belowSpace = Math.max(0, viewport.height - rect.bottom - viewportPadding);
  const aboveSpace = Math.max(0, rect.top - viewportPadding);
  const placement: PlatformSelectPopupPosition["placement"] =
    belowSpace >= estimatedHeight || belowSpace >= aboveSpace ? "below" : "above";
  const availableSpace = placement === "below" ? belowSpace : aboveSpace;
  // Keep the rendered box within the available side of the viewport, even
  // when the trigger leaves less than the normal 48px minimum.
  const maxHeight = Math.max(0, Math.min(280, availableSpace));
  const width = Math.min(rect.width, Math.max(0, viewport.width - viewportPadding * 2));
  const left = Math.max(
    viewportPadding,
    Math.min(rect.left, viewport.width - viewportPadding - width),
  );

  if (placement === "above") {
    return {
      bottom: viewport.height - rect.top,
      left,
      width,
      maxHeight,
      placement,
    };
  }

  return { top: rect.bottom, left, width, maxHeight, placement };
}

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
  const [popupPosition, setPopupPosition] = useState<PlatformSelectPopupPosition | null>(null);
  // A request counter keeps keyboard scrolling observable even when a
  // boundary key targets the same active index (React otherwise bails out of
  // the state update). Hover changes deliberately do not advance this count,
  // so a stationary pointer cannot restart scroll-follow.
  const [keyboardScrollRequest, setKeyboardScrollRequest] = useState(0);

  const setKeyboardActiveIndex = useCallback((index: number) => {
    setKeyboardScrollRequest(advancePlatformSelectKeyboardScrollRequest);
    setActiveIndex(index);
  }, []);

  const setHoverActiveIndex = useCallback((index: number) => {
    // Moving the pointer over an option must not scroll under a stationary
    // pointer; only keyboard navigation owns active-option scroll tracking.
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    if (!open) {
      setActiveIndex(selectedIndex);
    }
  }, [open, selectedIndex]);

  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    const popup = popupRef.current;
    const option = document.getElementById(`${listboxId}-option-${activeIndex}`);
    if (!popup || !(option instanceof HTMLElement)) return;
    const nextScrollTop = calculatePlatformSelectScrollTop({
      scrollTop: popup.scrollTop,
      clientHeight: popup.clientHeight,
      optionTop: option.offsetTop,
      optionHeight: option.offsetHeight,
    });
    if (nextScrollTop !== popup.scrollTop) popup.scrollTop = nextScrollTop;
  }, [keyboardScrollRequest, open]);

  const positionPopup = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    setPopupPosition(
      calculatePlatformSelectPopupPosition(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        props.options.length,
      ),
    );
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
    () => {
      if (props.disabled || selectedIndex < 0) return;
      setKeyboardScrollRequest(advancePlatformSelectKeyboardScrollRequest);
      setActiveIndex(selectedIndex);
      setOpen(true);
      positionPopup();
    },
    [positionPopup, props.disabled, selectedIndex],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const closeOnResize = () => closeMenu(false);
    const closeOnScroll = (event: Event) => {
      const target = event.target;
      // Scrolling the popup's own list is a normal way to reach lower
      // options; only viewport/ancestor scrolling invalidates fixed coords.
      if (target instanceof Node && popupRef.current?.contains(target)) return;
      closeMenu(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", closeOnResize);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", closeOnResize);
      window.removeEventListener("scroll", closeOnScroll, true);
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
      // Opening is not a selection. This keeps Escape a true cancellation
      // path; Enter/Space, click, or Tab are the only commit paths.
      if (!open) {
        openMenu();
        return;
      }
      const base = activeIndex >= 0 ? activeIndex : selectedIndex;
      const next = nextPlatformSelectIndex(props.options, base, direction);
      if (next < 0) return;
      setKeyboardActiveIndex(next);
    },
    [activeIndex, open, openMenu, props.options, selectedIndex, setKeyboardActiveIndex],
  );

  const moveToBoundary = useCallback(
    (toEnd: boolean) => {
      if (!open) {
        openMenu();
        return;
      }
      const index = toEnd
        ? [...props.options].map((option, index) => ({ option, index })).reverse().find(({ option }) => !option.disabled)?.index ?? -1
        : props.options.findIndex((option) => !option.disabled);
      if (index < 0) return;
      setKeyboardActiveIndex(index);
    },
    [open, openMenu, props.options, setKeyboardActiveIndex],
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
        ...(popupPosition.placement === "above"
          ? { bottom: popupPosition.bottom }
          : { top: popupPosition.top }),
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
              className="platform-select-popup platform-linux"
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
                  onMouseEnter={() => !option.disabled && setHoverActiveIndex(index)}
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
