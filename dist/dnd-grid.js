import { onScopeDispose, defineComponent, inject, shallowRef, computed, openBlock, createElementBlock, mergeProps, toHandlers, renderSlot, normalizeProps, guardReactiveProps, createElementVNode, createCommentVNode, normalizeStyle, unref, provide, readonly, watch, onMounted, onBeforeUnmount } from 'vue';

const ContainerSymbol = Symbol("DndGridContainer");

function sort(layout) {
  return [...layout].sort((a, b) => {
    if (a.hidden && !b.hidden) {
      return 1;
    }
    if (!a.hidden && b.hidden) {
      return -1;
    }
    if (a.position.y < b.position.y) {
      return -1;
    }
    if (a.position.y > b.position.y) {
      return 1;
    }
    if (a.position.x < b.position.x) {
      return -1;
    }
    if (a.position.x > b.position.x) {
      return 1;
    }
    return 0;
  });
}
function isFree(layout, position, filter = (_layout) => true) {
  for (let i = 0; i < layout.length; i++) {
    if (!filter(layout[i])) continue;
    if (isOverlapping(layout[i].position, position)) {
      return false;
    }
  }
  return true;
}
function getSize(layout) {
  let w = 0;
  let h = 0;
  for (let i = 0; i < layout.length; i++) {
    const box = layout[i];
    if (box.hidden) continue;
    w = Math.max(w, box.position.x + box.position.w);
    h = Math.max(h, box.position.y + box.position.h);
  }
  return { w, h };
}
function moveToFreePlace(layout, box, layoutOptions) {
  if (box.pinned) {
    return box;
  }
  const newPosition = { ...box.position };
  const initialY = newPosition.y;
  if (layoutOptions?.bubbleUp && newPosition.y > 0) {
    if (layoutOptions?.bubbleUp === "jump-over") {
      newPosition.y = 0;
    }
    do {
      newPosition.y--;
    } while (newPosition.y >= 0 && isFree(layout, newPosition, (_box) => _box.id !== box.id));
    newPosition.y++;
  }
  while (!isFree(layout, newPosition, (_box) => _box.id !== box.id)) {
    newPosition.y++;
  }
  if (newPosition.y === initialY) {
    return box;
  }
  return updateBoxData(box, { position: newPosition });
}
function updateBoxData(box, data = {}) {
  const { id, position, ...layoutOptions } = data;
  return {
    ...box,
    ...layoutOptions,
    position: {
      ...box.position,
      ...position
    }
  };
}
function fix(layout, layoutOptions) {
  let newLayout = sort(layout);
  if (layoutOptions?.bubbleUp) {
    newLayout.forEach((box, index) => {
      newLayout[index] = moveToFreePlace(newLayout, box, layoutOptions);
    });
    newLayout = sort(newLayout);
  }
  return newLayout;
}
function getBox(layout, id) {
  return _getBox(layout, id).box;
}
function createBox(layout, id, data, layoutOptions) {
  let box = { id, position: { x: 0, y: 0, w: 1, h: 1 } };
  if (data) {
    box = updateBoxData(box, data);
  }
  return moveToFreePlace(layout, box, layoutOptions);
}
function placeBox(layout, box, layoutOptions) {
  let newLayout = layout.filter((_box) => _box.id !== box.id && _box.pinned);
  box = moveToFreePlace(newLayout, box);
  newLayout.push(box);
  sort(layout).forEach((_box) => {
    if (_box.id === box.id || _box.pinned) return;
    newLayout.push(moveToFreePlace(newLayout, _box));
  });
  return fix(newLayout, layoutOptions);
}
function addBox(layout, box, layoutOptions) {
  const { index, box: _box } = _getBox(layout, box.id);
  if (box === _box || index > -1) {
    return layout;
  }
  return placeBox(layout, box, layoutOptions);
}
function updateBox(layout, id, data, layoutOptions) {
  const { box } = _getBox(layout, id);
  if (!box) {
    return layout;
  }
  return placeBox(layout, updateBoxData(box, data), layoutOptions);
}
function removeBox(layout, id, layoutOptions) {
  const index = _getBox(layout, id).index;
  if (index > -1) {
    const newLayout = [...layout];
    newLayout.splice(index, 1);
    return fix(newLayout, layoutOptions);
  }
  return layout;
}
function isOverlapping(positionA, positionB) {
  return positionA.x < positionB.x + positionB.w && positionA.x + positionA.w > positionB.x && positionA.y < positionB.y + positionB.h && positionA.y + positionA.h > positionB.y;
}
function toPixels(position, cellWidth, cellHeight, spacing = 0) {
  const pixels = {};
  for (let key in position || {}) {
    switch (key) {
      case "x":
        pixels[key] = position.x * (cellWidth + spacing);
        break;
      case "y":
        pixels[key] = position.y * (cellHeight + spacing);
        break;
      case "w":
        pixels[key] = position.w * (cellWidth + spacing) - spacing;
        break;
      case "h":
        pixels[key] = position.h * (cellHeight + spacing) - spacing;
        break;
    }
  }
  return pixels;
}
function fromPixels(pixels, cellWidth, cellHeight, spacing = 0) {
  const position = {};
  for (let key in pixels || {}) {
    switch (key) {
      case "x":
        position[key] = Math.floor(pixels.x / (cellWidth + spacing));
        break;
      case "y":
        position[key] = Math.floor(pixels.y / (cellHeight + spacing));
        break;
      case "w":
        position[key] = Math.floor((pixels.w + spacing) / (cellWidth + spacing));
        break;
      case "h":
        position[key] = Math.floor((pixels.h + spacing) / (cellHeight + spacing));
        break;
    }
  }
  return position;
}
function _getBox(layout, id) {
  const index = layout.findIndex((box) => box.id === id);
  return {
    index,
    box: index > -1 ? layout[index] : void 0
  };
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function useMouseHandler(callbacks = {}) {
  let hasStarted = false;
  let isActive = false;
  let isTouch = false;
  let startEvent;
  let startX;
  let startY;
  let offsetX;
  let offsetY;
  function doUpdate(type, evt) {
    if (evt) {
      offsetX = (isTouch ? evt.changedTouches[0].pageX : evt.pageX) - startX;
      offsetY = (isTouch ? evt.changedTouches[0].pageY : evt.pageY) - startY;
    }
    callbacks[type]?.({ startX, startY, offsetX, offsetY }, evt);
  }
  function onStart(evt) {
    if (evt.defaultPrevented || hasStarted || !callbacks?.["allow"]?.(evt)) return;
    evt.stopPropagation();
    evt.preventDefault();
    hasStarted = true;
    isTouch = evt.type === "touchstart";
    startEvent = evt;
    startX = isTouch ? evt.changedTouches[0].pageX : evt.pageX;
    startY = isTouch ? evt.changedTouches[0].pageY : evt.pageY;
    if (isTouch) {
      window.addEventListener("touchcancel", onCancel, { once: true });
      window.addEventListener("touchend", onStop, { once: true });
      window.addEventListener("touchmove", onMove, { passive: false });
    } else {
      window.addEventListener("mouseup", onStop, { once: true });
      window.addEventListener("mousemove", onMove, { passive: false });
    }
  }
  function onStop(evt) {
    evt?.stopPropagation();
    evt?.preventDefault();
    if (isTouch) {
      window.removeEventListener("touchcancel", onCancel, { once: true });
      window.removeEventListener("touchend", onStop, { once: true });
      window.removeEventListener("touchmove", onMove, { passive: false });
    } else {
      window.removeEventListener("mouseup", onStop, { once: true });
      window.removeEventListener("mousemove", onMove, { passive: false });
    }
    if (isActive) {
      doUpdate("stop", evt);
    }
    hasStarted = false;
    isActive = false;
    startEvent = void 0;
  }
  function onCancel(evt) {
    evt?.stopPropagation();
    evt?.preventDefault();
    return onStop(startEvent);
  }
  function onMove(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    if (!isActive) {
      isActive = true;
      doUpdate("start", startEvent);
    }
    doUpdate("update", evt);
  }
  onScopeDispose(() => onCancel());
  return {
    touchstart: onStart,
    mousedown: onStart
  };
}

const _hoisted_1$1 = {
  key: 0,
  class: "dndgrid__box_placeholderContainer"
};
const _hoisted_2 = {
  key: 1,
  class: "dndgrid__box_resizeHandleContainer"
};
const __default__$1 = {
  inheritAttrs: false
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  ...__default__$1,
  __name: "Box",
  props: {
    boxId: {
      required: true,
      type: null
    },
    overflow: {
      type: String,
      default: "hidden"
    }
  },
  setup(__props) {
    const props = __props;
    const {
      computedCellSize: computedCellSizeRef,
      disabled: disabledRef,
      isResizable: isResizableRef,
      isDraggable: isDraggableRef,
      addResizeHandles: addResizeHandlesRef,
      canStartDrag,
      canStartResize,
      getBox,
      updateBox,
      startLayout,
      stopLayout
    } = inject(ContainerSymbol);
    const overlayEl = document.createElement("div");
    overlayEl.classList.add("dndgrid__box_overlay");
    const slotContainerElRef = shallowRef();
    const boxElRef = shallowRef();
    const boxRef = computed(() => getBox(props.boxId));
    const visibleRef = computed(() => boxRef.value && !(boxRef.value.hidden ?? false));
    const positionRef = computed(() => boxRef.value?.position);
    const cssPositionRef = computed(() => {
      const position = positionRef.value;
      const pixels = cssPixelsRef.value;
      const basePixels = baseCssPixelsRef.value;
      return {
        "--dnd-grid-box-x": (position?.x ?? 0) + 1,
        "--dnd-grid-box-y": (position?.y ?? 0) + 1,
        "--dnd-grid-box-width": position?.w ?? 0,
        "--dnd-grid-box-height": position?.h ?? 0,
        "--dndgrid__box_box_cssPixels-x": pixels?.x ?? 0,
        "--dndgrid__box_box_cssPixels-y": pixels?.y ?? 0,
        "--dndgrid__box_box_cssPixels-w": pixels?.w ?? 0,
        "--dndgrid__box_box_cssPixels-h": pixels?.h ?? 0,
        "--dndgrid__box_box_baseCssPixels-x": basePixels?.x ?? 0,
        "--dndgrid__box_box_baseCssPixels-y": basePixels?.y ?? 0,
        "--dndgrid__box_box_baseCssPixels-w": basePixels?.w ?? 0,
        "--dndgrid__box_box_baseCssPixels-h": basePixels?.h ?? 0
      };
    });
    const pixelsRef = computed(() => {
      if (!positionRef.value || !computedCellSizeRef.value) return;
      const { width, height, spacing } = computedCellSizeRef.value;
      return toPixels(
        boxRef.value.position,
        width,
        height,
        spacing
      );
    });
    const cssPixelsRef = computed(() => {
      const pixels = pixelsRef.value;
      return {
        x: `${pixels?.x ?? 0}px`,
        y: `${pixels?.y ?? 0}px`,
        w: `${pixels?.w ?? 0}px`,
        h: `${pixels?.h ?? 0}px`
      };
    });
    const isBoxResizableRef = computed(() => {
      return (!disabledRef.value && isResizableRef.value && (boxRef.value?.isResizable ?? true) && (!boxRef.value?.pinned || boxRef.value?.isResizable)) ?? false;
    });
    const isBoxDraggableRef = computed(() => {
      return (!disabledRef.value && isDraggableRef.value && (boxRef.value?.isDraggable ?? true) && (!boxRef.value?.pinned || boxRef.value?.isDraggable)) ?? false;
    });
    const baseCssPixelsRef = shallowRef({});
    let basePosition;
    const isDraggingRef = shallowRef(false);
    const dragEvents = useMouseHandler({
      allow: function allowDrag(evt) {
        return isBoxDraggableRef.value && canStartDrag(evt);
      },
      start: function onDragStart() {
        startLayout();
        baseCssPixelsRef.value = cssPixelsRef.value;
        basePosition = positionRef.value;
        isDraggingRef.value = true;
        document.body.appendChild(overlayEl);
        document.body.setAttribute("dnd-grid-drag", "");
      },
      stop: function onDragStop() {
        stopLayout();
        isDraggingRef.value = false;
        slotContainerElRef.value?.style?.removeProperty("--dnd-grid-box-offset-left");
        slotContainerElRef.value?.style?.removeProperty("--dnd-grid-box-offset-top");
        overlayEl.remove();
        document.body.removeAttribute("dnd-grid-drag");
      },
      update: function onDragUpdate({ offsetX, offsetY }) {
        let offsetPixels = { x: offsetX, y: offsetY, w: 0, h: 0 };
        applyOffsetPixels(basePosition, offsetPixels);
      }
    });
    const isResizingRef = shallowRef(false);
    let resizeMode;
    const resizeEvents = useMouseHandler({
      allow: function allowResize(evt) {
        return isBoxResizableRef.value && canStartResize(evt);
      },
      start: function onResizeStart(_, evt) {
        startLayout();
        resizeMode = evt?.target?.getAttribute?.("dnd-grid-resize") || "br";
        baseCssPixelsRef.value = cssPixelsRef.value;
        basePosition = positionRef.value;
        isResizingRef.value = true;
        document.body.appendChild(overlayEl);
        document.body.setAttribute("dnd-grid-resize", resizeMode);
      },
      stop: function onResizeStop() {
        stopLayout();
        isResizingRef.value = false;
        slotContainerElRef.value?.style?.removeProperty("--dnd-grid-box-offset-width");
        slotContainerElRef.value?.style?.removeProperty("--dnd-grid-box-offset-height");
        overlayEl.remove();
        document.body.removeAttribute("dnd-grid-resize");
      },
      update: function onResizeUpdate({ offsetX, offsetY }) {
        let offsetPixels = { x: 0, y: 0, w: 0, h: 0 };
        switch (resizeMode?.[0]) {
          case "t":
            offsetPixels.y = offsetY;
            offsetPixels.h = -offsetY;
            break;
          case "b":
            offsetPixels.h = offsetY;
            break;
        }
        switch (resizeMode?.[1]) {
          case "l":
            offsetPixels.x = offsetX;
            offsetPixels.w = -offsetX;
            break;
          case "r":
            offsetPixels.w = offsetX;
            break;
        }
        applyOffsetPixels(basePosition, offsetPixels);
      }
    });
    const boxEventsRef = computed(() => {
      return mergeEvents(dragEvents, resizeEvents);
    });
    function applyOffsetPixels(basePosition2, offsetPixels) {
      const slotContainerEl = slotContainerElRef.value;
      const cellSize = computedCellSizeRef.value;
      const { width, height, spacing } = computedCellSizeRef.value;
      const {
        minWidth = 1,
        minHeight = 1,
        maxWidth = Infinity,
        maxHeight = Infinity
      } = boxRef.value.resizeLimits ?? {};
      const minPixelWidth = minWidth * (cellSize.width + spacing) - spacing;
      const maxPixelWidth = maxWidth * (cellSize.width + spacing) - spacing;
      const minPixelHeight = minHeight * (cellSize.height + spacing) - spacing;
      const maxPixelHeight = maxHeight * (cellSize.height + spacing) - spacing;
      slotContainerEl?.style?.setProperty("--dnd-grid-box-offset-left", `${offsetPixels.x}px`);
      slotContainerEl?.style?.setProperty("--dnd-grid-box-offset-top", `${offsetPixels.y}px`);
      slotContainerEl?.style?.setProperty("--dnd-grid-box-offset-width", `${clamp(offsetPixels.w, minPixelWidth, maxPixelWidth)}px`);
      slotContainerEl?.style?.setProperty("--dnd-grid-box-offset-height", `${clamp(offsetPixels.h, minPixelHeight, maxPixelHeight)}px`);
      slotContainerEl?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest"
      });
      const halfCellSizeWidth = cellSize.width / 2;
      const halfCellSizeHeight = cellSize.height / 2;
      const targetPosition = fromPixels({
        x: offsetPixels.x + halfCellSizeWidth,
        // add half cellsize for better box placement
        y: offsetPixels.y + halfCellSizeHeight,
        w: offsetPixels.w + halfCellSizeWidth,
        h: offsetPixels.h + halfCellSizeHeight
      }, cellSize.width, cellSize.height, cellSize.spacing);
      targetPosition.x = Math.max(0, targetPosition.x + basePosition2.x);
      targetPosition.y = Math.max(0, targetPosition.y + basePosition2.y);
      targetPosition.w = clamp(targetPosition.w + basePosition2.w, minWidth, maxWidth);
      targetPosition.h = clamp(targetPosition.h + basePosition2.h, minHeight, maxHeight);
      updatePosition(targetPosition);
    }
    function updatePosition(targetPosition) {
      const position = positionRef.value;
      if (position.x !== targetPosition.x || position.y !== targetPosition.y || position.w !== targetPosition.w || position.h !== targetPosition.h) {
        updateBox(boxRef.value.id, { position: targetPosition });
      }
    }
    function mergeEvents(...eventObjects) {
      const eventMap = /* @__PURE__ */ new Map();
      eventObjects.forEach((eventObject) => {
        for (const key in eventObject) {
          const callbackList = eventMap.get(key) || eventMap.set(key, []).get(key);
          callbackList.push(eventObject[key]);
        }
      });
      const mergedEvents = {};
      eventMap.forEach((callbacks, key) => {
        mergedEvents[key] = (evt) => callbacks.forEach((callback) => callback(evt));
      });
      return mergedEvents;
    }
    onScopeDispose(() => {
      overlayEl.remove();
    });
    return (_ctx, _cache) => {
      return visibleRef.value ? (openBlock(), createElementBlock("div", mergeProps({
        key: 0,
        ref_key: "boxElRef",
        ref: boxElRef,
        class: {
          dndgrid__box_box: true,
          dndgrid__box_dragging: isDraggingRef.value,
          dndgrid__box_resizing: isResizingRef.value
        },
        style: cssPositionRef.value
      }, toHandlers(boxEventsRef.value, true)), [
        isDraggingRef.value || isResizingRef.value ? (openBlock(), createElementBlock("div", _hoisted_1$1, [
          renderSlot(_ctx.$slots, "placeholder", normalizeProps(guardReactiveProps(boxRef.value)), () => [
            _cache[0] || (_cache[0] = createElementVNode("div", { class: "dndgrid__box_placeholder" }, null, -1))
          ])
        ])) : createCommentVNode("", true),
        createElementVNode("div", {
          ref_key: "slotContainerElRef",
          ref: slotContainerElRef,
          class: "dndgrid__box_slotContainer",
          style: normalizeStyle({
            "--dndgrid__box_overflow": props.overflow
          })
        }, [
          renderSlot(_ctx.$slots, "default", normalizeProps(guardReactiveProps(boxRef.value)))
        ], 4),
        unref(addResizeHandlesRef) && isBoxResizableRef.value ? (openBlock(), createElementBlock("div", _hoisted_2, _cache[1] || (_cache[1] = [
          createElementVNode("div", { "dnd-grid-resize": "t-" }, null, -1),
          createElementVNode("div", { "dnd-grid-resize": "-r" }, null, -1),
          createElementVNode("div", { "dnd-grid-resize": "b-" }, null, -1),
          createElementVNode("div", { "dnd-grid-resize": "-l" }, null, -1),
          createElementVNode("div", { "dnd-grid-resize": "tl" }, null, -1),
          createElementVNode("div", { "dnd-grid-resize": "tr" }, null, -1),
          createElementVNode("div", { "dnd-grid-resize": "br" }, null, -1),
          createElementVNode("div", { "dnd-grid-resize": "bl" }, null, -1)
        ]))) : createCommentVNode("", true)
      ], 16)) : createCommentVNode("", true);
    };
  }
});

const _hoisted_1 = ["dnd-grid-mode"];
const __default__ = {
  inheritAttrs: true
};
let NEXT_DND_GRID_ID = 1;
const _sfc_main = /* @__PURE__ */ defineComponent({
  ...__default__,
  __name: "Container",
  props: {
    layout: {
      type: Array,
      default: () => []
    },
    bubbleUp: {
      type: [Boolean, String],
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    isResizable: {
      type: Boolean,
      default: true
    },
    isDraggable: {
      type: Boolean,
      default: true
    },
    dragSelector: {
      type: Object,
      default: () => ({
        include: "[dnd-grid-drag]",
        exclude: ":is(input, button, select, a[href])"
      })
    },
    resizeSelector: {
      type: Object,
      default: () => ({
        include: "[dnd-grid-resize]",
        exclude: ":is(input, button, select, a[href])"
      })
    },
    addResizeHandles: {
      type: Boolean,
      default: true
    },
    // styling (mapped to css props)
    cellWidth: {
      type: [Number, String],
      default: null
    },
    cellMaxWidth: {
      type: [Number, String],
      default: null
    },
    cellHeight: {
      type: [Number, String],
      default: null
    },
    cellMaxHeight: {
      type: [Number, String],
      default: null
    },
    cellSpacing: {
      type: [Number, String],
      default: null
    },
    resizeHandlerSize: {
      type: [Number, String],
      default: null
    },
    resizeHandlerOffset: {
      type: [Number, String],
      default: null
    },
    placeholderBackground: {
      type: String,
      default: null
    },
    placeholderBorder: {
      type: String,
      default: null
    },
    transitionTimingFunction: {
      type: String,
      default: null
    },
    transitionDuration: {
      type: String,
      default: null
    }
  },
  emits: ["update:layout"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const DND_GRID_ID = NEXT_DND_GRID_ID++;
    const emit = __emit;
    const containerElRef = shallowRef();
    const computedCellSizeRef = shallowRef();
    const modeRef = shallowRef("grid");
    const layoutRef = shallowRef(props.layout);
    const isResizable = computed(() => props.isResizable);
    const isDraggable = computed(() => props.isResizable);
    const addResizeHandles = computed(() => props.addResizeHandles);
    const disabled = computed(() => props.disabled);
    provide(ContainerSymbol, {
      layout: readonly(layoutRef),
      mode: readonly(modeRef),
      disabled,
      isResizable,
      isDraggable,
      computedCellSize: readonly(computedCellSizeRef),
      startLayout,
      stopLayout,
      getBox: getBox$1,
      updateBox: updateBox$1,
      canStartDrag,
      canStartResize,
      addResizeHandles
    });
    watch(() => props.layout, (newLayout) => {
      layoutRef.value = newLayout;
    });
    const layoutOptionsRef = computed(() => {
      return {
        bubbleUp: props.bubbleUp
      };
    });
    const dragSelectorsRef = computed(() => {
      return getSelectorsFromProp(props.dragSelector);
    });
    const resizeSelectorsRef = computed(() => {
      return getSelectorsFromProp(props.resizeSelector);
    });
    const cursorStyleContentRef = computed(() => {
      if (props.disabled) {
        return "";
      }
      const styleContent = [];
      styleContent.push(
        ...[
          ["", "cursor: var(--dnd-resize-cursor-nwse, nwse-resize);"],
          [":where([dnd-grid-resize=t-], [dnd-grid-resize=b-])", "cursor: var(--dnd-resize-cursor-ns, ns-resize);"],
          [":where([dnd-grid-resize=-r], [dnd-grid-resize=-l])", "cursor: var(--dnd-resize-cursor-ew, ew-resize);"],
          [":where([dnd-grid-resize=tl], [dnd-grid-resize=br])", "cursor: var(--dnd-resize-cursor-nwse, nwse-resize);"],
          [":where([dnd-grid-resize=tr], [dnd-grid-resize=bl])", "cursor: var(--dnd-resize-cursor-nesw, nesw-resize);"]
        ].map(([selector, rules]) => {
          const selectors = getSelectorsFromProp(props.resizeSelector, selector);
          return `
                .dndgrid__box_container[dnd-grid-id="${DND_GRID_ID}"] :not($dndgrid__box_container) ${selectors.join(", ")} {
                    ${rules}
                }
            `;
        }),
        ...[
          ["", "cursor: var(--dnd-drag-cursor, move);"]
        ].map(([selector, rules]) => {
          const selectors = getSelectorsFromProp(props.dragSelector, selector);
          return `
                .dndgrid__box_container[dnd-grid-id="${DND_GRID_ID}"] :not(.dndgrid__box_container) ${selectors.join(", ")} {
                    ${rules}
                }
            `;
        })
      );
      return styleContent.join("\n");
    });
    const cursorStyleSheet = new CSSStyleSheet();
    watch(cursorStyleContentRef, (content) => {
      cursorStyleSheet.replaceSync(content);
    }, {
      immediate: true
    });
    onMounted(() => {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursorStyleSheet];
    });
    onBeforeUnmount(() => {
      const index = document.adoptedStyleSheets.indexOf(cursorStyleSheet);
      if (index > -1) {
        document.adoptedStyleSheets = [
          ...document.adoptedStyleSheets.slice(0, index),
          ...document.adoptedStyleSheets.slice(index + 1)
        ];
      }
    });
    function getBox$1(id) {
      return getBox(layoutRef.value, id);
    }
    function updateBox$1(id, data) {
      return layoutRef.value = updateBox(props.layout, id, data, layoutOptionsRef.value);
    }
    function toCssSize(value) {
      if (value == void 0) return;
      return isNaN(value) ? value : `${value}px`;
    }
    function updateComputedCellSize() {
      if (containerElRef.value) {
        const style = getComputedStyle(containerElRef.value);
        const width = parseFloat(style.gridTemplateColumns);
        const height = parseFloat(style.gridTemplateRows);
        const spacing = parseFloat(style.gap);
        computedCellSizeRef.value = { width, height, spacing };
      }
      return computedCellSizeRef.value;
    }
    function startLayout() {
      updateComputedCellSize();
      modeRef.value = "layout";
    }
    function stopLayout() {
      emit("update:layout", layoutRef.value);
      modeRef.value = "grid";
    }
    function canStartDrag(evt) {
      return Boolean(evt.target && dragSelectorsRef.value.find((selector) => evt.target.matches(selector)));
    }
    function canStartResize(evt) {
      return Boolean(evt.target && resizeSelectorsRef.value.find((selector) => evt.target.matches(selector)));
    }
    function getSelectorsFromProp(prop, additionalSelector) {
      let selectors = [
        (prop.include || "*") + (additionalSelector || ""),
        (prop.include || "*") + (additionalSelector || "") + " *"
      ];
      if (prop.exclude) {
        selectors = selectors.map((selector) => `${selector}:not(${prop.exclude}, ${prop.exclude} *)`);
      }
      return selectors;
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "containerElRef",
        ref: containerElRef,
        "dnd-grid-id": DND_GRID_ID,
        "dnd-grid-mode": modeRef.value,
        class: "dndgrid__box_container",
        style: normalizeStyle({
          "--dnd-grid-cell-width": toCssSize(props.cellWidth),
          "--dnd-grid-cell-max-width": toCssSize(props.cellMaxWidth) ?? 0,
          "--dnd-grid-cell-height": toCssSize(props.cellHeight),
          "--dnd-grid-cell-max-height": toCssSize(props.cellMaxHeight) ?? 0,
          "--dnd-grid-cell-spacing": toCssSize(props.cellSpacing),
          "--dnd-grid-resize-handler-size": toCssSize(props.resizeHandlerSize),
          "--dnd-grid-resize-handler-offset": toCssSize(props.resizeHandlerOffset),
          "--dnd-grid-placeholder-background": props.placeholderBackground,
          "--dnd-grid-placeholder-border": props.placeholderBorder,
          "--dnd-grid-transition-timing-function": props.transitionTimingFunction,
          "--dnd-grid-transition-duration": props.transitionDuration
        })
      }, [
        renderSlot(_ctx.$slots, "default")
      ], 12, _hoisted_1);
    };
  }
});

export { _sfc_main$1 as Box, _sfc_main as Container, addBox, clamp, createBox, fix, fromPixels, getBox, getSize, isFree, isOverlapping, moveToFreePlace, removeBox, sort, toPixels, updateBox, updateBoxData, useMouseHandler as useDndHandler };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG5kLWdyaWQuanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9zeW1ib2xzLnRzIiwiLi4vc3JjL3Rvb2xzL2xheW91dC50cyIsIi4uL3NyYy9jb21wb3NhYmxlcy91c2VEbmRIYW5kbGVyLnRzIiwiLi4vc3JjL2NvbXBvbmVudHMvQm94LnZ1ZSIsIi4uL3NyYy9jb21wb25lbnRzL0NvbnRhaW5lci52dWUiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSW5qZWN0aW9uS2V5LCBSZWYsIFNoYWxsb3dSZWYgfSBmcm9tIFwidnVlXCI7XG5pbXBvcnQgeyBMYXlvdXQsIExheW91dEVsZW1lbnQgfSBmcm9tIFwiLi90b29scy9sYXlvdXRcIjtcblxuZXhwb3J0IHR5cGUgQ29tcHV0ZWRDZWxsU2l6ZSA9IHtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHNwYWNpbmc6IG51bWJlcjtcbn07XG5cbmV4cG9ydCB0eXBlIENvbnRhaW5lclByb3Zpc2lvbiA9IHtcbiAgICBsYXlvdXQ6IFJlYWRvbmx5PFNoYWxsb3dSZWY8TGF5b3V0Pj4sXG4gICAgbW9kZTogUmVhZG9ubHk8UmVmPHN0cmluZz4+LFxuICAgIGRpc2FibGVkOiBSZWFkb25seTxSZWY8Ym9vbGVhbj4+LFxuICAgIGlzUmVzaXphYmxlOiBSZWFkb25seTxSZWY8Ym9vbGVhbj4+LFxuICAgIGlzRHJhZ2dhYmxlOiBSZWFkb25seTxSZWY8Ym9vbGVhbj4+LFxuICAgIGNvbXB1dGVkQ2VsbFNpemU6IFJlYWRvbmx5PFJlZjxDb21wdXRlZENlbGxTaXplPj4sXG4gICAgc3RhcnRMYXlvdXQ6ICgpID0+IHZvaWQsXG4gICAgc3RvcExheW91dDogKCkgPT4gdm9pZCxcbiAgICBnZXRCb3g6IChpZDogYW55KSA9PiBMYXlvdXRFbGVtZW50IHwgdW5kZWZpbmVkLFxuICAgIHVwZGF0ZUJveDogKGlkOiBhbnksIGRhdGE6IFBhcnRpYWw8TGF5b3V0RWxlbWVudD4pID0+IExheW91dCxcbiAgICBjYW5TdGFydERyYWc6IChldnQ6IGFueSkgPT4gYm9vbGVhbixcbiAgICBjYW5TdGFydFJlc2l6ZTogKGV2dDogYW55KSA9PiBib29sZWFuLFxuICAgIGFkZFJlc2l6ZUhhbmRsZXM6IFJlYWRvbmx5PFJlZjxib29sZWFuPj4sXG59O1xuXG5leHBvcnQgY29uc3QgQ29udGFpbmVyU3ltYm9sID0gU3ltYm9sKCdEbmRHcmlkQ29udGFpbmVyJykgYXMgSW5qZWN0aW9uS2V5PENvbnRhaW5lclByb3Zpc2lvbj47IiwiLypcbkxheW91dCBqc29uXG5bXG4gICAgeyAvLyBlYWNoIGJveCBoYXMgaGlzIG93biBvYmplY3QgaW4gdGhlIGxheW91dCBhcnJheVxuICAgICAgICBpZDogMSwgLy8gYm94IGlkZW50aWZpZXIgKGNhbiBiZSBvZiBhbnkgdHlwZSlcbiAgICAgICAgaGlkZGVuOiBmYWxzZSwgLy8gaXMgYm94IGhpZGRlbiA/XG4gICAgICAgIHBpbm5lZDogZmFsc2UsIC8vIHNob3VsZCBib3ggc3RheSBmaXhlZCBvbiBpdHMgcG9zaXRpb25cbiAgICAgICAgaXNSZXNpemFibGU6IHRydWUsIC8vIGJveCBjYW4gYmUgcmVzaXplZFxuICAgICAgICBpc0RyYWdnYWJsZTogdHJ1ZSwgLy8gYm94IGNhbiBiZSBkcmFnZ2VkXG4gICAgICAgIHBvc2l0aW9uOiB7IC8vIGJveCBwb3NpdGlvbiBpbiB0aGUgbGF5b3V0IGdyaWRcbiAgICAgICAgICAgIHg6IDEsIC8vIGhvcml6b250YWwgcG9zaXRpb24gc3RhcnRpbmcgd2l0aCAxXG4gICAgICAgICAgICB5OiAxLCAvLyB2ZXJ0aWNhbCBwb3NpdGlvbiBzdGFydGluZyB3aXRoIDFcbiAgICAgICAgICAgIHc6IDUsIC8vIGJveCB3aWR0aFxuICAgICAgICAgICAgaDogMiAgLy8gYm94IGhlaWdodFxuICAgICAgICB9XG4gICAgfSxcbiAgICAuLi5cbl1cbiovXG50eXBlIFBvc2l0aW9uID0ge1xuICAgIC8qKiBob3Jpem9udGFsIHBvc2l0aW9uIHN0YXJ0aW5nIHdpdGggMSAqL1xuICAgIHg6IG51bWJlcixcbiAgICAvKiogdmVydGljYWwgcG9zaXRpb24gc3RhcnRpbmcgd2l0aCAxICovXG4gICAgeTogbnVtYmVyLFxuICAgIC8qKiBib3ggd2lkdGggKi9cbiAgICB3OiBudW1iZXIsXG4gICAgLyoqIGJveCBoZWlnaHQgKi9cbiAgICBoOiBudW1iZXIsXG59XG5leHBvcnQgdHlwZSBHcmlkUG9zaXRpb24gPSBQb3NpdGlvbjtcbmV4cG9ydCB0eXBlIFBpeGVsUG9zaXRpb24gPSBQb3NpdGlvbjtcblxuZXhwb3J0IHR5cGUgU2l6ZUxpbWl0cyA9IHtcbiAgICBtaW5XaWR0aDogbnVtYmVyLFxuICAgIG1pbkhlaWdodDogbnVtYmVyLFxuICAgIG1heFdpZHRoOiBudW1iZXIsXG4gICAgbWF4SGVpZ2h0OiBudW1iZXIsXG59XG5cbmV4cG9ydCB0eXBlIExheW91dEVsZW1lbnQgPSB7XG4gICAgLyoqIEJveCBpZGVudGlmaWVyIChjYW4gYmUgYW55IHR5cGUpICovXG4gICAgaWQ6IGFueSwgXG4gICAgLyoqIGlzIGJveCBoaWRkZW4/ICovXG4gICAgaGlkZGVuPzogYm9vbGVhbixcbiAgICAvKiogc2hvdWxkIGJveCBzdGF5IGZpeGVkIG9uIGl0cyBwb3NpdGlvbiAqL1xuICAgIHBpbm5lZD86IGJvb2xlYW4sXG4gICAgLyoqIGJveCBjYW4gYmUgcmVzaXplZCAqL1xuICAgIGlzUmVzaXphYmxlPzogYm9vbGVhbixcbiAgICAvKiogYm94IGNhbiBiZSBkcmFnZ2VkICovXG4gICAgaXNEcmFnZ2FibGU/OiBib29sZWFuLFxuICAgIC8qKiBib3ggcG9zaXRpb24gaW4gdGhlIGxheW91dCBncmlkICovXG4gICAgcG9zaXRpb246IEdyaWRQb3NpdGlvbixcbiAgICAvKiogbWluL21heCB3aWR0aC9oZWlnaHQgdGhlIGJveCBjYW4gYmUgcmVzaXplZCB0byAqL1xuICAgIHJlc2l6ZUxpbWl0cz86IFNpemVMaW1pdHMsXG59XG5cbmV4cG9ydCB0eXBlIExheW91dE9wdGlvbnMgPSB7XG4gICAgYnViYmxlVXA/OiBib29sZWFuIHwgXCJqdW1wLW92ZXJcIixcbn1cblxuZXhwb3J0IHR5cGUgTGF5b3V0ID0gcmVhZG9ubHkgTGF5b3V0RWxlbWVudFtdO1xuXG4vLyBzb3J0IGxheW91dCBiYXNlZCBvbiBwb3NpdGlvbiBhbmQgdmlzaWJpbGl0eVxuZXhwb3J0IGZ1bmN0aW9uIHNvcnQgKGxheW91dDogTGF5b3V0KSB7XG4gICAgcmV0dXJuIFsuLi5sYXlvdXRdLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgaWYgKGEuaGlkZGVuICYmICFiLmhpZGRlbikge1xuICAgICAgICAgICAgcmV0dXJuIDFcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWEuaGlkZGVuICYmIGIuaGlkZGVuKSB7XG4gICAgICAgICAgICByZXR1cm4gLTFcbiAgICAgICAgfVxuICAgICAgICBpZiAoYS5wb3NpdGlvbi55IDwgYi5wb3NpdGlvbi55KSB7XG4gICAgICAgICAgICByZXR1cm4gLTFcbiAgICAgICAgfVxuICAgICAgICBpZiAoYS5wb3NpdGlvbi55ID4gYi5wb3NpdGlvbi55KSB7XG4gICAgICAgICAgICByZXR1cm4gMVxuICAgICAgICB9XG4gICAgICAgIGlmIChhLnBvc2l0aW9uLnggPCBiLnBvc2l0aW9uLngpIHtcbiAgICAgICAgICAgIHJldHVybiAtMVxuICAgICAgICB9XG4gICAgICAgIGlmIChhLnBvc2l0aW9uLnggPiBiLnBvc2l0aW9uLngpIHtcbiAgICAgICAgICAgIHJldHVybiAxXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDBcbiAgICB9KVxufVxuXG4vLyBjaGVjayBpZiBwb3NpdGlvbiBpcyBmcmVlIGluIGxheW91dFxuZXhwb3J0IGZ1bmN0aW9uIGlzRnJlZSAobGF5b3V0OiByZWFkb25seSBMYXlvdXRFbGVtZW50W10sIHBvc2l0aW9uOiBHcmlkUG9zaXRpb24sIGZpbHRlciA9IChfbGF5b3V0OiBMYXlvdXRFbGVtZW50KSA9PiB0cnVlKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsYXlvdXQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKCFmaWx0ZXIobGF5b3V0W2ldKSkgY29udGludWVcbiAgICAgICAgaWYgKGlzT3ZlcmxhcHBpbmcobGF5b3V0W2ldLnBvc2l0aW9uLCBwb3NpdGlvbikpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlXG59XG5cbi8vIGdldCBsYXlvdXQgc2l6ZSBiYXNlZCBvbiBib3hlc1xuZXhwb3J0IGZ1bmN0aW9uIGdldFNpemUgKGxheW91dDogcmVhZG9ubHkgTGF5b3V0RWxlbWVudFtdKSB7XG4gICAgbGV0IHcgPSAwXG4gICAgbGV0IGggPSAwXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsYXlvdXQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgYm94ID0gbGF5b3V0W2ldXG4gICAgICAgIGlmIChib3guaGlkZGVuKSBjb250aW51ZVxuICAgICAgICB3ID0gTWF0aC5tYXgodywgYm94LnBvc2l0aW9uLnggKyBib3gucG9zaXRpb24udylcbiAgICAgICAgaCA9IE1hdGgubWF4KGgsIGJveC5wb3NpdGlvbi55ICsgYm94LnBvc2l0aW9uLmgpXG4gICAgfVxuICAgIHJldHVybiB7IHcsIGggfVxufVxuXG4vLyB1cGRhdGVzIGJveCBwb3NpdGlvbiB0byBhIGZyZWUgcGxhY2UgaW4gYSBnaXZlbiBsYXlvdXRcbmV4cG9ydCBmdW5jdGlvbiBtb3ZlVG9GcmVlUGxhY2UgKGxheW91dDogcmVhZG9ubHkgTGF5b3V0RWxlbWVudFtdLCBib3g6IExheW91dEVsZW1lbnQsIGxheW91dE9wdGlvbnM/OiBMYXlvdXRPcHRpb25zKSB7XG4gICAgaWYgKGJveC5waW5uZWQpIHtcbiAgICAgICAgcmV0dXJuIGJveFxuICAgIH1cbiAgICBjb25zdCBuZXdQb3NpdGlvbiA9IHsgLi4uYm94LnBvc2l0aW9uIH1cbiAgICBjb25zdCBpbml0aWFsWSA9IG5ld1Bvc2l0aW9uLnlcblxuICAgIGlmIChsYXlvdXRPcHRpb25zPy5idWJibGVVcCAmJiBuZXdQb3NpdGlvbi55ID4gMCkge1xuICAgICAgICBpZiAobGF5b3V0T3B0aW9ucz8uYnViYmxlVXAgPT09ICdqdW1wLW92ZXInKSB7XG4gICAgICAgICAgICBuZXdQb3NpdGlvbi55ID0gMFxuICAgICAgICB9XG5cbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgbmV3UG9zaXRpb24ueS0tXG4gICAgICAgIH0gd2hpbGUgKFxuICAgICAgICAgICAgbmV3UG9zaXRpb24ueSA+PSAwICYmXG4gICAgICAgICAgICBpc0ZyZWUobGF5b3V0LCBuZXdQb3NpdGlvbiwgX2JveCA9PiBfYm94LmlkICE9PSBib3guaWQpXG4gICAgICAgIClcbiAgICAgICAgbmV3UG9zaXRpb24ueSsrXG4gICAgfVxuXG4gICAgd2hpbGUgKCFpc0ZyZWUobGF5b3V0LCBuZXdQb3NpdGlvbiwgX2JveCA9PiBfYm94LmlkICE9PSBib3guaWQpKSB7XG4gICAgICAgIG5ld1Bvc2l0aW9uLnkrK1xuICAgIH1cblxuICAgIGlmIChuZXdQb3NpdGlvbi55ID09PSBpbml0aWFsWSkge1xuICAgICAgICByZXR1cm4gYm94XG4gICAgfVxuXG4gICAgcmV0dXJuIHVwZGF0ZUJveERhdGEoYm94LCB7IHBvc2l0aW9uOiBuZXdQb3NpdGlvbiB9KVxufVxuXG4vLyBpbW11dGFibGUgYm94IGRhdGEgbWVyZ2VcbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVCb3hEYXRhIChib3g6IExheW91dEVsZW1lbnQsIGRhdGE6IFBhcnRpYWw8TGF5b3V0RWxlbWVudD4gPSB7fSkge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby11bnVzZWQtdmFyc1xuICAgIGNvbnN0IHsgaWQsIHBvc2l0aW9uLCAuLi5sYXlvdXRPcHRpb25zIH0gPSBkYXRhXG4gICAgcmV0dXJuIHtcbiAgICAgICAgLi4uYm94LFxuICAgICAgICAuLi5sYXlvdXRPcHRpb25zLFxuICAgICAgICBwb3NpdGlvbjoge1xuICAgICAgICAgICAgLi4uYm94LnBvc2l0aW9uLFxuICAgICAgICAgICAgLi4ucG9zaXRpb25cbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gZml4IGxheW91dCBiYXNlZCBvbiBsYXlvdXRPcHRpb25zXG5leHBvcnQgZnVuY3Rpb24gZml4IChsYXlvdXQ6IExheW91dCwgbGF5b3V0T3B0aW9ucz86IExheW91dE9wdGlvbnMpIHtcbiAgICBsZXQgbmV3TGF5b3V0ID0gc29ydChsYXlvdXQpXG4gICAgaWYgKGxheW91dE9wdGlvbnM/LmJ1YmJsZVVwKSB7XG4gICAgICAgIG5ld0xheW91dC5mb3JFYWNoKChib3gsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICBuZXdMYXlvdXRbaW5kZXhdID0gbW92ZVRvRnJlZVBsYWNlKG5ld0xheW91dCwgYm94LCBsYXlvdXRPcHRpb25zKVxuICAgICAgICB9KVxuICAgICAgICBuZXdMYXlvdXQgPSBzb3J0KG5ld0xheW91dClcbiAgICB9XG4gICAgcmV0dXJuIG5ld0xheW91dFxufVxuXG4vLyBnZXQgYm94IGJ5IGlkXG5leHBvcnQgZnVuY3Rpb24gZ2V0Qm94IChsYXlvdXQ6IExheW91dCwgaWQ6IGFueSkge1xuICAgIHJldHVybiBfZ2V0Qm94KGxheW91dCwgaWQpLmJveFxufVxuXG4vLyBjcmVhdGUgYm94XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQm94IChsYXlvdXQ6IExheW91dCwgaWQ6IGFueSwgZGF0YTogUGFydGlhbDxMYXlvdXRFbGVtZW50PiwgbGF5b3V0T3B0aW9uczogTGF5b3V0T3B0aW9ucykge1xuICAgIGxldCBib3ggPSB7IGlkLCBwb3NpdGlvbjogeyB4OiAwLCB5OiAwLCB3OiAxLCBoOiAxIH0gfVxuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIGJveCA9IHVwZGF0ZUJveERhdGEoYm94LCBkYXRhKVxuICAgIH1cbiAgICByZXR1cm4gbW92ZVRvRnJlZVBsYWNlKGxheW91dCwgYm94LCBsYXlvdXRPcHRpb25zKVxufVxuXG5mdW5jdGlvbiBwbGFjZUJveCAobGF5b3V0OiBMYXlvdXQsIGJveDogTGF5b3V0RWxlbWVudCwgbGF5b3V0T3B0aW9uczogTGF5b3V0T3B0aW9ucykge1xuICAgIGxldCBuZXdMYXlvdXQgPSBsYXlvdXQuZmlsdGVyKF9ib3ggPT4gX2JveC5pZCAhPT0gYm94LmlkICYmIF9ib3gucGlubmVkKVxuICAgIGJveCA9IG1vdmVUb0ZyZWVQbGFjZShuZXdMYXlvdXQsIGJveClcbiAgICBuZXdMYXlvdXQucHVzaChib3gpXG5cbiAgICBzb3J0KGxheW91dCkuZm9yRWFjaChfYm94ID0+IHtcbiAgICAgICAgaWYgKF9ib3guaWQgPT09IGJveC5pZCB8fCBfYm94LnBpbm5lZCkgcmV0dXJuXG4gICAgICAgIG5ld0xheW91dC5wdXNoKG1vdmVUb0ZyZWVQbGFjZShuZXdMYXlvdXQsIF9ib3gpKVxuICAgIH0pXG5cbiAgICByZXR1cm4gZml4KG5ld0xheW91dCwgbGF5b3V0T3B0aW9ucylcbn1cblxuLy8gYWRkIGJveFxuZXhwb3J0IGZ1bmN0aW9uIGFkZEJveCAobGF5b3V0OiBMYXlvdXQsIGJveDogTGF5b3V0RWxlbWVudCwgbGF5b3V0T3B0aW9uczogTGF5b3V0T3B0aW9ucykge1xuICAgIGNvbnN0IHsgaW5kZXgsIGJveDogX2JveCB9ID0gX2dldEJveChsYXlvdXQsIGJveC5pZClcbiAgICBpZiAoYm94ID09PSBfYm94IHx8IGluZGV4ID4gLTEpIHtcbiAgICAgICAgcmV0dXJuIGxheW91dFxuICAgIH1cblxuICAgIHJldHVybiBwbGFjZUJveChsYXlvdXQsIGJveCwgbGF5b3V0T3B0aW9ucylcbn1cblxuLy8gdXBkYXRlIGJveFxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUJveCAobGF5b3V0OiBMYXlvdXQsIGlkOiBhbnksIGRhdGE6IFBhcnRpYWw8TGF5b3V0RWxlbWVudD4sIGxheW91dE9wdGlvbnM6IExheW91dE9wdGlvbnMpIHtcbiAgICBjb25zdCB7IGJveCB9ID0gX2dldEJveChsYXlvdXQsIGlkKVxuICAgIGlmICghYm94KSB7XG4gICAgICAgIHJldHVybiBsYXlvdXRcbiAgICB9XG5cbiAgICByZXR1cm4gcGxhY2VCb3gobGF5b3V0LCB1cGRhdGVCb3hEYXRhKGJveCwgZGF0YSksIGxheW91dE9wdGlvbnMpXG59XG5cbi8vIHJlbW92ZSBib3hcbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVCb3ggKGxheW91dDogTGF5b3V0LCBpZDogYW55LCBsYXlvdXRPcHRpb25zOiBMYXlvdXRPcHRpb25zKSB7XG4gICAgY29uc3QgaW5kZXggPSBfZ2V0Qm94KGxheW91dCwgaWQpLmluZGV4XG5cbiAgICBpZiAoaW5kZXggPiAtMSkge1xuICAgICAgICBjb25zdCBuZXdMYXlvdXQgPSBbLi4ubGF5b3V0XVxuICAgICAgICBuZXdMYXlvdXQuc3BsaWNlKGluZGV4LCAxKVxuICAgICAgICByZXR1cm4gZml4KG5ld0xheW91dCwgbGF5b3V0T3B0aW9ucylcbiAgICB9XG5cbiAgICByZXR1cm4gbGF5b3V0XG59XG5cbi8vIGNoZWNrIGlmIDIgcG9zaXRpb25zIGFyZSBvdmVybGFwcGluZ1xuZXhwb3J0IGZ1bmN0aW9uIGlzT3ZlcmxhcHBpbmcgKHBvc2l0aW9uQTogR3JpZFBvc2l0aW9uLCBwb3NpdGlvbkI6IEdyaWRQb3NpdGlvbikge1xuICAgIHJldHVybiBwb3NpdGlvbkEueCA8IChwb3NpdGlvbkIueCArIHBvc2l0aW9uQi53KSAmJlxuICAgICAgICAocG9zaXRpb25BLnggKyBwb3NpdGlvbkEudykgPiBwb3NpdGlvbkIueCAmJlxuICAgICAgICBwb3NpdGlvbkEueSA8IChwb3NpdGlvbkIueSArIHBvc2l0aW9uQi5oKSAmJlxuICAgICAgICAocG9zaXRpb25BLnkgKyBwb3NpdGlvbkEuaCkgPiBwb3NpdGlvbkIueVxufVxuXG4vLyBnZXQgYm94IHBvc2l0aW9uIGluIHBpeGVsc1xuZXhwb3J0IGZ1bmN0aW9uIHRvUGl4ZWxzIChwb3NpdGlvbjogR3JpZFBvc2l0aW9uLCBjZWxsV2lkdGg6IG51bWJlciwgY2VsbEhlaWdodDogbnVtYmVyLCBzcGFjaW5nOiBudW1iZXIgPSAwKTogUGl4ZWxQb3NpdGlvbiB7XG4gICAgY29uc3QgcGl4ZWxzOiBQYXJ0aWFsPFBpeGVsUG9zaXRpb24+ID0ge307XG4gICAgZm9yIChsZXQga2V5IGluIHBvc2l0aW9uIHx8IHt9KSB7XG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICd4JzpcbiAgICAgICAgICAgICAgICBwaXhlbHNba2V5XSA9IHBvc2l0aW9uLnggKiAoY2VsbFdpZHRoICsgc3BhY2luZylcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSAneSc6XG4gICAgICAgICAgICAgICAgcGl4ZWxzW2tleV0gPSBwb3NpdGlvbi55ICogKGNlbGxIZWlnaHQgKyBzcGFjaW5nKVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlICd3JzpcbiAgICAgICAgICAgICAgICBwaXhlbHNba2V5XSA9IChwb3NpdGlvbi53ICogKGNlbGxXaWR0aCArIHNwYWNpbmcpKSAtIHNwYWNpbmdcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSAnaCc6XG4gICAgICAgICAgICAgICAgcGl4ZWxzW2tleV0gPSAocG9zaXRpb24uaCAqIChjZWxsSGVpZ2h0ICsgc3BhY2luZykpIC0gc3BhY2luZ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBpeGVscyBhcyBQaXhlbFBvc2l0aW9uO1xufVxuXG4vLyBnZXQgYm94IHBvc2l0aW9uIGZyb20gcGl4ZWxzXG5leHBvcnQgZnVuY3Rpb24gZnJvbVBpeGVscyAocGl4ZWxzOiBQaXhlbFBvc2l0aW9uLCBjZWxsV2lkdGg6IG51bWJlciwgY2VsbEhlaWdodDogbnVtYmVyLCBzcGFjaW5nOiBudW1iZXIgPSAwKTogR3JpZFBvc2l0aW9uIHtcbiAgICBjb25zdCBwb3NpdGlvbjogUGFydGlhbDxHcmlkUG9zaXRpb24+ID0ge31cbiAgICBmb3IgKGxldCBrZXkgaW4gcGl4ZWxzIHx8IHt9KSB7XG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICd4JzpcbiAgICAgICAgICAgICAgICBwb3NpdGlvbltrZXldID0gTWF0aC5mbG9vcihwaXhlbHMueCAvIChjZWxsV2lkdGggKyBzcGFjaW5nKSlcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSAneSc6XG4gICAgICAgICAgICAgICAgcG9zaXRpb25ba2V5XSA9IE1hdGguZmxvb3IocGl4ZWxzLnkgLyAoY2VsbEhlaWdodCArIHNwYWNpbmcpKVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlICd3JzpcbiAgICAgICAgICAgICAgICBwb3NpdGlvbltrZXldID0gTWF0aC5mbG9vcigocGl4ZWxzLncgKyBzcGFjaW5nKSAvIChjZWxsV2lkdGggKyBzcGFjaW5nKSlcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSAnaCc6XG4gICAgICAgICAgICAgICAgcG9zaXRpb25ba2V5XSA9IE1hdGguZmxvb3IoKHBpeGVscy5oICsgc3BhY2luZykgLyAoY2VsbEhlaWdodCArIHNwYWNpbmcpKVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBvc2l0aW9uIGFzIEdyaWRQb3NpdGlvbjtcbn1cblxuLy8gZ2V0IGJveCBoZWxwZXIuIHJldHVybiBib3ggYW5kIHRoZSBpbmRleFxuZnVuY3Rpb24gX2dldEJveCAobGF5b3V0OiBMYXlvdXQsIGlkOiBhbnkpIHtcbiAgICBjb25zdCBpbmRleCA9IGxheW91dC5maW5kSW5kZXgoYm94ID0+IGJveC5pZCA9PT0gaWQpXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaW5kZXgsXG4gICAgICAgIGJveDogaW5kZXggPiAtMSA/IGxheW91dFtpbmRleF0gOiB1bmRlZmluZWRcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpIHtcbiAgICByZXR1cm4gTWF0aC5taW4obWF4LCBNYXRoLm1heChtaW4sIHZhbHVlKSk7XG59IiwiaW1wb3J0IHsgb25TY29wZURpc3Bvc2UgfSBmcm9tICd2dWUnXG5cbnR5cGUgTW91c2VDYWxsYmFja0FyZyA9IHtcbiAgICBzdGFydFg6IG51bWJlclxuICAgIHN0YXJ0WTogbnVtYmVyXG4gICAgb2Zmc2V0WDogbnVtYmVyXG4gICAgb2Zmc2V0WTogbnVtYmVyXG59XG5cbmV4cG9ydCB0eXBlIEV2ZW50SGFuZGxlckNhbGxiYWNrID0gKG1vdmVtZW50OiBNb3VzZUNhbGxiYWNrQXJnLCBldnQ6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50IHwgdW5kZWZpbmVkKSA9PiB2b2lkXG5cbmV4cG9ydCB0eXBlIENhbGxiYWNrcyA9IHtcbiAgICBhbGxvdz86IChldnQ6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50KSA9PiBib29sZWFuXG4gICAgc3RhcnQ/OiAobW92ZW1lbnQ6IE1vdXNlQ2FsbGJhY2tBcmcsIGV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG4gICAgc3RvcD86IChtb3ZlbWVudDogTW91c2VDYWxsYmFja0FyZywgZXZ0OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCB8IHVuZGVmaW5lZCkgPT4gdm9pZDtcbiAgICB1cGRhdGU/OiAobW92ZW1lbnQ6IE1vdXNlQ2FsbGJhY2tBcmcsIGV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG59XG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gdXNlTW91c2VIYW5kbGVyIChjYWxsYmFja3M6IENhbGxiYWNrcyA9IHt9KSB7XG4gICAgbGV0IGhhc1N0YXJ0ZWQgPSBmYWxzZVxuICAgIGxldCBpc0FjdGl2ZSA9IGZhbHNlXG4gICAgbGV0IGlzVG91Y2ggPSBmYWxzZVxuICAgIGxldCBzdGFydEV2ZW50OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCB8IHVuZGVmaW5lZDtcbiAgICBsZXQgc3RhcnRYOiBudW1iZXIgfCB1bmRlZmluZWRcbiAgICBsZXQgc3RhcnRZOiBudW1iZXIgfCB1bmRlZmluZWRcbiAgICBsZXQgb2Zmc2V0WDogbnVtYmVyIHwgdW5kZWZpbmVkXG4gICAgbGV0IG9mZnNldFk6IG51bWJlciB8IHVuZGVmaW5lZFxuXG4gICAgZnVuY3Rpb24gZG9VcGRhdGUgKHR5cGU6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJ1cGRhdGVcIiwgZXZ0OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCB8IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoZXZ0KSB7XG4gICAgICAgICAgICBvZmZzZXRYID0gKGlzVG91Y2ggPyAoZXZ0IGFzIFRvdWNoRXZlbnQpLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VYIDogKGV2dCBhcyBNb3VzZUV2ZW50KS5wYWdlWCkgLSBzdGFydFghXG4gICAgICAgICAgICBvZmZzZXRZID0gKGlzVG91Y2ggPyAoZXZ0IGFzIFRvdWNoRXZlbnQpLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VZIDogKGV2dCBhcyBNb3VzZUV2ZW50KS5wYWdlWSkgLSBzdGFydFkhXG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFja3NbdHlwZV0/Lih7IHN0YXJ0WDogc3RhcnRYISwgc3RhcnRZOiBzdGFydFkhLCBvZmZzZXRYOiBvZmZzZXRYISwgb2Zmc2V0WTogb2Zmc2V0WSEgfSwgZXZ0KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uU3RhcnQgKGV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgaWYgKGV2dC5kZWZhdWx0UHJldmVudGVkIHx8IGhhc1N0YXJ0ZWQgfHwgIWNhbGxiYWNrcz8uWydhbGxvdyddPy4oZXZ0KSkgcmV0dXJuXG4gICAgICAgIGV2dC5zdG9wUHJvcGFnYXRpb24oKVxuICAgICAgICBldnQucHJldmVudERlZmF1bHQoKVxuXG4gICAgICAgIGhhc1N0YXJ0ZWQgPSB0cnVlXG4gICAgICAgIGlzVG91Y2ggPSBldnQudHlwZSA9PT0gJ3RvdWNoc3RhcnQnXG4gICAgICAgIHN0YXJ0RXZlbnQgPSBldnRcbiAgICAgICAgc3RhcnRYID0gaXNUb3VjaCA/IChldnQgYXMgVG91Y2hFdmVudCkuY2hhbmdlZFRvdWNoZXNbMF0ucGFnZVggOiAoZXZ0IGFzIE1vdXNlRXZlbnQpLnBhZ2VYXG4gICAgICAgIHN0YXJ0WSA9IGlzVG91Y2ggPyAoZXZ0IGFzIFRvdWNoRXZlbnQpLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VZIDogKGV2dCBhcyBNb3VzZUV2ZW50KS5wYWdlWVxuXG4gICAgICAgIGlmIChpc1RvdWNoKSB7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hjYW5jZWwnLCBvbkNhbmNlbCwgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCBvblN0b3AsIHsgb25jZTogdHJ1ZSB9KVxuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIG9uTW92ZSwgeyBwYXNzaXZlOiBmYWxzZSB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBvblN0b3AsIHsgb25jZTogdHJ1ZSB9KVxuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIG9uTW92ZSwgeyBwYXNzaXZlOiBmYWxzZSB9KVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25TdG9wIChldnQ6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIGV2dD8uc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgZXZ0Py5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAgICAgaWYgKGlzVG91Y2gpIHtcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIG9uQ2FuY2VsLCB7IG9uY2U6IHRydWUgfSBhcyBFdmVudExpc3RlbmVyT3B0aW9ucylcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaGVuZCcsIG9uU3RvcCwgeyBvbmNlOiB0cnVlIH0gYXMgRXZlbnRMaXN0ZW5lck9wdGlvbnMpXG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgb25Nb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0gYXMgRXZlbnRMaXN0ZW5lck9wdGlvbnMpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG9uU3RvcCwgeyBvbmNlOiB0cnVlIH0gYXMgRXZlbnRMaXN0ZW5lck9wdGlvbnMpXG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgb25Nb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0gYXMgRXZlbnRMaXN0ZW5lck9wdGlvbnMpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNBY3RpdmUpIHtcbiAgICAgICAgICAgIGRvVXBkYXRlKCdzdG9wJywgZXZ0KVxuICAgICAgICB9XG5cbiAgICAgICAgaGFzU3RhcnRlZCA9IGZhbHNlXG4gICAgICAgIGlzQWN0aXZlID0gZmFsc2VcbiAgICAgICAgc3RhcnRFdmVudCA9IHVuZGVmaW5lZFxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uQ2FuY2VsIChldnQ/OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCB8IHVuZGVmaW5lZCkge1xuICAgICAgICBldnQ/LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgICAgIGV2dD8ucHJldmVudERlZmF1bHQoKVxuXG4gICAgICAgIHJldHVybiBvblN0b3Aoc3RhcnRFdmVudClcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbk1vdmUgKGV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgZXZ0LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAgICAgaWYgKCFpc0FjdGl2ZSkge1xuICAgICAgICAgICAgaXNBY3RpdmUgPSB0cnVlXG4gICAgICAgICAgICBkb1VwZGF0ZSgnc3RhcnQnLCBzdGFydEV2ZW50KVxuICAgICAgICB9XG5cbiAgICAgICAgZG9VcGRhdGUoJ3VwZGF0ZScsIGV2dClcbiAgICB9XG5cbiAgICBvblNjb3BlRGlzcG9zZSgoKSA9PiBvbkNhbmNlbCgpKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdG91Y2hzdGFydDogb25TdGFydCxcbiAgICAgICAgbW91c2Vkb3duOiBvblN0YXJ0XG4gICAgfVxufVxuIiwiPHNjcmlwdCBsYW5nPVwidHNcIj5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgICBpbmhlcml0QXR0cnM6IGZhbHNlXG59XG48L3NjcmlwdD5cblxuPHNjcmlwdCBzZXR1cCBsYW5nPVwidHNcIj5cbmltcG9ydCB7IENvbnRhaW5lclN5bWJvbCB9IGZyb20gJy4uL3N5bWJvbHMnXG5pbXBvcnQgeyBpbmplY3QsIHNoYWxsb3dSZWYsIGNvbXB1dGVkLCBvblNjb3BlRGlzcG9zZSB9IGZyb20gJ3Z1ZSdcbmltcG9ydCB7IHRvUGl4ZWxzLCBmcm9tUGl4ZWxzLCBHcmlkUG9zaXRpb24sIFBpeGVsUG9zaXRpb24sIGNsYW1wIH0gZnJvbSAnLi4vdG9vbHMvbGF5b3V0J1xuaW1wb3J0IHVzZURuZEhhbmRsZXIgZnJvbSAnLi4vY29tcG9zYWJsZXMvdXNlRG5kSGFuZGxlcidcblxuY29uc3QgcHJvcHMgPSBkZWZpbmVQcm9wcyh7XG4gICAgYm94SWQ6IHtcbiAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgIHR5cGU6IG51bGwgYXMgYW55LFxuICAgIH0sXG5cbiAgICBvdmVyZmxvdzoge1xuICAgICAgICB0eXBlOiBTdHJpbmcsXG4gICAgICAgIGRlZmF1bHQ6ICdoaWRkZW4nXG4gICAgfVxufSlcblxuY29uc3Qge1xuICAgIGNvbXB1dGVkQ2VsbFNpemU6IGNvbXB1dGVkQ2VsbFNpemVSZWYsXG4gICAgZGlzYWJsZWQ6IGRpc2FibGVkUmVmLFxuICAgIGlzUmVzaXphYmxlOiBpc1Jlc2l6YWJsZVJlZixcbiAgICBpc0RyYWdnYWJsZTogaXNEcmFnZ2FibGVSZWYsXG4gICAgYWRkUmVzaXplSGFuZGxlczogYWRkUmVzaXplSGFuZGxlc1JlZixcbiAgICBjYW5TdGFydERyYWcsXG4gICAgY2FuU3RhcnRSZXNpemUsXG4gICAgZ2V0Qm94LFxuICAgIHVwZGF0ZUJveCxcbiAgICBzdGFydExheW91dCxcbiAgICBzdG9wTGF5b3V0LFxufSA9IGluamVjdChDb250YWluZXJTeW1ib2wpITtcblxuY29uc3Qgb3ZlcmxheUVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jylcbm92ZXJsYXlFbC5jbGFzc0xpc3QuYWRkKFwiZG5kZ3JpZF9fYm94X292ZXJsYXlcIilcblxuY29uc3Qgc2xvdENvbnRhaW5lckVsUmVmID0gc2hhbGxvd1JlZigpXG5jb25zdCBib3hFbFJlZiA9IHNoYWxsb3dSZWYoKVxuXG4vLyBUT0RPIHJlc29sdmUgZXh0cmEgcGFyYW1ldGVyXG4vL2NvbnN0IGJveFJlZiA9IGNvbXB1dGVkKCgpID0+IGdldEJveChwcm9wcy5ib3hJZCwgdHJ1ZSkhKTtcbmNvbnN0IGJveFJlZiA9IGNvbXB1dGVkKCgpID0+IGdldEJveChwcm9wcy5ib3hJZCkhKTtcbmNvbnN0IHZpc2libGVSZWYgPSBjb21wdXRlZCgoKSA9PiBib3hSZWYudmFsdWUgJiYgIShib3hSZWYudmFsdWUuaGlkZGVuID8/IGZhbHNlKSlcblxuLy8gZ3JpZCBtb2RlXG5jb25zdCBwb3NpdGlvblJlZiA9IGNvbXB1dGVkKCgpID0+IGJveFJlZi52YWx1ZT8ucG9zaXRpb24pXG5jb25zdCBjc3NQb3NpdGlvblJlZiA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICBjb25zdCBwb3NpdGlvbiA9IHBvc2l0aW9uUmVmLnZhbHVlXG4gICAgY29uc3QgcGl4ZWxzID0gY3NzUGl4ZWxzUmVmLnZhbHVlO1xuICAgIGNvbnN0IGJhc2VQaXhlbHMgPSBiYXNlQ3NzUGl4ZWxzUmVmLnZhbHVlO1xuICAgIHJldHVybiB7XG4gICAgICAgICctLWRuZC1ncmlkLWJveC14JzogKHBvc2l0aW9uPy54ID8/IDApICsgMSxcbiAgICAgICAgJy0tZG5kLWdyaWQtYm94LXknOiAocG9zaXRpb24/LnkgPz8gMCkgKyAxLFxuICAgICAgICAnLS1kbmQtZ3JpZC1ib3gtd2lkdGgnOiBwb3NpdGlvbj8udyA/PyAwLFxuICAgICAgICAnLS1kbmQtZ3JpZC1ib3gtaGVpZ2h0JzogcG9zaXRpb24/LmggPz8gMCxcbiAgICAgICAgJy0tZG5kZ3JpZF9fYm94X2JveF9jc3NQaXhlbHMteCc6IHBpeGVscz8ueCA/PyAwLFxuICAgICAgICAnLS1kbmRncmlkX19ib3hfYm94X2Nzc1BpeGVscy15JzogcGl4ZWxzPy55ID8/IDAsXG4gICAgICAgICctLWRuZGdyaWRfX2JveF9ib3hfY3NzUGl4ZWxzLXcnOiBwaXhlbHM/LncgPz8gMCxcbiAgICAgICAgJy0tZG5kZ3JpZF9fYm94X2JveF9jc3NQaXhlbHMtaCc6IHBpeGVscz8uaCA/PyAwLFxuICAgICAgICAnLS1kbmRncmlkX19ib3hfYm94X2Jhc2VDc3NQaXhlbHMteCc6IGJhc2VQaXhlbHM/LnggPz8gMCxcbiAgICAgICAgJy0tZG5kZ3JpZF9fYm94X2JveF9iYXNlQ3NzUGl4ZWxzLXknOiBiYXNlUGl4ZWxzPy55ID8/IDAsXG4gICAgICAgICctLWRuZGdyaWRfX2JveF9ib3hfYmFzZUNzc1BpeGVscy13JzogYmFzZVBpeGVscz8udyA/PyAwLFxuICAgICAgICAnLS1kbmRncmlkX19ib3hfYm94X2Jhc2VDc3NQaXhlbHMtaCc6IGJhc2VQaXhlbHM/LmggPz8gMCxcbiAgICB9XG59KVxuXG4vLyBsYXlvdXRpbmcgbW9kZVxuY29uc3QgcGl4ZWxzUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIGlmICghcG9zaXRpb25SZWYudmFsdWUgfHwgIWNvbXB1dGVkQ2VsbFNpemVSZWYudmFsdWUpIHJldHVyblxuICAgIGNvbnN0IHsgd2lkdGgsIGhlaWdodCwgc3BhY2luZyB9ID0gY29tcHV0ZWRDZWxsU2l6ZVJlZi52YWx1ZVxuICAgIHJldHVybiB0b1BpeGVscyhcbiAgICAgICAgYm94UmVmLnZhbHVlLnBvc2l0aW9uLFxuICAgICAgICB3aWR0aCxcbiAgICAgICAgaGVpZ2h0LFxuICAgICAgICBzcGFjaW5nXG4gICAgKVxufSlcbmNvbnN0IGNzc1BpeGVsc1JlZiA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICBjb25zdCBwaXhlbHMgPSBwaXhlbHNSZWYudmFsdWVcbiAgICByZXR1cm4ge1xuICAgICAgICB4OiBgJHtwaXhlbHM/LnggPz8gMH1weGAsXG4gICAgICAgIHk6IGAke3BpeGVscz8ueSA/PyAwfXB4YCxcbiAgICAgICAgdzogYCR7cGl4ZWxzPy53ID8/IDB9cHhgLFxuICAgICAgICBoOiBgJHtwaXhlbHM/LmggPz8gMH1weGBcbiAgICB9XG59KVxuXG5jb25zdCBpc0JveFJlc2l6YWJsZVJlZiA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICByZXR1cm4gKCFkaXNhYmxlZFJlZi52YWx1ZSAvLyBkbmQgaXMgZW5hYmxlZFxuICAgICAgICAmJiBpc1Jlc2l6YWJsZVJlZi52YWx1ZSAvLyByZXNpemluZyBpcyBlbmFibGVkXG4gICAgICAgICYmIChib3hSZWYudmFsdWU/LmlzUmVzaXphYmxlID8/IHRydWUpIC8vIGJveCByZXNpemluZyBpcyBlbmFibGVkIChkZWZhdWx0cyB0byBlbmFibGVkKVxuICAgICAgICAmJiAoIWJveFJlZi52YWx1ZT8ucGlubmVkIHx8IGJveFJlZi52YWx1ZT8uaXNSZXNpemFibGUpIC8vIHBpbm5lZCBib3hlcyBjYW4gb25seSBiZSBkcmFnZ2VkIHdoZW4gcmVzaXppbmcgaXMgZXhwbGljaXRseSBlbmFibGVkXG4gICAgICAgICkgPz8gZmFsc2Vcbn0pXG5cbmNvbnN0IGlzQm94RHJhZ2dhYmxlUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIHJldHVybiAoIWRpc2FibGVkUmVmLnZhbHVlIC8vIGRuZCBpcyBlbmFibGVkXG4gICAgICAgICYmIGlzRHJhZ2dhYmxlUmVmLnZhbHVlIC8vIGRyYWdnaW5nIGlzIGVuYWJsZWRcbiAgICAgICAgJiYgKGJveFJlZi52YWx1ZT8uaXNEcmFnZ2FibGUgPz8gdHJ1ZSkgLy8gYm94IGRyYWdnaW5nIGlzIGVuYWJsZWQgKGRlZmF1bHRzIHRvIGVuYWJsZWQpXG4gICAgICAgICYmICghYm94UmVmLnZhbHVlPy5waW5uZWQgfHwgYm94UmVmLnZhbHVlPy5pc0RyYWdnYWJsZSkgLy8gcGlubmVkIGJveGVzIGNhbiBvbmx5IGJlIGRyYWdnZWQgd2hlbiBkcmFnZ2luZyBpcyBleHBsaWNpdGx5IGVuYWJsZWRcbiAgICAgICAgKSA/PyBmYWxzZVxufSlcblxuY29uc3QgYmFzZUNzc1BpeGVsc1JlZiA9IHNoYWxsb3dSZWYoe30gYXMgeyB4OiBzdHJpbmcsIHk6IHN0cmluZywgdzogc3RyaW5nLCBoOiBzdHJpbmcgfSlcbmxldCBiYXNlUG9zaXRpb246IEdyaWRQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblxuY29uc3QgaXNEcmFnZ2luZ1JlZiA9IHNoYWxsb3dSZWYoZmFsc2UpXG5jb25zdCBkcmFnRXZlbnRzID0gdXNlRG5kSGFuZGxlcih7XG4gICAgYWxsb3c6IGZ1bmN0aW9uIGFsbG93RHJhZyAoZXZ0KSB7XG4gICAgICAgIHJldHVybiBpc0JveERyYWdnYWJsZVJlZi52YWx1ZSAmJiBjYW5TdGFydERyYWcoZXZ0KSAvLyBjaGVjayBpZiBldnQgaXMgYWxsb3dlZCB0byBzdGFydCBkcmFnZ2luZ1xuICAgIH0sXG4gICAgc3RhcnQ6IGZ1bmN0aW9uIG9uRHJhZ1N0YXJ0ICgpIHtcbiAgICAgICAgc3RhcnRMYXlvdXQoKVxuICAgICAgICBiYXNlQ3NzUGl4ZWxzUmVmLnZhbHVlID0gY3NzUGl4ZWxzUmVmLnZhbHVlXG4gICAgICAgIGJhc2VQb3NpdGlvbiA9IHBvc2l0aW9uUmVmLnZhbHVlXG4gICAgICAgIGlzRHJhZ2dpbmdSZWYudmFsdWUgPSB0cnVlXG5cbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5RWwpXG4gICAgICAgIGRvY3VtZW50LmJvZHkuc2V0QXR0cmlidXRlKCdkbmQtZ3JpZC1kcmFnJywgJycpXG4gICAgfSxcbiAgICBzdG9wOiBmdW5jdGlvbiBvbkRyYWdTdG9wICgpIHtcbiAgICAgICAgc3RvcExheW91dCgpXG4gICAgICAgIGlzRHJhZ2dpbmdSZWYudmFsdWUgPSBmYWxzZVxuICAgICAgICBzbG90Q29udGFpbmVyRWxSZWYudmFsdWU/LnN0eWxlPy5yZW1vdmVQcm9wZXJ0eSgnLS1kbmQtZ3JpZC1ib3gtb2Zmc2V0LWxlZnQnKVxuICAgICAgICBzbG90Q29udGFpbmVyRWxSZWYudmFsdWU/LnN0eWxlPy5yZW1vdmVQcm9wZXJ0eSgnLS1kbmQtZ3JpZC1ib3gtb2Zmc2V0LXRvcCcpXG5cbiAgICAgICAgb3ZlcmxheUVsLnJlbW92ZSgpXG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQXR0cmlidXRlKCdkbmQtZ3JpZC1kcmFnJylcbiAgICB9LFxuICAgIHVwZGF0ZTogZnVuY3Rpb24gb25EcmFnVXBkYXRlICh7IG9mZnNldFgsIG9mZnNldFkgfSkge1xuICAgICAgICBsZXQgb2Zmc2V0UGl4ZWxzID0geyB4OiBvZmZzZXRYLCB5OiBvZmZzZXRZLCB3OiAwLCBoOiAwIH1cbiAgICAgICAgYXBwbHlPZmZzZXRQaXhlbHMoYmFzZVBvc2l0aW9uLCBvZmZzZXRQaXhlbHMpXG4gICAgfVxufSlcblxuY29uc3QgaXNSZXNpemluZ1JlZiA9IHNoYWxsb3dSZWYoZmFsc2UpXG5sZXQgcmVzaXplTW9kZTogdW5kZWZpbmVkIHwgXCJ0LVwiIHwgXCItclwiIHwgXCJiLVwiIHwgXCItbFwiIHwgXCJ0bFwiIHwgXCJ0clwiIHwgXCJiclwiIHwgXCJibFwiXG5jb25zdCByZXNpemVFdmVudHMgPSB1c2VEbmRIYW5kbGVyKHtcbiAgICBhbGxvdzogZnVuY3Rpb24gYWxsb3dSZXNpemUgKGV2dCkge1xuICAgICAgICByZXR1cm4gaXNCb3hSZXNpemFibGVSZWYudmFsdWUgJiYgY2FuU3RhcnRSZXNpemUoZXZ0KVxuICAgIH0sXG4gICAgc3RhcnQ6IGZ1bmN0aW9uIG9uUmVzaXplU3RhcnQgKF8sIGV2dCkge1xuICAgICAgICBzdGFydExheW91dCgpXG4gICAgICAgIHJlc2l6ZU1vZGUgPSAoZXZ0Py50YXJnZXQgYXMgRWxlbWVudCB8IHVuZGVmaW5lZCk/LmdldEF0dHJpYnV0ZT8uKCdkbmQtZ3JpZC1yZXNpemUnKSBhcyB0eXBlb2YgcmVzaXplTW9kZSB8fCAnYnInXG4gICAgICAgIGJhc2VDc3NQaXhlbHNSZWYudmFsdWUgPSBjc3NQaXhlbHNSZWYudmFsdWVcbiAgICAgICAgYmFzZVBvc2l0aW9uID0gcG9zaXRpb25SZWYudmFsdWVcbiAgICAgICAgaXNSZXNpemluZ1JlZi52YWx1ZSA9IHRydWVcblxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXlFbClcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zZXRBdHRyaWJ1dGUoJ2RuZC1ncmlkLXJlc2l6ZScsIHJlc2l6ZU1vZGUpXG4gICAgfSxcbiAgICBzdG9wOiBmdW5jdGlvbiBvblJlc2l6ZVN0b3AgKCkge1xuICAgICAgICBzdG9wTGF5b3V0KClcbiAgICAgICAgaXNSZXNpemluZ1JlZi52YWx1ZSA9IGZhbHNlXG4gICAgICAgIHNsb3RDb250YWluZXJFbFJlZi52YWx1ZT8uc3R5bGU/LnJlbW92ZVByb3BlcnR5KCctLWRuZC1ncmlkLWJveC1vZmZzZXQtd2lkdGgnKVxuICAgICAgICBzbG90Q29udGFpbmVyRWxSZWYudmFsdWU/LnN0eWxlPy5yZW1vdmVQcm9wZXJ0eSgnLS1kbmQtZ3JpZC1ib3gtb2Zmc2V0LWhlaWdodCcpXG5cbiAgICAgICAgb3ZlcmxheUVsLnJlbW92ZSgpXG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQXR0cmlidXRlKCdkbmQtZ3JpZC1yZXNpemUnKVxuICAgIH0sXG4gICAgdXBkYXRlOiBmdW5jdGlvbiBvblJlc2l6ZVVwZGF0ZSAoeyBvZmZzZXRYLCBvZmZzZXRZIH0pIHtcbiAgICAgICAgbGV0IG9mZnNldFBpeGVscyA9IHsgeDogMCwgeTogMCwgdzogMCwgaDogMCB9XG5cbiAgICAgICAgc3dpdGNoIChyZXNpemVNb2RlPy5bMF0pIHtcbiAgICAgICAgICAgIGNhc2UgJ3QnOiAvLyB0b3BcbiAgICAgICAgICAgICAgICBvZmZzZXRQaXhlbHMueSA9IG9mZnNldFlcbiAgICAgICAgICAgICAgICBvZmZzZXRQaXhlbHMuaCA9IC1vZmZzZXRZXG4gICAgICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgICAgY2FzZSAnYic6IC8vIGJvdHRvbVxuICAgICAgICAgICAgICAgIG9mZnNldFBpeGVscy5oID0gb2Zmc2V0WVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2ggKHJlc2l6ZU1vZGU/LlsxXSkge1xuICAgICAgICAgICAgY2FzZSAnbCc6IC8vIGxlZnRcbiAgICAgICAgICAgICAgICBvZmZzZXRQaXhlbHMueCA9IG9mZnNldFhcbiAgICAgICAgICAgICAgICBvZmZzZXRQaXhlbHMudyA9IC1vZmZzZXRYXG4gICAgICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgICAgY2FzZSAncic6IC8vIHJpZ2h0XG4gICAgICAgICAgICAgICAgb2Zmc2V0UGl4ZWxzLncgPSBvZmZzZXRYXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuXG4gICAgICAgIGFwcGx5T2Zmc2V0UGl4ZWxzKGJhc2VQb3NpdGlvbiwgb2Zmc2V0UGl4ZWxzKVxuICAgIH1cbn0pXG5cbmNvbnN0IGJveEV2ZW50c1JlZiA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICByZXR1cm4gbWVyZ2VFdmVudHMoZHJhZ0V2ZW50cywgcmVzaXplRXZlbnRzKVxufSlcblxuZnVuY3Rpb24gYXBwbHlPZmZzZXRQaXhlbHMgKGJhc2VQb3NpdGlvbjogR3JpZFBvc2l0aW9uLCBvZmZzZXRQaXhlbHM6IFBpeGVsUG9zaXRpb24pIHtcbiAgICBjb25zdCBzbG90Q29udGFpbmVyRWwgPSBzbG90Q29udGFpbmVyRWxSZWYudmFsdWVcbiAgICBjb25zdCBjZWxsU2l6ZSA9IGNvbXB1dGVkQ2VsbFNpemVSZWYudmFsdWVcbiAgICBjb25zdCB7IHdpZHRoLCBoZWlnaHQsIHNwYWNpbmcgfSA9IGNvbXB1dGVkQ2VsbFNpemVSZWYudmFsdWVcblxuICAgIGNvbnN0IHtcbiAgICAgICAgbWluV2lkdGggPSAxLFxuICAgICAgICBtaW5IZWlnaHQgPSAxLFxuICAgICAgICBtYXhXaWR0aCA9IEluZmluaXR5LFxuICAgICAgICBtYXhIZWlnaHQgPSBJbmZpbml0eVxuICAgIH0gPSBib3hSZWYudmFsdWUucmVzaXplTGltaXRzID8/IHt9O1xuXG4gICAgY29uc3QgbWluUGl4ZWxXaWR0aCA9IChtaW5XaWR0aCAqIChjZWxsU2l6ZS53aWR0aCArIHNwYWNpbmcpKSAtIHNwYWNpbmdcbiAgICBjb25zdCBtYXhQaXhlbFdpZHRoID0gKG1heFdpZHRoICogKGNlbGxTaXplLndpZHRoICsgc3BhY2luZykpIC0gc3BhY2luZ1xuICAgIGNvbnN0IG1pblBpeGVsSGVpZ2h0ID0gKG1pbkhlaWdodCAqIChjZWxsU2l6ZS5oZWlnaHQgKyBzcGFjaW5nKSkgLSBzcGFjaW5nXG4gICAgY29uc3QgbWF4UGl4ZWxIZWlnaHQgPSAobWF4SGVpZ2h0ICogKGNlbGxTaXplLmhlaWdodCArIHNwYWNpbmcpKSAtIHNwYWNpbmdcblxuICAgIHNsb3RDb250YWluZXJFbD8uc3R5bGU/LnNldFByb3BlcnR5KCctLWRuZC1ncmlkLWJveC1vZmZzZXQtbGVmdCcsIGAke29mZnNldFBpeGVscy54fXB4YClcbiAgICBzbG90Q29udGFpbmVyRWw/LnN0eWxlPy5zZXRQcm9wZXJ0eSgnLS1kbmQtZ3JpZC1ib3gtb2Zmc2V0LXRvcCcsIGAke29mZnNldFBpeGVscy55fXB4YClcbiAgICBzbG90Q29udGFpbmVyRWw/LnN0eWxlPy5zZXRQcm9wZXJ0eSgnLS1kbmQtZ3JpZC1ib3gtb2Zmc2V0LXdpZHRoJywgYCR7Y2xhbXAob2Zmc2V0UGl4ZWxzLncsIG1pblBpeGVsV2lkdGgsIG1heFBpeGVsV2lkdGgpfXB4YClcbiAgICBzbG90Q29udGFpbmVyRWw/LnN0eWxlPy5zZXRQcm9wZXJ0eSgnLS1kbmQtZ3JpZC1ib3gtb2Zmc2V0LWhlaWdodCcsIGAke2NsYW1wKG9mZnNldFBpeGVscy5oLCBtaW5QaXhlbEhlaWdodCwgbWF4UGl4ZWxIZWlnaHQpfXB4YClcblxuICAgIHNsb3RDb250YWluZXJFbD8uc2Nyb2xsSW50b1ZpZXcoe1xuICAgICAgICBiZWhhdmlvcjogJ3Ntb290aCcsXG4gICAgICAgIGJsb2NrOiAnbmVhcmVzdCcsXG4gICAgICAgIGlubGluZTogJ25lYXJlc3QnXG4gICAgfSlcblxuICAgIGNvbnN0IGhhbGZDZWxsU2l6ZVdpZHRoID0gY2VsbFNpemUud2lkdGggLyAyXG4gICAgY29uc3QgaGFsZkNlbGxTaXplSGVpZ2h0ID0gY2VsbFNpemUuaGVpZ2h0IC8gMlxuICAgIGNvbnN0IHRhcmdldFBvc2l0aW9uID0gZnJvbVBpeGVscyh7XG4gICAgICAgIHg6IG9mZnNldFBpeGVscy54ICsgaGFsZkNlbGxTaXplV2lkdGgsIC8vIGFkZCBoYWxmIGNlbGxzaXplIGZvciBiZXR0ZXIgYm94IHBsYWNlbWVudFxuICAgICAgICB5OiBvZmZzZXRQaXhlbHMueSArIGhhbGZDZWxsU2l6ZUhlaWdodCxcbiAgICAgICAgdzogb2Zmc2V0UGl4ZWxzLncgKyBoYWxmQ2VsbFNpemVXaWR0aCxcbiAgICAgICAgaDogb2Zmc2V0UGl4ZWxzLmggKyBoYWxmQ2VsbFNpemVIZWlnaHRcbiAgICB9LCBjZWxsU2l6ZS53aWR0aCwgY2VsbFNpemUuaGVpZ2h0LCBjZWxsU2l6ZS5zcGFjaW5nKVxuXG4gICAgdGFyZ2V0UG9zaXRpb24ueCA9IE1hdGgubWF4KDAsIHRhcmdldFBvc2l0aW9uLnggKyBiYXNlUG9zaXRpb24ueClcbiAgICB0YXJnZXRQb3NpdGlvbi55ID0gTWF0aC5tYXgoMCwgdGFyZ2V0UG9zaXRpb24ueSArIGJhc2VQb3NpdGlvbi55KVxuICAgIHRhcmdldFBvc2l0aW9uLncgPSBjbGFtcCh0YXJnZXRQb3NpdGlvbi53ICsgYmFzZVBvc2l0aW9uLncsIG1pbldpZHRoLCBtYXhXaWR0aClcbiAgICB0YXJnZXRQb3NpdGlvbi5oID0gY2xhbXAodGFyZ2V0UG9zaXRpb24uaCArIGJhc2VQb3NpdGlvbi5oLCBtaW5IZWlnaHQsIG1heEhlaWdodClcblxuICAgIHVwZGF0ZVBvc2l0aW9uKHRhcmdldFBvc2l0aW9uKVxufVxuXG5mdW5jdGlvbiB1cGRhdGVQb3NpdGlvbiAodGFyZ2V0UG9zaXRpb246IEdyaWRQb3NpdGlvbikge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gcG9zaXRpb25SZWYudmFsdWVcbiAgICBpZiAoXG4gICAgICAgIHBvc2l0aW9uLnggIT09IHRhcmdldFBvc2l0aW9uLnggfHxcbiAgICAgICAgcG9zaXRpb24ueSAhPT0gdGFyZ2V0UG9zaXRpb24ueSB8fFxuICAgICAgICBwb3NpdGlvbi53ICE9PSB0YXJnZXRQb3NpdGlvbi53IHx8XG4gICAgICAgIHBvc2l0aW9uLmggIT09IHRhcmdldFBvc2l0aW9uLmhcbiAgICApIHtcbiAgICAgICAgdXBkYXRlQm94KGJveFJlZi52YWx1ZS5pZCwgeyBwb3NpdGlvbjogdGFyZ2V0UG9zaXRpb24gfSlcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1lcmdlRXZlbnRzICguLi5ldmVudE9iamVjdHM6IHsgW2tleTogc3RyaW5nXTogKGV2ZW50OiBhbnkpID0+IHZvaWQgfVtdKSB7XG4gICAgY29uc3QgZXZlbnRNYXAgPSBuZXcgTWFwPHN0cmluZywgKChldmVudDogYW55KSA9PiB2b2lkKVtdPigpO1xuICAgIGV2ZW50T2JqZWN0cy5mb3JFYWNoKGV2ZW50T2JqZWN0ID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZXZlbnRPYmplY3QpIHtcbiAgICAgICAgICAgIGNvbnN0IGNhbGxiYWNrTGlzdCA9IGV2ZW50TWFwLmdldChrZXkpIHx8IGV2ZW50TWFwLnNldChrZXksIFtdKS5nZXQoa2V5KVxuICAgICAgICAgICAgY2FsbGJhY2tMaXN0LnB1c2goZXZlbnRPYmplY3Rba2V5XSlcbiAgICAgICAgfVxuICAgIH0pXG4gICAgY29uc3QgbWVyZ2VkRXZlbnRzOiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge31cbiAgICBldmVudE1hcC5mb3JFYWNoKChjYWxsYmFja3MsIGtleSkgPT4ge1xuICAgICAgICBtZXJnZWRFdmVudHNba2V5XSA9IChldnQ6IGFueSkgPT4gY2FsbGJhY2tzLmZvckVhY2goY2FsbGJhY2sgPT4gY2FsbGJhY2soZXZ0KSlcbiAgICB9KVxuICAgIHJldHVybiBtZXJnZWRFdmVudHNcbn1cblxub25TY29wZURpc3Bvc2UoKCkgPT4ge1xuICAgIG92ZXJsYXlFbC5yZW1vdmUoKVxufSlcbjwvc2NyaXB0PlxuXG48dGVtcGxhdGU+XG4gICAgPGRpdlxuICAgICAgICB2LWlmPVwidmlzaWJsZVJlZlwiXG4gICAgICAgIHJlZj1cImJveEVsUmVmXCJcbiAgICAgICAgOmNsYXNzPVwie1xuICAgICAgICAgICAgZG5kZ3JpZF9fYm94X2JveDogdHJ1ZSxcbiAgICAgICAgICAgIGRuZGdyaWRfX2JveF9kcmFnZ2luZzogaXNEcmFnZ2luZ1JlZixcbiAgICAgICAgICAgIGRuZGdyaWRfX2JveF9yZXNpemluZzogaXNSZXNpemluZ1JlZlxuICAgICAgICB9XCJcbiAgICAgICAgOnN0eWxlPVwiY3NzUG9zaXRpb25SZWZcIlxuICAgICAgICB2LW9uPVwiYm94RXZlbnRzUmVmXCJcbiAgICA+XG4gICAgICAgIDxkaXZcbiAgICAgICAgICAgIHYtaWY9XCJpc0RyYWdnaW5nUmVmIHx8IGlzUmVzaXppbmdSZWZcIlxuICAgICAgICAgICAgY2xhc3M9XCJkbmRncmlkX19ib3hfcGxhY2Vob2xkZXJDb250YWluZXJcIlxuICAgICAgICA+XG4gICAgICAgICAgICA8c2xvdFxuICAgICAgICAgICAgICAgIG5hbWU9XCJwbGFjZWhvbGRlclwiXG4gICAgICAgICAgICAgICAgdi1iaW5kPVwiYm94UmVmXCJcbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZG5kZ3JpZF9fYm94X3BsYWNlaG9sZGVyXCIgLz5cbiAgICAgICAgICAgIDwvc2xvdD5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXZcbiAgICAgICAgICAgIHJlZj1cInNsb3RDb250YWluZXJFbFJlZlwiXG4gICAgICAgICAgICBjbGFzcz1cImRuZGdyaWRfX2JveF9zbG90Q29udGFpbmVyXCJcbiAgICAgICAgICAgIDpzdHlsZT1cIntcbiAgICAgICAgICAgICAgICAnLS1kbmRncmlkX19ib3hfb3ZlcmZsb3cnOiBwcm9wcy5vdmVyZmxvdyxcbiAgICAgICAgICAgIH1cIlxuICAgICAgICA+XG4gICAgICAgICAgICA8c2xvdCB2LWJpbmQ9XCJib3hSZWZcIiAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgdi1pZj1cImFkZFJlc2l6ZUhhbmRsZXNSZWYgJiYgaXNCb3hSZXNpemFibGVSZWZcIlxuICAgICAgICAgICAgY2xhc3M9XCJkbmRncmlkX19ib3hfcmVzaXplSGFuZGxlQ29udGFpbmVyXCJcbiAgICAgICAgPlxuICAgICAgICAgICAgPGRpdiBkbmQtZ3JpZC1yZXNpemU9XCJ0LVwiIC8+XG4gICAgICAgICAgICA8ZGl2IGRuZC1ncmlkLXJlc2l6ZT1cIi1yXCIgLz5cbiAgICAgICAgICAgIDxkaXYgZG5kLWdyaWQtcmVzaXplPVwiYi1cIiAvPlxuICAgICAgICAgICAgPGRpdiBkbmQtZ3JpZC1yZXNpemU9XCItbFwiIC8+XG4gICAgICAgICAgICA8ZGl2IGRuZC1ncmlkLXJlc2l6ZT1cInRsXCIgLz5cbiAgICAgICAgICAgIDxkaXYgZG5kLWdyaWQtcmVzaXplPVwidHJcIiAvPlxuICAgICAgICAgICAgPGRpdiBkbmQtZ3JpZC1yZXNpemU9XCJiclwiIC8+XG4gICAgICAgICAgICA8ZGl2IGRuZC1ncmlkLXJlc2l6ZT1cImJsXCIgLz5cbiAgICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG48L3RlbXBsYXRlPlxuXG48c3R5bGU+XG46d2hlcmUoLmRuZGdyaWRfX2JveF9ib3gpIHtcbiAgICBhbGw6IHVuc2V0O1xufVxuXG4uZG5kZ3JpZF9fYm94X2JveCB7XG4gICAgZ3JpZC1jb2x1bW46IHZhcigtLWRuZC1ncmlkLWJveC14KSAvIHNwYW4gdmFyKC0tZG5kLWdyaWQtYm94LXdpZHRoKTtcbiAgICBncmlkLXJvdzogdmFyKC0tZG5kLWdyaWQtYm94LXkpIC8gc3BhbiB2YXIoLS1kbmQtZ3JpZC1ib3gtaGVpZ2h0KTtcbiAgICBkaXNwbGF5OiBncmlkO1xuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMTAwJTtcbiAgICBncmlkLXRlbXBsYXRlLXJvd3M6IDEwMCU7XG59XG5cbi5kbmRncmlkX19ib3hfYm94ID4gKiB7XG4gICAgZ3JpZC1jb2x1bW46IDE7XG4gICAgZ3JpZC1yb3c6IDE7XG59XG5bZG5kLWdyaWQtbW9kZT0nbGF5b3V0J10gLmRuZGdyaWRfX2JveF9ib3gge1xuICAgIHVzZXItc2VsZWN0OiBub25lO1xufVxuXG5bZG5kLWdyaWQtbW9kZT0nbGF5b3V0J10gLmRuZGdyaWRfX2JveF9ib3g6bm90KFtkbmQtZ3JpZC1tb2RlPSdsYXlvdXQnXSBbZG5kLWdyaWQtbW9kZT0nZ3JpZCddIC5kbmRncmlkX19ib3hfYm94KSA+IDppcyguZG5kZ3JpZF9fYm94X3Nsb3RDb250YWluZXIsIC5kbmRncmlkX19ib3hfcGxhY2Vob2xkZXJDb250YWluZXIpIHtcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgbGVmdDogdmFyKC0tZG5kZ3JpZF9fYm94X2JveF9jc3NQaXhlbHMteCk7XG4gICAgdG9wOiB2YXIoLS1kbmRncmlkX19ib3hfYm94X2Nzc1BpeGVscy15KTtcbiAgICB3aWR0aDogdmFyKC0tZG5kZ3JpZF9fYm94X2JveF9jc3NQaXhlbHMtdyk7XG4gICAgaGVpZ2h0OiB2YXIoLS1kbmRncmlkX19ib3hfYm94X2Nzc1BpeGVscy1oKTtcbn1cblxuW2RuZC1ncmlkLW1vZGU9J2xheW91dCddIC5kbmRncmlkX19ib3hfYm94OmlzKC5kbmRncmlkX19ib3hfZHJhZ2dpbmcsIC5kbmRncmlkX19ib3hfcmVzaXppbmcpOm5vdChbZG5kLWdyaWQtbW9kZT0nbGF5b3V0J10gW2RuZC1ncmlkLW1vZGU9J2dyaWQnXSAuZG5kZ3JpZF9fYm94X2JveCkgID4gLmRuZGdyaWRfX2JveF9zbG90Q29udGFpbmVyIHtcbiAgICBsZWZ0OiBjYWxjKHZhcigtLWRuZGdyaWRfX2JveF9ib3hfYmFzZUNzc1BpeGVscy14KSArIHZhcigtLWRuZC1ncmlkLWJveC1vZmZzZXQtbGVmdCwgMHB4KSk7XG4gICAgdG9wOiBjYWxjKHZhcigtLWRuZGdyaWRfX2JveF9ib3hfYmFzZUNzc1BpeGVscy15KSArIHZhcigtLWRuZC1ncmlkLWJveC1vZmZzZXQtdG9wLCAwcHgpKTtcbiAgICB3aWR0aDogY2FsYyh2YXIoLS1kbmRncmlkX19ib3hfYm94X2Jhc2VDc3NQaXhlbHMtdykgKyB2YXIoLS1kbmQtZ3JpZC1ib3gtb2Zmc2V0LXdpZHRoLCAwcHgpKTtcbiAgICBoZWlnaHQ6IGNhbGModmFyKC0tZG5kZ3JpZF9fYm94X2JveF9iYXNlQ3NzUGl4ZWxzLWgpICsgdmFyKC0tZG5kLWdyaWQtYm94LW9mZnNldC1oZWlnaHQsIDBweCkpO1xufVxuXG4uZG5kZ3JpZF9fYm94X3BsYWNlaG9sZGVyIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBoZWlnaHQ6IDEwMCU7XG4gICAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbiAgICBiYWNrZ3JvdW5kOiB2YXIoLS1kbmQtZ3JpZC1wbGFjZWhvbGRlci1iYWNrZ3JvdW5kLCAjRjAwMik7XG4gICAgYm9yZGVyOiB2YXIoLS1kbmQtZ3JpZC1wbGFjZWhvbGRlci1ib3JkZXIsIG5vbmUpO1xufVxuXG5bZG5kLWdyaWQtbW9kZT0nbGF5b3V0J10gLmRuZGdyaWRfX2JveF9ib3g6aXMoLmRuZGdyaWRfX2JveF9kcmFnZ2luZywgLmRuZGdyaWRfX2JveF9yZXNpemluZyk6bm90KFtkbmQtZ3JpZC1tb2RlPSdsYXlvdXQnXSBbZG5kLWdyaWQtbW9kZT0nZ3JpZCddIC5kbmRncmlkX19ib3hfYm94KSA+IC5kbmRncmlkX19ib3hfc2xvdENvbnRhaW5lciB7XG4gICAgei1pbmRleDogOTk5OTtcbiAgICBvcGFjaXR5OiAwLjY7XG59XG5cbltkbmQtZ3JpZC1tb2RlPSdsYXlvdXQnXSAuZG5kZ3JpZF9fYm94X2JveDpub3QoLmRuZGdyaWRfX2JveF9kcmFnZ2luZywgLmRuZGdyaWRfX2JveF9yZXNpemluZyk6bm90KFtkbmQtZ3JpZC1tb2RlPSdsYXlvdXQnXSBbZG5kLWdyaWQtbW9kZT0nZ3JpZCddIC5kbmRncmlkX19ib3hfYm94KSA+IC5kbmRncmlkX19ib3hfc2xvdENvbnRhaW5lcixcbi5kbmRncmlkX19ib3hfcGxhY2Vob2xkZXJDb250YWluZXIge1xuICAgIHRyYW5zaXRpb24tcHJvcGVydHk6IGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodDtcbiAgICB0cmFuc2l0aW9uLWR1cmF0aW9uOiB2YXIoLS1kbmQtZ3JpZC10cmFuc2l0aW9uLWR1cmF0aW9uLCAwLjFzKTtcbiAgICB0cmFuc2l0aW9uLXRpbWluZy1mdW5jdGlvbjogdmFyKC0tZG5kLWdyaWQtdHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb24sIGVhc2Utb3V0KTtcbn1cblxuLmRuZGdyaWRfX2JveF9zbG90Q29udGFpbmVyIHtcbiAgICB6LWluZGV4OiAxO1xuICAgIG92ZXJmbG93OiB2YXIoLS1kbmRncmlkX19ib3hfb3ZlcmZsb3cpO1xufVxuXG4uZG5kZ3JpZF9fYm94X3Jlc2l6ZUhhbmRsZUNvbnRhaW5lciB7XG4gICAgd2lkdGg6IDEwMCU7XG4gICAgaGVpZ2h0OiAxMDAlO1xuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgICAtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLWRlZmF1bHQtc2l6ZTogMTBweDtcbiAgICAtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLWRlZmF1bHQtb2Zmc2V0OiBjYWxjKHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLXNpemUsIHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLWRlZmF1bHQtc2l6ZSkpIC8gLTIpO1xufVxuXG4uZG5kZ3JpZF9fYm94X3Jlc2l6ZUhhbmRsZUNvbnRhaW5lciA+ICoge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICB3aWR0aDogdmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItc2l6ZSwgdmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItZGVmYXVsdC1zaXplKSk7XG4gICAgaGVpZ2h0OiB2YXIoLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1zaXplLCB2YXIoLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1kZWZhdWx0LXNpemUpKTtcbiAgICB6LWluZGV4OiA5OTk5O1xufVxuXG4uZG5kZ3JpZF9fYm94X3Jlc2l6ZUhhbmRsZUNvbnRhaW5lciA+IFtkbmQtZ3JpZC1yZXNpemVePXRdIHtcbiAgICB0b3A6IHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLW9mZnNldCwgdmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItZGVmYXVsdC1vZmZzZXQpKTtcbn1cblxuLmRuZGdyaWRfX2JveF9yZXNpemVIYW5kbGVDb250YWluZXIgPiBbZG5kLWdyaWQtcmVzaXplXj1iXSB7XG4gICAgYm90dG9tOiB2YXIoLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1vZmZzZXQsIHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLWRlZmF1bHQtb2Zmc2V0KSk7XG59XG5cbi5kbmRncmlkX19ib3hfcmVzaXplSGFuZGxlQ29udGFpbmVyID4gW2RuZC1ncmlkLXJlc2l6ZV49Jy0nXSB7XG4gICAgdG9wOiAwcHg7XG4gICAgaGVpZ2h0OiAxMDAlO1xufVxuXG4uZG5kZ3JpZF9fYm94X3Jlc2l6ZUhhbmRsZUNvbnRhaW5lciA+IFtkbmQtZ3JpZC1yZXNpemUkPWxdIHtcbiAgICBsZWZ0OiB2YXIoLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1vZmZzZXQsIHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLWRlZmF1bHQtb2Zmc2V0KSk7XG59XG5cbi5kbmRncmlkX19ib3hfcmVzaXplSGFuZGxlQ29udGFpbmVyID4gW2RuZC1ncmlkLXJlc2l6ZSQ9cl0ge1xuICAgIHJpZ2h0OiB2YXIoLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1vZmZzZXQsIHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLWRlZmF1bHQtb2Zmc2V0KSk7XG59XG5cbi5kbmRncmlkX19ib3hfcmVzaXplSGFuZGxlQ29udGFpbmVyID4gW2RuZC1ncmlkLXJlc2l6ZSQ9Jy0nXSB7XG4gICAgbGVmdDogMHB4O1xuICAgIHdpZHRoOiAxMDAlO1xufVxuXG4uZG5kZ3JpZF9fYm94X292ZXJsYXkge1xuICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICB0b3A6IDA7XG4gICAgbGVmdDogMDtcbiAgICB3aWR0aDogMTAwdnc7XG4gICAgaGVpZ2h0OiAxMDB2aDtcbiAgICB6LWluZGV4OiA5OTk5OTk7XG59XG48L3N0eWxlPlxuIiwiPHNjcmlwdCBsYW5nPVwidHNcIj5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgICBpbmhlcml0QXR0cnM6IHRydWVcbn1cblxubGV0IE5FWFRfRE5EX0dSSURfSUQgPSAxXG48L3NjcmlwdD5cblxuPHNjcmlwdCBzZXR1cCBsYW5nPVwidHNcIj5cbmltcG9ydCB7IHByb3ZpZGUsIHJlYWRvbmx5LCB3YXRjaCwgb25Nb3VudGVkLCBvbkJlZm9yZVVubW91bnQsIHRvUmVmLCBzaGFsbG93UmVmLCBjb21wdXRlZCwgUHJvcCwgUmVmIH0gZnJvbSAndnVlJ1xuaW1wb3J0IHsgQ29udGFpbmVyU3ltYm9sIH0gZnJvbSAnLi4vc3ltYm9scydcbmltcG9ydCB7IExheW91dCwgTGF5b3V0RWxlbWVudCwgZ2V0Qm94IGFzIF9nZXRCb3gsIHVwZGF0ZUJveCBhcyBfdXBkYXRlQm94IH0gZnJvbSAnLi4vdG9vbHMvbGF5b3V0J1xuXG50eXBlIFNlbGVjdG9yUHJvcCA9IHtcbiAgICBpbmNsdWRlOiBzdHJpbmc7XG4gICAgZXhjbHVkZT86IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgcHJvcHMgPSBkZWZpbmVQcm9wcyh7XG4gICAgbGF5b3V0OiB7XG4gICAgICAgIHR5cGU6IEFycmF5LFxuICAgICAgICBkZWZhdWx0OiAoKSA9PiBbXVxuICAgIH0gYXMgUHJvcDxMYXlvdXQ+LFxuXG4gICAgYnViYmxlVXA6IHtcbiAgICAgICAgdHlwZTogW0Jvb2xlYW4sIFN0cmluZ10sXG4gICAgICAgIGRlZmF1bHQ6IGZhbHNlXG4gICAgfSBhcyBQcm9wPGJvb2xlYW4gfCBcImp1bXAtb3ZlclwiPixcblxuICAgIGRpc2FibGVkOiB7XG4gICAgICAgIHR5cGU6IEJvb2xlYW4sXG4gICAgICAgIGRlZmF1bHQ6IGZhbHNlXG4gICAgfSxcblxuICAgIGlzUmVzaXphYmxlOiB7XG4gICAgICAgIHR5cGU6IEJvb2xlYW4sXG4gICAgICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgfSxcblxuICAgIGlzRHJhZ2dhYmxlOiB7XG4gICAgICAgIHR5cGU6IEJvb2xlYW4sXG4gICAgICAgIGRlZmF1bHQ6IHRydWVcbiAgICB9LFxuXG4gICAgZHJhZ1NlbGVjdG9yOiB7XG4gICAgICAgIHR5cGU6IE9iamVjdCxcbiAgICAgICAgZGVmYXVsdDogKCkgPT4gKHtcbiAgICAgICAgICAgIGluY2x1ZGU6ICdbZG5kLWdyaWQtZHJhZ10nLFxuICAgICAgICAgICAgZXhjbHVkZTogJzppcyhpbnB1dCwgYnV0dG9uLCBzZWxlY3QsIGFbaHJlZl0pJ1xuICAgICAgICB9KVxuICAgIH0gYXMgUHJvcDxTZWxlY3RvclByb3A+LFxuXG4gICAgcmVzaXplU2VsZWN0b3I6IHtcbiAgICAgICAgdHlwZTogT2JqZWN0LFxuICAgICAgICBkZWZhdWx0OiAoKSA9PiAoe1xuICAgICAgICAgICAgaW5jbHVkZTogJ1tkbmQtZ3JpZC1yZXNpemVdJyxcbiAgICAgICAgICAgIGV4Y2x1ZGU6ICc6aXMoaW5wdXQsIGJ1dHRvbiwgc2VsZWN0LCBhW2hyZWZdKSdcbiAgICAgICAgfSlcbiAgICB9IGFzIFByb3A8U2VsZWN0b3JQcm9wPixcblxuICAgIGFkZFJlc2l6ZUhhbmRsZXM6IHtcbiAgICAgICAgdHlwZTogQm9vbGVhbixcbiAgICAgICAgZGVmYXVsdDogdHJ1ZVxuICAgIH0sXG5cbiAgICAvLyBzdHlsaW5nIChtYXBwZWQgdG8gY3NzIHByb3BzKVxuICAgIGNlbGxXaWR0aDoge1xuICAgICAgICB0eXBlOiBbTnVtYmVyLCBTdHJpbmddLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIGNlbGxNYXhXaWR0aDoge1xuICAgICAgICB0eXBlOiBbTnVtYmVyLCBTdHJpbmddLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIGNlbGxIZWlnaHQ6IHtcbiAgICAgICAgdHlwZTogW051bWJlciwgU3RyaW5nXSxcbiAgICAgICAgZGVmYXVsdDogbnVsbFxuICAgIH0sXG5cbiAgICBjZWxsTWF4SGVpZ2h0OiB7XG4gICAgICAgIHR5cGU6IFtOdW1iZXIsIFN0cmluZ10sXG4gICAgICAgIGRlZmF1bHQ6IG51bGxcbiAgICB9LFxuXG4gICAgY2VsbFNwYWNpbmc6IHtcbiAgICAgICAgdHlwZTogW051bWJlciwgU3RyaW5nXSxcbiAgICAgICAgZGVmYXVsdDogbnVsbFxuICAgIH0sXG5cbiAgICByZXNpemVIYW5kbGVyU2l6ZToge1xuICAgICAgICB0eXBlOiBbTnVtYmVyLCBTdHJpbmddLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIHJlc2l6ZUhhbmRsZXJPZmZzZXQ6IHtcbiAgICAgICAgdHlwZTogW051bWJlciwgU3RyaW5nXSxcbiAgICAgICAgZGVmYXVsdDogbnVsbFxuICAgIH0sXG5cbiAgICBwbGFjZWhvbGRlckJhY2tncm91bmQ6IHtcbiAgICAgICAgdHlwZTogU3RyaW5nLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIHBsYWNlaG9sZGVyQm9yZGVyOiB7XG4gICAgICAgIHR5cGU6IFN0cmluZyxcbiAgICAgICAgZGVmYXVsdDogbnVsbFxuICAgIH0sXG5cbiAgICB0cmFuc2l0aW9uVGltaW5nRnVuY3Rpb246IHtcbiAgICAgICAgdHlwZTogU3RyaW5nLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIHRyYW5zaXRpb25EdXJhdGlvbjoge1xuICAgICAgICB0eXBlOiBTdHJpbmcsXG4gICAgICAgIGRlZmF1bHQ6IG51bGxcbiAgICB9XG59KVxuXG5jb25zdCBETkRfR1JJRF9JRCA9IE5FWFRfRE5EX0dSSURfSUQrK1xuXG5jb25zdCBlbWl0ID0gZGVmaW5lRW1pdHMoWyd1cGRhdGU6bGF5b3V0J10pXG5cbmNvbnN0IGNvbnRhaW5lckVsUmVmID0gc2hhbGxvd1JlZigpXG5jb25zdCBjb21wdXRlZENlbGxTaXplUmVmID0gc2hhbGxvd1JlZigpXG5jb25zdCBtb2RlUmVmID0gc2hhbGxvd1JlZignZ3JpZCcpXG5jb25zdCBsYXlvdXRSZWYgPSBzaGFsbG93UmVmKHByb3BzLmxheW91dCEpXG5jb25zdCBpc1Jlc2l6YWJsZSA9IGNvbXB1dGVkKCgpID0+IHByb3BzLmlzUmVzaXphYmxlKTtcbmNvbnN0IGlzRHJhZ2dhYmxlID0gY29tcHV0ZWQoKCkgPT4gcHJvcHMuaXNSZXNpemFibGUpO1xuY29uc3QgYWRkUmVzaXplSGFuZGxlcyA9IGNvbXB1dGVkKCgpID0+IHByb3BzLmFkZFJlc2l6ZUhhbmRsZXMpO1xuY29uc3QgZGlzYWJsZWQgPSBjb21wdXRlZCgoKSA9PiBwcm9wcy5kaXNhYmxlZCEpO1xuXG5wcm92aWRlKENvbnRhaW5lclN5bWJvbCwge1xuICAgIGxheW91dDogcmVhZG9ubHkobGF5b3V0UmVmKSxcbiAgICBtb2RlOiByZWFkb25seShtb2RlUmVmKSxcbiAgICBkaXNhYmxlZCxcbiAgICBpc1Jlc2l6YWJsZSxcbiAgICBpc0RyYWdnYWJsZSxcbiAgICBjb21wdXRlZENlbGxTaXplOiByZWFkb25seShjb21wdXRlZENlbGxTaXplUmVmKSxcbiAgICBzdGFydExheW91dCxcbiAgICBzdG9wTGF5b3V0LFxuICAgIGdldEJveCxcbiAgICB1cGRhdGVCb3gsXG4gICAgY2FuU3RhcnREcmFnLFxuICAgIGNhblN0YXJ0UmVzaXplLFxuICAgIGFkZFJlc2l6ZUhhbmRsZXMsXG59KVxuXG53YXRjaCgoKSA9PiBwcm9wcy5sYXlvdXQhLCBuZXdMYXlvdXQgPT4ge1xuICAgIGxheW91dFJlZi52YWx1ZSA9IG5ld0xheW91dFxufSlcblxuY29uc3QgbGF5b3V0T3B0aW9uc1JlZiA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgICBidWJibGVVcDogcHJvcHMuYnViYmxlVXAhXG4gICAgfVxufSlcblxuY29uc3QgZHJhZ1NlbGVjdG9yc1JlZiA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICByZXR1cm4gZ2V0U2VsZWN0b3JzRnJvbVByb3AocHJvcHMuZHJhZ1NlbGVjdG9yISlcbn0pXG5cbmNvbnN0IHJlc2l6ZVNlbGVjdG9yc1JlZiA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICByZXR1cm4gZ2V0U2VsZWN0b3JzRnJvbVByb3AocHJvcHMucmVzaXplU2VsZWN0b3IhKVxufSlcblxuY29uc3QgY3Vyc29yU3R5bGVDb250ZW50UmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIGlmIChwcm9wcy5kaXNhYmxlZCkge1xuICAgICAgICByZXR1cm4gJydcbiAgICB9XG5cbiAgICBjb25zdCBzdHlsZUNvbnRlbnQ6IHN0cmluZ1tdID0gW11cblxuICAgIHN0eWxlQ29udGVudC5wdXNoKFxuICAgICAgICAuLi5bXG4gICAgICAgICAgICBbJycsICdjdXJzb3I6IHZhcigtLWRuZC1yZXNpemUtY3Vyc29yLW53c2UsIG53c2UtcmVzaXplKTsnXSxcbiAgICAgICAgICAgIFsnOndoZXJlKFtkbmQtZ3JpZC1yZXNpemU9dC1dLCBbZG5kLWdyaWQtcmVzaXplPWItXSknLCAnY3Vyc29yOiB2YXIoLS1kbmQtcmVzaXplLWN1cnNvci1ucywgbnMtcmVzaXplKTsnXSxcbiAgICAgICAgICAgIFsnOndoZXJlKFtkbmQtZ3JpZC1yZXNpemU9LXJdLCBbZG5kLWdyaWQtcmVzaXplPS1sXSknLCAnY3Vyc29yOiB2YXIoLS1kbmQtcmVzaXplLWN1cnNvci1ldywgZXctcmVzaXplKTsnXSxcbiAgICAgICAgICAgIFsnOndoZXJlKFtkbmQtZ3JpZC1yZXNpemU9dGxdLCBbZG5kLWdyaWQtcmVzaXplPWJyXSknLCAnY3Vyc29yOiB2YXIoLS1kbmQtcmVzaXplLWN1cnNvci1ud3NlLCBud3NlLXJlc2l6ZSk7J10sXG4gICAgICAgICAgICBbJzp3aGVyZShbZG5kLWdyaWQtcmVzaXplPXRyXSwgW2RuZC1ncmlkLXJlc2l6ZT1ibF0pJywgJ2N1cnNvcjogdmFyKC0tZG5kLXJlc2l6ZS1jdXJzb3ItbmVzdywgbmVzdy1yZXNpemUpOyddXG4gICAgICAgIF0ubWFwKChbc2VsZWN0b3IsIHJ1bGVzXSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0b3JzID0gZ2V0U2VsZWN0b3JzRnJvbVByb3AocHJvcHMucmVzaXplU2VsZWN0b3IhLCBzZWxlY3RvcilcbiAgICAgICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICAgICAgLmRuZGdyaWRfX2JveF9jb250YWluZXJbZG5kLWdyaWQtaWQ9XCIke0RORF9HUklEX0lEfVwiXSA6bm90KCRkbmRncmlkX19ib3hfY29udGFpbmVyKSAke3NlbGVjdG9ycy5qb2luKCcsICcpfSB7XG4gICAgICAgICAgICAgICAgICAgICR7cnVsZXN9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgYFxuICAgICAgICB9KSxcbiAgICAgICAgLi4uW1xuICAgICAgICAgICAgWycnLCAnY3Vyc29yOiB2YXIoLS1kbmQtZHJhZy1jdXJzb3IsIG1vdmUpOyddXG4gICAgICAgIF0ubWFwKChbc2VsZWN0b3IsIHJ1bGVzXSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0b3JzID0gZ2V0U2VsZWN0b3JzRnJvbVByb3AocHJvcHMuZHJhZ1NlbGVjdG9yISwgc2VsZWN0b3IpXG4gICAgICAgICAgICByZXR1cm4gYFxuICAgICAgICAgICAgICAgIC5kbmRncmlkX19ib3hfY29udGFpbmVyW2RuZC1ncmlkLWlkPVwiJHtETkRfR1JJRF9JRH1cIl0gOm5vdCguZG5kZ3JpZF9fYm94X2NvbnRhaW5lcikgJHtzZWxlY3RvcnMuam9pbignLCAnKX0ge1xuICAgICAgICAgICAgICAgICAgICAke3J1bGVzfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGBcbiAgICAgICAgfSlcbiAgICApXG5cbiAgICByZXR1cm4gc3R5bGVDb250ZW50LmpvaW4oJ1xcbicpXG59KVxuXG5jb25zdCBjdXJzb3JTdHlsZVNoZWV0ID0gbmV3IENTU1N0eWxlU2hlZXQoKVxud2F0Y2goY3Vyc29yU3R5bGVDb250ZW50UmVmLCBjb250ZW50ID0+IHtcbiAgICBjdXJzb3JTdHlsZVNoZWV0LnJlcGxhY2VTeW5jKGNvbnRlbnQpXG59LCB7XG4gICAgaW1tZWRpYXRlOiB0cnVlXG59KVxuXG5vbk1vdW50ZWQoKCkgPT4ge1xuICAgIGRvY3VtZW50LmFkb3B0ZWRTdHlsZVNoZWV0cyA9IFsgLi4uZG9jdW1lbnQuYWRvcHRlZFN0eWxlU2hlZXRzLCBjdXJzb3JTdHlsZVNoZWV0IF1cbn0pXG5cbm9uQmVmb3JlVW5tb3VudCgoKSA9PiB7XG4gICAgY29uc3QgaW5kZXggPSBkb2N1bWVudC5hZG9wdGVkU3R5bGVTaGVldHMuaW5kZXhPZihjdXJzb3JTdHlsZVNoZWV0KVxuICAgIGlmIChpbmRleCA+IC0xKSB7XG4gICAgICAgIGRvY3VtZW50LmFkb3B0ZWRTdHlsZVNoZWV0cyA9IFtcbiAgICAgICAgICAgIC4uLmRvY3VtZW50LmFkb3B0ZWRTdHlsZVNoZWV0cy5zbGljZSgwLCBpbmRleCksXG4gICAgICAgICAgICAuLi5kb2N1bWVudC5hZG9wdGVkU3R5bGVTaGVldHMuc2xpY2UoaW5kZXgrMSksXG4gICAgICAgIF1cbiAgICB9XG59KVxuXG5mdW5jdGlvbiBnZXRCb3ggKGlkOiBhbnkpIHtcbiAgICAvLyBUT0RPIHJlc29sdmUgZXh0cmEgcGFyYW1ldGVyXG4gICAgLy9yZXR1cm4gX2dldEJveChsYXlvdXRSZWYudmFsdWUsIGlkLCBsYXlvdXRPcHRpb25zUmVmLnZhbHVlKVxuICAgIHJldHVybiBfZ2V0Qm94KGxheW91dFJlZi52YWx1ZSwgaWQpXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUJveCAoaWQ6IGFueSwgZGF0YTogUGFydGlhbDxMYXlvdXRFbGVtZW50Pikge1xuICAgIHJldHVybiBsYXlvdXRSZWYudmFsdWUgPSBfdXBkYXRlQm94KHByb3BzLmxheW91dCEsIGlkLCBkYXRhLCBsYXlvdXRPcHRpb25zUmVmLnZhbHVlKVxufVxuXG5mdW5jdGlvbiB0b0Nzc1NpemUgKHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkKSB7XG4gICAgaWYgKHZhbHVlID09IHVuZGVmaW5lZCkgcmV0dXJuXG4gICAgcmV0dXJuIGlzTmFOKHZhbHVlIGFzIG51bWJlcikgPyB2YWx1ZSA6IGAke3ZhbHVlfXB4YFxufVxuXG5mdW5jdGlvbiB1cGRhdGVDb21wdXRlZENlbGxTaXplICgpIHtcbiAgICBpZiAoY29udGFpbmVyRWxSZWYudmFsdWUpIHtcbiAgICAgICAgY29uc3Qgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGNvbnRhaW5lckVsUmVmLnZhbHVlKVxuICAgICAgICBjb25zdCB3aWR0aCA9IHBhcnNlRmxvYXQoc3R5bGUuZ3JpZFRlbXBsYXRlQ29sdW1ucylcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gcGFyc2VGbG9hdChzdHlsZS5ncmlkVGVtcGxhdGVSb3dzKVxuICAgICAgICBjb25zdCBzcGFjaW5nID0gcGFyc2VGbG9hdChzdHlsZS5nYXApXG5cbiAgICAgICAgY29tcHV0ZWRDZWxsU2l6ZVJlZi52YWx1ZSA9IHsgd2lkdGgsIGhlaWdodCwgc3BhY2luZyB9XG4gICAgfVxuICAgIHJldHVybiBjb21wdXRlZENlbGxTaXplUmVmLnZhbHVlXG59XG5cbmZ1bmN0aW9uIHN0YXJ0TGF5b3V0ICgpIHtcbiAgICB1cGRhdGVDb21wdXRlZENlbGxTaXplKClcbiAgICBtb2RlUmVmLnZhbHVlID0gJ2xheW91dCdcbn1cblxuZnVuY3Rpb24gc3RvcExheW91dCAoKSB7XG4gICAgZW1pdCgndXBkYXRlOmxheW91dCcsIGxheW91dFJlZi52YWx1ZSlcbiAgICBtb2RlUmVmLnZhbHVlID0gJ2dyaWQnXG59XG5cbmZ1bmN0aW9uIGNhblN0YXJ0RHJhZyAoZXZ0OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkge1xuICAgIHJldHVybiBCb29sZWFuKGV2dC50YXJnZXQgJiYgZHJhZ1NlbGVjdG9yc1JlZi52YWx1ZS5maW5kKHNlbGVjdG9yID0+IChldnQudGFyZ2V0IGFzIEVsZW1lbnQpLm1hdGNoZXMoc2VsZWN0b3IpKSlcbn1cblxuZnVuY3Rpb24gY2FuU3RhcnRSZXNpemUgKGV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpIHtcbiAgICByZXR1cm4gQm9vbGVhbihldnQudGFyZ2V0ICYmIHJlc2l6ZVNlbGVjdG9yc1JlZi52YWx1ZS5maW5kKHNlbGVjdG9yID0+IChldnQudGFyZ2V0IGFzIEVsZW1lbnQpLm1hdGNoZXMoc2VsZWN0b3IpKSlcbn1cblxuZnVuY3Rpb24gZ2V0U2VsZWN0b3JzRnJvbVByb3AgKHByb3A6IFNlbGVjdG9yUHJvcCwgYWRkaXRpb25hbFNlbGVjdG9yPzogc3RyaW5nKSB7XG4gICAgbGV0IHNlbGVjdG9ycyA9IFtcbiAgICAgICAgKHByb3AuaW5jbHVkZSB8fCAnKicpICsgKGFkZGl0aW9uYWxTZWxlY3RvciB8fCAnJyksXG4gICAgICAgIChwcm9wLmluY2x1ZGUgfHwgJyonKSArIChhZGRpdGlvbmFsU2VsZWN0b3IgfHwgJycpICsgJyAqJ1xuICAgIF1cbiAgICBpZiAocHJvcC5leGNsdWRlKSB7XG4gICAgICAgIHNlbGVjdG9ycyA9IHNlbGVjdG9ycy5tYXAoc2VsZWN0b3IgPT4gYCR7c2VsZWN0b3J9Om5vdCgke3Byb3AuZXhjbHVkZX0sICR7cHJvcC5leGNsdWRlfSAqKWApXG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGVjdG9yc1xufVxuPC9zY3JpcHQ+XG5cbjx0ZW1wbGF0ZT5cbiAgICA8ZGl2XG4gICAgICAgIHJlZj1cImNvbnRhaW5lckVsUmVmXCJcbiAgICAgICAgOmRuZC1ncmlkLWlkPVwiRE5EX0dSSURfSURcIlxuICAgICAgICA6ZG5kLWdyaWQtbW9kZT1cIm1vZGVSZWZcIlxuICAgICAgICBjbGFzcz1cImRuZGdyaWRfX2JveF9jb250YWluZXJcIlxuICAgICAgICA6c3R5bGU9XCJ7XG4gICAgICAgICAgICAnLS1kbmQtZ3JpZC1jZWxsLXdpZHRoJzogdG9Dc3NTaXplKHByb3BzLmNlbGxXaWR0aCksXG4gICAgICAgICAgICAnLS1kbmQtZ3JpZC1jZWxsLW1heC13aWR0aCc6IHRvQ3NzU2l6ZShwcm9wcy5jZWxsTWF4V2lkdGgpID8/IDAsXG4gICAgICAgICAgICAnLS1kbmQtZ3JpZC1jZWxsLWhlaWdodCc6IHRvQ3NzU2l6ZShwcm9wcy5jZWxsSGVpZ2h0KSxcbiAgICAgICAgICAgICctLWRuZC1ncmlkLWNlbGwtbWF4LWhlaWdodCc6IHRvQ3NzU2l6ZShwcm9wcy5jZWxsTWF4SGVpZ2h0KSA/PyAwLFxuICAgICAgICAgICAgJy0tZG5kLWdyaWQtY2VsbC1zcGFjaW5nJzogdG9Dc3NTaXplKHByb3BzLmNlbGxTcGFjaW5nKSxcbiAgICAgICAgICAgICctLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLXNpemUnOiB0b0Nzc1NpemUocHJvcHMucmVzaXplSGFuZGxlclNpemUpLFxuICAgICAgICAgICAgJy0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItb2Zmc2V0JzogdG9Dc3NTaXplKHByb3BzLnJlc2l6ZUhhbmRsZXJPZmZzZXQpLFxuICAgICAgICAgICAgJy0tZG5kLWdyaWQtcGxhY2Vob2xkZXItYmFja2dyb3VuZCc6IHByb3BzLnBsYWNlaG9sZGVyQmFja2dyb3VuZCxcbiAgICAgICAgICAgICctLWRuZC1ncmlkLXBsYWNlaG9sZGVyLWJvcmRlcic6IHByb3BzLnBsYWNlaG9sZGVyQm9yZGVyLFxuICAgICAgICAgICAgJy0tZG5kLWdyaWQtdHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb24nOiBwcm9wcy50cmFuc2l0aW9uVGltaW5nRnVuY3Rpb24sXG4gICAgICAgICAgICAnLS1kbmQtZ3JpZC10cmFuc2l0aW9uLWR1cmF0aW9uJzogcHJvcHMudHJhbnNpdGlvbkR1cmF0aW9uLFxuICAgICAgICB9XCJcbiAgICA+XG4gICAgICAgIDxzbG90IC8+XG4gICAgPC9kaXY+XG48L3RlbXBsYXRlPlxuXG48c3R5bGU+XG46d2hlcmUoLmRuZGdyaWRfX2JveF9jb250YWluZXIpIHtcbiAgICBhbGw6IHVuc2V0O1xufVxuXG4uZG5kZ3JpZF9fYm94X2NvbnRhaW5lciB7XG4gICAgZGlzcGxheTogZ3JpZDtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgZ3JpZC1hdXRvLWNvbHVtbnM6IG1pbm1heChcbiAgICAgICAgdmFyKC0tZG5kLWdyaWQtY2VsbC13aWR0aCwgOGVtKSxcbiAgICAgICAgdmFyKC0tZG5kLWdyaWQtY2VsbC1tYXgtd2lkdGgsIDApXG4gICAgKTtcbiAgICBncmlkLWF1dG8tcm93czogbWlubWF4KFxuICAgICAgICB2YXIoLS1kbmQtZ3JpZC1jZWxsLWhlaWdodCwgOGVtKSxcbiAgICAgICAgdmFyKC0tZG5kLWdyaWQtY2VsbC1tYXgtaGVpZ2h0LCAwKVxuICAgICk7XG4gICAgZ2FwOiB2YXIoLS1kbmQtZ3JpZC1jZWxsLXNwYWNpbmcsIDAuNWVtKTtcbiAgICBtaW4td2lkdGg6IG1pbi1jb250ZW50O1xuICAgIG1pbi1oZWlnaHQ6IG1pbi1jb250ZW50O1xufVxuPC9zdHlsZT5cbiJdLCJuYW1lcyI6WyJfX2RlZmF1bHRfXyIsInVzZURuZEhhbmRsZXIiLCJiYXNlUG9zaXRpb24iLCJnZXRCb3giLCJ1cGRhdGVCb3giLCJfZ2V0Qm94IiwiX3VwZGF0ZUJveCJdLCJtYXBwaW5ncyI6Ijs7QUF5QmEsTUFBQSxlQUFBLEdBQWtCLE9BQU8sa0JBQWtCLENBQUE7O0FDc0NqRCxTQUFTLEtBQU0sTUFBZ0IsRUFBQTtBQUNsQyxFQUFBLE9BQU8sQ0FBQyxHQUFHLE1BQU0sRUFBRSxJQUFLLENBQUEsQ0FBQyxHQUFHLENBQU0sS0FBQTtBQUM5QixJQUFBLElBQUksQ0FBRSxDQUFBLE1BQUEsSUFBVSxDQUFDLENBQUEsQ0FBRSxNQUFRLEVBQUE7QUFDdkIsTUFBTyxPQUFBLENBQUEsQ0FBQTtBQUFBLEtBQ1g7QUFDQSxJQUFBLElBQUksQ0FBQyxDQUFBLENBQUUsTUFBVSxJQUFBLENBQUEsQ0FBRSxNQUFRLEVBQUE7QUFDdkIsTUFBTyxPQUFBLENBQUEsQ0FBQSxDQUFBO0FBQUEsS0FDWDtBQUNBLElBQUEsSUFBSSxDQUFFLENBQUEsUUFBQSxDQUFTLENBQUksR0FBQSxDQUFBLENBQUUsU0FBUyxDQUFHLEVBQUE7QUFDN0IsTUFBTyxPQUFBLENBQUEsQ0FBQSxDQUFBO0FBQUEsS0FDWDtBQUNBLElBQUEsSUFBSSxDQUFFLENBQUEsUUFBQSxDQUFTLENBQUksR0FBQSxDQUFBLENBQUUsU0FBUyxDQUFHLEVBQUE7QUFDN0IsTUFBTyxPQUFBLENBQUEsQ0FBQTtBQUFBLEtBQ1g7QUFDQSxJQUFBLElBQUksQ0FBRSxDQUFBLFFBQUEsQ0FBUyxDQUFJLEdBQUEsQ0FBQSxDQUFFLFNBQVMsQ0FBRyxFQUFBO0FBQzdCLE1BQU8sT0FBQSxDQUFBLENBQUEsQ0FBQTtBQUFBLEtBQ1g7QUFDQSxJQUFBLElBQUksQ0FBRSxDQUFBLFFBQUEsQ0FBUyxDQUFJLEdBQUEsQ0FBQSxDQUFFLFNBQVMsQ0FBRyxFQUFBO0FBQzdCLE1BQU8s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
